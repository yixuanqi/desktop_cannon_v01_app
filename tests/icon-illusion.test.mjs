import test from 'node:test';
import assert from 'node:assert/strict';
import {IconIllusion,ICON_PHYSICS,validateVisualSample} from '../web/js/icon-interaction/illusion.mjs';

const U='data:image/png;base64,eA==';
const layout={overlayPhysicalX:0,overlayPhysicalY:0,scaleFactor:1,screenWidth:1920,taskbarTop:1040};
const sample={token:'cell:18',screenX:100,screenY:220,width:95,height:123,borderMatch:.97,
  backgroundDataUrl:U,spriteDataUrl:U};
const instant=async()=>({decoded:true});
const make=options=>new IconIllusion({getLayout:()=>layout,loadImage:instant,...options});

async function preparedEngine(options={}){
 const engine=make(options);engine.setEnabled(true);
 const count=await engine.prepare([sample],'desktop-layout-1');
 assert.equal(count,1);return engine;
}

test('M3: wallpaper sample validates and maps physical screen coordinates to overlay CSS pixels',()=>{
 const rect=validateVisualSample(sample,layout);
 assert.deepEqual({x:rect.x,y:rect.y,width:rect.width,height:rect.height},{x:100,y:220,width:95,height:123});
 const scaled=validateVisualSample(sample,{...layout,overlayPhysicalX:25,overlayPhysicalY:30,scaleFactor:1.25});
 assert.equal(scaled.x,60);assert.equal(scaled.width,76);
});

test('M3: mismatched wallpaper and missing PNG data are rejected before caching',async()=>{
 assert.throws(()=>validateVisualSample({...sample,borderMatch:.61},layout),/ICON_SAMPLE_INVALID/);
 assert.throws(()=>validateVisualSample({...sample,spriteDataUrl:'file:///private'},layout),/ICON_IMAGE_MISSING/);
 const engine=make({onError:()=>{}});engine.setEnabled(true);
 assert.equal(await engine.prepare([{...sample,borderMatch:.2}]),0);
 assert.equal(engine.cacheSize,0);
});

test('M4: hit starts synchronously from prewarmed cache with no async capture on collision',async()=>{
 const engine=await preparedEngine();
 const started=engine.onHit({token:'cell:18',hitX:100,hitY:280,velocityX:-1200,velocityY:-500,
   physicalRect:{screenX:100,screenY:220,width:95,height:123}});
 assert.equal(started,true);assert.equal(engine.active.phase,'flight');
 assert.equal(engine.active.vx,-384);assert.equal(engine.active.vy,-160);
 assert.equal(engine.active.x,100);assert.equal(engine.active.y,220);
 assert.deepEqual(engine.active.physicalRect,{screenX:100,screenY:220,width:95,height:123});
});

test('M4: impact offset creates angular velocity (off-center hit produces spin)',async()=>{
 const engine=await preparedEngine();
 assert.equal(engine.onHit({token:'cell:18',hitX:100,hitY:220,velocityX:-1300,velocityY:-420}),true);
 assert.ok(Math.abs(engine.active.omega)>0.1);
});

test('M4: gravity changes vertical velocity and the icon follows an actual ballistic arc',async()=>{
 const engine=await preparedEngine();
 engine.onHit({token:'cell:18',hitX:147,hitY:281,velocityX:-1400,velocityY:-100});
 const before=engine.active.y;const initialVy=engine.active.vy;
 engine.update(.20,{left:0,top:0,right:1920,bottom:1040});
 assert.ok(engine.active.y<before+20,'initial upward momentum should still dominate early flight');
 assert.ok(engine.active.vy>initialVy,'gravity must increase downward velocity');
 assert.ok(engine.active.x<100,'icon should move in projectile travel direction');
});

test('M4: icon bounces at desktop floor and then returns through a damped spring',async()=>{
 const engine=await preparedEngine();
 engine.onHit({token:'cell:18',hitX:100,hitY:220,velocityX:-1500,velocityY:350});
 const initialX=engine.active.x;
 let sawBounce=false;let sawRest=false;let sawReturn=false;
 for(let i=0;i<1200&&engine.hasAnimation;i++){
   engine.update(1/60,{left:0,top:0,right:1920,bottom:360});
   if(engine.active?.phase==='rest')sawRest=true;
   if(engine.active?.phase==='return')sawReturn=true;
   if(engine.active?.bouncesY>0)sawBounce=true;
 }
 assert.ok(sawRest,'icon must rest on the floor before returning');
 assert.ok(sawReturn,'flight/rest phase must transition to spring return');
 assert.ok(sawBounce,'desktop floor collision must reverse vertical velocity');
 assert.ok(engine.succeeded===1);
 assert.ok(!engine.hasAnimation,'spring-damped return should settle after 5-8s ground rest');
 assert.ok(initialX===100);
});

test('M4: stale position or missing prewarm cache falls back immediately without delayed animation',async()=>{
 const engine=await preparedEngine();
 assert.equal(engine.onHit({token:'cell:18',physicalRect:{screenX:101,screenY:220,width:95,height:123}}),false);
 assert.equal(engine.hasAnimation,false);
 assert.equal(engine.onHit({token:'unknown'}),false);
 assert.equal(engine.hasAnimation,false);
});

test('M4: disabling experiment clears active sprite and all cached desktop images immediately',async()=>{
 const engine=await preparedEngine();
 assert.equal(engine.cacheSize,1);
 assert.equal(engine.onHit({token:'cell:18',velocityX:-800}),true);
 engine.setEnabled(false);
 assert.equal(engine.hasAnimation,false);assert.equal(engine.cacheSize,0);
});

test('M4: cache prewarm is invalidated when feature is disabled while image decode is pending',async()=>{
 const resolvers=[];const engine=make({loadImage:()=>new Promise(resolve=>{resolvers.push(resolve);})});
 engine.setEnabled(true);const task=engine.prepare([sample]);engine.setEnabled(false);
 for(const resolve of resolvers)resolve({decoded:true});
 assert.equal(await task,0);assert.equal(engine.cacheSize,0);
});

test('M4: physics constants define real impulse, gravity, restitution and spring return',()=>{
 assert.ok(ICON_PHYSICS.gravity>0);
 assert.ok(ICON_PHYSICS.restitutionX>0&&ICON_PHYSICS.restitutionX<1);
 assert.ok(ICON_PHYSICS.springK>0&&ICON_PHYSICS.springDamping>0);
 assert.ok(ICON_PHYSICS.impulseScale>0);
});

test('M4: fixed 120Hz accumulator keeps icon physics identical at 60/75/144Hz',async()=>{
 const run=async hz=>{
   const engine=await preparedEngine();
   engine.onHit({token:'cell:18',hitX:190,hitY:260,velocityX:-1450,velocityY:-980});
   for(let i=0;i<hz;i++)engine.update(1/hz,{left:0,top:0,right:1920,bottom:1040});
   return engine.active;
 };
 const [a,b,c]=await Promise.all([run(60),run(75),run(144)]);
 for(const key of ['x','y','vx','vy','angle','omega']){
   assert.ok(Math.abs(a[key]-b[key])<1e-5,`${key}: 60Hz and 75Hz drift`);
   assert.ok(Math.abs(a[key]-c[key])<1e-5,`${key}: 60Hz and 144Hz drift`);
 }
});
