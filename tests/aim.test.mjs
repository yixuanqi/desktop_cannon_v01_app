import test from 'node:test';
import assert from 'node:assert/strict';
import { AIM, aimFromDrag, rotationDegrees } from '../web/js/aim.mjs';
import { muzzleInCannon, muzzleOnOverlay, pointInSprite, receiverInCannon } from '../web/js/geometry.mjs';
import { MESH, framePath, frameIndex, warpedSourcePoint, meshWeight, quantizePitch } from '../web/js/mesh-warp.mjs';
import { predictedTrajectory } from '../web/js/trajectory.mjs';
import { createProjectile,stepProjectile } from '../web/js/physics.mjs';

test('二维拉闩：向右拉增加力度，上下微调30°至38°并按0.5°量化',()=>{
 assert.deepEqual(aimFromDrag(100,100,145,100),{pull:45,power:.5,angle:34});
 assert.deepEqual(aimFromDrag(100,100,190,120),{pull:90,power:1,angle:38});
 assert.deepEqual(aimFromDrag(100,100,115,70),{pull:15,power:15/90,angle:30});
 assert.equal(aimFromDrag(100,100,100,111).angle,36.5);
 assert.equal(aimFromDrag(100,100,1999,9999).angle,AIM.maxAngle);
 assert.equal(aimFromDrag(100,100,-20,-999).angle,AIM.minAngle);
 assert.equal(aimFromDrag(100,100,-20,100).pull,0);
});
test('帧索引0-16、34°保持原图、权重保留草地',()=>{
 assert.equal(rotationDegrees(34),0);
 assert.equal(rotationDegrees(38),4);
 assert.equal(rotationDegrees(30),-4);
 assert.equal(framePath(30),'/assets/mesh/frames/pitch_00.png');
 assert.equal(framePath(34),'/assets/mesh/frames/pitch_08.png');
 assert.equal(framePath(38),'/assets/mesh/frames/pitch_16.png');
 assert.equal(frameIndex(38),16);
 assert.equal(quantizePitch(34.24),34);
 assert.equal(quantizePitch(34.26),34.5);
 assert.ok(meshWeight(135,160)>meshWeight(279,258)*4);
 assert.ok(meshWeight(135,160)>meshWeight(135,331)*100);
 assert.deepEqual(warpedSourcePoint(135,160,34),{x:135,y:160});
 assert.deepEqual(muzzleInCannon(),pointInSprite(135,160));
});
test('网格变形下炮口与炮尾持续运动，非刚性旋转的半径不作约束',()=>{
 const high=muzzleInCannon(38),low=muzzleInCannon(30),neutral=muzzleInCannon(34);
 assert.ok(high.y<neutral.y && low.y>neutral.y);
 for(const a of [30,31,34,36,38]){
  const p=muzzleInCannon(a),r=receiverInCannon(a);
  assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.ok(Math.hypot(p.x-r.x,p.y-r.y)>50);
 }
});
test('移动整个小炮后，预测和真实发射使用相同网格炮口位置',()=>{
 const layout={cannonX:710,cannonY:490,overlayX:0,overlayY:0};
 const neutral=muzzleOnOverlay(layout,34),high=muzzleOnOverlay(layout,38);
 assert.ok(high.y<neutral.y);
 assert.ok(Math.abs(muzzleOnOverlay({...layout,cannonX:810,cannonY:540},38).x-high.x-100)<1e-10);
 assert.ok(Math.abs(muzzleOnOverlay({...layout,cannonX:810,cannonY:540},38).y-high.y-50)<1e-10);
});
test('预测弹道复用真实物理步长，直至第一次撞击',()=>{
 const shot={x:1000,y:700,power:.62,angle:36};
 const bounds={left:0,top:0,right:1920,bottom:1032};
 const dots=predictedTrajectory(shot,bounds,0.045,35);
 assert.ok(dots.length>4 && dots.length<=35);
 const ball=createProjectile(shot);
 for(let i=0;i<dots.length;i++){
  stepProjectile(ball,.045,bounds);
  assert.ok(Math.abs(ball.x-dots[i].x)<1e-8);
  assert.ok(Math.abs(ball.y-dots[i].y)<1e-8);
 }
 assert.deepEqual(predictedTrajectory({x:0,y:0,power:0,angle:34},bounds),[]);
});
