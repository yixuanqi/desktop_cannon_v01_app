import { listen, emit, getLayout, getIconSnapshot, getIconCapabilities, getIconVisualSamples, getIconVisualGuardMany, getIconEnvironment, isTauri } from './bridge.mjs';
import { IconProbeRuntime } from './icon-interaction/runtime.mjs';
import { IconIllusion, decodeImage } from './icon-interaction/illusion.mjs';
import { IconCacheLifecycle, iconSnapshotKey } from './icon-interaction/cache-lifecycle.mjs';
import { PHYSICS, createProjectile, advanceProjectileFrame } from './physics.mjs';
import { ParticleSystem } from './particles.mjs';
import { predictedTrajectory } from './trajectory.mjs';

const iconDebug = Boolean(globalThis.window?.location?.search?.includes('iconDebug=1'));
const canvas=document.querySelector('#field');
const ctx=canvas.getContext('2d',{alpha:true});
const notice=document.querySelector('#illusion-notice');
const sprite=new Image();sprite.src='/assets/cannonball.png';
const fx=new ParticleSystem();const projectiles=[];
let layout;let rafId=0;let lastTick=0;let width=0;let height=0;
let renderedFrames=0;let lastImpactSoundAt=0;let aim=null;
let nextIllusionGuardAt=0;let illusionGuardPending=false;
let aimDots=[];let aimDirty=true;let aimBoundsKey='';
let refreshTimer=0;let environmentTimer=0;let environmentPending=false;let environmentSequence=0;let visualWarmupPromise=null;let visualCacheSignature='';
const lifecycle=new IconCacheLifecycle();
let visualState='off';let visualMessage='';let visualMessageUntil=0;

function showNotice(message,duration=2600){
  visualMessage=message;visualMessageUntil=Date.now()+duration;updateNotice();
}
function updateNotice(){
  if(!notice)return;
  const active=Date.now()<visualMessageUntil;
  notice.textContent=active?visualMessage:
    visualState==='loading'?'正在预热桌面图标素材，请稍候…':
    visualState==='failed'?'图标素材准备失败：本次只播放命中火星':'';
  notice.style.display=notice.textContent?'block':'none';
}

const illusion=new IconIllusion({
  loadImage:decodeImage,getLayout:()=>layout,
  onError:error=>{visualState='failed';showNotice(`视觉飞散暂不可用：${String(error).slice(0,90)}；命中检测仍正常`,2800);},
  onReady:({count})=>{visualState=count?'ready':'failed';showNotice(`图标素材已预热：${count} 个`,1800);},
});

function discardVisualCache(reason) {
  lifecycle.invalidate(reason);
  illusion.invalidate();  // cancels animation + invalidates async image decoding
  visualCacheSignature='';visualWarmupPromise=null;
  visualState=illusion.enabled?'loading':'off';
  updateNotice();render();
}

async function prepareVisualCache(snapshot){
  if(!illusion.enabled||!isTauri||!layout||!lifecycle.environment||!snapshot?.icons?.length)return 0;
  const signature=iconSnapshotKey(snapshot);
  if(!signature||signature!==lifecycle.snapshot)return 0;
  if(signature===visualCacheSignature&&illusion.cacheSize>0)return illusion.cacheSize;
  if(visualWarmupPromise)return visualWarmupPromise;
  const revision=lifecycle.revision,environment=lifecycle.environment;
  visualState='loading';updateNotice();
  const task=(async()=>{
    try{
      const batch=await getIconVisualSamples();
      if(!illusion.enabled||!lifecycle.isCurrent(revision,signature,environment))return 0;
      // In-flight Shell reordering: reject a batch whose token/physical cells
      // no longer match the snapshot we used for collision targets.
      const expected=new Map(snapshot.icons.map(c=>[c.token,`${c.screenX},${c.screenY},${c.cellWidth},${c.cellHeight}`]));
      if((batch.samples??[]).some(sample=>
        expected.get(sample.token)!==`${sample.screenX},${sample.screenY},${sample.width},${sample.height}`)){
        discardVisualCache('visual-snapshot-mismatch');
        iconProbe.invalidate('visual-snapshot-mismatch');
        void iconProbe.refresh();return 0;
      }
      const count=await illusion.prepare(batch.samples,`${environment}|${signature}`);
      if(!illusion.enabled||!lifecycle.isCurrent(revision,signature,environment))return 0;
      if(!count)throw new Error(batch.firstRejection||'NO_VALID_ICON_SAMPLES');
      visualCacheSignature=signature;
      if(batch.rejected)showNotice(`视觉素材 ${count}/${batch.total} 已预热，${batch.rejected} 个暂不支持（仍可命中）`,2400);
      return count;
    }catch(error){
      if(!illusion.enabled||!lifecycle.isCurrent(revision,signature,environment))return 0;
      visualState='failed';showNotice(`素材预热失败：${String(error).slice(0,100)}`,4200);return 0;
    }finally{
      if(visualWarmupPromise===task)visualWarmupPromise=null;
      updateNotice();
    }
  })();
  visualWarmupPromise=task;
  return task;
}

const iconProbe=new IconProbeRuntime({
  refreshSnapshot:()=>isTauri?getIconSnapshot():Promise.resolve({desktopForeground:false,capturedAtMs:Date.now(),icons:[]}),
  getLayout:()=>layout,
  onSnapshot:snapshot=>{
    if(iconDebug)render();
    if(!illusion.enabled)return;
    if(!iconProbe.candidates.length){
      illusion.invalidate();visualCacheSignature='';visualWarmupPromise=null;
      lifecycle.observeSnapshot(snapshot);
      return;
    }
    if(lifecycle.observeSnapshot(snapshot)){
      illusion.invalidate();visualCacheSignature='';visualWarmupPromise=null;
    }
    void prepareVisualCache(snapshot);
  },
  onError:error=>{visualState='failed';showNotice(`桌面图标读取失败：${String(error).slice(0,90)}`,3800);},
  shouldIgnoreToken:token=>illusion.isActive(token),
  hitEffect:({x,y,token,icon,velocityX,velocityY})=>{
    // This path is deliberately synchronous. No capture, PNG encoding or image decode on impact.
    const started=illusion.onHit({token,hitX:x,hitY:y,velocityX,velocityY,physicalRect:icon?.physicalRect});
    fx.spawn('impact',x,y,started?22:18,.24);
  },
});

function setInteractionEnabled(enabled){
  const next=Boolean(enabled);
  if(iconProbe.enabled===next&&illusion.enabled===next)return;
  iconProbe.setEnabled(next);illusion.setEnabled(next);
  if(refreshTimer)clearInterval(refreshTimer);
  if(environmentTimer)clearInterval(environmentTimer);
  refreshTimer=next?setInterval(()=>iconProbe.tick(),1000):0;
  environmentTimer=next?setInterval(()=>{void reconcileEnvironment('periodic');},2000):0;
  if(!next){lifecycle.invalidate('disabled');visualCacheSignature='';visualWarmupPromise=null;visualState='off';visualMessage='';visualMessageUntil=0;}
  else{
    visualState='loading';void reconcileEnvironment('enabled');
  }
  updateNotice();render();
}

/** Environment changes are a safety barrier: no old wallpaper patch or cell may render. */
async function reconcileEnvironment(source='periodic') {
  if(!illusion.enabled||!isTauri||environmentPending)return;
  environmentPending=true;
  const serial=environmentSequence;
  try {
    const env=await getIconEnvironment();
    if(serial!==environmentSequence)return;
    if(!illusion.enabled)return;
    const changed=lifecycle.observeEnvironment(env);
    if(changed){
      illusion.invalidate();visualWarmupPromise=null;visualCacheSignature='';
      iconProbe.invalidate(`environment:${source}`);
      layout=env.layout;resize();render();
      await iconProbe.refresh();
    }
  }catch(error){
    if(illusion.enabled){
      discardVisualCache('environment-query-error');
      iconProbe.invalidate('environment-query-error');
      visualState='failed';showNotice(`桌面环境读取失败，已停止图标互动：${String(error).slice(0,70)}`,2500);
    }
  }finally{
    environmentPending=false;
    if(serial!==environmentSequence&&illusion.enabled)void reconcileEnvironment('event-retry');
  }
}

function onDisplayChange(source){
  if(!illusion.enabled)return;
  // Cancel immediately; never show a wallpaper patch at an old DPI or origin.
  environmentSequence++;lifecycle.environment='';
  discardVisualCache(`display:${source}`);
  iconProbe.invalidate(`display:${source}`);
  void reconcileEnvironment(source);
}

function resize(){
  width=window.innerWidth;height=window.innerHeight;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  ctx.setTransform(dpr,0,0,dpr,0,0);aimDirty=true;
}
function onImpact(event){
  const power=Math.min(event.speed/650,1);
  fx.spawn('impact',event.x,event.y,24+30*power,.28);
  if(event.kind==='ground'&&event.speed<115)fx.spawn('smoke',event.x,event.y,43,.45);
  if(performance.now()-lastImpactSoundAt>140&&power>.3){
    lastImpactSoundAt=performance.now();emit('cannon:impact',{power}).catch(()=>{});
  }
}
function render(){
  ctx.clearRect(0,0,width,height);
  if(aim){
    const bounds={left:0,top:0,right:width,bottom:Math.min(height,layout?.taskbarTop??height-48)};
    const key=`${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`;
    if(aimDirty||key!==aimBoundsKey){aimDots=predictedTrajectory(aim,bounds);aimDirty=false;aimBoundsKey=key;}
    ctx.save();
    for(const point of aimDots){ctx.globalAlpha=point.opacity;ctx.beginPath();ctx.arc(point.x,point.y,3.1,0,Math.PI*2);ctx.fillStyle='#f7c96b';ctx.fill();}
    ctx.restore();
  }
  illusion.draw(ctx);
  // Debug-only: start overlay with ?iconDebug=1; do not clutter tray.
  if(iconDebug)
    illusion.drawDebug(ctx,iconProbe.candidates);
  for(const ball of projectiles){
    if(sprite.complete&&sprite.naturalWidth)ctx.drawImage(sprite,ball.x-ball.radius,ball.y-ball.radius,ball.radius*2,ball.radius*2);
    else{ctx.beginPath();ctx.arc(ball.x,ball.y,ball.radius,0,Math.PI*2);ctx.fillStyle='#394352';ctx.fill();}
  }
  fx.draw(ctx);updateNotice();renderedFrames++;
}
function loop(timestamp){
  rafId=0;
  const dt=Math.min((timestamp-lastTick)/1000||0,.075);lastTick=timestamp;
  const bounds={left:0,top:0,right:width,bottom:Math.min(height,layout?.taskbarTop??height-48)};
  for(const ball of projectiles){
    const oldX=ball.x,oldY=ball.y;
    advanceProjectileFrame(ball,dt,bounds,onImpact,segment=>iconProbe.onSegment(segment));
    ball.trailTimer+=dt;
    if(ball.alive&&ball.trailTimer>.07&&!ball.grounded&&Math.hypot(ball.x-oldX,ball.y-oldY)>.8){
      ball.trailTimer=0;fx.spawn('smoke',ball.x,ball.y,20,.34);
    }
    if(!ball.alive)fx.spawn('explosion',ball.x,ball.y,46,.50);
  }
  for(let i=projectiles.length-1;i>=0;i--)if(!projectiles[i].alive)projectiles.splice(i,1);
  fx.update(dt);illusion.update(dt,bounds);
  if(illusion.active&&!illusionGuardPending&&timestamp>=nextIllusionGuardAt&&isTauri){
    nextIllusionGuardAt=timestamp+200;illusionGuardPending=true;
    // A single native call checks every hidden real icon; on uncertainty
    // remove ALL masks rather than risking blocking an Explorer click.
    void getIconVisualGuardMany(illusion.activeRects).then(safe=>{if(!safe){illusion.cancel();render();}})
      .catch(()=>illusion.cancel()).finally(()=>{illusionGuardPending=false;});
  }
  render();
  if(projectiles.length||fx.active||aim||illusion.hasAnimation)rafId=requestAnimationFrame(loop);
  else lastTick=0;
}
function wake(){if(!rafId){lastTick=0;rafId=requestAnimationFrame(loop);}}

listen('icon:interaction-changed',enabled=>setInteractionEnabled(Boolean(enabled)));
listen('cannon:aim',payload=>{if(Number.isFinite(payload?.x)&&Number.isFinite(payload?.y)){aim=payload;aimDirty=true;wake();}});
listen('cannon:aim-stop',()=>{aim=null;aimDots=[];aimDirty=true;render();});
listen('cannon:fire',payload=>{
  if(!payload||!Number.isFinite(payload.x)||!Number.isFinite(payload.y))return;
  if(projectiles.length>=PHYSICS.maxProjectiles)projectiles.shift();
  projectiles.push(createProjectile(payload));fx.spawn('muzzle',payload.x,payload.y,70,.17);wake();
});
window.addEventListener('resize',()=>{illusion.cancel();resize();render();onDisplayChange('webview-resize');});
listen('icon:environment-changed',payload=>onDisplayChange(payload?.reason||'native-window-event'));
window.addEventListener('pagehide',()=>illusion.cancel());
document.addEventListener?.('visibilitychange',()=>{if(document.hidden)illusion.cancel();});

getLayout().then(value=>{
  layout=value;resize();
  if(iconProbe.enabled)void reconcileEnvironment('initial-layout');
}).catch(console.error);

async function reconcileNativeFlags(){
  if(!isTauri)return;
  try{
    const capabilities=await getIconCapabilities();
    setInteractionEnabled(Boolean(capabilities.enabled));
  }catch(error){
    visualState='failed';showNotice(`无法读取图标互动状态：${String(error).slice(0,90)}`,3500);
  }
}
if(isTauri){
  void reconcileNativeFlags();
  const timer=window.setInterval(()=>{if(!document.hidden)void reconcileNativeFlags();},2500);
  timer?.unref?.();window.addEventListener?.('pagehide',()=>window.clearInterval(timer));
}
resize();updateNotice();
window.__overlayDebug={iconProbe,illusion,lifecycle,projectiles,
  get renderedFrames(){return renderedFrames;},get active(){return Boolean(rafId);},get aim(){return aim;},
  get layout(){return layout;},fire:payload=>emit('cannon:fire',payload)};
