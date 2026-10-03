export function audioPlacement(midiTime,stopTime,offset,rate,speed,bufferDuration){
 const from=Math.max(midiTime,offset),to=Math.min(stopTime,offset+bufferDuration/rate);
 if(to<=from)return null;
 return {delay:(from-midiTime)/speed,bufferOffset:(from-offset)*rate,duration:(to-from)/speed,playbackRate:speed*rate};
}
export function scheduleAudioBuffer(context,buffer,{offset=0,rate=1,gain=1},midiTime,stopTime,speed,destination,when=context.currentTime){
 const placement=audioPlacement(midiTime,stopTime,offset,rate,speed,buffer.duration);if(!placement)return null;
 const source=context.createBufferSource(),volume=context.createGain();source.buffer=buffer;source.playbackRate.value=placement.playbackRate;volume.gain.value=gain;source.connect(volume);volume.connect(destination);
 source.start(when+placement.delay,placement.bufferOffset);source.stop(when+placement.delay+placement.duration);
 source.onended=()=>{source.disconnect();volume.disconnect();};
 return {setGain(value){volume.gain.setTargetAtTime(value,context.currentTime,.015);},stop(){try{source.stop();}catch{}source.disconnect();volume.disconnect();}};
}
export function makeWaveform(buffer,bins=2000){
 const data=buffer.getChannelData(0),peaks=new Float32Array(bins),stride=Math.max(1,Math.floor(data.length/bins));
 for(let i=0;i<bins;i++){let peak=0;const end=Math.min(data.length,(i+1)*stride);for(let j=i*stride;j<end;j+=Math.max(1,Math.floor(stride/100)))peak=Math.max(peak,Math.abs(data[j]));peaks[i]=peak;}
 return peaks;
}
