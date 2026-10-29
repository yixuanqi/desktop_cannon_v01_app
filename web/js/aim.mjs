/** V0.4: source-art mesh warp, quantized to precomputed half-degree frames. */
import { clamp } from './physics.mjs';
import { MESH, quantizePitch } from './mesh-warp.mjs';
export const AIM = Object.freeze({
  baseAngle: MESH.neutral,
  minAngle: MESH.min,
  maxAngle: MESH.max,
  degreesPerPointerPixel: 0.23,
  maxPull:90,
  step:MESH.step,
});
export function aimFromDrag(startX,startY,clientX,clientY,initialAngle=AIM.baseAngle) {
  const dx=Number.isFinite(clientX)?clientX-startX:0;
  const dy=Number.isFinite(clientY)?clientY-startY:0;
  const pull=clamp(dx,0,AIM.maxPull);
  const angle=quantizePitch(initialAngle+dy*AIM.degreesPerPointerPixel);
  return {pull,power:pull/AIM.maxPull,angle};
}
export function rotationDegrees(angle){return quantizePitch(angle)-AIM.baseAngle;}
