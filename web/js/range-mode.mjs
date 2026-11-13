/**
 * Optional 30-second VIRTUAL desktop range. This module does not inspect,
 * move, capture, or score real Windows Explorer icons.
 * All targets are reachable points sampled from the SAME projectile integrator
 * used to render live shots, rather than arbitrary decorative screen points.
 */
import {clamp, createProjectile, stepProjectile, PHYSICS} from './physics.mjs';

export const RANGE_DURATION_MS=30000;
export const RANGE_TARGET_RADIUS=23;
export const RANGE_BEST_KEY='desktop-cannon.range.best.v1';

export function sweptTargetHit(segment,target) {
  if(!target?.active || !segment ||
    ![segment.x0,segment.y0,segment.x1,segment.y1,segment.radius,target.x,target.y,target.radius].every(Number.isFinite))return false;
  const dx=segment.x1-segment.x0,dy=segment.y1-segment.y0;
  const d2=dx*dx+dy*dy;
  const t=d2>1e-10?clamp(((target.x-segment.x0)*dx+(target.y-segment.y0)*dy)/d2,0,1):0;
  const x=segment.x0+t*dx,y=segment.y0+t*dy;
  const r=Math.max(0,segment.radius)+target.radius;
  return (x-target.x)**2+(y-target.y)**2<=r*r;
}

function sampleArc(origin,bounds,power,angle,seconds) {
  const ball=createProjectile({...origin,power,angle});
  const steps=Math.max(1,Math.round(seconds/PHYSICS.maxStep));
  for(let i=0;i<steps&&ball.alive;i++) {
    let hitWall=false;
    stepProjectile(ball,PHYSICS.maxStep,bounds,()=>{hitWall=true;});
    if(hitWall)return null;
  }
  return ball.alive?{x:ball.x,y:ball.y}:null;
}

/** Arrange up to three safe, reachable targets, even on smaller screens. */
export function planRangeTargets(bounds,origin,wave=0) {
  if(!origin || ![origin.x,origin.y].every(Number.isFinite) ||
    !bounds || ![bounds.left,bounds.top,bounds.right,bounds.bottom].every(Number.isFinite) ||
    bounds.right-bounds.left<360 || bounds.bottom-bounds.top<240)return [];
  const candidates=[
    [.30,34,.32],[.56,34,.44],[.84,34,.52],
    [.44,30,.45],[.72,37,.43],[.92,32,.53],
    [.28,37,.38],[.65,30,.55],[.96,37,.46],
    [.38,33,.34],[.77,36,.50],[.52,31,.56],
  ];
  const targets=[];
  for(let k=0;k<candidates.length;k++){
    const [power,angle,seconds]=candidates[(k+wave*3)%candidates.length];
    const candidate=sampleArc(origin,bounds,power,angle,seconds);
    if(!candidate)continue;
    const {x,y}=candidate;
    const margin=RANGE_TARGET_RADIUS+17;
    if(x<bounds.left+margin||x>bounds.right-margin||y<bounds.top+margin||y>bounds.bottom-margin)continue;
    if(x>origin.x-70||Math.hypot(x-origin.x,y-origin.y)<120)continue;
    if(targets.some(t=>Math.hypot(t.x-x,t.y-y)<RANGE_TARGET_RADIUS*3.5))continue;
    targets.push({id:`range-${wave}-${k}`,x,y,radius:RANGE_TARGET_RADIUS,active:true});
    if(targets.length===3)break;
  }
  return targets;
}

export class DesktopRange {
  constructor({now=()=>Date.now(),durationMs=RANGE_DURATION_MS,bestScore=0}={}) {
    this.now=now;this.durationMs=durationMs;this.bestScore=Math.max(0,Number(bestScore)||0);
    this.active=false;this.finished=false;this.reason='';this.score=0;this.combo=0;
    this.targets=[];this.origin=null;this.bounds=null;this.endsAt=0;this.wave=0;this.finishedAt=0;
    this.lastHitAt=-Infinity;this.lastAward=null;
  }
  start(bounds,origin) {
    const planned=planRangeTargets(bounds,origin,0);
    if(!planned.length)return false;
    this.active=true;this.finished=false;this.reason='';this.finishedAt=0;
    this.score=0;this.combo=0;this.wave=0;this.lastHitAt=-Infinity;
    this.lastAward=null;this.targets=planned;this.bounds={...bounds};this.origin={...origin};
    this.endsAt=this.now()+this.durationMs;
    return true;
  }
  stop(reason='stopped') {
    if(!this.active)return false;
    this.active=false;this.finished=true;this.reason=reason;this.finishedAt=this.now();
    this.bestScore=Math.max(this.bestScore,this.score);
    this.targets=[];return true;
  }
  tick() {
    if(!this.active)return false;
    if(this.now()>=this.endsAt){this.stop('time');return true;}
    return false;
  }
  hitSegment(segment) {
    if(!this.active)return [];
    if(this.tick())return [];
    const hits=[];
    const now=this.now();
    for(const target of this.targets){
      if(!sweptTargetHit(segment,target))continue;
      target.active=false;
      this.combo=now-this.lastHitAt<=4000?Math.min(this.combo+1,5):1;
      this.lastHitAt=now;
      const gained=100+(this.combo-1)*50;
      this.score+=gained;
      this.lastAward={x:target.x,y:target.y,score:gained,combo:this.combo,at:now};
      hits.push({x:target.x,y:target.y,score:gained,combo:this.combo});
    }
    if(hits.length && !this.targets.some(t=>t.active)){
      this.wave++;
      const next=planRangeTargets(this.bounds,this.origin,this.wave);
      if(next.length)this.targets=next;
      else this.stop('cleared');
    }
    return hits;
  }
  get remainingMs(){return this.active?Math.max(0,this.endsAt-this.now()):0;}
  snapshot(){
    return {active:this.active,finished:this.finished,reason:this.reason,
      secondsLeft:Math.ceil(this.remainingMs/1000),score:this.score,
      combo:this.combo,bestScore:Math.max(this.bestScore,this.score),
      targetsLeft:this.targets.filter(t=>t.active).length,wave:this.wave+1};
  }
}
