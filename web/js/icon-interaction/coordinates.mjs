/** Physical desktop coordinates -> overlay CSS pixels, never assume Shell grid cells are picture bounds. */
export function screenToOverlay(point,{overlayPhysicalX=0,overlayPhysicalY=0,scaleFactor=1}={}) {
  if (![point?.x,point?.y,overlayPhysicalX,overlayPhysicalY,scaleFactor].every(Number.isFinite)||scaleFactor<=0)
    throw new Error('invalid coordinate transform');
  return {x:(point.x-overlayPhysicalX)/scaleFactor,y:(point.y-overlayPhysicalY)/scaleFactor};
}
/**
 * Conservative IMAGE collision region inside an Explorer spacing cell.
 * GetItemPosition + GetSpacing are not the exact visual rectangle. The reported
 * imageSize comes from IFolderView2; this still is a derived region, not UIA.
 * Never use this region as a substitute for the full cell during screenshot
 * extraction / background masking (those are separate coordinate contracts).
 */
export function iconImageRegion(cell) {
  const {screenX:x,screenY:y,cellWidth:w,cellHeight:h}=cell??{};
  if(![x,y,w,h].every(Number.isFinite)||w<20||h<20)return null;
  let size=cell.imageSize;
  const reported=Number.isFinite(size)&&size>=16&&size<=Math.min(w,h,256);
  if(!reported) size=Math.min(64,Math.max(16,Math.min(w-14,h-42)));
  size=Math.min(size,w-8,h-8);
  const insetX=Math.max(0,Math.round((w-size)/2));
  const insetY=Math.max(2,Math.min(16,Math.round((h-size-36)/2)));
  const padding=3; // modest contact margin for high-velocity projectile circles
  return {
    x:x+insetX-padding,y:y+insetY-padding,
    width:size+padding*2,height:size+padding*2,
    source:reported?'shell-size-estimate':'spacing-fallback-estimate',
  };
}
export function snapshotToCandidates(snapshot,layout,nowMs=Date.now()) {
  if(!snapshot || !Array.isArray(snapshot.icons)||
    nowMs-(snapshot.capturedAtMs??-Infinity)>7500 || snapshot.capturedAtMs-nowMs>3000) return [];
  if(!layout || !Number.isFinite(layout.scaleFactor)||layout.scaleFactor<=0)return [];
  const result=[];const scale=layout.scaleFactor;
  for(const cell of snapshot.icons) {
    if(!Number.isFinite(cell.screenX)||!Number.isFinite(cell.screenY)||
      !Number.isFinite(cell.cellWidth)||!Number.isFinite(cell.cellHeight))continue;
    const img=iconImageRegion(cell);
    if(!img)continue;
    const pt=screenToOverlay(img,layout);
    const rect={x:pt.x,y:pt.y,width:img.width/scale,height:img.height/scale};
    if(rect.x+rect.width<=0||rect.y+rect.height<=0||rect.x>=layout.screenWidth||rect.y>=layout.taskbarTop)continue;
    result.push({token:cell.token,rect,geometrySource:img.source,
      physicalRect:{screenX:cell.screenX,screenY:cell.screenY,width:cell.cellWidth,height:cell.cellHeight}});
  }
  return result;
}
