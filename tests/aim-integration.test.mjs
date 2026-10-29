import test from 'node:test';
import assert from 'node:assert/strict';
import { muzzleOnOverlay } from '../web/js/geometry.mjs';

test('二维拉闩完整事件链：旋转/预览/发射/复位/Esc取消',async()=>{
 const callbacks=new Map();const events=[];
 const layout={cannonX:1250,cannonY:600,overlayX:0,overlayY:0};
 globalThis.__TAURI__={
  core:{invoke:async()=>({...layout})},
  event:{listen:async(n,f)=>{const a=callbacks.get(n)||[];a.push(f);callbacks.set(n,a);return()=>{};},
    emit:async(n,p)=>{events.push({name:n,payload:p}); for(const f of callbacks.get(n)||[])f({payload:p});}},
  window:{getCurrentWindow:()=>({startDragging:async()=>{}})}
 };
 class Element{
  constructor(){this.style={setProperty(name,value){this[name]=value}};this.dataset={state:'idle'};this.handlers={};this.captured=false;this.textContent='';}
  addEventListener(n,fn){this.handlers[n]=fn;}
  fire(n,props={}){this.handlers[n]?.({pointerId:1,button:0,clientX:100,clientY:100,preventDefault(){},stopPropagation(){},...props});}
  setPointerCapture(){this.captured=true;}
  hasPointerCapture(){return this.captured;}
  releasePointerCapture(){this.captured=false;}
 }
 const elements=Object.fromEntries(['#scene','#recoil','#bolt','#bolt-spring','#power-fill','#power-number','#angle-number','#flash','#mesh-frame','#lever-axis'].map(key=>[key,new Element()]));
 globalThis.document={querySelector: k=>elements[k]};
 const windowHandlers={};
 globalThis.window={setInterval,clearInterval,addEventListener:(n,fn)=>windowHandlers[n]=fn};
 await import('../web/js/cannon.mjs?aim-integration');
 const bolt=elements['#bolt'];
 bolt.fire('pointerdown');
 bolt.fire('pointermove',{clientX:160,clientY:120});
 assert.equal(window.__cannonDebug.angle,38);
 assert.equal(window.__cannonDebug.pull,60);
 assert.equal(elements['#mesh-frame'].src,'/assets/mesh/frames/pitch_16.png');
 assert.match(elements['#lever-axis'].style.transform,/rotate\(4deg\)/);
 assert.equal(elements['#bolt'].style.transform,'translateX(60px)');
 assert.equal(elements['#bolt-spring'].style.width,'70px');
 await new Promise(r=>setTimeout(r,10));
 assert.ok(events.some(x=>x.name==='cannon:aim'&&x.payload.angle===38));
 const before=events.filter(x=>x.name==='cannon:fire').length;
 bolt.fire('pointerup',{clientX:160,clientY:120});
 await new Promise(r=>setTimeout(r,8));
 assert.equal(events.filter(x=>x.name==='cannon:fire').length,before+1);
 const shot=events.find(x=>x.name==='cannon:fire').payload;
 assert.equal(shot.angle,38);
 assert.ok(Math.abs(shot.x-muzzleOnOverlay(layout,38).x)<1e-8);
 assert.ok(Math.abs(shot.y-muzzleOnOverlay(layout,38).y)<1e-8);
 assert.ok(events.findIndex(x=>x.name==='cannon:aim-stop') < events.findIndex(x=>x.name==='cannon:fire')); // stop-aim before fire
 await new Promise(r=>setTimeout(r,430));
 assert.equal(window.__cannonDebug.state,'idle');
 assert.equal(window.__cannonDebug.angle,38); // aiming persists
 const shots=events.filter(x=>x.name==='cannon:fire').length;
 bolt.fire('pointerdown',{clientX:100,clientY:100});
 bolt.fire('pointermove',{clientX:170,clientY:130});
 windowHandlers.keydown({key:'Escape'});
 assert.equal(bolt.captured,false);
 assert.equal(window.__cannonDebug.state,'idle');
 assert.equal(events.filter(x=>x.name==='cannon:fire').length,shots);
 assert.equal(window.__cannonDebug.angle,38); // cancel restores pre-drag pitch
});
