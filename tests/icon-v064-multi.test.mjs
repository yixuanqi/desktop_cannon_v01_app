import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {IconIllusion,ICON_PHYSICS,groundHoldSeconds} from '../web/js/icon-interaction/illusion.mjs';
import {IconProbeRuntime} from '../web/js/icon-interaction/runtime.mjs';
import {allIconHits} from '../web/js/icon-interaction/collision.mjs';
const U='data:image/png;base64,dGVzdA==';
const layout={overlayPhysicalX:0,overlayPhysicalY:0,scaleFactor:1,screenWidth:950,taskbarTop:650};
const makeCell=(i,x)=>({token:`cell:${i}`,screenX:x,screenY:200,cellWidth:90,cellHeight:120,imageSize:50});
const sample=cell=>({token:cell.token,screenX:cell.screenX,screenY:cell.screenY,width:cell.cellWidth,height:cell.cellHeight,borderMatch:.98,backgroundDataUrl:U,spriteDataUrl:U});
async function engineFor(cells){
 const e=new IconIllusion({getLayout:()=>layout,loadImage:async()=>({decoded:true})});
 e.setEnabled(true);assert.equal(await e.prepare(cells.map(sample)),cells.length);return e;
}
const bounds={left:0,top:0,right:950,bottom:650};
const runUntil=(engine,predicate,maxSeconds=18)=>{
 for(let i=0;i<maxSeconds*120;i++){
  if(predicate())return i/120;
  engine.update(1/120,bounds);
 }
 return null;
};

test('V0.6.4: one shot can register multiple different icons in flight order even within one segment',async()=>{
 let now=5000;
 const cells=[makeCell(1,100),makeCell(2,220),makeCell(3,350)];
 const effect=[];
 const runtime=new IconProbeRuntime({
  refreshSnapshot:async()=>({capturedAtMs:now,explorerEpoch:1,icons:cells}),
  getLayout:()=>layout,now:()=>now,hitEffect:e=>effect.push(e),
 });
 runtime.setEnabled(true);await new Promise(r=>setImmediate(r));
 const contact=runtime.onSegment({x0:70,y0:230,x1:450,y1:230,radius:6,shotId:33,velocityX:800,velocityY:0});
 assert.equal(contact.token,'cell:1');
 assert.deepEqual(effect.map(h=>h.token),cells.map(c=>c.token));
 runtime.onSegment({x0:70,y0:230,x1:450,y1:230,radius:6,shotId:33});
 assert.equal(effect.length,3,'same shot may not duplicate its contacts');
 now+=30;
 runtime.onSegment({x0:70,y0:230,x1:450,y1:230,radius:6,shotId:34});
 assert.equal(effect.length,6,'different shot may hit all three again');
});

test('V0.6.4: multiple icon hit objects remain independently active, new shots do not evict previous falling ones',async()=>{
 const cells=Array.from({length:4},(_,i)=>makeCell(i+1,100+i*135));
 const e=await engineFor(cells);
 for(const c of cells.slice(0,3))assert.equal(e.onHit({token:c.token,hitX:c.screenX+30,hitY:220,velocityX:-1100,velocityY:280}),true);
 assert.equal(e.activeCount,3);assert.equal(e.hasAnimation,true);
 assert.equal(e.onHit({token:cells[0].token}),false,'do not duplicate an already displaced icon');
 for(let i=0;i<150;i++)e.update(1/120,bounds);
 assert.equal(e.onHit({token:cells[3].token,velocityX:-650,velocityY:100}),true);
 assert.equal(e.activeCount,4);
 assert.deepEqual(e.activeRects.map(r=>r.screenX),cells.map(c=>c.screenX));
});

test('V0.6.4: each icon only starts returning after it touches down and rests for 5-8s',async()=>{
 const cell=makeCell(1,300);
 const e=await engineFor([cell]);
 assert.equal(e.onHit({token:cell.token,velocityX:-1000,velocityY:-250}),true);
 const landedAt=runUntil(e,()=>e.active?.phase==='rest',5);
 assert.notEqual(landedAt,null,'should actually land before starting the timer');
 const restSeconds=e.active.restSeconds;
 assert.ok(restSeconds>=5&&restSeconds<=8);
 for(let i=0;i<Math.floor((restSeconds-.12)*120);i++)e.update(1/120,bounds);
 assert.equal(e.active.phase,'rest','do not start returning before 5 seconds');
 const startedReturn=runUntil(e,()=>e.active?.phase==='return',1);
 assert.notEqual(startedReturn,null);
 assert.ok(e.active.restAge>=5,'actual rest age must be at least five seconds');
 const finishedAt=runUntil(e,()=>!e.hasAnimation,5);
 assert.notEqual(finishedAt,null,'icon should eventually finish the spring return');
});

test('V0.6.4: hold duration is stable per token and bounded',()=>{
 const tokens=['cell:1','cell:12','cell:53','home:custom-app','video-player'];
 for(const token of tokens){
  assert.equal(groundHoldSeconds(token),groundHoldSeconds(token));
  assert.ok(groundHoldSeconds(token)>=5 && groundHoldSeconds(token)<=8);
 }
 assert.ok(ICON_PHYSICS.maxDuration>ICON_PHYSICS.restSecondsMax+ICON_PHYSICS.maxFlightSeconds+2);
});

test('V0.6.4: disabling/invalidating removes ALL wallpaper masks and sprites',async()=>{
 const cells=[makeCell(1,100),makeCell(2,220)];const e=await engineFor(cells);
 for(const c of cells)e.onHit({token:c.token,velocityY:500});
 assert.equal(e.activeCount,2);
 e.invalidate();assert.equal(e.activeCount,0);assert.equal(e.cacheSize,0);
});

test('V0.6.4: every backdrop is drawn before ALL sprites, so neighboring masks cannot erase falling icons',async()=>{
 const cells=[makeCell(1,100),makeCell(2,220)];const e=await engineFor(cells);
 for(const c of cells)e.onHit({token:c.token,velocityX:-1100});
 const ops=[];
 const ctx={drawImage:(image)=>ops.push(image.type??'none'),save(){},restore(){},translate(){},rotate(){}};
 // Override decoded mock objects to identify each layer.
 for(const entry of e.cache.values()){
  entry.background.type='mask';entry.sprite.type='sprite';
 }
 e.draw(ctx);
 assert.deepEqual(ops,['mask','mask','sprite','sprite']);
});

test('V0.6.4: sources isolate screenshot icon pixels from labels, apply one native guard to all masks',()=>{
 const rust=fs.readFileSync(new URL('../src-tauri/src/icon_visual.rs',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../src-tauri/src/lib.rs',import.meta.url),'utf8');
 const overlay=fs.readFileSync(new URL('../web/js/overlay.mjs',import.meta.url),'utf8');
 assert.match(rust,/dc_shell_icon_bgra/);assert.match(rust,/alpha_bounds/);
 assert.doesNotMatch(rust,/xx<crop_x0/);
 assert.match(app,/fn icon_visual_guard_many/);
 assert.match(overlay,/getIconVisualGuardMany\(illusion\.activeRects\)/);
 assert.doesNotMatch(app,/SelectAndPositionItems/);
});

test('V0.6.4: image-only bounds control floor contact instead of full text cell height',async()=>{
 const c=makeCell(1,200),s={...sample(c),imageLeft:15,imageTop:8,imageWidth:60,imageHeight:63};
 const e=new IconIllusion({getLayout:()=>layout,loadImage:async()=>({decoded:true})});
 e.setEnabled(true);assert.equal(await e.prepare([s]),1);
 e.onHit({token:c.token,velocityX:0,velocityY:600});
 const land=runUntil(e,()=>e.active?.phase==='rest',5);
 assert.notEqual(land,null);
 assert.ok(Math.abs(e.active.y+e.active.rect.iconBounds.bottom-bounds.bottom)<.001,
   'actual image edge, not whitespace under label, must touch taskbar floor');
 assert.equal(e.active.rect.iconBounds.bottom,71);
});

test('V0.6.4: active/fallen icons have no ghost collision at their original desktop coordinates',async()=>{
 let now=1000;const c=makeCell(1,100);const effects=[];
 const e=await engineFor([c]);
 const p=new IconProbeRuntime({refreshSnapshot:async()=>({capturedAtMs:now,explorerEpoch:1,icons:[c]}),
  getLayout:()=>layout,now:()=>now,hitEffect:h=>effects.push(h),
  shouldIgnoreToken:token=>e.isActive(token)});
 p.setEnabled(true);await new Promise(r=>setImmediate(r));
 const r=p.candidates[0].rect;
 const seg=shotId=>({x0:r.x-6,y0:r.y+20,x1:r.x+70,y1:r.y+20,radius:6,shotId});
 p.onSegment(seg(1));assert.equal(e.onHit({token:c.token,velocityY:200}),true);
 p.onSegment(seg(2));assert.equal(effects.length,1,'no sparks at old home while icon is airborne');
});

test('V0.6.4: 12 is a safety cap, concurrent icons do not evict already resting ones',async()=>{
 const cells=Array.from({length:13},(_,i)=>makeCell(i+1,100));
 const e=await engineFor(cells);
 for(const c of cells.slice(0,12))assert.equal(e.onHit({token:c.token,velocityY:700}),true);
 assert.equal(e.activeCount,12);
 assert.equal(e.onHit({token:cells[12].token,velocityY:700}),false);
 assert.equal(e.activeCount,12);
});

test('V0.6.4: one actual 120Hz cannon projectile can strike 3 staggered targets',async()=>{
 const {createProjectile,advanceProjectileFrame}=await import('../web/js/physics.mjs');
 const sampleBall=createProjectile({x:860,y:585,power:1,angle:31,id:44});
 const waypoints=[];
 for(let i=0;i<75;i++){
  advanceProjectileFrame(sampleBall,1/120,bounds);
  if([15,35,55].includes(i))waypoints.push({x:sampleBall.x,y:sampleBall.y});
 }
 const cells=waypoints.map((pt,i)=>({token:`target:${i}`,screenX:Math.round(pt.x)-45,
  screenY:Math.round(pt.y)-31,cellWidth:95,cellHeight:123,imageSize:64}));
 let now=2000;const hits=[];
 const runtime=new IconProbeRuntime({refreshSnapshot:async()=>({capturedAtMs:now,icons:cells,explorerEpoch:1}),
  getLayout:()=>layout,now:()=>now,hitEffect:e=>hits.push(e)});
 runtime.setEnabled(true);await new Promise(r=>setImmediate(r));
 const ball=createProjectile({x:860,y:585,power:1,angle:31,id:44});
 for(let i=0;i<75;i++)advanceProjectileFrame(ball,1/120,bounds,()=>{},seg=>runtime.onSegment(seg));
 assert.deepEqual(hits.map(e=>e.token),cells.map(c=>c.token));
});
