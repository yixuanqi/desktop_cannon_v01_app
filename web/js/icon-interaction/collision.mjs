/** Pure swept-circle vs AABB icon candidate collision; all coordinates CSS px. */
export function segmentRectFirstHit(a,b,rect,radius=0) {
  if (![a?.x,a?.y,b?.x,b?.y,rect?.x,rect?.y,rect?.width,rect?.height,radius].every(Number.isFinite)) return null;
  if (rect.width<=0||rect.height<=0||radius<0) return null;
  let tEnter=0,tExit=1;
  const limits=[{start:a.x,delta:b.x-a.x,lo:rect.x-radius,hi:rect.x+rect.width+radius},
    {start:a.y,delta:b.y-a.y,lo:rect.y-radius,hi:rect.y+rect.height+radius}];
  for(const {start,delta,lo,hi} of limits) {
    if (Math.abs(delta)<1e-10) { if(start<lo||start>hi) return null; continue; }
    let ta=(lo-start)/delta,tb=(hi-start)/delta;
    if(ta>tb) [ta,tb]=[tb,ta];
    tEnter=Math.max(tEnter,ta);tExit=Math.min(tExit,tb);
    if(tEnter>tExit) return null;
  }
  return {t:tEnter,x:a.x+(b.x-a.x)*tEnter,y:a.y+(b.y-a.y)*tEnter};
}
export function allIconHits(a,b,radius,icons,{now=0,cooldown=new Map(),cooldownMs=500,shotId=null}={}) {
  // A shot may hit the same icon only once; another shot must never be blocked
  // by the old global per-icon 500ms cooldown. Legacy callers keep time-based logic.
  const hits=[];
  for (const icon of icons) {
    if (!icon?.token || !icon?.rect) continue;
    const key=shotId==null?icon.token:`shot:${shotId}|${icon.token}`;
    if (shotId!=null ? cooldown.has(key) : now-(cooldown.get(key)??-Infinity)<cooldownMs)continue;
    const p=segmentRectFirstHit(a,b,icon.rect,radius);
    if(p) hits.push({...p,token:icon.token,icon});
  }
  return hits.sort((a,b)=>a.t-b.t);
}
/** Kept for callers that only need the first contact. */
export function firstIconHit(a,b,radius,icons,options={}) {
  return allIconHits(a,b,radius,icons,options)[0]??null;
}
