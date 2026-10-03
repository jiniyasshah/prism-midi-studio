export class Synth {
  async init(offlineContext=null){
    if(!this.ctx){
      const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Audio is not supported in this browser.');
      this.ctx=offlineContext||new C();this.offline=!!offlineContext;this.master=this.ctx.createGain();this.master.gain.value=.65;
      this.compressor=this.ctx.createDynamicsCompressor();this.compressor.threshold.value=-16;this.compressor.ratio.value=8;
      this.dry=this.ctx.createGain();this.dry.gain.value=.9;this.wet=this.ctx.createGain();this.wet.gain.value=.2;
      this.delay=this.ctx.createDelay(1);this.delay.delayTime.value=.18;this.feedback=this.ctx.createGain();this.feedback.gain.value=.24;
      this.input=this.ctx.createGain();this.input.connect(this.dry);this.dry.connect(this.master);this.input.connect(this.delay);this.delay.connect(this.feedback);this.feedback.connect(this.delay);this.delay.connect(this.wet);this.wet.connect(this.master);
      this.master.connect(this.compressor);this.compressor.connect(this.ctx.destination);if(!this.offline){this.destination=this.ctx.createMediaStreamDestination();this.compressor.connect(this.destination);}
      this.voices=new Set();
      const n=this.ctx.sampleRate;this.noise=this.ctx.createBuffer(1,n,this.ctx.sampleRate);const ar=this.noise.getChannelData(0);let seed=729;for(let i=0;i<n;i++){seed=(seed*16807)%2147483647;ar[i]=(seed/2147483647)*2-1;}
    }
    if(!this.offline)await this.ctx.resume();
  }
  setVolume(value){if(this.master)this.master.gain.setTargetAtTime(value,this.ctx.currentTime,.025);}
  setSpace(value){if(this.wet)this.wet.gain.setTargetAtTime(value*.5,this.ctx.currentTime,.025);}
  stop(){if(!this.ctx)return;for(const v of this.voices){try{v.gain.gain.cancelScheduledValues(this.ctx.currentTime);v.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.008);v.sources.forEach(s=>s.stop(this.ctx.currentTime+.03));}catch{}}this.voices.clear();
    this.delay.disconnect();this.feedback.disconnect();this.delay=this.ctx.createDelay(1);this.delay.delayTime.value=.18;this.feedback=this.ctx.createGain();this.feedback.gain.value=.24;this.input.disconnect();this.input.connect(this.dry);this.input.connect(this.delay);this.delay.connect(this.feedback);this.feedback.connect(this.delay);this.delay.connect(this.wet);
  }
  play(note,track,when,duration,transpose=0,brightness=.5){
    if(!this.ctx||(!this.offline&&this.voices.size>=256))return;
    const ctx=this.ctx,start=Math.max(when,ctx.currentTime),dur=Math.max(.025,duration),pitch=note.pitch+(note.channel===9?0:transpose),freq=440*2**((pitch-69)/12);
    const program=track.instrument==='auto'?note.program:Number(track.instrument),family=Math.floor(program/8),drum=note.channel===9;
    const gain=ctx.createGain(),pan=ctx.createStereoPanner(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=Math.min(18000,1800+brightness*14000);filter.Q.value=.3;
    pan.pan.value=Math.max(-1,Math.min(1,track.pan+(note.pan||0)));gain.connect(filter);filter.connect(pan);pan.connect(this.input);
    const volume=note.velocity*(note.volume??1)*track.volume*.22;
    const sources=[];let release=.23;
    const osc=(type,f,level=1)=>{const s=ctx.createOscillator(),g=ctx.createGain();s.type=type;s.frequency.value=f;g.gain.value=level;s.connect(g);g.connect(gain);s.start(start);sources.push(s);return s;};
    if(drum){
      if(note.pitch===35||note.pitch===36||note.pitch===41||note.pitch===43){const s=osc('sine',150);s.frequency.setValueAtTime(150,start);s.frequency.exponentialRampToValueAtTime(45,start+.16);release=.15;}
      else{const s=ctx.createBufferSource();s.buffer=this.noise;const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=note.pitch>=42?5000:1400;s.connect(high);high.connect(gain);s.start(start);sources.push(s);release=.07;}
    }else if(family===0){osc('sine',freq,1);osc('sine',freq*2,.35);osc('sine',freq*3,.13);osc('sine',freq*4,.055);release=.33;}
    else if(family===1||family===13){osc('sine',freq,.9);osc('sine',freq*2.002,.3);osc('sine',freq*4.01,.1);release=.45;}
    else if(family===2){osc('sine',freq,.7);osc('sine',freq*2,.25);osc('sine',freq*3,.18);release=.1;}
    else if(family===3){osc('triangle',freq,.9);osc('sine',freq*2,.2);release=.13;}
    else if(family===4){osc('triangle',freq,.7);osc('sine',freq/2,.4);release=.12;}
    else if(family===5||family===6||family===11||family===12){osc('triangle',freq*.998,.45);osc('triangle',freq*1.002,.45);osc('sine',freq*.5,.15);release=.5;}
    else if(family===7||family===8||family===10){osc(family===10&&program%8===0?'square':'sawtooth',freq,.4);osc('sine',freq,.5);release=.12;}
    else{osc('sine',freq,.9);osc('triangle',freq*2,.1);release=.2;}
    const sustained=!drum&&[2,5,6,7,8,9,10,11,12].includes(family),attack=sustained?.04:.005;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+Math.min(attack,dur*.4));
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*(sustained?.72:drum?.01:.2)),start+dur);
    gain.gain.exponentialRampToValueAtTime(.00001,start+dur+release);
    const voice={gain,sources};this.voices.add(voice);sources.forEach(s=>s.stop(start+dur+release+.01));
    sources[0].onended=()=>{this.voices.delete(voice);gain.disconnect();filter.disconnect();pan.disconnect();};
  }
}
