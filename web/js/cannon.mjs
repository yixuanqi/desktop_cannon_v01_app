import { emit, listen, getLayout, startNativeWindowDrag, isTauri } from './bridge.mjs';
import { pullFromPointer, powerFromPull, shouldFire, STAGES, stateForTimeSinceShot, MAX_PULL_PX } from './charge.mjs';
import { muzzleOnOverlay } from './geometry.mjs';
import { playSound, toggleSound } from './sound.mjs';
import { dragFrameTo } from './window-drag.mjs';

const scene = document.querySelector('#scene');
const recoil = document.querySelector('#recoil');
const bolt = document.querySelector('#bolt');
const spring = document.querySelector('#bolt-spring');
const fill = document.querySelector('#power-fill');
const number = document.querySelector('#power-number');
let layout;
let charging = false;
let movingPreview = false;
let downX = 0;
let currentPull = 0;
let hovered = false;
let dragStart = null;
let lastFired = -Infinity;
let recoveryTimer;
let shotId = 0;

function showState(state) { scene.dataset.state = state; }
function setPull(pixels) {
  currentPull = pixels;
  // The rod is anchored at the receiver and EXTENDS as the knob slides.
  // Moving just the knob leaves a floating, disconnected handle.
  scene.style.setProperty('--bolt-pull', `${pixels}px`);
  spring.style.width = `${Math.max(8, pixels + 10)}px`;
  bolt.style.transform = `translateX(${pixels}px)`;
  const power = powerFromPull(pixels);
  fill.style.width = `${Math.round(power * 100)}%`;
  number.textContent = `${Math.round(power * 100)}%`;
}
function reset() {
  charging = false;
  setPull(0);
  showState(hovered ? STAGES.hover : STAGES.idle);
}
function pointerDown(e) {
  if (e.button != null && e.button !== 0 || charging || movingPreview) return;
  e.preventDefault();
  e.stopPropagation?.();
  charging = true;
  downX = e.clientX;
  bolt.setPointerCapture(e.pointerId);
  showState(STAGES.charging);
  setPull(0);
}
function pointerMove(e) {
  if (!charging) return;
  setPull(pullFromPointer(downX, e.clientX));
}
async function release(e) {
  if (!charging) return;
  e.preventDefault();
  e.stopPropagation?.();
  const power = powerFromPull(currentPull);
  charging = false;
  if (bolt.hasPointerCapture(e.pointerId)) bolt.releasePointerCapture(e.pointerId);
  if (!shouldFire(power)) { reset(); return; }
  // Native window can be moved. Read its REAL position for each shot,
  // not a stale startup position cached by the front end.
  try { layout = await getLayout(); }
  catch (error) { console.error('无法更新炮口坐标', error); }
  if (!layout) { reset(); return; }
  const target = muzzleOnOverlay(layout);
  shotId++;
  showState(STAGES.firing);
  lastFired = performance.now();
  playSound('fire', power);
  await emit('cannon:fire', { id: shotId, x: target.x, y: target.y, power, angle: 34 });
  setPull(0);
  window.clearInterval(recoveryTimer);
  recoveryTimer = window.setInterval(() => {
    const state = stateForTimeSinceShot(performance.now() - lastFired);
    if (state === STAGES.idle) { clearInterval(recoveryTimer); reset(); }
    else showState(state);
  }, 24);
}

// On the cannon body (not the red handle), begin dragging the entire window.
// Native Windows desktop: OS-managed Tauri drag. Browser preview: move iframe.
function bodyPointerDown(e) {
  if (e.button != null && e.button !== 0 || charging) return;
  e.preventDefault();
  if (isTauri) {
    startNativeWindowDrag().catch(error => console.error('移动小炮失败', error));
    return;
  }
  const frame = window.frameElement;
  if (!frame) return;
  const rect = frame.getBoundingClientRect();
  dragStart = { pointerX: e.screenX ?? e.clientX, pointerY: e.screenY ?? e.clientY,
    left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  movingPreview = true;
  scene.dataset.moving = 'true';
  recoil.setPointerCapture(e.pointerId);
}
function bodyPointerMove(e) {
  if (!movingPreview || !dragStart) return;
  const frame = window.frameElement;
  if (!frame) return;
  const point = dragFrameTo(dragStart, e.screenX ?? e.clientX, e.screenY ?? e.clientY,
    window.parent.innerWidth, window.parent.innerHeight);
  frame.style.right = 'auto'; frame.style.bottom = 'auto';
  frame.style.left = `${point.x}px`;
  frame.style.top = `${point.y}px`;
}
function bodyPointerEnd(e) {
  if (!movingPreview) return;
  movingPreview = false;
  dragStart = null;
  scene.dataset.moving = 'false';
  if (recoil.hasPointerCapture(e.pointerId)) recoil.releasePointerCapture(e.pointerId);
}

bolt.addEventListener('pointerdown', pointerDown);
bolt.addEventListener('pointermove', pointerMove);
bolt.addEventListener('pointerup', release);
bolt.addEventListener('pointercancel', () => reset());
bolt.addEventListener('lostpointercapture', () => { if (charging) reset(); });
bolt.addEventListener('pointerenter', () => { hovered = true; if (!charging && performance.now() - lastFired > 380) showState(STAGES.hover); });
bolt.addEventListener('pointerleave', () => { hovered = false; if (!charging && performance.now() - lastFired > 380) showState(STAGES.idle); });
// Tauri recommends native startDragging from a real mousedown event.
// Pointer events remain for the browser iframe fallback.
recoil.addEventListener(isTauri ? 'mousedown' : 'pointerdown', bodyPointerDown);
recoil.addEventListener('pointermove', bodyPointerMove);
recoil.addEventListener('pointerup', bodyPointerEnd);
recoil.addEventListener('pointercancel', bodyPointerEnd);
recoil.addEventListener('lostpointercapture', () => { if (movingPreview) { movingPreview = false; dragStart = null; scene.dataset.moving = 'false'; } });
listen('cannon:toggle-audio', () => toggleSound());
listen('cannon:impact', (payload) => playSound('impact', payload?.power ?? .35));
getLayout().then(l => { layout = l; }).catch(err => { console.error('桌面坐标初始化失败', err); });
window.__cannonDebug = {
  get state() { return scene.dataset.state; },
  get pull() { return currentPull; },
  get moving() { return movingPreview; },
  get layout() { return layout; },
};
