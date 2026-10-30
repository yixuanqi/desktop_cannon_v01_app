import {allIconHits} from './collision.mjs';
import {snapshotToCandidates} from './coordinates.mjs';
/** Read-only Explorer hit detection. It never changes actual desktop icon positions. */
export class IconProbeRuntime {
  constructor({refreshSnapshot,getLayout,hitEffect,onSnapshot=()=>{},onError=()=>{},
    shouldIgnoreToken=()=>false,now=()=>Date.now()}) {
    this.refreshSnapshot=refreshSnapshot;this.getLayout=getLayout;
    this.hitEffect=hitEffect;this.onSnapshot=onSnapshot;this.onError=onError;
    this.shouldIgnoreToken=shouldIgnoreToken;this.now=now;
    this.enabled=false;this.candidates=[];this.snapshot=null;this.cooldown=new Map();
    this.lastRead=0;this.refreshPending=false;this.generation=0;this.explorerEpoch=null;
    this.stats={refreshes:0,hits:0};this.status='disabled';this.error='';this.rawCount=0;
  }
  setEnabled(enabled) {
    if(this.enabled===Boolean(enabled))return;
    this.enabled=Boolean(enabled);this.generation++;
    this.candidates=[];this.snapshot=null;this.cooldown.clear();this.lastRead=0;this.explorerEpoch=null;
    this.status=this.enabled?'loading':'disabled';this.error='';this.rawCount=0;
    if(this.enabled)void this.refresh();
  }
  invalidate(reason='environment-change') {
    this.generation++;this.candidates=[];this.snapshot=null;this.cooldown.clear();
    this.lastRead=0;this.explorerEpoch=null;this.refreshPending=false;
    this.status=this.enabled?'loading':'disabled';this.error=reason;
  }
  async refresh() {
    if(!this.enabled||this.refreshPending)return false;
    this.refreshPending=true;const generation=this.generation;
    try{
      const snapshot=await this.refreshSnapshot();
      if(!this.enabled||generation!==this.generation)return false;
      if(this.explorerEpoch!==null&&snapshot.explorerEpoch!==this.explorerEpoch)this.cooldown.clear();
      this.explorerEpoch=snapshot.explorerEpoch??null;
      this.snapshot=snapshot;
      this.rawCount=Array.isArray(snapshot.icons)?snapshot.icons.length:0;
      const layout=this.getLayout();
      this.candidates=snapshotToCandidates(snapshot,layout,this.now());
      this.status=!layout?'layout-unavailable':
        !this.rawCount?'no-icons':!this.candidates.length?'coordinate-filtered':'ready';
      this.error='';this.lastRead=this.now();this.stats.refreshes++;
      this.onSnapshot(snapshot,this.candidates);
      return true;
    }catch(error){
      if(generation===this.generation){
        this.snapshot=null;this.candidates=[];this.rawCount=0;this.lastRead=this.now();
        this.status='probe-error';this.error=String(error instanceof Error?error.message:error).slice(0,180);this.onError(this.error);
      }
      return false;
    }finally{if(generation===this.generation)this.refreshPending=false;}
  }
  tick(){if(this.enabled&&!this.refreshPending&&this.now()-this.lastRead>=2000)void this.refresh();}
  onSegment({x0,y0,x1,y1,radius,shotId,velocityX,velocityY}){
    if(!this.enabled||!this.candidates.length||this.now()-this.lastRead>6500)return null;
    const now=this.now();
    // A shot may contact multiple different icons within the SAME physics step.
    const eligible=this.candidates.filter(icon=>!this.shouldIgnoreToken(icon.token));
    const hits=allIconHits({x:x0,y:y0},{x:x1,y:y1},radius,eligible,{now,cooldown:this.cooldown,shotId});
    if(!hits.length)return null;
    for(const hit of hits){
      this.cooldown.set(shotId==null?hit.token:`shot:${shotId}|${hit.token}`,now);
      this.stats.hits++;
      this.hitEffect({x:hit.x,y:hit.y,token:hit.token,icon:hit.icon,shotId,velocityX,velocityY});
    }
    // Keep cooldown entries bounded over long desktop sessions.
    if(this.cooldown.size>512)for(const [key,when] of this.cooldown){if(now-when>15000)this.cooldown.delete(key);}
    return hits[0];
  }
}
