import test from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor() { this.style = { setProperty(name,value) { this[name]=value; } }; this.dataset = { state: 'idle' }; this.textContent = ''; this.handlers = new Map(); this.captured = false; }
  addEventListener(event, fn) { this.handlers.set(event, fn); }
  fire(event, more = {}) { this.handlers.get(event)?.({ pointerId: 4, clientX: 210,
    preventDefault() {}, ...more }); }
  setPointerCapture() { this.captured = true; }
  hasPointerCapture() { return this.captured; }
  releasePointerCapture() { this.captured = false; }
}

test('从炮闩按下、拖动、松手，到跨窗事件、炮弹生成和动画恢复', async () => {
  const callbacks = new Map();
  const emitted = [];
  const layout = { overlayX:0, overlayY:0, cannonX:1545, cannonY:788,
    screenWidth:1920, screenHeight:1080, taskbarTop:1032, scaleFactor:1 };
  let layoutCalls = 0;
  globalThis.__TAURI__ = {
    core: { invoke: async (name) => { assert.equal(name,'get_layout'); layoutCalls++; return {...layout}; } },
    event: {
      listen: async (name, fn) => { if(!callbacks.has(name)) callbacks.set(name, []);callbacks.get(name).push(fn);return () => {}; },
      emit: async (name,payload) => {
        emitted.push({ name,payload });
        for (const fn of callbacks.get(name) ?? []) fn({payload});
      },
    },
  };
  const elements = Object.fromEntries(['#scene','#recoil','#bolt','#bolt-spring','#power-fill','#power-number'].map(k => [k,new FakeElement()]));
  let nativeDrags = 0;
  globalThis.__TAURI__.window = { getCurrentWindow: () => ({ startDragging: async () => { nativeDrags++; } }) };
  const handlers = {};
  globalThis.window = {
    setInterval, clearInterval, innerWidth:1920, innerHeight:1080,devicePixelRatio:1,
    addEventListener:(event,fn)=>{handlers[event]=fn;},
  };
  globalThis.document = { querySelector: (selector) => elements[selector] };
  await import('../web/js/cannon.mjs?integration');
  await new Promise(r=>setTimeout(r,3));
  assert.equal(window.__cannonDebug.state,'idle');
  const ctx = { setTransform(){},clearRect(){},drawImage(){ this.draws=(this.draws ?? 0)+1; },
    beginPath(){},arc(){},fill(){},save(){},restore(){},globalAlpha:1 };
  const canvas = {width:0,height:0,style:{},getContext:()=>ctx};
  globalThis.document = {querySelector: (selector) => selector==='#field'?canvas:null};
  globalThis.Image = class { complete=true; naturalWidth=65; set src(v){this._src=v;} };
  const frames = []; let nextRaf=0;
  globalThis.requestAnimationFrame = (fn) => {frames.push(fn);return ++nextRaf;};
  await import('../web/js/overlay.mjs?integration');
  await new Promise(r=>setTimeout(r,3));
  const bolt=elements['#bolt'];
  // The cannon BODY, unlike the knob, must initiate native window dragging.
  elements['#recoil'].fire('mousedown', {button:0});
  assert.equal(nativeDrags, 1);
  elements['#recoil'].fire('mousedown',{button:2});
  assert.equal(nativeDrags,1);
  assert.equal(window.__cannonDebug.state, 'idle');
  assert.equal(emitted.filter(v=>v.name==='cannon:fire').length, 0);
  bolt.fire('pointerdown',{clientX:208});
  assert.equal(window.__cannonDebug.state,'charging');
  bolt.fire('pointermove',{clientX:292});
  assert.ok(window.__cannonDebug.pull>=83);
  assert.ok(Number.parseInt(elements['#power-number'].textContent)>=90);
  // Pull the knob and extend the spring to physically bridge the gap.
  assert.equal(elements['#bolt-spring'].style.width,'94px');
  assert.equal(elements['#bolt'].style.transform,'translateX(84px)');
  // Simulate OS window move: shot coordinates must use NEW position.
  layout.cannonX += 120;
  layout.cannonY -= 70;
  bolt.fire('pointerup',{clientX:292});
  await new Promise(r=>setTimeout(r,5));
  assert.equal(emitted.filter(v=>v.name==='cannon:fire').length,1);
  const shot=emitted.find(v=>v.name==='cannon:fire').payload;
  assert.ok(shot.x>1720 && shot.x<1870 && shot.y>700 && shot.y<850);
  assert.ok(shot.power>.9);
  assert.ok(layoutCalls >= 2, '发射前必须查询窗口新位置，而非使用缓存');
  assert.equal(window.__overlayDebug.projectiles.length,1);
  let now=0;
  for(let i=0;i<80;i++){
    const fn=frames.shift();if(!fn)break;
    now+=16.66;fn(now);
  }
  assert.ok(window.__overlayDebug.renderedFrames>50);
  assert.ok(ctx.draws>20);
  await new Promise(r=>setTimeout(r,470));
  assert.equal(window.__cannonDebug.state,'idle');
  // Tap without pulling: no unwanted weak shot.
  bolt.fire('pointerdown',{clientX:200});bolt.fire('pointerup',{clientX:200});
  await new Promise(r=>setTimeout(r,5));
  assert.equal(emitted.filter(v=>v.name==='cannon:fire').length,1);
});
