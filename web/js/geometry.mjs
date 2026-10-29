import { AIM } from './aim.mjs';
import { MESH, warpedSourcePoint } from './mesh-warp.mjs';
export const CANNON_WINDOW=Object.freeze({width:360,height:240});
export const SPRITE=Object.freeze({
  x:39,y:53,width:214,height:156,
  pivotSourceX:280,pivotSourceY:216,
  muzzleSourceX:135,muzzleSourceY:160,
  rearSourceX:371,rearSourceY:187,
});
export function pointInSprite(x,y) {
  return {x:SPRITE.x+SPRITE.width*x/MESH.width,
    y:SPRITE.y+SPRITE.height*y/MESH.height};
}
export const PIVOT=Object.freeze(pointInSprite(SPRITE.pivotSourceX,SPRITE.pivotSourceY));
// Kept as standalone geometry helper; mesh mode does NOT use rigid rotation.
export function rotateAround(point,origin,degrees) {
  const r=degrees*Math.PI/180, c=Math.cos(r),s=Math.sin(r);
  const dx=point.x-origin.x,dy=point.y-origin.y;
  return {x:origin.x+dx*c-dy*s,y:origin.y+dx*s+dy*c};
}
export function meshPointInCannon(sourceX,sourceY,angle=AIM.baseAngle) {
  const point=warpedSourcePoint(sourceX,sourceY,angle);
  return pointInSprite(point.x,point.y);
}
export function muzzleInCannon(angle=AIM.baseAngle) {
  return meshPointInCannon(SPRITE.muzzleSourceX,SPRITE.muzzleSourceY,angle);
}
export function receiverInCannon(angle=AIM.baseAngle) {
  return meshPointInCannon(SPRITE.rearSourceX,SPRITE.rearSourceY,angle);
}
export function cannonPosition(workArea,scale=1) {
  return {
    x:Math.round(workArea.x+workArea.width-CANNON_WINDOW.width*scale-15*scale),
    y:Math.round(workArea.y+workArea.height-CANNON_WINDOW.height*scale-4*scale),
  };
}
export function muzzleOnOverlay(layout,angle=AIM.baseAngle) {
  const muzzle=muzzleInCannon(angle);
  return {x:layout.cannonX-(layout.overlayX??0)+muzzle.x,
    y:layout.cannonY-(layout.overlayY??0)+muzzle.y};
}
