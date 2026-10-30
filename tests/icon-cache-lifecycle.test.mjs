import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {IconCacheLifecycle, environmentKey, iconSnapshotKey} from '../web/js/icon-interaction/cache-lifecycle.mjs';
import {IconIllusion} from '../web/js/icon-interaction/illusion.mjs';
import {IconProbeRuntime} from '../web/js/icon-interaction/runtime.mjs';

const U='data:image/png;base64,Zg==';
const layout={overlayPhysicalX:0,overlayPhysicalY:0,scaleFactor:1,screenWidth:1920,taskbarTop:1040};
const cell=(index,x,y)=>({token:`cell:${index}`,screenX:x,screenY:y,cellWidth:95,cellHeight:123});
const snap=(...icons)=>({explorerEpoch:1,desktopForeground:true,capturedAtMs:2000,icons});
const sample={token:'cell:1',screenX:50,screenY:100,width:95,height:123,borderMatch:.99,backgroundDataUrl:U,spriteDataUrl:U};

test('fingerprint: identical snapshots do not cause repeated prewarming, icon move and reorder do',()=>{
  const l=new IconCacheLifecycle();
  assert.equal(l.observeEnvironment({fingerprint:'display-1920-dpi-1-wallpaper-a'}),true);
  assert.equal(l.observeSnapshot(snap(cell(1,50,100),cell(2,150,100))),true);
  const version=l.revision;
  assert.equal(l.observeEnvironment({fingerprint:'display-1920-dpi-1-wallpaper-a'}),false);
  assert.equal(l.observeSnapshot(snap(cell(1,50,100),cell(2,150,100))),false);
  assert.equal(l.revision,version);
  assert.equal(l.observeSnapshot(snap(cell(1,100,100),cell(2,150,100))),true);
  assert.ok(l.revision>version);
  assert.notEqual(iconSnapshotKey(snap(cell(1,50,100),cell(2,150,100))),
    iconSnapshotKey(snap(cell(2,150,100),cell(1,50,100))));
  assert.notEqual(iconSnapshotKey(snap(cell(1,50,100))),iconSnapshotKey({...snap(cell(1,50,100)),explorerEpoch:2}));
});

test('screen resolution, DPI, taskbar and wallpaper fingerprints invalidate every old cache generation',()=>{
  const l=new IconCacheLifecycle();
  const envs=['1920x1080|1.0|wall-a','2560x1440|1.0|wall-a',
    '2560x1440|1.25|wall-a','2560x1440|1.25|wall-b'];
  for (const fingerprint of envs){
    const prev=l.revision;
    assert.equal(l.observeEnvironment({fingerprint}),true);
    assert.ok(l.revision>prev);
    assert.equal(l.snapshot,'');
  }
  assert.equal(l.observeEnvironment({fingerprint:envs.at(-1)}),false);
  assert.equal(environmentKey({fingerprint:''}), '');
  assert.equal(l.observeEnvironment(null),true);
});

test('late asynchronous decoded images are discarded when environment changes',async()=>{
  const pending=[];
  const engine=new IconIllusion({loadImage:()=>new Promise(resolve=>pending.push(resolve)),getLayout:()=>layout});
  engine.setEnabled(true);
  const old=engine.prepare([sample],'old-display-wallpaper');
  assert.equal(engine.pending,true);
  engine.invalidate();
  assert.equal(engine.cacheSize,0);
  for(const resolve of pending)resolve({image:true});
  assert.equal(await old,0);
  assert.equal(engine.cacheSize,0);
  assert.equal(engine.onHit({token:sample.token}),false);
  assert.equal(engine.cacheSignature,'');
});

test('new prewarm can begin while stale image decode is pending; old callbacks cannot overwrite new cache',async()=>{
  const pending=[];
  const engine=new IconIllusion({loadImage:()=>new Promise(resolve=>pending.push(resolve)),getLayout:()=>layout});
  engine.setEnabled(true);
  const old=engine.prepare([sample],'old');
  engine.invalidate();
  const next=engine.prepare([sample],'new');
  for(const resolve of pending.slice(2))resolve({v:'new'});
  assert.equal(await next,1);
  for(const resolve of pending.slice(0,2))resolve({v:'old'});
  assert.equal(await old,0);
  assert.equal(engine.cacheSize,1);
  assert.equal(engine.cacheSignature,'new');
});

test('in-flight Explorer fetch cannot resurrect old rectangles after a display change',async()=>{
  const resolvers=[];
  let time=2000;
  const runtime=new IconProbeRuntime({refreshSnapshot:()=>new Promise(resolve=>resolvers.push(resolve)),
    getLayout:()=>layout,now:()=>time,hitEffect:()=>{throw Error('unexpected hit');}});
  runtime.enabled=true;
  const old=runtime.refresh();
  runtime.invalidate('display-changed');
  const fresh=runtime.refresh();
  resolvers[1](snap(cell(1,250,100)));
  assert.equal(await fresh,true);
  resolvers[0](snap(cell(1,50,100)));
  assert.equal(await old,false);
  assert.ok(runtime.candidates[0].rect.x>=250);
  assert.equal(runtime.status,'ready');
  time+=6600;
  assert.equal(runtime.onSegment({x0:250,y0:115,x1:265,y1:115,radius:8}),null,
    'stale snapshot must not trigger illusion');
});

test('invalidating an active visual illusion immediately removes its wallpaper mask and flying sprite',async()=>{
  const engine=new IconIllusion({loadImage:async()=>({image:true}),getLayout:()=>layout});
  engine.setEnabled(true);
  assert.equal(await engine.prepare([sample]),1);
  assert.equal(engine.onHit({token:'cell:1',velocityX:-1400,velocityY:-550}),true);
  engine.invalidate();
  assert.equal(engine.hasAnimation,false);
  assert.equal(engine.cacheSize,0);
});

test('native environment observer is wired and remains separate from cannon physics',()=>{
  const base=new URL('../',import.meta.url);
  const overlay=fs.readFileSync(new URL('web/js/overlay.mjs',base),'utf8');
  const native=fs.readFileSync(new URL('src-tauri/src/lib.rs',base),'utf8');
  assert.match(overlay,/getIconEnvironment\(\)/);
  assert.match(overlay,/onDisplayChange\('webview-resize'\)/);
  assert.match(overlay,/icon:environment-changed/);
  assert.match(overlay,/iconProbe\.invalidate/);
  assert.match(native,/async fn icon_environment/);
  assert.match(native,/WindowEvent::ScaleFactorChanged/);
  assert.match(native,/WindowEvent::Resized/);
  assert.match(native,/wallpaper_revision/);
  assert.doesNotMatch(native,/SelectAndPositionItems/);
});
