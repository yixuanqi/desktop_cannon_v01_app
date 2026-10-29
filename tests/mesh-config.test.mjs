import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MESH, warpedSourcePoint, frameIndex, meshWeight} from '../web/js/mesh-warp.mjs';
import {muzzleInCannon,receiverInCannon} from '../web/js/geometry.mjs';
const rig=JSON.parse(readFileSync(new URL('../web/assets/mesh/mesh_rig.json',import.meta.url),'utf8'));
test('runtime JS 位移场参数与离线 Python 生成配置完全一致',()=>{
 const p=rig.influence;
 assert.deepEqual([MESH.width,MESH.height],rig.canvas);
 assert.deepEqual([MESH.pivotX,MESH.pivotY],rig.pivot);
 for(const [a,b] of [['neutral','neutral_angle'],['min','min_angle'],['max','max_angle'],['step','step_angle']])assert.equal(MESH[a],rig[b]);
 const mapping={topFadeY:'top_fade_center_y',topSoftness:'top_fade_softness',leftFadeX:'left_fade_center_x',rightFadeX:'right_fade_center_x',sideSoftness:'side_fade_softness',wheelX:'wheel_center_x',wheelY:'wheel_center_y',wheelSigmaX:'wheel_sigma_x',wheelSigmaY:'wheel_sigma_y',wheelSuppression:'wheel_suppression',groundFadeY:'ground_fade_center_y',groundSoftness:'ground_fade_softness'};
 for(const [a,b] of Object.entries(mapping))assert.equal(MESH[a],p[b],a);
 assert.equal(1+(rig.max_angle-rig.min_angle)/rig.step_angle,rig.frame_count);
});
test('所有角度的炮口/炮尾锚点连续，帧序号不溢出',()=>{
 let previous;
 for(let index=0;index<rig.frame_count;index++){
  const a=rig.min_angle+index*rig.step_angle;
  assert.equal(frameIndex(a),index);
  const muzzle=muzzleInCannon(a),receiver=receiverInCannon(a);
  assert.ok(Number.isFinite(muzzle.x)&&Number.isFinite(muzzle.y));
  assert.ok(Number.isFinite(receiver.x)&&Number.isFinite(receiver.y));
  if(previous)assert.ok(Math.hypot(previous.x-muzzle.x,previous.y-muzzle.y)<3);
  previous=muzzle;
 }
 assert.ok(meshWeight(135,160)>meshWeight(279,258));
 assert.deepEqual(warpedSourcePoint(371,187,34),{x:371,y:187});
});
