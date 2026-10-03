import {drawParticles} from './studio-visuals.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function drawCreativeScene(ctx,{mode,w,h,t,s,notes,tracks,min,max,colorFor,noteName,budget}){
 const count=max-min+1,cx=w/2,cy=mode==='tunnel'?h*.22:h*.5,unit=Math.min(w,h)/720,base=h*.86;
 const hit=Math.min(w,h)*.13,outer=Math.min(w,h)*.46;
 const trackIds=[...tracks.keys()],trackRows=Math.max(1,trackIds.length);
 ctx.save();ctx.lineWidth=unit;ctx.strokeStyle='rgba(159,179,217,.2)';
 if(mode==='tunnel'){
  if(s.grid){for(let i=0;i<=12;i++){const x=w*.08+w*.84*i/12;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(x,base);ctx.stroke();}for(let i=1;i<9;i++){const z=i/8;ctx.beginPath();ctx.moveTo(cx-w*.42*z,cy+(base-cy)*z);ctx.lineTo(cx+w*.42*z,cy+(base-cy)*z);ctx.stroke();}}
  if(s.playhead){ctx.strokeStyle=s.playheadColor;ctx.lineWidth=s.playheadWidth*unit;ctx.beginPath();ctx.moveTo(w*.08,base);ctx.lineTo(w*.92,base);ctx.stroke();}
  if(s.keyboard)for(let p=min;p<=max;p++){const x=w*.08+(p-min)*w*.84/count;ctx.fillStyle=p%12===0?'#788ba9':'#263248';ctx.fillRect(x+unit,base+4*unit,Math.max(1,w*.84/count-2*unit),16*unit);if(s.keyLabels&&p%12===0){ctx.fillStyle='#afbed6';ctx.font=`${11*unit}px system-ui`;ctx.textAlign='center';ctx.fillText(noteName(p),x+w*.42/count,base+35*unit);}}
 }else if(mode==='spiral'){
  if(s.grid){for(let arm=0;arm<6;arm++){ctx.beginPath();for(let j=0;j<=80;j++){const u=j/80,a=arm*Math.PI/3+(1-u)*s.spiralTurns*Math.PI*2+t*s.creativeRotation,r=hit+u*(outer-hit);const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}}
  if(s.playhead){ctx.strokeStyle=s.playheadColor;ctx.beginPath();ctx.arc(cx,cy,hit,0,Math.PI*2);ctx.stroke();}
  if(s.keyboard&&s.keyLabels)for(let p=min;p<=max;p++)if(p%12===0){const a=(p-min)/count*Math.PI*2+s.spiralTurns*Math.PI*2+t*s.creativeRotation;ctx.fillStyle='#b6c2db';ctx.font=`${11*unit}px system-ui`;ctx.textAlign='center';ctx.fillText(noteName(p),cx+Math.cos(a)*(hit-16*unit),cy+Math.sin(a)*(hit-16*unit));}
 }else{
  if(s.grid)for(let i=0;i<trackRows;i++){const y=h*.16+(i+.5)/trackRows*h*.7;ctx.beginPath();ctx.moveTo(w*.08,y);ctx.lineTo(w*.92,y);ctx.stroke();}
  if(s.keyboard&&s.keyLabels)trackIds.forEach((id,i)=>{const tr=tracks.get(id);if(!tr.visible)return;ctx.fillStyle='#99aac5';ctx.font=`${12*unit}px system-ui`;ctx.textAlign='left';ctx.fillText(tr.name||`Track ${i+1}`,w*.04,h*.16+(i+.5)/trackRows*h*.7-18*unit,w*.28);});
 }
 let drawn=0;
 for(const n of notes){if(n.start>t+s.timeWindow)break;const tr=tracks.get(n.trackId);if(!tr?.visible)continue;const p=n.pitch+(n.channel===9?0:s.transpose);if(p<min||p>max)continue;const age=t-n.start,held=age>=0&&t<n.end;if(t-n.end>Math.max(4,s.particleLife)||++drawn>12000)continue;
  const color=colorFor(n,tr),fraction=(p-min+.5)/count;ctx.fillStyle=color;ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=s.glow*unit*(held?1:.35);ctx.globalAlpha=s.opacity;
  if(mode==='tunnel'){
   const zAt=when=>1/(1+Math.max(0,when-t)/s.timeWindow*s.tunnelDepth),z=zAt(n.start),tail=zAt(n.end),lane=(fraction-.5)*w*.84,half=w*.84/count*s.noteWidth/2;
   if(t<=n.end){ctx.globalAlpha=s.opacity*(.25+z*.75);ctx.beginPath();ctx.moveTo(cx+(lane-half)*z,cy+(base-cy)*z);ctx.lineTo(cx+(lane+half)*z,cy+(base-cy)*z);ctx.lineTo(cx+(lane+half)*tail,cy+(base-cy)*tail-2*unit);ctx.lineTo(cx+(lane-half)*tail,cy+(base-cy)*tail-2*unit);ctx.closePath();ctx.fill();}
   ctx.globalAlpha=1;drawParticles(ctx,n,t,cx+lane,base,-Math.PI/2,color,{...s,particleSize:s.particleSize*unit,particleSpread:s.particleSpread*unit},budget);
  }else if(mode==='spiral'){
   const at=when=>{const u=clamp((when-t)/s.timeWindow,0,1),a=fraction*Math.PI*2+(1-u)*s.spiralTurns*Math.PI*2+t*s.creativeRotation,r=hit+u*(outer-hit);return {x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r,a};};
   const head=at(n.start),tip=at(t);
   if(t<=n.end){ctx.lineWidth=(2+4*n.velocity)*unit*s.noteWidth;ctx.beginPath();const from=Math.max(n.start,t),to=Math.min(n.end,t+s.timeWindow);for(let j=0;j<=24;j++){const pt=at(from+(to-from)*j/24);if(!j)ctx.moveTo(pt.x,pt.y);else ctx.lineTo(pt.x,pt.y);}ctx.stroke();ctx.beginPath();ctx.arc(head.x,head.y,(held?5:3)*unit,0,Math.PI*2);ctx.fill();}
   ctx.globalAlpha=1;drawParticles(ctx,n,t,tip.x,tip.y,tip.a,color,{...s,particleSize:s.particleSize*unit,particleSpread:s.particleSpread*unit},budget);
  }else if(age>=0){
   const x=w*.12+fraction*w*.76,y=h*.16+(trackIds.indexOf(n.trackId)+.5)/trackRows*h*.7,life=s.rippleLife;
   if(age<life)for(let j=0;j<3;j++){const phase=age/life-j*.13;if(phase<0)continue;ctx.globalAlpha=s.opacity*(1-phase)*(1-phase);ctx.lineWidth=(2+n.velocity*2)*unit;ctx.beginPath();ctx.arc(x,y,Math.max(.5,(8+phase*s.rippleSize)*unit),0,Math.PI*2);ctx.stroke();}
   if(held||age<.3){ctx.globalAlpha=s.opacity;ctx.beginPath();ctx.arc(x,y,(3+4*n.velocity)*unit,0,Math.PI*2);ctx.fill();}
   ctx.globalAlpha=1;drawParticles(ctx,n,t,x,y,-Math.PI/2,color,{...s,particleSize:s.particleSize*unit,particleSpread:s.particleSpread*unit},budget);
  }
 }
 ctx.restore();
}
