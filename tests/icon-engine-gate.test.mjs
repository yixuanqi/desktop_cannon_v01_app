import test from 'node:test';import assert from 'node:assert/strict';
import {IconProbeRuntime} from '../web/js/icon-interaction/runtime.mjs';
test('图标命中把物理碰撞点、真实速度和屏幕矩形同步交给视觉物理层',async()=>{
 let received=null,now=1000;
 const runtime=new IconProbeRuntime({now:()=>now,
  getLayout:()=>({overlayPhysicalX:0,overlayPhysicalY:0,scaleFactor:1,screenWidth:800,taskbarTop:560}),
  refreshSnapshot:async()=>({desktopForeground:true,capturedAtMs:now,explorerEpoch:1,
   icons:[{token:'a',screenX:35,screenY:35,cellWidth:70,cellHeight:80}]}),
  hitEffect:event=>{received=event;}});
 runtime.setEnabled(true);await new Promise(resolve=>setImmediate(resolve));
 runtime.onSegment({x0:0,y0:45,x1:200,y1:45,radius:6,shotId:100,velocityX:-900,velocityY:-280});
 assert.equal(received.token,'a');assert.equal(received.velocityX,-900);assert.equal(received.velocityY,-280);
 assert.deepEqual(received.icon.physicalRect,{screenX:35,screenY:35,width:70,height:80});
 assert.ok(Number.isFinite(received.x)&&Number.isFinite(received.y));
 runtime.setEnabled(false);assert.equal(runtime.candidates.length,0);
});
