import test from 'node:test';
import assert from 'node:assert/strict';
import {DesktopRange, planRangeTargets, sweptTargetHit, RANGE_DURATION_MS, RANGE_TARGET_RADIUS} from '../web/js/range-mode.mjs';
import {createProjectile,stepProjectile,PHYSICS} from '../web/js/physics.mjs';

const bounds={left:0,top:0,right:1600,bottom:860};
const origin={x:1360,y:710};

test('virtual targets are inside the desktop and originate from real shot arcs',()=>{
  const targets=planRangeTargets(bounds,origin);
  assert.equal(targets.length,3);
  assert.ok(targets.every(t=>t.x>RANGE_TARGET_RADIUS&&t.x<bounds.right-RANGE_TARGET_RADIUS));
  assert.ok(targets.every(t=>t.y>RANGE_TARGET_RADIUS&&t.y<bounds.bottom-RANGE_TARGET_RADIUS));
  assert.ok(targets.every(t=>t.x<origin.x-70&&t.active));
  for(let i=0;i<targets.length;i++)
    for(let j=i+1;j<targets.length;j++)
      assert.ok(Math.hypot(targets[i].x-targets[j].x,targets[i].y-targets[j].y)>RANGE_TARGET_RADIUS*3);
  // Do not invent decorative targets in unreachable places: at least the first
  // target must be hittable by the same production physics simulation.
  let reached=false;
  for(const power of [.30,.56,.84,.44,.72,.92,.28,.65,.96,.38,.77,.52]){
    if(reached)break;
    for(const angle of [30,31,32,33,34,36,37]){
      const ball=createProjectile({...origin,power,angle});
      for(let k=0;k<100&&ball.alive;k++){
        stepProjectile(ball,PHYSICS.maxStep,bounds,()=>{},seg=>{
          if(sweptTargetHit(seg,targets[0]))reached=true;
        });
        if(reached)break;
      }
      if(reached)break;
    }
  }
  assert.equal(reached,true,'first practice target must be reachable by a normal shot');
});

test('small screens are supported, unavailable layouts fail closed',()=>{
  const limited=planRangeTargets({left:0,top:0,right:1024,bottom:726},{x:805,y:555});
  assert.ok(limited.length>=1&&limited.length<=3);
  assert.deepEqual(planRangeTargets({left:0,top:0,right:250,bottom:200},origin),[]);
  assert.deepEqual(planRangeTargets(bounds,{x:NaN,y:0}),[]);
});

test('swept target collision checks the full motion segment, not only an endpoint',()=>{
  const target={x:400,y:300,radius:23,active:true};
  assert.equal(sweptTargetHit({x0:350,y0:300,x1:450,y1:300,radius:9},target),true);
  assert.equal(sweptTargetHit({x0:350,y0:340,x1:450,y1:340,radius:9},target),false);
  assert.equal(sweptTargetHit({x0:350,y0:300,x1:450,y1:300,radius:9},{...target,active:false}),false);
  assert.equal(sweptTargetHit({x0:300,y0:300,x1:300,y1:300,radius:9},target),false);
});

test('score only from genuine virtual-target collisions and never double score a target',()=>{
  let now=10000;
  const game=new DesktopRange({now:()=>now,bestScore:600});
  assert.equal(game.start(bounds,origin),true);
  const [first,second]=game.targets;
  assert.deepEqual(game.hitSegment({x0:2,y0:2,x1:50,y1:50,radius:9}),[]);
  assert.equal(game.score,0);
  const crossed=t=>({x0:t.x-45,y0:t.y,x1:t.x+45,y1:t.y,radius:9});
  assert.equal(game.hitSegment(crossed(first)).length,1);
  assert.equal(game.score,100);
  assert.equal(game.hitSegment(crossed(first)).length,0);
  assert.equal(game.score,100);
  now+=1000;
  assert.equal(game.hitSegment(crossed(second)).length,1);
  assert.equal(game.score,250);
  assert.equal(game.combo,2);
  assert.equal(game.snapshot().bestScore,600);
});

test('countdown expires, resets combo and keeps the best score',()=>{
  let now=5000;
  const game=new DesktopRange({now:()=>now});
  assert.ok(game.start(bounds,origin));
  const t=game.targets[0];
  const path={x0:t.x-55,y0:t.y,x1:t.x+55,y1:t.y,radius:9};
  game.hitSegment(path);
  assert.equal(game.score,100);
  assert.equal(game.snapshot().secondsLeft,30);
  now+=RANGE_DURATION_MS+1;
  assert.equal(game.tick(),true);
  assert.equal(game.active,false);
  assert.equal(game.finished,true);
  assert.equal(game.snapshot().bestScore,100);
  assert.equal(game.hitSegment(path).length,0);
  assert.equal(game.start(bounds,origin),true);
  assert.equal(game.score,0);
  assert.equal(game.bestScore,100);
  assert.equal(game.combo,0);
  now+=1500;
  game.stop('hidden');
  assert.equal(game.active,false);
});
