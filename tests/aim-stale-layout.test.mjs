import test from 'node:test';
import assert from 'node:assert/strict';
import {muzzleOnOverlay} from '../web/js/geometry.mjs';
import {powerFromPull} from '../web/js/charge.mjs';

test('拖动小炮之后瞄准使用新窗口坐标，并以抬手位置作为最终发射值', async()=>{
 const oldLayout={cannonX:740,cannonY:520,overlayX:0,overlayY:0};
 const newLayout={...oldLayout,cannonX:900,cannonY:600};
 let calls=0, resolveLatest;
 const emitted=[];
 globalThis.__TAURI__={
   core:{invoke:async()=>{calls++; if(calls===1)return oldLayout;
     if(calls===2)return await new Promise(resolve=>{resolveLatest=resolve});
     return newLayout;
   }},
   event:{listen:async()=>()=>{},emit:async(name,payload)=>{emitted.push({name,payload});}},
   window:{getCurrentWindow:()=>({startDragging:async()=>{}})},
 };
 class FakeElement {
  constructor(){this.style={setProperty(){}};this.dataset={state:'idle'};this.handlers={};this.captured=false;}
  addEventListener(type,fn){this.handlers[type]=fn;}
  fire(type, props={}){this.handlers[type]?.({button:0,pointerId:1,clientX:100,clientY:100,preventDefault(){},stopPropagation(){},...props});}
  setPointerCapture(){this.captured=true;}
  hasPointerCapture(){return this.captured;}
  releasePointerCapture(){this.captured=false;}
 }
 const nodes=Object.fromEntries(['#scene','#recoil','#bolt','#bolt-spring','#power-fill','#power-number','#angle-number','#flash','#mesh-frame','#lever-axis'].map(k=>[k,new FakeElement()]));
 globalThis.document={querySelector:key=>nodes[key]};
 globalThis.window={setInterval,clearInterval,addEventListener(){}};
 await import('../web/js/cannon.mjs?layout-regression');
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(calls,1);
 nodes['#bolt'].fire('pointerdown');
 nodes['#bolt'].fire('pointermove',{clientX:140,clientY:110});
 assert.equal(emitted.filter(e=>e.name==='cannon:aim').length,0,'old layout must not be used');
 resolveLatest(newLayout);
 await new Promise(resolve=>setTimeout(resolve,0));
 const preview=emitted.filter(e=>e.name==='cannon:aim').at(-1).payload;
 const expected=muzzleOnOverlay(newLayout,36.5);
 assert.ok(Math.abs(preview.x-expected.x)<1e-8);
 assert.ok(Math.abs(preview.y-expected.y)<1e-8);
 // Pointerup happens elsewhere even when the last pointermove was lost.
 nodes['#bolt'].fire('pointerup',{clientX:160,clientY:112});
 await new Promise(resolve=>setTimeout(resolve,0));
 const shot=emitted.filter(e=>e.name==='cannon:fire').at(-1).payload;
 assert.equal(shot.angle,37);
 assert.equal(shot.power,powerFromPull(60));
 const end=muzzleOnOverlay(newLayout,37);
 assert.ok(Math.abs(shot.x-end.x)<1e-8);
 assert.ok(Math.abs(shot.y-end.y)<1e-8);
});
