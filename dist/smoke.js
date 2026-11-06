// Procedural translucent clouds, shared by preview and every video exporter.
// Coordinates depend only on MIDI time and seed, so seeking is reproducible.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fract=x=>x-Math.floor(x);
const hash=(x,y,seed)=>fract(Math.sin(x*127.1+y*311.7+seed*17.13)*43758.5453);
const smooth=x=>x*x*(3-2*x);
function noise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y),u=smooth(fract(x)),v=smooth(fract(y));const a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;}
export const smokePresets={
 fog:{smokeEnabled:true,smokeStyle:'fog',smokeColor:'#b5c5dc',smokeOpacity:.42,smokeDensity:55,smokeSize:.7,smokeSpeed:.35,smokeDirection:0,smokeTurbulence:.35,smokeHeight:.83,smokeLayer:'behind'},
 rising:{smokeEnabled:true,smokeStyle:'rising',smokeColor:'#c1b2ca',smokeOpacity:.48,smokeDensity:45,smokeSize:.48,smokeSpeed:.55,smokeDirection:270,smokeTurbulence:.7,smokeHeight:.85,smokeLayer:'behind'},
 mist:{smokeEnabled:true,smokeStyle:'mist',smokeColor:'#a9d7d8',smokeOpacity:.3,smokeDensity:35,smokeSize:.8,smokeSpeed:.25,smokeDirection:15,smokeTurbulence:.4,smokeHeight:.48,smokeLayer:'behind'},
 wisps:{smokeEnabled:true,smokeStyle:'wisps',smokeColor:'#d6c8ee',smokeOpacity:.45,smokeDensity:35,smokeSize:.5,smokeSpeed:.45,smokeDirection:340,smokeTurbulence:.85,smokeHeight:.64,smokeLayer:'behind'}
};
export function smokeFrame(w,h,time,s){
 if(!s.smokeEnabled||s.smokeOpacity<=0||s.smokeDensity<=0||w<=0||h<=0)return [];
 const style=s.smokeStyle||'fog',seed=Number(s.smokeSeed)||73,density=clamp(s.smokeDensity,0,100),count=Math.ceil(density*.48),t=Math.max(0,time)*clamp(s.smokeSpeed,0,3),angle=(s.smokeDirection||0)*Math.PI/180,turbulence=clamp(s.smokeTurbulence,0,1.5),height=clamp(s.smokeHeight,0,1),size=clamp(s.smokeSize,.15,1.5);
 const result=[];
 for(let i=0;i<count;i++){
  const r=k=>hash(i+1,k,seed),life=12+r(1)*14,phase=fract(t/life+r(2)),envelope=Math.sin(Math.PI*phase)**1.4;
  const travel=phase-.5,drift=travel*.8;
  let x=r(3),y=height+(r(4)-.5)*.24;
  if(style==='rising'){x=.12+r(3)*.76+Math.sin(t*.21+r(6)*6)*turbulence*.08;y=height+travel*Math.sin(angle)*.95;x+=travel*Math.cos(angle)*.35;}
  else if(style==='mist'){x+=drift*Math.cos(angle);y=height+(r(4)-.5)*.75+drift*Math.sin(angle)*.5;}
  else{x+=drift*Math.cos(angle);y+=drift*Math.sin(angle)*.35;}
  x+=Math.sin(t*.16+r(7)*6)*turbulence*.07;y+=Math.cos(t*.19+r(8)*6)*turbulence*.045;
  const base=Math.min(w,h)*size*(.45+r(5)*.55),stretch=style==='fog'?3.1:style==='wisps'?3.6:style==='mist'?2.1:1.2;
  result.push({x:x*w,y:y*h,width:base*stretch,height:base*(style==='wisps'?.42:style==='fog'?.8:1.3),rotation:style==='wisps'?(Math.sin(t*.12+r(9)*6)*.25+angle):style==='rising'?Math.sin(t*.15+r(9)*6)*.7:Math.sin(t*.1+r(9)*6)*.12,alpha:clamp(s.smokeOpacity,0,1)*envelope*(.16+ r(10)*.18),variant:i%4});
 }
 return result;
}
const textures=new Map();
function texture(color,variant,seed){
 const key=`${color}:${variant}:${seed}`;if(textures.has(key))return textures.get(key);
 const size=128,c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(size,size):document.createElement('canvas');c.width=c.height=size;
 const g=c.getContext('2d'),pixels=g.createImageData(size,size),rgb=/^#[0-9a-f]{6}$/i.test(color)?color:'#b5c5dc';
 const red=parseInt(rgb.slice(1,3),16),green=parseInt(rgb.slice(3,5),16),blue=parseInt(rgb.slice(5,7),16);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=x/(size-1),ny=y/(size-1),warp=noise(nx*3,ny*3,seed+variant)*.24,dx=(nx-.5)*2,dy=(ny-.5)*2;
  const edge=Math.max(0,1-Math.sqrt(dx*dx+dy*dy)),cloud=.55*noise(nx*4+warp,ny*4,seed+variant)+.3*noise(nx*9,ny*9+warp,seed+variant+4)+.15*noise(nx*19,ny*19,seed+variant+9);
  const i=(y*size+x)*4;pixels.data[i]=red;pixels.data[i+1]=green;pixels.data[i+2]=blue;pixels.data[i+3]=Math.round(255*Math.pow(edge,.7)*smooth(clamp((cloud-.15)*1.65,0,1)));
 }
 g.putImageData(pixels,0,0);if(textures.size>=12)textures.delete(textures.keys().next().value);textures.set(key,c);return c;
}
export function drawSmoke(ctx,w,h,t,s,layer='behind'){
 if((s.smokeLayer||'behind')!==layer)return;
 const puffs=smokeFrame(w,h,t,s);if(!puffs.length)return;
 ctx.save();ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;ctx.filter='none';
 for(const puff of puffs){ctx.save();ctx.translate(puff.x,puff.y);ctx.rotate(puff.rotation);ctx.globalAlpha=puff.alpha;ctx.drawImage(texture(s.smokeColor,puff.variant,Number(s.smokeSeed)||73),-puff.width/2,-puff.height/2,puff.width,puff.height);ctx.restore();}
 ctx.restore();
}
