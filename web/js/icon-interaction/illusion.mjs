/**
 * V0.6.4: prewarmed sprites + simultaneous icons + ground-rest physics.
 * No asynchronous work is allowed in onHit(): a cached hit starts this frame.
 */
import { screenToOverlay } from './coordinates.mjs';

export const ICON_PHYSICS = Object.freeze({
  impulseScale: 0.32,
  maxLaunchSpeed: 620,
  gravity: 1450,
  maxFlightSeconds: 4.5,
  restSecondsMin: 5,
  restSecondsMax: 8,
  maxConcurrentIcons: 12,
  groundLinearDrag: 6.0,
  groundedSettleSpeed: 48,
  minGroundContactAge: .12,
  linearDrag: 0.10,
  restitutionX: 0.42,
  restitutionY: 0.38,
  floorFriction: 0.80,
  angularDamping: 1.7,
  maxAngularSpeed: 8.0,
  springK: 52,
  springDamping: 14.4,
  rotationSpringK: 48,
  rotationSpringDamping: 12.5,
  settlePosition: 1.35,
  settleVelocity: 18,
  settleAngle: 0.025,
  settleAngularVelocity: 0.08,
  maxDuration: 18,
  fixedStep: 1 / 120,
});

const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));

export function validateVisualSample(sample, layout) {
  if(!sample||!layout||typeof sample.token!=='string'||
     !Number.isFinite(sample.screenX)||!Number.isFinite(sample.screenY)||
     !Number.isFinite(sample.width)||!Number.isFinite(sample.height)||
     sample.width<8||sample.height<8||sample.width>256||sample.height>256||
     sample.borderMatch<.88) throw new Error('ICON_SAMPLE_INVALID');
  if(!sample.backgroundDataUrl?.startsWith('data:image/png;base64,')||
     !sample.spriteDataUrl?.startsWith('data:image/png;base64,')) throw new Error('ICON_IMAGE_MISSING');
  const point=screenToOverlay({x:sample.screenX,y:sample.screenY},layout);
  const scale=layout.scaleFactor;
  // Full cell is used for the wallpaper patch, but the icon IMAGE within it
  // is the physics collision body. Text lives outside these image bounds.
  const left=Number.isFinite(sample.imageLeft)?sample.imageLeft/scale:0;
  const top=Number.isFinite(sample.imageTop)?sample.imageTop/scale:0;
  const imageWidth=Number.isFinite(sample.imageWidth)?sample.imageWidth/scale:sample.width/scale;
  const imageHeight=Number.isFinite(sample.imageHeight)?sample.imageHeight/scale:sample.height/scale;
  if(left<0||top<0||imageWidth<=0||imageHeight<=0||
    left+imageWidth>sample.width/scale+.01||top+imageHeight>sample.height/scale+.01)
    throw new Error('ICON_IMAGE_BOUNDS_INVALID');
  return {x:point.x,y:point.y,width:sample.width/scale,height:sample.height/scale,
    iconBounds:{left,top,right:left+imageWidth,bottom:top+imageHeight},
    physicalRect:{screenX:sample.screenX,screenY:sample.screenY,width:sample.width,height:sample.height}};
}

function samePhysicalRect(a,b) {
  return Boolean(a&&b&&a.screenX===b.screenX&&a.screenY===b.screenY&&
    a.width===b.width&&a.height===b.height);
}

function clampVelocity(value) {
  return clamp(Number.isFinite(value)?value:0,-ICON_PHYSICS.maxLaunchSpeed,ICON_PHYSICS.maxLaunchSpeed);
}

/** Stable per-icon waiting time avoids randomly changing rest duration between runs. */
export function groundHoldSeconds(token) {
  let hash=2166136261;
  for(const char of String(token)){
    hash=Math.imul(hash^char.codePointAt(0),16777619)>>>0;
  }
  return ICON_PHYSICS.restSecondsMin+(hash%301)/100;
}

function makeLaunch(sample, rect, {hitX,hitY,velocityX,velocityY}) {
  const vx=clampVelocity(velocityX*ICON_PHYSICS.impulseScale);
  const vy=clampVelocity(velocityY*ICON_PHYSICS.impulseScale);
  const rx=(Number.isFinite(hitX)?hitX:rect.x+rect.width/2)-(rect.x+rect.width/2);
  const ry=(Number.isFinite(hitY)?hitY:rect.y+rect.height/2)-(rect.y+rect.height/2);
  const inertia=(rect.width*rect.width+rect.height*rect.height)/12;
  const omega=clamp((rx*vy-ry*vx)/Math.max(inertia,1)*1.25,
    -ICON_PHYSICS.maxAngularSpeed,ICON_PHYSICS.maxAngularSpeed);
  return {
    token:sample.token,rect,background:sample.background,sprite:sample.sprite,
    homeX:rect.x,homeY:rect.y,x:rect.x,y:rect.y,vx,vy,angle:0,omega,
    age:0,phase:'flight',flightAge:0,groundAge:0,restAge:0,
    restSeconds:groundHoldSeconds(sample.token),bouncesX:0,bouncesY:0,grounded:false,
    physicalRect:rect.physicalRect,
  };
}

export class IconIllusion {
  constructor({loadImage,getLayout,onError=()=>{},onReady=()=>{}}) {
    this.loadImage=loadImage;this.getLayout=getLayout;
    this.onError=onError;this.onReady=onReady;
    this.enabled=false;this.pending=false;this.activeByToken=new Map();
    this.generation=0;this.failed=0;this.succeeded=0;this.accumulator=0;
    this.cache=new Map();this.cacheSignature='';
  }

  setEnabled(value) {
    const next=Boolean(value);
    if(this.enabled===next)return;
    this.enabled=next;this.generation++;this.activeByToken.clear();this.pending=false;this.accumulator=0;
    if(!next){this.cache.clear();this.cacheSignature='';}
  }

  cancel(){this.generation++;this.pending=false;this.activeByToken.clear();this.accumulator=0;}

  /** Hard barrier: no pixels from any previous environment may be replayed. */
  invalidate(){
    this.cancel();this.cache.clear();this.cacheSignature='';
  }

  async prepare(samples, signature='') {
    if(!this.enabled)return 0;
    if(this.pending)return 0;
    const generation=this.generation;
    this.pending=true;
    try {
      const prepared=await Promise.allSettled((samples??[]).map(async sample=>{
        const rect=validateVisualSample(sample,this.getLayout());
        const [background,sprite]=await Promise.all([
          this.loadImage(sample.backgroundDataUrl),this.loadImage(sample.spriteDataUrl)]);
        // Shell alpha-trimmed PNG must match its declared physical bitmap size.
        // Reject corrupt/inconsistent images rather than drawing half a sprite.
        const expectedWidth=Number.isFinite(sample.imageWidth)?sample.imageWidth:sample.width;
        const expectedHeight=Number.isFinite(sample.imageHeight)?sample.imageHeight:sample.height;
        const actualWidth=sprite.naturalWidth??sprite.width;
        const actualHeight=sprite.naturalHeight??sprite.height;
        if((Number.isFinite(actualWidth)&&actualWidth!==expectedWidth)||
           (Number.isFinite(actualHeight)&&actualHeight!==expectedHeight))
          throw new Error('SPRITE_DIMENSION_MISMATCH');
        return [sample.token,{...sample,rect,background,sprite}];
      }));
      if(!this.enabled||generation!==this.generation)return 0;
      const successful=prepared.filter(x=>x.status==='fulfilled').map(x=>x.value);
      this.cache=new Map(successful);
      this.cacheSignature=signature;
      if(!this.cache.size){this.onError('NO_VALID_PREWARMED_ICON_IMAGES');return 0;}
      this.onReady({count:this.cache.size,signature,rejected:prepared.length-this.cache.size});
      return this.cache.size;
    } catch(error) {
      if(generation===this.generation){this.failed++;this.cache.clear();this.onError(String(error));}
      return 0;
    } finally {
      if(generation===this.generation)this.pending=false;
    }
  }

  /** Legacy single-icon inspection access; physical simulation uses activeByToken. */
  get active(){return this.activeByToken.values().next().value??null;}
  get activeCount(){return this.activeByToken.size;}
  get activeRects(){return [...this.activeByToken.values()].map(a=>a.physicalRect);}
  isActive(token){return this.activeByToken.has(token);}
  cancelToken(token){this.activeByToken.delete(token);if(!this.activeByToken.size)this.accumulator=0;}

  /** Synchronous: every DISTINCT token gets its own rigid-body state. */
  onHit({token,hitX,hitY,velocityX=0,velocityY=0,physicalRect}={}) {
    if(!this.enabled||this.pending||!token)return false;
    if(this.activeByToken.has(token)||this.activeByToken.size>=ICON_PHYSICS.maxConcurrentIcons)return false;
    const sample=this.cache.get(token);
    if(!sample)return false;
    if(physicalRect&&!samePhysicalRect(sample.rect.physicalRect,physicalRect)){
      this.onError('ICON_CACHE_STALE');return false;
    }
    this.activeByToken.set(token,makeLaunch(sample,sample.rect,{hitX,hitY,velocityX,velocityY}));
    this.succeeded++;
    return true;
  }

  /** Update all active icons on the SAME 120Hz clock, independent of monitor refresh rate. */
  update(dt,bounds={left:0,top:0,right:1920,bottom:1040}) {
    if(!this.activeByToken.size||!Number.isFinite(dt)||dt<=0)return;
    const p=ICON_PHYSICS;
    this.accumulator=Math.min(this.accumulator+Math.min(dt,.075),.15);
    while(this.accumulator+1e-10>=p.fixedStep&&this.activeByToken.size){
      const h=p.fixedStep;this.accumulator-=h;
      for(const [token,a] of this.activeByToken){
        a.age+=h;
        const right=Number.isFinite(bounds.right)?bounds.right:1920;
        const bottom=Number.isFinite(bounds.bottom)?bounds.bottom:1040;
        const left=Number.isFinite(bounds.left)?bounds.left:0;
        const top=Number.isFinite(bounds.top)?bounds.top:0;
        const ib=a.rect.iconBounds??{left:0,top:0,right:a.rect.width,bottom:a.rect.height};
        const floor=Math.max(top-ib.top,bottom-ib.bottom);
        if(a.phase==='flight'){
          a.flightAge+=h;
          a.vx*=Math.exp(-p.linearDrag*h);
          if(a.grounded){
            a.groundAge+=h;
            a.vy=0;a.y=floor;
            a.vx*=Math.exp(-p.groundLinearDrag*h);
          }else{
            a.vy+=p.gravity*h;
          }
          a.x+=a.vx*h;a.y+=a.vy*h;
          a.angle+=a.omega*h;
          a.omega*=Math.exp(-p.angularDamping*h);
          if(a.x+ib.left<left){a.x=left-ib.left;a.vx=Math.abs(a.vx)*p.restitutionX;a.omega*=-.55;a.bouncesX++;}
          if(a.x+ib.right>right){a.x=right-ib.right;a.vx=-Math.abs(a.vx)*p.restitutionX;a.omega*=-.55;a.bouncesX++;}
          if(a.y+ib.top<top){a.y=top-ib.top;a.vy=Math.abs(a.vy)*p.restitutionY;a.bouncesY++;}
          if(a.y>=floor){
            a.y=floor;
            if(!a.grounded){
              a.bouncesY++;
              if(Math.abs(a.vy)>85){a.vy=-Math.abs(a.vy)*p.restitutionY;a.vx*=p.floorFriction;a.omega*=.72;}
              else{a.vy=0;a.grounded=true;a.groundAge=0;}
            }
          }
          // Do not start the 5-8 second countdown until the sprite actually lands.
          if(a.grounded&&a.groundAge>=p.minGroundContactAge&&Math.abs(a.vx)<=p.groundedSettleSpeed){
            a.phase='rest';a.restAge=0;a.vx=0;a.vy=0;a.omega=0;a.y=floor;
          }else if(a.flightAge>=p.maxFlightSeconds){
            // Safety bound for unusual physical geometry, still visibly place on ground.
            a.phase='rest';a.restAge=0;a.vx=0;a.vy=0;a.omega=0;a.y=floor;
          }
        }else if(a.phase==='rest'){
          a.restAge+=h;
          a.y=floor;
          // Smoothly settle a tipped-over icon; no instant rotation snap.
          a.angle*=Math.exp(-4*h);
          if(a.restAge>=a.restSeconds){a.phase='return';a.returnAge=0;}
        }else if(a.phase==='return'){
          a.returnAge=(a.returnAge??0)+h;
          const dx=a.x-a.homeX,dy=a.y-a.homeY;
          const ax=-p.springK*dx-p.springDamping*a.vx;
          const ay=-p.springK*dy-p.springDamping*a.vy;
          a.vx+=ax*h;a.vy+=ay*h;a.x+=a.vx*h;a.y+=a.vy*h;
          const angularAcceleration=-p.rotationSpringK*a.angle-p.rotationSpringDamping*a.omega;
          a.omega+=angularAcceleration*h;a.angle+=a.omega*h;
          const distance=Math.hypot(a.x-a.homeX,a.y-a.homeY);
          if((distance<=p.settlePosition&&Math.hypot(a.vx,a.vy)<=p.settleVelocity&&
            Math.abs(a.angle)<=p.settleAngle&&Math.abs(a.omega)<=p.settleAngularVelocity)||a.returnAge>4){
            this.activeByToken.delete(token);
          }
        }
        if(a.age>=p.maxDuration)this.activeByToken.delete(token);
      }
    }
    if(!this.activeByToken.size)this.accumulator=0;
  }

  get hasAnimation(){return this.activeByToken.size>0;}
  get cacheSize(){return this.cache.size;}

  draw(ctx) {
    if(!this.activeByToken.size)return;
    // All wallpaper masks FIRST: a neighboring mask must never erase a flying icon.
    for(const a of this.activeByToken.values()){
      const {x,y,width,height}=a.rect;
      ctx.drawImage(a.background,x,y,width,height);
    }
    // Only the icon image has alpha. The source text is hidden at home but
    // is not rotated, torn or dragged as part of the image sprite.
    for(const a of this.activeByToken.values()){
      // renderRect is independent from full-cell captureRect and the smaller
      // collision hitbox. The extracted PNG is already alpha-trimmed; place it
      // at its stored cell-relative visual origin. NEVER draw it as a cell.
      const ib=a.rect.iconBounds;
      const sw=ib.right-ib.left,sh=ib.bottom-ib.top;
      ctx.save();ctx.translate(a.x+ib.left+sw/2,a.y+ib.top+sh/2);ctx.rotate(a.angle);
      ctx.drawImage(a.sprite,-sw/2,-sh/2,sw,sh);
      ctx.restore();
    }
  }

  /** Opt-in visual inspection: green=hitbox; blue=full capture cell;
   * yellow=actual sprite rendering bounds. No other debug UI or tray item. */
  drawDebug(ctx,candidates=[]) {
    for(const a of this.activeByToken.values()) {
      const r=a.rect,ib=r.iconBounds;
      ctx.strokeStyle='#4299ff';ctx.lineWidth=1.5;
      ctx.strokeRect(r.x,r.y,r.width,r.height);
      ctx.strokeStyle='#ffd744';
      ctx.strokeRect(a.x+ib.left,a.y+ib.top,ib.right-ib.left,ib.bottom-ib.top);
    }
    ctx.strokeStyle='#35e49c';ctx.lineWidth=1.5;
    for(const c of candidates){
      if(!c?.rect)continue;
      const {x,y,width,height}=c.rect;
      ctx.strokeRect(x,y,width,height);
    }
  }
}

export function decodeImage(url) {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('ICON_IMAGE_DECODE_FAILED'));
    img.src=url;
  });
}
