import test from 'node:test';
import assert from 'node:assert/strict';
import { shotVelocity,createProjectile, stepProjectile,PHYSICS } from '../web/js/physics.mjs';
import { powerFromPull,pullFromPointer,shouldFire,stateForTimeSinceShot } from '../web/js/charge.mjs';
import { cannonPosition,muzzleOnOverlay } from '../web/js/geometry.mjs';
const bounds={left:0,top:0,right:1920,bottom:1032};
test('蓄力：只允许向右拖动，最大 90px',()=> {
 assert.equal(pullFromPointer(100,90),0);
 assert.equal(pullFromPointer(100,190),90);
 assert.equal(pullFromPointer(100,310),90);
 assert.equal(powerFromPull(45),.5);
 assert.equal(powerFromPull(-2),0);
 assert.equal(powerFromPull(400),1);
 assert.equal(shouldFire(0.079),false);
 assert.equal(shouldFire(.08),true);
});
test('力度越大，初速度越大；方向左上',()=>{
 const weak=shotVelocity(.2,34),strong=shotVelocity(.9,34);
 assert.ok(strong.speed>weak.speed);
 assert.ok(strong.vx<0 && strong.vy<0);
 assert.equal(shotVelocity(-99).speed,PHYSICS.minSpeed);
 assert.equal(shotVelocity(99).speed,PHYSICS.maxSpeed);
});
test('固定时间步长模拟重力：速度先上升后下降',()=>{
 const p=createProjectile({x:1400,y:800,power:.6});
 const y0=p.y, vy0=p.vy;
 for(let i=0;i<25;i++)stepProjectile(p,.01,bounds);
 assert.ok(p.y<y0);
 assert.ok(p.vy>vy0);
});
test('左边界碰撞，X 速度取正，位置不会越界',()=>{
 const p=createProjectile({x:13,y:500,power:1});
 const hits=[];
 stepProjectile(p,.03,bounds,(v)=>hits.push(v));
 assert.ok(hits.some(h=>h.kind==='wall'));
 assert.ok(p.vx>0); assert.ok(p.x>=p.radius);
});
test('顶部边界碰撞，Y 速度转正',()=>{
 const p=createProjectile({x:1000,y:12,power:.7});
 const hits=[];
 stepProjectile(p,.025,bounds,h=>hits.push(h));
 assert.ok(hits.some(h=>h.kind==='ceiling'));
 assert.ok(p.vy>0);
});
test('地面碰撞触发反弹并损失能量',()=>{
 const p=createProjectile({x:1000,y:1015,power:.8});
 p.vy=400; p.vx=-180;
 const hits=[];stepProjectile(p,.06,bounds,h=>hits.push(h));
 assert.ok(hits.some(h=>h.kind==='ground'));
 assert.ok(p.vy<0);assert.ok(Math.abs(p.vy)<400);
});
test('低速最终着地，停止并且自动销毁',()=>{
 const p=createProjectile({x:1000,y:1020,power:.1});
 p.vy=40; p.vx=1;
 for(let i=0;i<100;i++)stepProjectile(p,.016,bounds);
 assert.equal(p.alive,false);
});
test('物理步长处理 75ms 卡顿且不会 NaN',()=>{
 const p=createProjectile({x:1500,y:600,power:1});
 for(let i=0;i<300;i++)stepProjectile(p,.15,bounds);
 assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
 assert.ok(p.x>=p.radius-1 && p.x<=bounds.right-p.radius+1);
 assert.equal(p.alive,false);
});
test('关键帧状态段',()=>{
 assert.equal(stateForTimeSinceShot(20),'firing');
 assert.equal(stateForTimeSinceShot(140),'recovering');
 assert.equal(stateForTimeSinceShot(500),'idle');
});
test('默认桌面摆放、发射坐标换算',()=>{
 const loc=cannonPosition({x:0,y:0,width:1920,height:1032},1);
 assert.deepEqual(loc,{x:1545,y:788});
 const muzzle=muzzleOnOverlay({cannonX:loc.x,cannonY:loc.y,overlayX:0,overlayY:0});
 assert.ok(muzzle.x>1545 && muzzle.x<1720);
 assert.ok(muzzle.y>800 && muzzle.y<1032);
});
