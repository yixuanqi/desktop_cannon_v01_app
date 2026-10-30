import test from 'node:test';import assert from 'node:assert/strict';
import {IconProbeRuntime} from '../web/js/icon-interaction/runtime.mjs';
const layout={overlayPhysicalX:0,overlayPhysicalY:0,scaleFactor:1,screenWidth:800,taskbarTop:550};
const snapshot={desktopForeground:true,capturedAtMs:1000,icons:[{token:'a',screenX:10,screenY:30,cellWidth:50,cellHeight:50}]};
test('默认禁用时无扫描，无碰撞回调，启用后按子步命中去重',async()=>{
 let now=1000,reads=0,hits=0;
 const p=new IconProbeRuntime({refreshSnapshot:async()=>{reads++;return {...snapshot,capturedAtMs:now};},getLayout:()=>layout,now:()=>now,hitEffect:()=>hits++});
 assert.equal(reads,0);p.onSegment({x0:0,y0:50,x1:90,y1:50,radius:5});assert.equal(hits,0);
 p.setEnabled(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1);
 const seg={x0:0,y0:50,x1:90,y1:50,radius:5,shotId:1};
 p.onSegment(seg);p.onSegment(seg);assert.equal(hits,1);
 now+=501;p.onSegment({...seg,shotId:2});assert.equal(hits,2);
 p.setEnabled(false);p.onSegment(seg);assert.equal(hits,2);
});
test('异步请求结束前禁用：过期结果不得复活',async()=>{
 let finish;const p=new IconProbeRuntime({refreshSnapshot:()=>new Promise(r=>finish=r),getLayout:()=>layout,now:()=>1000,hitEffect:()=>{}});
 p.setEnabled(true);p.setEnabled(false);finish(snapshot);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(p.candidates.length,0);
});
test('实际固定物理子步触发 observer，原炮弹终态不改变',async()=>{
 const {createProjectile,advanceProjectileFrame}=await import('../web/js/physics.mjs');
 const a=createProjectile({x:500,y:280,power:.8}),b=createProjectile({x:500,y:280,power:.8});
 const bounds={left:0,top:0,right:900,bottom:700};let cnt=0;
 advanceProjectileFrame(a,.045,bounds,()=>{},()=>cnt++);
 advanceProjectileFrame(b,.045,bounds);assert.ok(cnt>0);
 assert.deepEqual(a,b);
});
