import test from 'node:test';
import assert from 'node:assert/strict';
import {smokeFrame,drawSmoke,smokePresets} from '../dist/smoke.js';

test('all four smoke styles are deterministic, moving and resolution independent',()=>{
 const signatures=[];
 for(const style of Object.keys(smokePresets)){
  const s={...smokePresets[style],smokeSeed:73},a=smokeFrame(1280,720,5,s),b=smokeFrame(3840,2160,5,s);
  assert.ok(a.length>0&&a.length<=48);assert.deepEqual(a,smokeFrame(1280,720,5,s));assert.notDeepEqual(a,smokeFrame(1280,720,6,s));
  for(let i=0;i<a.length;i++){for(const k of ['x','y','width','height'])assert.ok(Math.abs(a[i][k]*3-b[i][k])<1e-8);assert.equal(a[i].alpha,b[i].alpha);}
  signatures.push(JSON.stringify(a));
 }
 assert.equal(new Set(signatures).size,4);
});
test('smoke switches, opacity and zero speed preserve settings and stop rendering/motion',()=>{
 const s={...smokePresets.fog,smokeSeed:73};
 for(const override of [{smokeEnabled:false},{smokeOpacity:0},{smokeDensity:0}])assert.equal(smokeFrame(1280,720,4,{...s,...override}).length,0);
 assert.deepEqual(smokeFrame(1280,720,0,{...s,smokeSpeed:0}),smokeFrame(1280,720,99,{...s,smokeSpeed:0}));
 drawSmoke({save(){assert.fail('disabled layer should not paint')}},1280,720,1,s,'front');
});
