import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
test('project frame/visibility controls have one Settings home and music has one picker',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 const settings=html.slice(html.indexOf('id="panel-settings"'),html.indexOf('id="panel-export"'));
 for(const id of ['resolution','resolution-width','resolution-height','aspect','fps','visibility-controls','hide-guides','save-look','load-look'])assert.ok(settings.includes(`id="${id}"`),id);
 assert.equal((html.match(/<input[^>]*accept="[^"]*audio[^>]*>/g)||[]).length,1);
 for(const id of ['audio-offset','audio-rate','audio-gain','audio-mode','audio-fit','remove-audio','transcription-download','transcription-add','transcription-replace','record-live','snapshot','transparent-format','compact-quality'])assert.ok(ids.includes(id),id);
 for(const tab of ['media','visual','scene','tracks','settings','export'])assert.ok(ids.includes('tab-'+tab));
});
test('export locks moved controls once and restores previously disabled state',()=>{
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,dataset:{}});return nodes.get(id);};
 $('resolution-width').disabled=true;
 const context={$,recording:false,document:{body:{classList:{toggle(){}}}},$$:()=>[$('resolution'),$('fps'),$('resolution-width'),$('setting-smokeEnabled')]};
 const code=app.slice(app.indexOf('function recordUI('),app.indexOf('async function startDirectExport('));vm.runInNewContext(code,context);
 context.recordUI(true);assert.equal($('fps').disabled,true);assert.equal($('setting-smokeEnabled').disabled,true);context.recordUI(false);
 assert.equal($('resolution').disabled,false);assert.equal($('fps').disabled,false);assert.equal($('resolution-width').disabled,true);assert.equal($('setting-smokeEnabled').disabled,false);
});
