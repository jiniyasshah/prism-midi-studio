export const palettes={
 aurora:['#ad8cf7','#79d4db','#df9bd5','#8eaff8','#edbc88','#98ddbd'],ember:['#ff9d70','#ffd18f','#f77f9f','#de7ac5','#ffbf67','#ffebe0'],ocean:['#65d3ef','#749afd','#80ecd7','#a2befa','#52b6cf','#c5ecff'],mono:['#eeeef7','#bfc9db','#8d9bb5','#d7dcf0','#9fa8c2','#ffffff'],
 neon:['#ff4fbd','#49f2ff','#a16bff','#ffec61','#6affb9','#ff776e'],sakura:['#ff9fc8','#ffc5dd','#d1a7ff','#ffdfa9','#f3b5d2','#a9c7ff'],forest:['#55dfa8','#a6ee87','#48bfb8','#d5e889','#81cbd2','#bedab0'],sunset:['#ff806b','#ffb65f','#e477c5','#a68afa','#fcd68b','#dc9daa'],ice:['#c1f5ff','#8fceff','#e5edff','#77e0de','#a1b3ff','#efffff'],candy:['#ff8db9','#a7a0ff','#7ce2d4','#ffe494','#dbacff','#ffb999'],gold:['#ffe7a3','#eac463','#fff5d8','#c79642','#f3cf94','#fff0bb'],cyber:['#60ffe0','#c7ff54','#5ecbff','#9d8bff','#ff74d2','#b9fff4'],ruby:['#ff5577','#ff839b','#dc618c','#ffb4a4','#c989ec','#f8d4dc'],lavender:['#c1a4ff','#a78af0','#e4ccff','#98a8f8','#c694d9','#e4e2ff'],rainbow:['#ff626b','#ffb657','#f7e86b','#6de19a','#74c8ff','#bd92ff'],dusk:['#7d9ac7','#c99cae','#a99de0','#e5bb93','#72b2bb','#ccd0e8'],custom:['#ad8cf7','#79d4db','#df9bd5','#8eaff8','#edbc88','#98ddbd']
};
export const paletteNames={aurora:'Aurora',ember:'Ember',ocean:'Deep ocean',mono:'Silver screen',neon:'Neon nights',sakura:'Sakura',forest:'Forest light',sunset:'Sunset glow',ice:'Glacier',candy:'Candy pastel',gold:'Champagne gold',cyber:'Cyber mint',ruby:'Ruby bloom',lavender:'Lavender haze',rainbow:'Rainbow',dusk:'Blue hour',custom:'Custom palette'};
export const modeNames={horizontal:'PIANO ROLL',vertical:'FALLING NOTES',comet:'COMET TRAILS',ribbon:'RIBBON FLOW',orbit:'ORBIT',pulse:'PULSE BARS',spiral:'SPIRAL GALAXY',tunnel:'NEON TUNNEL',ripples:'RIPPLE FIELD'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rng=(n,k)=>{const x=Math.sin(n.pitch*127.1+n.start*311.7+k*74.7)*43758.5453;return x-Math.floor(x);};
export function drawParticles(ctx,n,t,x,y,angle,color,s,budget){
 if(!s.particles||!s.particleCount||budget.left<=0)return;
 const age=t-n.start,life=s.particleLife;if(age<0)return;
 const continuous=s.particleMotion==='stream';if(age>(continuous?n.duration+life:life))return;
 const amount=Math.round(s.particleCount*(s.particleVelocity?n.velocity:1));
 ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=s.glow*.35;
 for(let k=0;k<amount&&budget.left>0;k++){
  const seed=rng(n,k),phase=continuous?((age+seed*life)%life)/life:age/life;
  if(continuous&&age>n.duration+life*(1-seed))continue;
  const across=(seed-.5)*s.particleSpread*phase*2,forward=(15+s.particleSpread*(.4+rng(n,k+500)))*phase;
  const px=x+Math.cos(angle)*forward-Math.sin(angle)*across,py=y+Math.sin(angle)*forward+Math.cos(angle)*across;
  const size=Math.max(.2,s.particleSize*(1-phase)*(.6+seed));ctx.globalAlpha=(1-phase)*.85;
  if(s.particleShape==='sparks'){ctx.lineWidth=size;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-Math.cos(angle)*size*4,py-Math.sin(angle)*size*4);ctx.stroke();}
  else if(s.particleShape==='squares')ctx.fillRect(px-size,py-size,size*2,size*2);
  else{ctx.beginPath();ctx.arc(px,py,size,0,Math.PI*2);ctx.fill();}budget.left--;
 }ctx.restore();
}
export function midiEnergy(notes,t,tracks){let energy=0;for(const n of notes){if(n.start>t)break;const age=t-n.start;if(age<.5&&tracks.get(n.trackId)?.visible)energy+=n.velocity*Math.exp(-age*8);}return Math.min(1,energy*.5);}
export function drawBackground(ctx,image,w,h,t,s,color,energy){
 if(!image)return;
 const motion=s.bgMotion,amount=s.bgMovement,phase=t*s.bgSpeed*.08;
 const scale=Math.max(w/image.width,h/image.height)*(1.02+s.bgBlur*4/Math.min(w,h)+amount*.18+(motion==='zoom'?amount*.08*(1-Math.cos(phase)):0)+energy*s.bgPulse*.035);
 const iw=image.width*scale,ih=image.height*scale;
 const dx=motion==='drift'?Math.sin(phase)*Math.max(0,iw-w)*.4:0,dy=motion==='drift'?Math.cos(phase*.73)*Math.max(0,ih-h)*.4:0;
 ctx.save();ctx.globalAlpha=s.bgOpacity;ctx.filter=`blur(${s.bgBlur}px) saturate(${s.bgSaturation}%) brightness(${s.bgBrightness+energy*s.bgPulse*.3})`;
 ctx.drawImage(image,(w-iw)/2+dx,(h-ih)/2+dy,iw,ih);ctx.restore();
 ctx.save();ctx.fillStyle=s.bgTint;ctx.globalAlpha=s.bgTintAmount;ctx.fillRect(0,0,w,h);ctx.globalAlpha=s.bgDim;ctx.fillStyle='#000000';ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
 if(s.bgVignette){const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.12,w/2,h/2,Math.max(w,h)*.68);g.addColorStop(0,'transparent');g.addColorStop(1,`rgba(0,0,0,${s.bgVignette})`);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}

 ctx.restore();
}
export function drawExtraScene(ctx,{mode,w,h,t,s,notes,tracks,min,max,colorFor,noteName,budget}){
 const count=max-min+1,cx=w/2,cy=h*.51,radius=Math.min(w,h)*s.orbitRadius,outer=Math.min(w,h)*.47;
 const base=h-(s.keyboard?48:22),column=w/count;
 ctx.save();ctx.lineWidth=1;
 if(mode==='orbit'){
  if(s.grid)for(const r of [radius,outer]){ctx.strokeStyle='rgba(170,185,220,.16)';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();}
  if(s.playhead){ctx.strokeStyle=s.playheadColor;ctx.lineWidth=s.playheadWidth;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();}
  if(s.keyboard)for(let p=min;p<=max;p++){const a=(p-min)/count*Math.PI*2-Math.PI/2;ctx.strokeStyle='#71809b';ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(radius-6),cy+Math.sin(a)*(radius-6));ctx.lineTo(cx+Math.cos(a)*(radius-12),cy+Math.sin(a)*(radius-12));ctx.stroke();if(s.keyLabels&&p%12===0){ctx.fillStyle='#bdc5dd';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(noteName(p),cx+Math.cos(a)*(radius-24),cy+Math.sin(a)*(radius-24));}}
 }else{
  if(s.grid){ctx.strokeStyle='rgba(150,168,200,.13)';for(let j=1;j<5;j++){ctx.beginPath();ctx.moveTo(0,base-j*h*.17);ctx.lineTo(w,base-j*h*.17);ctx.stroke();}}
  if(s.playhead){ctx.strokeStyle=s.playheadColor;ctx.beginPath();ctx.moveTo(0,base);ctx.lineTo(w,base);ctx.stroke();}
 }
 const bars=new Map();let drawn=0;
 for(const n of notes){if(n.start>t+s.timeWindow)break;const tr=tracks.get(n.trackId);if(!tr?.visible)continue;const p=n.pitch+(n.channel===9?0:s.transpose);if(p<min||p>max||t-n.end>Math.max(2,s.particleLife))continue;if(++drawn>16000)break;
  const age=t-n.start,held=age>=0&&t<n.end,color=colorFor(n,tr);ctx.fillStyle=color;ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=held?s.glow:s.glow*.2;
  if(mode==='orbit'){
   const a=(p-min)/count*Math.PI*2-Math.PI/2,hitX=cx+Math.cos(a)*radius,hitY=cy+Math.sin(a)*radius;
   if(t<=n.end){const r=radius+clamp((n.start-t)/s.timeWindow,0,1)*(outer-radius),tail=radius+clamp((n.end-t)/s.timeWindow,0,1)*(outer-radius);ctx.globalAlpha=s.opacity*(held?1:.65);ctx.lineWidth=Math.max(2,(s.velocitySize?n.velocity:1)*s.noteWidth*8);ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(a)*tail,cy+Math.sin(a)*tail);ctx.stroke();ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,held?5:3,0,Math.PI*2);ctx.fill();}
   ctx.globalAlpha=1;drawParticles(ctx,n,t,hitX,hitY,a,color,s,budget);
  }else if(age>=0){
   const level=(held?n.velocity:n.velocity*Math.exp(-(t-n.end)*5));const existing=bars.get(p);if(!existing||level>existing.level)bars.set(p,{level,color});
   drawParticles(ctx,n,t,(p-min+.5)*column,base,-Math.PI/2,color,s,budget);
  }
 }
 if(mode==='pulse')for(let p=min;p<=max;p++){const bar=bars.get(p),x=(p-min)*column,barHeight=(bar?.level||0)*h*.7*s.pulseHeight;
  ctx.shadowBlur=s.glow*.5;ctx.fillStyle=bar?.color||'#536079';ctx.globalAlpha=bar?s.opacity:.12;ctx.fillRect(x+column*(1-s.noteWidth)/2,base-Math.max(2,barHeight),Math.max(1,column*s.noteWidth-1),Math.max(2,barHeight));ctx.globalAlpha=1;
  if(s.keyboard){ctx.shadowBlur=0;ctx.globalAlpha=bar?1:.35;ctx.fillRect(x+1,base+5,Math.max(1,column-2),18);ctx.globalAlpha=1;if(s.keyLabels&&p%12===0){ctx.fillStyle='#aab5ce';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(noteName(p),x+column/2,base+37);}}
 }
 ctx.restore();
}
