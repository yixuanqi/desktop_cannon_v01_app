import test from 'node:test';
import assert from 'node:assert/strict';
import {PHYSICS, createProjectile, advanceProjectileFrame, stepProjectile} from '../web/js/physics.mjs';
import {predictedTrajectory, trajectoryStepCount} from '../web/js/trajectory.mjs';

const bounds={left:0,top:0,right:1920,bottom:1032};
const cases=[
 {x:1600,y:650,angle:30,power:.2},
 {x:1600,y:650,angle:34,power:.6},
 {x:1600,y:650,angle:38,power:1},
 {x:370,y:100,angle:38,power:.8},
 {x:1200,y:200,angle:30,power:.9},
];
function followSteps(shot, intervals) {
 const ball=createProjectile(shot);
 for(const dt of intervals)advanceProjectileFrame(ball,dt,bounds);
 return ball;
}
test('实际炮弹不同刷新率与不均匀帧时间下，沿同一轨迹运动',()=>{
 for(const shot of cases){
  const pure=createProjectile(shot);
  for(let i=0;i<240;i++)stepProjectile(pure,PHYSICS.maxStep,bounds);
  const stable30=followSteps(shot,Array(60).fill(1/30));
  const stable60=followSteps(shot,Array(120).fill(1/60));
  const stable120=followSteps(shot,Array(240).fill(1/120));
  const stable144=followSteps(shot,Array(288).fill(1/144));
  const jittered=followSteps(shot,Array.from({length:200},(_,i)=>i%2 ? .004 : .016));
  for(const actual of [stable30,stable60,stable120,stable144,jittered]){
   assert.ok(Math.abs(actual.x-pure.x)<1e-7,`x drift for ${JSON.stringify(shot)}: ${actual.x-pure.x}`);
   assert.ok(Math.abs(actual.y-pure.y)<1e-7,`y drift for ${JSON.stringify(shot)}: ${actual.y-pure.y}`);
   assert.equal(actual.hitCount,pure.hitCount);
  }
 }
});
test('预测虚线每一点与实弹固定步长轨迹一致，包括首次碰撞点',()=>{
 for(const shot of cases){
  const pts=predictedTrajectory(shot,bounds,0.05,48);
  assert.ok(pts.length>1 && pts.length<=48);
  const ball=createProjectile(shot);
  const n=trajectoryStepCount(0.05);
  for(let k=1;k<pts.length;k++) {
   let hit=false;
   for(let i=0;i<n && !hit;i++)stepProjectile(ball,PHYSICS.maxStep,bounds,()=>{hit=true});
   assert.ok(Math.abs(pts[k].x-ball.x)<1e-8,`x at ${shot.angle}, dot ${k}`);
   assert.ok(Math.abs(pts[k].y-ball.y)<1e-8,`y at ${shot.angle}, dot ${k}`);
   if(hit) assert.equal(k,pts.length-1,'last preview dot at first collision');
  }
 }
});
