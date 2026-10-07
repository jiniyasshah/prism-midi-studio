const time=seconds=>{const n=Math.ceil(seconds);return n>=60?`${Math.floor(n/60)}m ${n%60}s`:`${n}s`;};
const size=bytes=>bytes>=1024**3?`${(bytes/1024**3).toFixed(2)} GB`:`${(bytes/1024**2).toFixed(1)} MB`;
export function exportReport(stats,fullDuration){
 if(!stats||!Number.isFinite(stats.bytes)||stats.duration<=0)return '';
 const elapsed=stats.elapsedMs/1000;
 let text=`${stats.duration.toFixed(1)}s video · ${size(stats.bytes)} · rendered in ${time(elapsed)}.`;
 if(fullDuration>stats.duration+.1){const scale=fullDuration/stats.duration;text+=` Full range at this sample rate: ~${time(elapsed*scale)} and ~${size(stats.bytes*scale)}. This is an estimate; busier sections may take longer and be larger.`;}
 return text;
}
