import test from 'node:test';
import assert from 'node:assert/strict';
import { dragFrameTo } from '../web/js/window-drag.mjs';

test('预览移动：根据屏幕指针位移移动整个小炮而非零件', () => {
  const anchor = { left: 550, top: 420, width: 360, height: 240, pointerX: 1000, pointerY: 550 };
  assert.deepEqual(dragFrameTo(anchor, 880, 490, 1600, 900), {x:430, y:360});
  assert.deepEqual(dragFrameTo(anchor, 2500, 2500, 1600, 900), {x:1240, y:660});
  assert.deepEqual(dragFrameTo(anchor, 0, 0, 1600, 900), {x:0, y:0});
});

test('浏览器预览：炮身移动改变窗口位置；炮闩单独蓄力且从新位置发射', async () => {
  // Each node:test file runs in its own process so the bridge is initialized
  // in preview mode rather than native mode.
  globalThis.BroadcastChannel = undefined;
  const frame = {style:{}, getBoundingClientRect: () => ({
    left: parseFloat(frame.style.left ?? 800),
    top: parseFloat(frame.style.top ?? 550), width:360,height:240,
  })};
  class Element {
    constructor(){this.style={setProperty(name,value){this[name]=value;}};this.dataset={state:'idle'};
      this.handlers=new Map();this.captured=false;this.textContent='';}
    addEventListener(name, fn){this.handlers.set(name, fn);}
    fire(type, props={}){this.handlers.get(type)?.({
      pointerId:9, clientX:100, clientY:80, screenX:400, screenY:300, button:0,
      preventDefault(){},stopPropagation(){}, ...props,
    });}
    setPointerCapture(){this.captured=true;}
    hasPointerCapture(){return this.captured;}
    releasePointerCapture(){this.captured=false;}
  }
  const elements=Object.fromEntries(['#scene','#recoil','#bolt','#bolt-spring','#power-fill','#power-number']
    .map(k=>[k,new Element()]));
  globalThis.document={querySelector: k=>elements[k]};
  const parent={innerWidth:1600,innerHeight:900};
  globalThis.window={parent,frameElement:frame,innerWidth:360,innerHeight:240,setInterval,clearInterval};
  await import('../web/js/cannon.mjs?previewDrag');
  const {getLayout,listen}=await import('../web/js/bridge.mjs');
  await new Promise(r=>setTimeout(r,5));
  const shots=[];
  await listen('cannon:fire',payload=>shots.push(payload));
  assert.equal((await getLayout()).cannonX,800);
  elements['#recoil'].fire('pointerdown',{screenX:500,screenY:500});
  assert.equal(window.__cannonDebug.moving,true);
  elements['#recoil'].fire('pointermove',{screenX:410,screenY:440});
  assert.equal(frame.style.left,'710px');
  assert.equal(frame.style.top,'490px');
  elements['#recoil'].fire('pointerup');
  assert.equal(window.__cannonDebug.moving,false);
  assert.equal((await getLayout()).cannonX,710);
  assert.equal(shots.length,0);
  const bolt=elements['#bolt'];
  bolt.fire('pointerdown',{clientX:200});
  bolt.fire('pointermove',{clientX:260});
  assert.equal(frame.style.left,'710px'); // Pulling a bolt doesn't move the window.
  assert.equal(elements['#bolt-spring'].style.width,'70px');
  assert.equal(elements['#bolt'].style.transform,'translateX(60px)');
  bolt.fire('pointerup',{clientX:260});
  await new Promise(r=>setTimeout(r,8));
  assert.equal(shots.length,1);
  assert.ok(shots[0].x > 750 && shots[0].x < 860);
  assert.ok(shots[0].y > 520 && shots[0].y < 650);
  assert.equal(shots[0].power,2/3);
  // Release native-test interval to keep this test fast, while verifying reset.
  await new Promise(r=>setTimeout(r,470));
  assert.equal(window.__cannonDebug.state,'idle');
});
