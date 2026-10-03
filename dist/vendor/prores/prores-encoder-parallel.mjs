import { v as validateOptions, a as validateWorkers, r as readCanvasRgba, b as compileWasmModule, d as createModuleFrom } from './prores-core.mjs';
export { P as ProResProfile, e as ProfileNames } from './prores-core.mjs';

/**
 * Frame-parallel ProRes encoder pool.
 *
 * ProRes is intra-only, so every frame is independent — encoding frame N in
 * isolation is byte-identical to encoding it as the Nth frame of a
 * sequential stream (verified across all profiles). This pool exploits that:
 * N workers each hold their own WASM encoder instance and encode frames in
 * parallel, while the main thread records samples in frame order and reuses
 * the C muxer for the container. Output is bit-identical to the
 * single-thread encoder.
 *
 * This module is transport-agnostic: the caller supplies `module` (a loaded
 * WASM module used only for muxing) and `spawnWorker` (a factory returning a
 * postMessage/onmessage handle). parallel.js wires the default Blob-URL
 * Worker transport; tests use Node worker_threads or in-process fakes.
 */


class ProResEncoderPool {
  static async create(options) {
    const pool = new ProResEncoderPool(options);
    try {
      await pool._init();
    } catch (err) {
      // Don't leak workers (or the muxer context) that did start.
      await pool.destroy();
      throw err;
    }
    return pool;
  }

  constructor(options) {
    const { module, wasmModule = null, spawnWorker } = options;

    if (!module) throw new Error('pool: a loaded WASM module is required for muxing');
    if (typeof spawnWorker !== 'function') throw new Error('pool: spawnWorker factory is required');

    const {
      width, height, fpsNum: num, fpsDen: den, profile, rangeValue, onFrameData,
    } = validateOptions(options);
    const workers = validateWorkers(options.workers);

    this._module = module;
    this._wasmModule = wasmModule;
    this._spawnWorker = spawnWorker;
    this._width = width;
    this._height = height;
    this._fpsNum = num;
    this._fpsDen = den;
    this._profile = profile;
    this._rangeValue = rangeValue;
    this._onFrameData = onFrameData;

    const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    this._workerCount = workers ?? Math.min(hc, 8);

    this._rgbaSize = width * height * 4;
    this._scratch = { canvas: null, ctx: null };
    this._muxCtx = 0;

    // Worker handles and scheduling state.
    this._workers = [];
    this._idle = [];
    this._queue = [];          // frames awaiting a free worker
    this._freeBuffers = [];    // reusable RGBA ArrayBuffers

    // Reorder + accounting. Frames _nextRecord.._submitted-1 are unrecorded:
    // queued, in a worker, or encoded and waiting for an earlier frame.
    this._submitted = 0;       // frames accepted from the caller
    this._maxUnrecorded = this._workerCount * 2;
    this._nextRecord = 0;      // next frame index to record in order
    this._packets = new Map(); // frameIndex -> Uint8Array, awaiting in-order record
    this._chunks = [];         // buffered-mode ordered chunks
    this._frameCount = 0;      // frames fully recorded

    this._backpressure = [];   // resolvers waiting for frames to be recorded
    this._error = null;
    this._destroyed = false;
    this._finalized = false;
  }

  get frameCount() { return this._frameCount; }
  get width() { return this._width; }
  get height() { return this._height; }
  get workerCount() { return this._workerCount; }

  async _init() {
    // Main-thread context: used ONLY for muxing (record_sample + finalize).
    this._muxCtx = this._module._prores_wasm_create(
      this._width, this._height, this._fpsNum, this._fpsDen,
      this._profile, this._rangeValue
    );
    if (!this._muxCtx) throw new Error('pool: failed to create muxer context');

    // Spawn and initialize all workers.
    await Promise.all(
      Array.from({ length: this._workerCount }, () => this._startWorker())
    );
  }

  _startWorker() {
    return new Promise((resolve, reject) => {
      const worker = this._spawnWorker();
      worker.onmessage = (e) => this._onWorkerMessage(worker, e.data);
      worker.onerror = (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const detail = (e && e.message) || 'the worker failed to load';
        const hint = worker._readyResolve
          ? ' (if your Content-Security-Policy blocks blob: workers, add "worker-src blob:" ' +
            'or use createProResEncoder() from "prores-wasm-encoder")'
          : '';
        this._fail(new Error(`pool: worker error: ${detail}${hint}`));
      };
      worker._readyResolve = resolve;
      worker._readyReject = reject;
      this._workers.push(worker);

      worker.postMessage({
        type: 'init',
        width: this._width, height: this._height,
        fpsNum: this._fpsNum, fpsDen: this._fpsDen,
        profile: this._profile, range: this._rangeValue,
        // Compiled WebAssembly.Module, shared with every worker via
        // structured clone (no recompile, no second copy of the binary).
        wasmModule: this._wasmModule,
      });
    });
  }

  _onWorkerMessage(worker, msg) {
    // After destroy(), only the workers' shutdown acknowledgements matter.
    if (this._destroyed && msg.type !== 'destroyed') return;
    if (msg.type === 'ready') {
      this._idle.push(worker);
      if (worker._readyResolve) { worker._readyResolve(); worker._readyResolve = null; }
      this._pump();
    } else if (msg.type === 'packet') {
      // Recycle the returned input buffer.
      if (msg.rgba) this._freeBuffers.push(msg.rgba);
      this._idle.push(worker);
      this._packets.set(msg.frameIndex, new Uint8Array(msg.packet));
      this._drainRecords();
      this._releaseBackpressure();
      this._pump();
    } else if (msg.type === 'error') {
      this._fail(new Error(msg.error));
    } else if (msg.type === 'destroyed') {
      if (worker._destroyResolve) { worker._destroyResolve(); worker._destroyResolve = null; }
    }
  }

  _fail(err) {
    if (!this._error) this._error = err;
    // Reject any pending readiness/backpressure waiters.
    for (const w of this._workers) {
      if (w._readyReject) { w._readyReject(err); w._readyReject = null; }
    }
    this._releaseBackpressure();
  }

  _releaseBackpressure() {
    const waiters = this._backpressure;
    this._backpressure = [];
    for (const r of waiters) r();
  }

  // Move queued frames onto idle workers.
  _pump() {
    while (this._idle.length > 0 && this._queue.length > 0) {
      const worker = this._idle.pop();
      const job = this._queue.shift();
      worker.postMessage(
        { type: 'encode', frameIndex: job.frameIndex, rgba: job.buffer },
        [job.buffer]
      );
    }
  }

  // Record any packets that are now contiguous from _nextRecord.
  _drainRecords() {
    while (this._packets.has(this._nextRecord)) {
      const chunk = this._packets.get(this._nextRecord);
      this._packets.delete(this._nextRecord);

      const rec = this._module._prores_wasm_mux_record_sample(this._muxCtx, chunk.length);
      if (rec < 0) { this._fail(new Error('pool: failed to record sample ' + this._nextRecord)); return; }

      if (this._onFrameData) {
        this._onFrameData(chunk);
      } else {
        this._chunks.push(chunk);
      }
      this._frameCount++;
      this._nextRecord++;
    }
  }

  _takeBuffer() {
    const buf = this._freeBuffers.pop();
    if (buf && buf.byteLength === this._rgbaSize) return buf;
    return new ArrayBuffer(this._rgbaSize);
  }

  /** Throw unless the pool can accept frames. */
  _checkWritable() {
    if (this._error) throw this._error;
    if (this._destroyed) throw new Error('pool: encoder destroyed');
    if (this._finalized) throw new Error('pool: cannot add frames after finalize');
  }

  /** Wait on the backpressure queue while `condition()` holds. */
  async _waitWhile(condition) {
    while (condition() && !this._error && !this._destroyed) {
      await new Promise((r) => this._backpressure.push(r));
    }
    if (this._error) throw this._error;
    if (this._destroyed) throw new Error('pool: encoder destroyed');
  }

  /**
   * Submit one RGBA frame for encoding. Resolves once the frame has been
   * accepted into the pipeline (applying backpressure so at most 2x the
   * worker count of frames are unrecorded at once, bounding memory).
   */
  async addFrameRgba(data) {
    this._checkWritable();
    if (!data || data.length !== this._rgbaSize) {
      throw new Error(`pool: invalid RGBA size ${data && data.length}, expected ${this._rgbaSize}`);
    }

    // Backpressure: count every unrecorded frame, not only those in
    // workers, so a slow frame can't grow the reorder buffer.
    await this._waitWhile(() => this._submitted - this._nextRecord >= this._maxUnrecorded);

    const frameIndex = this._submitted++;

    // Copy the caller's pixels into a transferable buffer we own.
    const buffer = this._takeBuffer();
    new Uint8Array(buffer).set(data);

    const job = { frameIndex, buffer };
    if (this._idle.length > 0) {
      const worker = this._idle.pop();
      worker.postMessage({ type: 'encode', frameIndex, rgba: buffer }, [buffer]);
    } else {
      this._queue.push(job);
    }
  }

  async addFrameFromImageData(imageData) {
    if (!imageData || imageData.width !== this._width || imageData.height !== this._height) {
      const got = imageData ? `${imageData.width}x${imageData.height}` : String(imageData);
      throw new Error(`pool: ImageData ${got} != ${this._width}x${this._height}`);
    }
    return this.addFrameRgba(imageData.data);
  }

  async addFrameFromCanvas(canvas) {
    this._checkWritable();
    // Read synchronously, in the caller's task, so WebGL canvases still hold
    // the frame; the async part (backpressure) comes after.
    return this.addFrameRgba(readCanvasRgba(canvas, this._width, this._height, this._scratch));
  }

  /**
   * Wait until every submitted frame has been encoded and recorded (and, in
   * streaming mode, delivered via onFrameData). Does not finalize anything.
   */
  async flush() {
    await this._waitWhile(() => this._nextRecord < this._submitted);
  }

  finalizeHeaders() {
    if (this._destroyed) throw new Error('pool: encoder destroyed');
    if (this._frameCount === 0) throw new Error('pool: no frames encoded');
    const sizePtr = this._module._malloc(8);
    try {
      const headerPtr = this._module._prores_wasm_finalize_header(this._muxCtx, sizePtr);
      if (!headerPtr) throw new Error('pool: failed to finalize MOV header');
      const headerSize = this._module.HEAPU32[sizePtr >> 2];
      const header = new Uint8Array(headerSize);
      header.set(new Uint8Array(this._module.HEAPU8.buffer, headerPtr, headerSize));

      const moovPtr = this._module._prores_wasm_finalize_moov(this._muxCtx, sizePtr);
      if (!moovPtr) throw new Error('pool: failed to finalize MOV moov box');
      const moovSize = this._module.HEAPU32[sizePtr >> 2];
      const moov = new Uint8Array(moovSize);
      moov.set(new Uint8Array(this._module.HEAPU8.buffer, moovPtr, moovSize));

      return { header, moov };
    } finally {
      this._module._free(sizePtr);
    }
  }

  async finalize() {
    if (this._onFrameData) {
      throw new Error('pool: finalize() is unavailable in streaming mode (onFrameData); use finalizeHeaders()');
    }
    await this._finishFrames();
    const { header, moov } = this.finalizeHeaders();
    const chunks = this._chunks;
    this._chunks = [];

    let total = header.length + moov.length;
    for (const c of chunks) total += c.length;

    const out = new Uint8Array(total);
    let off = 0;
    out.set(header, off); off += header.length;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    out.set(moov, off);
    return out;
  }

  async finalizeToBlob() {
    if (this._onFrameData) {
      throw new Error('pool: finalizeToBlob() is unavailable in streaming mode (onFrameData); use finalizeHeaders()');
    }
    await this._finishFrames();
    const { header, moov } = this.finalizeHeaders();
    const chunks = this._chunks;
    this._chunks = [];
    return new Blob([header, ...chunks, moov], { type: 'video/quicktime' });
  }

  /** Streaming mode: flush all frames (delivered via onFrameData), then
   * return the header/moov to write around them. */
  async finalizeStreaming() {
    await this._finishFrames();
    return this.finalizeHeaders();
  }

  /** Close the pool to new frames, then wait for the in-flight ones. */
  async _finishFrames() {
    if (this._destroyed) throw new Error('pool: encoder destroyed');
    if (this._finalized) throw new Error('pool: already finalized; create a new pool for the next file');
    this._finalized = true;
    await this.flush();
    // Every frame is recorded, so no more input buffers will be needed
    // (up to 2x workers full frames: hundreds of MB at 4K).
    this._freeBuffers = [];
  }

  async destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    // Anything still waiting (addFrame backpressure, flush, finalize)
    // rejects with "encoder destroyed" instead of hanging.
    this._releaseBackpressure();

    await Promise.all(this._workers.map((w) => new Promise((resolve) => {
      // Fallback in case the worker never replies.
      const timer = setTimeout(resolve, 250);
      w._destroyResolve = () => { clearTimeout(timer); resolve(); };
      try { w.postMessage({ type: 'destroy' }); } catch { w._destroyResolve(); }
    })));

    for (const w of this._workers) {
      if (typeof w.terminate === 'function') w.terminate();
    }
    this._workers = [];
    this._idle = [];
    this._queue = [];
    this._freeBuffers = [];
    this._packets.clear();
    this._chunks = [];

    if (this._muxCtx) {
      this._module._prores_wasm_destroy(this._muxCtx);
      this._muxCtx = 0;
    }
  }
}

var proresWorkerCode = "var e,r=(e=import.meta.url,async function(r={}){var t,n,a=r;a.ready=new Promise((e,r)=>{t=e,n=r});var o,s,i,f=Object.assign({},a),u=\"object\"==typeof window,_=\"function\"==typeof importScripts,c=\"object\"==typeof process&&\"object\"==typeof process.versions&&\"string\"==typeof process.versions.node,l=\"\";if(c){const{createRequire:e}=await import(\"module\");var p=e(import.meta.url),m=p(\"fs\"),d=p(\"path\");l=_?d.dirname(l)+\"/\":p(\"url\").fileURLToPath(new URL(\"./\",import.meta.url)),o=(e,r)=>(e=F(e)?new URL(e):d.normalize(e),m.readFileSync(e,r?void 0:\"utf8\")),i=e=>((e=o(e,!0)).buffer||(e=new Uint8Array(e)),e),s=(e,r,t,n=!0)=>{e=F(e)?new URL(e):d.normalize(e),m.readFile(e,n?void 0:\"utf8\",(e,a)=>{e?t(e):r(n?a.buffer:a)})},process.argv.slice(2),a.inspect=()=>\"[Emscripten Module object]\"}else(u||_)&&(_?l=self.location.href:\"undefined\"!=typeof document&&document.currentScript&&(l=document.currentScript.src),e&&(l=e),l=0!==l.indexOf(\"blob:\")?l.substr(0,l.replace(/[?#].*/,\"\").lastIndexOf(\"/\")+1):\"\",o=e=>{var r=new XMLHttpRequest;return r.open(\"GET\",e,!1),r.send(null),r.responseText},_&&(i=e=>{var r=new XMLHttpRequest;return r.open(\"GET\",e,!1),r.responseType=\"arraybuffer\",r.send(null),new Uint8Array(r.response)}),s=(e,r,t)=>{var n=new XMLHttpRequest;n.open(\"GET\",e,!0),n.responseType=\"arraybuffer\",n.onload=()=>{200==n.status||0==n.status&&n.response?r(n.response):t()},n.onerror=t,n.send(null)});a.print||console.log.bind(console);var w,y=a.printErr||console.error.bind(console);Object.assign(a,f),f=null,a.wasmBinary&&(w=a.wasmBinary),\"object\"!=typeof WebAssembly&&P(\"no native wasm support detected\");var b,h,g,v,A,R,k,E,I=!1;function U(){var e=b.buffer;a.HEAP8=h=new Int8Array(e),a.HEAP16=v=new Int16Array(e),a.HEAPU8=g=new Uint8Array(e),a.HEAPU16=new Uint16Array(e),a.HEAP32=A=new Int32Array(e),a.HEAPU32=R=new Uint32Array(e),a.HEAPF32=k=new Float32Array(e),a.HEAPF64=E=new Float64Array(e)}var z=[],S=[],W=[];function x(){var e=a.preRun.shift();z.unshift(e)}var M=0,T=null;function P(e){throw a.onAbort&&a.onAbort(e),y(e=\"Aborted(\"+e+\")\"),I=!0,e=new WebAssembly.RuntimeError(e+\". Build with -sASSERTIONS for more info.\"),n(e),e}var H,C=e=>e.startsWith(\"data:application/octet-stream;base64,\"),F=e=>e.startsWith(\"file://\");if(a.locateFile){if(!C(H=\"prores-encoder.wasm.wasm\")){var j=H;H=a.locateFile?a.locateFile(j,l):l+j}}else H=new URL(\"prores-encoder.wasm.wasm\",import.meta.url).href;function B(e){if(e==H&&w)return new Uint8Array(w);if(i)return i(e);throw\"both async and sync fetching of the wasm failed\"}function L(e,r,t){return function(e){if(!w&&(u||_)){if(\"function\"==typeof fetch&&!F(e))return fetch(e,{credentials:\"same-origin\"}).then(r=>{if(!r.ok)throw\"failed to load wasm binary file at '\"+e+\"'\";return r.arrayBuffer()}).catch(()=>B(e));if(s)return new Promise((r,t)=>{s(e,e=>r(new Uint8Array(e)),t)})}return Promise.resolve().then(()=>B(e))}(e).then(e=>WebAssembly.instantiate(e,r)).then(e=>e).then(t,e=>{y(`failed to asynchronously prepare wasm: ${e}`),P(e)})}var D=e=>{for(;0<e.length;)e.shift()(a)},$=\"undefined\"!=typeof TextDecoder?new TextDecoder(\"utf8\"):void 0,G=(e,r)=>{if(e>>>=0){var t=g,n=(e>>>=0)+r;for(r=e;t[r]&&!(r>=n);)++r;if(16<r-e&&t.buffer&&$)t=$.decode(t.subarray(e,r));else{for(n=\"\";e<r;){var a=t[e++];if(128&a){var o=63&t[e++];if(192==(224&a))n+=String.fromCharCode((31&a)<<6|o);else{var s=63&t[e++];65536>(a=224==(240&a)?(15&a)<<12|o<<6|s:(7&a)<<18|o<<12|s<<6|63&t[e++])?n+=String.fromCharCode(a):(a-=65536,n+=String.fromCharCode(55296|a>>10,56320|1023&a))}}else n+=String.fromCharCode(a)}t=n}}else t=\"\";return t},O=(e,r,t,n)=>{var o={string:e=>{var r=0;if(null!=e&&0!==e){for(var t=r=0;t<e.length;++t){var n=e.charCodeAt(t);127>=n?r++:2047>=n?r+=2:55296<=n&&57343>=n?(r+=4,++t):r+=3}var a=r+1;if(r=K(a),n=g,t=r>>>0,0<a){a=t+a-1;for(var o=0;o<e.length;++o){var s=e.charCodeAt(o);if(55296<=s&&57343>=s&&(s=65536+((1023&s)<<10)|1023&e.charCodeAt(++o)),127>=s){if(t>=a)break;n[t++>>>0]=s}else{if(2047>=s){if(t+1>=a)break;n[t++>>>0]=192|s>>6}else{if(65535>=s){if(t+2>=a)break;n[t++>>>0]=224|s>>12}else{if(t+3>=a)break;n[t++>>>0]=240|s>>18,n[t++>>>0]=128|s>>12&63}n[t++>>>0]=128|s>>6&63}n[t++>>>0]=128|63&s}}n[t>>>0]=0}}return r},array:e=>{var r=K(e.length);return h.set(e,r>>>0),r}};e=a[\"_\"+e];var s,i=[],f=0;if(n)for(var u=0;u<n.length;u++){var _=o[t[u]];_?(0===f&&(f=X()),i[u]=_(n[u])):i[u]=n[u]}return t=e.apply(null,i),s=t,0!==f&&J(f),\"string\"===r?G(s):\"boolean\"===r?!!s:s},V={c:()=>Date.now(),a:function(e,r,t){return r>>>=0,g.copyWithin(e>>>0>>>0,r>>>0,r+(t>>>0)>>>0)},b:function(e){e>>>=0;var r=g.length;if(4294901760<e)return!1;for(var t=1;4>=t;t*=2){var n=r*(1+.2/t);n=Math.min(n,e+100663296);var a=Math;n=Math.max(e,n);e:{a=(a.min.call(a,4294901760,n+(65536-n%65536)%65536)-b.buffer.byteLength+65535)/65536;try{b.grow(a),U();var o=1;break e}catch(e){}o=void 0}if(o)return!0}return!1}},q=function(){function e(e){return q=e.exports,q=function(){var e=q;e=Object.assign({},e);var r=e=>r=>e(r)>>>0,t=e=>()=>e()>>>0;return e.f=r(e.f),e.__errno_location=t(e.__errno_location),e.y=t(e.y),e.A=r(e.A),e}(),b=q.d,U(),S.unshift(q.e),M--,a.monitorRunDependencies&&a.monitorRunDependencies(M),0==M&&T&&(e=T,T=null,e()),q}var r={a:V};if(M++,a.monitorRunDependencies&&a.monitorRunDependencies(M),a.instantiateWasm)try{return a.instantiateWasm(r,e)}catch(e){y(`Module.instantiateWasm callback failed with error: ${e}`),n(e)}return function(e,r){var t=H;return w||\"function\"!=typeof WebAssembly.instantiateStreaming||C(t)||F(t)||c||\"function\"!=typeof fetch?L(t,e,r):fetch(t,{credentials:\"same-origin\"}).then(n=>WebAssembly.instantiateStreaming(n,e).then(r,function(n){return y(`wasm streaming compile failed: ${n}`),y(\"falling back to ArrayBuffer instantiation\"),L(t,e,r)}))}(r,function(r){e(r.instance)}).catch(n),{}}();a._malloc=e=>(a._malloc=q.f)(e),a._free=e=>(a._free=q.g)(e),a._prores_wasm_create=(e,r,t,n,o,s)=>(a._prores_wasm_create=q.h)(e,r,t,n,o,s),a._prores_wasm_add_frame_rgba=(e,r)=>(a._prores_wasm_add_frame_rgba=q.i)(e,r),a._prores_wasm_add_frame_yuv=(e,r)=>(a._prores_wasm_add_frame_yuv=q.j)(e,r),a._prores_wasm_encode_frame_rgba=(e,r)=>(a._prores_wasm_encode_frame_rgba=q.k)(e,r),a._prores_wasm_encode_frame_yuv=(e,r)=>(a._prores_wasm_encode_frame_yuv=q.l)(e,r),a._prores_wasm_last_frame_size=e=>(a._prores_wasm_last_frame_size=q.m)(e),a._prores_wasm_mux_record_sample=(e,r)=>(a._prores_wasm_mux_record_sample=q.n)(e,r),a._prores_wasm_finalize_header=(e,r)=>(a._prores_wasm_finalize_header=q.o)(e,r),a._prores_wasm_finalize_moov=(e,r)=>(a._prores_wasm_finalize_moov=q.p)(e,r),a._prores_wasm_finalize=(e,r)=>(a._prores_wasm_finalize=q.q)(e,r),a._prores_wasm_free_buffer=e=>(a._prores_wasm_free_buffer=q.r)(e),a._prores_wasm_destroy=e=>(a._prores_wasm_destroy=q.s)(e),a._prores_wasm_get_rgba_buffer_size=(e,r)=>(a._prores_wasm_get_rgba_buffer_size=q.t)(e,r),a._prores_wasm_get_yuv_buffer_size=(e,r,t)=>(a._prores_wasm_get_yuv_buffer_size=q.u)(e,r,t),a._prores_wasm_alloc=e=>(a._prores_wasm_alloc=q.v)(e),a._prores_wasm_get_fourcc=e=>(a._prores_wasm_get_fourcc=q.w)(e);var N,X=()=>(X=q.y)(),J=e=>(J=q.z)(e),K=e=>(K=q.A)(e);function Q(){function e(){if(!N&&(N=!0,a.calledRun=!0,!I)){if(D(S),t(a),a.onRuntimeInitialized&&a.onRuntimeInitialized(),a.postRun)for(\"function\"==typeof a.postRun&&(a.postRun=[a.postRun]);a.postRun.length;){var e=a.postRun.shift();W.unshift(e)}D(W)}}if(!(0<M)){if(a.preRun)for(\"function\"==typeof a.preRun&&(a.preRun=[a.preRun]);a.preRun.length;)x();D(z),0<M||(a.setStatus?(a.setStatus(\"Running...\"),setTimeout(function(){setTimeout(function(){a.setStatus(\"\")},1),e()},1)):e())}}if(a.ccall=O,a.cwrap=(e,r,t,n)=>{var o=!t||t.every(e=>\"number\"===e||\"boolean\"===e);return\"string\"!==r&&o&&!n?a[\"_\"+e]:function(){return O(e,r,t,arguments)}},a.setValue=function(e,r,t=\"i8\"){switch(t.endsWith(\"*\")&&(t=\"*\"),t){case\"i1\":case\"i8\":h[e>>>0>>>0]=r;break;case\"i16\":v[e>>>1>>>0]=r;break;case\"i32\":A[e>>>2>>>0]=r;break;case\"i64\":P(\"to do setValue(i64) use WASM_BIGINT\");case\"float\":k[e>>>2>>>0]=r;break;case\"double\":E[e>>>3>>>0]=r;break;case\"*\":R[e>>>2>>>0]=r;break;default:P(`invalid type for setValue: ${t}`)}},a.getValue=function(e,r=\"i8\"){switch(r.endsWith(\"*\")&&(r=\"*\"),r){case\"i1\":case\"i8\":return h[e>>>0>>>0];case\"i16\":return v[e>>>1>>>0];case\"i32\":return A[e>>>2>>>0];case\"i64\":P(\"to do getValue(i64) use WASM_BIGINT\");case\"float\":return k[e>>>2>>>0];case\"double\":return E[e>>>3>>>0];case\"*\":return R[e>>>2>>>0];default:P(`invalid type for getValue: ${r}`)}},a.UTF8ToString=G,T=function e(){N||Q(),N||(T=e)},a.preInit)for(\"function\"==typeof a.preInit&&(a.preInit=[a.preInit]);0<a.preInit.length;)a.preInit.pop()();return Q(),r.ready});function t(){let e=null,t=0,n=0,a=0;return{handle:async function(o,s){try{if(\"init\"===o.type){if(!o.wasmModule)throw new Error(\"worker: init message is missing the compiled wasmModule\");if(e=await r({locateFile:e=>e,instantiateWasm:(e,r)=>(WebAssembly.instantiate(o.wasmModule,e).then(e=>{r(e,o.wasmModule)}),{})}),t=e._prores_wasm_create(o.width,o.height,o.fpsNum,o.fpsDen,o.profile,o.range),!t)throw new Error(\"worker: failed to create encoder\");if(a=e._prores_wasm_get_rgba_buffer_size(o.width,o.height),n=e._prores_wasm_alloc(a),!n)throw new Error(\"worker: failed to allocate RGBA buffer\");s({type:\"ready\"})}else if(\"encode\"===o.type){const r=new Uint8Array(o.rgba);if(r.length!==a)throw new Error(`worker: RGBA size ${r.length} != expected ${a}`);e.HEAPU8.set(r,n);const i=e._prores_wasm_encode_frame_rgba(t,n);if(!i)throw new Error(`worker: encode failed for frame ${o.frameIndex}`);const f=e._prores_wasm_last_frame_size(t),u=new Uint8Array(f);u.set(new Uint8Array(e.HEAPU8.buffer,i,f)),s({type:\"packet\",frameIndex:o.frameIndex,packet:u.buffer,rgba:o.rgba},[u.buffer,o.rgba])}else\"destroy\"===o.type&&(e&&n&&e._free(n),e&&t&&e._prores_wasm_destroy(t),t=0,n=0,s({type:\"destroyed\"}))}catch(e){s({type:\"error\",frameIndex:o&&o.frameIndex,error:String(e&&e.message||e)})}}}}\"undefined\"!=typeof self&&\"function\"==typeof self.postMessage&&function(e){const r=t();e.onmessage=t=>r.handle(t.data,(r,t)=>e.postMessage(r,t))}(self);export{t as createWorkerCore};\n";

/**
 * prores-wasm-encoder/parallel — frame-parallel encoding entry point.
 *
 * Kept as a separate entry so the base library stays small: importing only
 * 'prores-wasm-encoder' never pulls in the worker machinery. This entry
 * embeds the worker source (WITHOUT a second copy of the WASM binary) and
 * shares one compiled WebAssembly.Module with every worker.
 */

/**
 * Create a frame-parallel ProRes encoder pool.
 *
 * ProRes is intra-only, so frames are independent and encode in parallel
 * across Web Workers with byte-identical output to the single-thread
 * encoder. The WASM binary is compiled once and the compiled module is
 * shared with every worker (structured clone), so workers add no extra
 * compiles or copies.
 *
 * Requires Web Workers with module support (Chrome 80+, Safari 15+,
 * Firefox 114+). For environments without workers, use the base entry's
 * createProResEncoder().
 *
 * @param {Object} options
 * @param {number} options.width - Frame width in pixels
 * @param {number} options.height - Frame height in pixels
 * @param {number} [options.frameRate=30]
 * @param {number} [options.frameRateNum]
 * @param {number} [options.frameRateDen]
 * @param {number} [options.profile=3] - ProRes profile (see ProResProfile)
 * @param {string} [options.range="limited"]
 * @param {number} [options.workers] - Worker count (default: min(hardwareConcurrency, 8))
 * @param {function} [options.onFrameData] - Streaming mode (see ProResEncoder)
 * @returns {Promise<ProResEncoderPool>}
 */
async function createProResEncoderPool(options = {}) {
  if (!options.spawnWorker && typeof Worker === 'undefined') {
    throw new Error(
      'Web Workers are not available in this environment; ' +
      'use createProResEncoder() from "prores-wasm-encoder" instead'
    );
  }

  // Compile the WASM once; every worker instantiates from this module.
  const wasmModule = await compileWasmModule();

  // Main-thread module instance, used only for muxing.
  const module = await createModuleFrom(wasmModule);

  let spawnWorker = options.spawnWorker;
  let blobUrl = null;
  if (!spawnWorker) {
    const blob = new Blob([proresWorkerCode], { type: 'text/javascript' });
    blobUrl = URL.createObjectURL(blob);
    spawnWorker = () => {
      try {
        return new Worker(blobUrl, { type: 'module' });
      } catch (err) {
        throw new Error(
          `pool: could not start a Web Worker (${err && err.message || err}). ` +
          'If your Content-Security-Policy blocks blob: workers, add "worker-src blob:" ' +
          'or use createProResEncoder() from "prores-wasm-encoder".'
        );
      }
    };
  }

  try {
    const pool = await ProResEncoderPool.create({ ...options, module, wasmModule, spawnWorker });
    return pool;
  } finally {
    // Every worker has been constructed and reported ready by now, so the
    // Blob URL has been fetched and is safe to release.
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

export { ProResEncoderPool, createProResEncoderPool, createProResEncoderPool as default };
//# sourceMappingURL=prores-encoder-parallel.mjs.map
