/**
 * Runtime counterpart of scripts/generate_mesh_frames.py.
 * Shared field parameters live in assets/mesh/mesh_rig.json. This copy is
 * intentionally small and verified against that manifest in automated tests.
 * Units are source bitmap pixels, not CSS or physical display pixels.
 */
export const MESH = Object.freeze({
  width:480, height:350, pivotX:280, pivotY:216, neutral:34, min:30, max:38,
  step:0.5,
  topFadeY:242, topSoftness:16, leftFadeX:49, rightFadeX:381, sideSoftness:18,
  wheelX:279, wheelY:258, wheelSigmaX:67, wheelSigmaY:44,
  wheelSuppression:0.92, groundFadeY:294, groundSoftness:8,
});
const sigmoid = z => 1/(1+Math.exp(-Math.max(-40,Math.min(40,z))));
export function meshWeight(x,y) {
  const k=MESH;
  const upper=sigmoid((k.topFadeY-y)/k.topSoftness);
  const left=sigmoid((x-k.leftFadeX)/k.sideSoftness);
  const right=sigmoid((k.rightFadeX-x)/k.sideSoftness);
  const wheel=Math.exp(-0.5*(((x-k.wheelX)/k.wheelSigmaX)**2+((y-k.wheelY)/k.wheelSigmaY)**2));
  const ground=sigmoid((k.groundFadeY-y)/k.groundSoftness);
  return upper*left*right*(1-k.wheelSuppression*wheel)*ground;
}
export const meshClamp = angle => Math.min(MESH.max,Math.max(MESH.min,Number.isFinite(angle)?angle:MESH.neutral));
export function quantizePitch(angle) {
  return MESH.min + Math.round((meshClamp(angle)-MESH.min)/MESH.step)*MESH.step;
}
export function frameIndex(angle){return Math.round((quantizePitch(angle)-MESH.min)/MESH.step);}
export function framePath(angle){return `/assets/mesh/frames/pitch_${String(frameIndex(angle)).padStart(2,'0')}.png`;}
/** Destination sampled pixel for a known source pixel.
 * OpenCV uses inverse resampling: dest - displacement(dest) = source.
 * Solve this inverse with fixed-point iteration; suitable for small angles.
 */
export function warpedSourcePoint(x,y,angle) {
  const theta=(meshClamp(angle)-MESH.neutral)*Math.PI/180;
  if(!theta)return {x,y};
  let dx=0,dy=0;
  for(let i=0;i<7;i++) {
    const px=x+dx,py=y+dy;
    const w=meshWeight(px,py);
    dx=-theta*(py-MESH.pivotY)*w;
    dy= theta*(px-MESH.pivotX)*w;
  }
  return {x:x+dx,y:y+dy};
}
