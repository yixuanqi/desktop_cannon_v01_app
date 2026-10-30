import test from 'node:test';
import assert from 'node:assert/strict';
import {iconImageRegion,snapshotToCandidates} from '../web/js/icon-interaction/coordinates.mjs';
import {IconProbeRuntime} from '../web/js/icon-interaction/runtime.mjs';
import {IconIllusion} from '../web/js/icon-interaction/illusion.mjs';

const layout={overlayPhysicalX:0,overlayPhysicalY:0,scaleFactor:1,screenWidth:1920,taskbarTop:1000};
const c={token:'cell:1',screenX:90,screenY:110,cellWidth:95,cellHeight:123,imageSize:64};
const snap={explorerEpoch:1,desktopForeground:true,capturedAtMs:1000,icons:[c]};
const sleep=()=>new Promise(resolve=>setImmediate(resolve));

test('M1: Shell image size shrinks big 95x123 grid to visible image approximation',()=>{
  const r=iconImageRegion(c);
  assert.equal(r.width,70);assert.equal(r.height,70);
  assert.ok(r.x>c.screenX);assert.ok(r.y>c.screenY);
  const hit=snapshotToCandidates(snap,layout,1000)[0];
  assert.equal(hit.rect.width,70);assert.equal(hit.physicalRect.width,95);
});
test('M2: image misses are not falsely registered in blank parts of Explorer grid',async()=>{
  let now=1000, hits=[];
  const probe=new IconProbeRuntime({refreshSnapshot:async()=>({...snap,capturedAtMs:now}),getLayout:()=>layout,now:()=>now,hitEffect:e=>hits.push(e)});
  probe.setEnabled(true);await sleep();
  assert.equal(probe.candidates.length,1);
  const image=probe.candidates[0].rect;
  const gridX=c.screenX+2;
  assert.ok(gridX<image.x);
  const miss=probe.onSegment({x0:gridX,y0:image.y-4,x1:gridX,y1:image.y+image.height+4,radius:0,shotId:1});
  assert.equal(miss,null);
  const hit=probe.onSegment({x0:image.x-10,y0:image.y+20,x1:image.x+80,y1:image.y+20,radius:4,shotId:1});
  assert.equal(hit.token,'cell:1');assert.equal(hits.length,1);
});
test('M2: distinct cannon shots can hit the same icon in under 500ms, same shot cannot double-hit',async()=>{
  let now=1000, hits=0;
  const probe=new IconProbeRuntime({refreshSnapshot:async()=>({...snap,capturedAtMs:now}),getLayout:()=>layout,now:()=>now,hitEffect:()=>hits++});
  probe.setEnabled(true);await sleep();
  const r=probe.candidates[0].rect;
  const segment=(shotId)=>({x0:r.x-30,y0:r.y+20,x1:r.x+80,y1:r.y+20,radius:3,shotId});
  probe.onSegment(segment(15));probe.onSegment(segment(15));
  now+=40;probe.onSegment(segment(16));
  assert.equal(hits,2);
});
test('M2: foreground flags no longer erase every visible desktop icon target',()=>{
  assert.equal(snapshotToCandidates({...snap,desktopForeground:false},layout,1000).length,1);
});
test('M4: partial image prewarm does not drop all valid icons or delay impact on a cache miss',async()=>{
  const engine=new IconIllusion({getLayout:()=>layout,loadImage:async url=>{if(url.includes('broken'))throw Error('decode');return {ok:true};}});
  engine.setEnabled(true);
  const base={screenX:90,screenY:110,width:95,height:123,borderMatch:.97,
    backgroundDataUrl:'data:image/png;base64,good',spriteDataUrl:'data:image/png;base64,good'};
  const count=await engine.prepare([{...base,token:'cell:1'}, {...base,token:'cell:2',spriteDataUrl:'data:image/png;base64,broken'}]);
  assert.equal(count,1);
  assert.equal(engine.onHit({token:'cell:2'}),false);
  assert.equal(engine.onHit({token:'cell:1',velocityX:-1200,velocityY:0}),true);
});
