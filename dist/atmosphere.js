const wrap=x=>((x%1)+1)%1;
const random=(i,seed)=>{let n=Math.imul(i+1,374761393)^Math.imul(seed+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
export function musicalBeat(song,t){
 const map=song.tempoMap||[];let lo=0,hi=map.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(map[mid].seconds<=t)lo=mid+1;else hi=mid;}
 const segment=map[Math.max(0,lo-1)];
 return segment?segment.tick/(song.ppq||480)+(t-segment.seconds)/(segment.mpqn/1e6):t*(song.bpm||120)/60;
}
export function atmosphereFrame(w,h,t,s,colors,beat){
 if(!s.bgDust)return [];
 const unit=Math.min(w,h)/720,angle=s.dustDirection*Math.PI/180,seed=s.dustSeed||1;
 const phase=wrap(beat*s.dustBeatDivision),pulse=s.dustBeat?Math.exp(-phase*s.dustBeatDecay)*s.dustBeatStrength:0;
 const particles=[];
 for(let i=0;i<s.bgDust;i++){
  const a=random(i,seed),b=random(i+500,seed),c=random(i+1000,seed),depth=.4+c*.9;
  const travel=t*s.dustSpeed*.025*depth;
  let x,y;
  if(s.dustMotion==='swirl'){
   const radius=.12+b*.58,theta=a*Math.PI*2+angle+travel*2*(s.dustClockwise?1:-1);
   x=.5+Math.cos(theta)*radius*h/w;y=.5+Math.sin(theta)*radius;
  }else if(s.dustMotion==='radial'){
   const radius=wrap(b+travel)*.8,theta=a*Math.PI*2+angle;x=.5+Math.cos(theta)*radius*h/w;y=.5+Math.sin(theta)*radius;
  }else{x=wrap(a+Math.cos(angle)*travel*h/w);y=wrap(b+Math.sin(angle)*travel);}
  x+=Math.sin(t*s.dustSpeed*.5+a*12)*s.dustWander*.015;y+=Math.cos(t*s.dustSpeed*.4+b*12)*s.dustWander*.015;
  const size=s.dustSize*unit*(1-s.dustVariation+c*s.dustVariation*2)*(1+pulse*.8);
  const twinkle=1-s.dustTwinkle*(.5+.5*Math.sin(t*(.7+c)+a*12));
  const opacity=Math.min(1,s.dustOpacity*twinkle*(1+pulse));
  const color=s.dustColorMode==='single'?s.dustColor:s.dustColorMode==='rainbow'?`hsl(${Math.round(a*360)},90%,75%)`:colors[i%colors.length];
  particles.push({x:x*w,y:y*h,size,opacity,color,angle:angle+(s.dustMotion==='radial'?a*Math.PI*2:0),glow:s.dustGlow*unit*(1+pulse)});
 }
 return particles;
}
export function drawAtmosphere(ctx,w,h,t,s,colors,song){
 const particles=atmosphereFrame(w,h,t,s,colors,musicalBeat(song,t));
 if(!particles.length)return;
 ctx.save();ctx.filter='none';ctx.globalCompositeOperation=s.dustBlend;
 for(const p of particles){
  ctx.globalAlpha=p.opacity;ctx.fillStyle=p.color;ctx.strokeStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=p.glow;
  ctx.lineWidth=Math.max(.6*Math.min(w,h)/720,p.size*.2);ctx.beginPath();
  if(s.dustShape==='stars'){
   for(let k=0;k<8;k++){const a=k*Math.PI/4-Math.PI/2,r=k%2?p.size*.25:p.size*1.7;const x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();
  }else if(s.dustShape==='diamonds'){ctx.moveTo(p.x,p.y-p.size);ctx.lineTo(p.x+p.size*.7,p.y);ctx.lineTo(p.x,p.y+p.size);ctx.lineTo(p.x-p.size*.7,p.y);ctx.closePath();ctx.fill();}
  else if(s.dustShape==='streaks'){ctx.lineWidth=p.size*.5;ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-Math.cos(p.angle)*p.size*5,p.y-Math.sin(p.angle)*p.size*5);ctx.stroke();}
  else{ctx.arc(p.x,p.y,p.size,0,Math.PI*2);if(s.dustShape==='rings')ctx.stroke();else if(s.dustShape==='bokeh'){ctx.globalAlpha*=.55;ctx.fill();ctx.globalAlpha=p.opacity;ctx.stroke();}else ctx.fill();}
 }
 ctx.restore();
}
export const atmospherePresets={
 stardust:{bgDust:100,dustShape:'stars',dustSize:3,dustSpeed:.5,dustDirection:270,dustMotion:'swirl',dustColorMode:'palette',dustOpacity:.6,dustGlow:9,dustBeat:true,dustBeatStrength:.5,dustTwinkle:.45},
 snow:{bgDust:140,dustShape:'dots',dustSize:4,dustSpeed:.8,dustDirection:90,dustMotion:'drift',dustColorMode:'single',dustColor:'#e4f4ff',dustOpacity:.65,dustGlow:2,dustBeat:false,dustTwinkle:.1},
 embers:{bgDust:90,dustShape:'streaks',dustSize:3,dustSpeed:1.3,dustDirection:270,dustMotion:'drift',dustColorMode:'single',dustColor:'#ffae68',dustOpacity:.75,dustGlow:12,dustBeat:true,dustBeatStrength:.45,dustTwinkle:.25},
 fireflies:{bgDust:65,dustShape:'bokeh',dustSize:4,dustSpeed:.25,dustDirection:270,dustMotion:'drift',dustColorMode:'single',dustColor:'#b3f889',dustOpacity:.6,dustGlow:16,dustBeat:false,dustTwinkle:.8}
};
