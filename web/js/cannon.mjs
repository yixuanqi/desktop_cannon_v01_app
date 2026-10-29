import { emit, listen, getLayout, startNativeWindowDrag, isTauri } from './bridge.mjs';
import { powerFromPull, shouldFire, STAGES, stateForTimeSinceShot } from './charge.mjs';
import { aimFromDrag, AIM, rotationDegrees } from './aim.mjs';
import { framePath, MESH } from './mesh-warp.mjs';
import { muzzleOnOverlay, muzzleInCannon, receiverInCannon } from './geometry.mjs';
import { playSound, toggleSound } from './sound.mjs';
import { dragFrameTo } from './window-drag.mjs';

const scene = document.querySelector('#scene');
const recoil = document.querySelector('#recoil');
const bolt = document.querySelector('#bolt');
const spring = document.querySelector('#bolt-spring');
const fill = document.querySelector('#power-fill');
const number = document.querySelector('#power-number');
const angleNumber = document.querySelector('#angle-number');
const flash = document.querySelector('#flash');
const meshFrame = document.querySelector('#mesh-frame');
const leverAxis = document.querySelector('#lever-axis');
let previousFrame = '';
// Preload small precomputed sprites so repeated mouse motion doesn't cause IO stalls.
if(typeof Image !== 'undefined') {
  for(let i=0;i<17;i++){const img=new Image();img.src=`/assets/mesh/frames/pitch_${String(i).padStart(2,'0')}.png`;}
}
let layout;
let charging = false;
let movingPreview = false;
let dragStart = null;
let downX = 0, downY = 0, angleAtDown = AIM.baseAngle;
let currentPull = 0, currentAngle = AIM.baseAngle;
let hovered = false;
let lastFired = -Infinity;
let recoveryTimer;
let shotId = 0;
let chargeSequence = 0;
let activePointerId = null;

function showState(state) { scene.dataset.state = state; }
function updatePitch() {
  const next=framePath(currentAngle);
  if(meshFrame && next!==previousFrame){meshFrame.src=next;previousFrame=next;}
  if (angleNumber) angleNumber.textContent = `${currentAngle.toFixed(1).replace(/\.0$/, '')}°`;
  // Lever and spring are separate from the picture; follow receiver's displaced
  // position while rotating around the physical connection point (165,83).
  if(leverAxis) {
    const neutral=receiverInCannon(AIM.baseAngle), moved=receiverInCannon(currentAngle);
    leverAxis.style.transform=`translate(${(moved.x-neutral.x).toFixed(3)}px, ${(moved.y-neutral.y).toFixed(3)}px) rotate(${rotationDegrees(currentAngle)}deg)`;
  }
  if (flash) {
    const muzzle=muzzleInCannon(currentAngle);
    flash.style.left=`${muzzle.x-51}px`;
    flash.style.top=`${muzzle.y-51}px`;
  }
}
function setAim(pull, angle) {
  currentPull = pull;
  currentAngle = angle;
  spring.style.width = `${Math.max(8, pull + 10)}px`;
  bolt.style.transform = `translateX(${pull}px)`;
  const power = powerFromPull(pull);
  fill.style.width = `${Math.round(power * 100)}%`;
  number.textContent = `${Math.round(power * 100)}%`;
  updatePitch();
}
function stopAimPreview() { emit('cannon:aim-stop', {}).catch(() => {}); }
function reset() {
  charging = false;
  chargeSequence++;
  activePointerId = null;
  setAim(0, currentAngle);
  stopAimPreview();
  showState(hovered ? STAGES.hover : STAGES.idle);
}
function pointerDown(e) {
  if ((e.button != null && e.button !== 0) || charging || movingPreview) return;
  e.preventDefault(); e.stopPropagation?.();
  charging = true;
  chargeSequence++;
  activePointerId = e.pointerId;
  downX = e.clientX;
  downY = Number.isFinite(e.clientY) ? e.clientY : 0;
  angleAtDown = currentAngle;
  bolt.setPointerCapture?.(e.pointerId);
  showState(STAGES.charging);
  setAim(0, currentAngle);
  // The cannon window does not move during a lever drag; its last physical
  // position is reliable until we refresh it once more immediately before fire.
  getLayout().then(l => { if (charging) { layout = l; sendAimPreview(); } }).catch(() => {});
}
function sendAimPreview() {
  if (!charging || !layout || !shouldFire(powerFromPull(currentPull))) { stopAimPreview(); return; }
  const muzzle = muzzleOnOverlay(layout, currentAngle);
  emit('cannon:aim', { ...muzzle, power: powerFromPull(currentPull), angle: currentAngle }).catch(() => {});
}
function pointerMove(e) {
  if (!charging) return;
  const pose = aimFromDrag(downX, downY, e.clientX, e.clientY, angleAtDown);
  setAim(pose.pull, pose.angle);
  sendAimPreview();
}
async function release(e) {
  if (!charging) return;
  e.preventDefault(); e.stopPropagation?.();
  const power = powerFromPull(currentPull);
  const angle = currentAngle;
  charging = false;
  activePointerId = null;
  const sequence = ++chargeSequence;
  if (bolt.hasPointerCapture?.(e.pointerId)) bolt.releasePointerCapture(e.pointerId);
  stopAimPreview();
  if (!shouldFire(power)) { reset(); return; }
  try { layout = await getLayout(); }
  catch (error) { console.error('无法更新炮口坐标', error); }
  if (sequence !== chargeSequence) return; // Cancel/restart during async refresh.
  if (!layout) { reset(); return; }
  const target = muzzleOnOverlay(layout, angle);
  shotId++;
  showState(STAGES.firing);
  lastFired = performance.now();
  playSound('fire', power);
  try { await emit('cannon:fire', { id: shotId, ...target, power, angle }); }
  catch (error) { console.error('发射事件失败', error); }
  if (sequence !== chargeSequence) return;
  setAim(0, angle);
  window.clearInterval(recoveryTimer);
  recoveryTimer = window.setInterval(() => {
    const state = stateForTimeSinceShot(performance.now() - lastFired);
    if (state === STAGES.idle) { window.clearInterval(recoveryTimer); reset(); }
    else showState(state);
  }, 24);
}
function cancelCharge() {
  if (!charging) return;
  charging = false;
  const id = activePointerId;
  activePointerId = null;
  if (id != null && bolt.hasPointerCapture?.(id)) bolt.releasePointerCapture(id);
  setAim(0, angleAtDown); // Escape/cancel also reverts the temporary pitch.
  reset();
}
function bodyPointerDown(e) {
  if ((e.button != null && e.button !== 0) || charging) return;
  e.preventDefault();
  if (isTauri) { startNativeWindowDrag().catch(error => console.error('移动小炮失败', error)); return; }
  const frame = window.frameElement;
  if (!frame) return;
  const rect = frame.getBoundingClientRect();
  dragStart = {pointerX:e.screenX ?? e.clientX, pointerY:e.screenY ?? e.clientY,
    left:rect.left, top:rect.top, width:rect.width, height:rect.height};
  movingPreview = true;
  scene.dataset.moving = 'true';
  recoil.setPointerCapture?.(e.pointerId);
}
function bodyPointerMove(e) {
  if (!movingPreview || !dragStart) return;
  const frame = window.frameElement;
  if (!frame) return;
  const point = dragFrameTo(dragStart, e.screenX ?? e.clientX, e.screenY ?? e.clientY,
    window.parent.innerWidth,window.parent.innerHeight);
  frame.style.right='auto';frame.style.bottom='auto';
  frame.style.left=`${point.x}px`;frame.style.top=`${point.y}px`;
}
function bodyPointerEnd(e) {
  if (!movingPreview) return;
  movingPreview=false;dragStart=null;scene.dataset.moving='false';
  if (recoil.hasPointerCapture?.(e.pointerId)) recoil.releasePointerCapture(e.pointerId);
}
bolt.addEventListener('pointerdown', pointerDown);
bolt.addEventListener('pointermove', pointerMove);
bolt.addEventListener('pointerup', release);
bolt.addEventListener('pointercancel', cancelCharge);
bolt.addEventListener('lostpointercapture', cancelCharge);
bolt.addEventListener('pointerenter', () => { hovered=true; if(!charging&&performance.now()-lastFired>380)showState(STAGES.hover); });
bolt.addEventListener('pointerleave', () => { hovered=false; if(!charging&&performance.now()-lastFired>380)showState(STAGES.idle); });
recoil.addEventListener(isTauri ? 'mousedown' : 'pointerdown', bodyPointerDown);
recoil.addEventListener('pointermove', bodyPointerMove);
recoil.addEventListener('pointerup', bodyPointerEnd);
recoil.addEventListener('pointercancel', bodyPointerEnd);
recoil.addEventListener('lostpointercapture',()=>{if(movingPreview){movingPreview=false;dragStart=null;scene.dataset.moving='false';}});
window.addEventListener?.('keydown',(e)=>{if(e.key==='Escape'){cancelCharge();}});
listen('cannon:toggle-audio',()=>toggleSound());
listen('cannon:impact',payload=>playSound('impact',payload?.power??.35));
getLayout().then(l=>{layout=l;}).catch(err=>console.error('桌面坐标初始化失败',err));
updatePitch();
window.__cannonDebug={get state(){return scene.dataset.state;},get pull(){return currentPull;},
  get angle(){return currentAngle;},get moving(){return movingPreview;},get layout(){return layout;},
  cancel:cancelCharge};
