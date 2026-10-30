import test from 'node:test';
import assert from 'node:assert/strict';
import {IconProbeRuntime} from '../web/js/icon-interaction/runtime.mjs';
const layout={overlayPhysicalX:0,overlayPhysicalY:0,scaleFactor:1,screenWidth:800,taskbarTop:500};
const make=(overrides={})=>({desktopForeground:true,capturedAtMs:1000,explorerEpoch:1,
 icons:[{token:'cell:0',screenX:80,screenY:90,cellWidth:80,cellHeight:90}],...overrides});
const flush=()=>new Promise(r=>setImmediate(r));
test('启用前显示禁用状态，启用后显示 Shell 候选数与命中统计',async()=>{
 const p=new IconProbeRuntime({now:()=>1000,refreshSnapshot:async()=>make(),getLayout:()=>layout,hitEffect:()=>{}});
 assert.equal(p.status,'disabled');p.setEnabled(true);await flush();
 assert.equal(p.status,'ready');assert.equal(p.rawCount,1);assert.equal(p.candidates.length,1);
 p.onSegment({x0:0,y0:110,x1:200,y1:110,radius:8,shotId:1});
 assert.equal(p.stats.hits,1);
 p.setEnabled(false);assert.equal(p.status,'disabled');assert.equal(p.candidates.length,0);
});
test('Shell 调用失败有可观测错误与节流，不会静默消失或疯狂重试',async()=>{
 let attempts=0;
 const p=new IconProbeRuntime({now:()=>1000,refreshSnapshot:async()=>{attempts++;throw new Error('IFolderView unavailable 0x80004005');},getLayout:()=>layout,hitEffect:()=>{}});
 p.setEnabled(true);await flush();assert.equal(p.status,'probe-error');assert.match(p.error,/IFolderView/);
 p.tick();await flush();assert.equal(attempts,1);
});
test('缺少布局、空白桌面、错误的坐标分别得到独立诊断',async()=>{
 for(const [snap,position,expected] of [
   [make(),null,'layout-unavailable'],[make({icons:[]}),layout,'no-icons'],
   [make({icons:[{token:'a',screenX:9999,screenY:100,cellWidth:80,cellHeight:90}]}),layout,'coordinate-filtered']]){
   const p=new IconProbeRuntime({now:()=>1000,refreshSnapshot:async()=>snap,getLayout:()=>position,hitEffect:()=>{}});
   p.setEnabled(true);await flush();assert.equal(p.status,expected);
 }
});
