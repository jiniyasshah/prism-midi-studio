import {validateAudioFile} from './transcription-core.js';
// Validate the complete choice before changing the arrangement.
export function classifyMediaFiles(list){
 const files=Array.from(list||[]),midi=[],audio=[];
 if(!files.length)throw Error('Choose MIDI files or an audio recording.');
 for(const file of files){if(/\.(mid|midi)$/i.test(file.name))midi.push(file);else{validateAudioFile(file);audio.push(file);}}
 if(audio.length>1)throw Error('Choose one audio recording at a time. You can select multiple MIDI files together.');
 return {midi,audio:audio[0]||null};
}
