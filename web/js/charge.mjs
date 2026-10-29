import { clamp } from './physics.mjs';
export const MAX_PULL_PX = 90;
export const MIN_FIRE_POWER = 0.08;
/** Pull is deliberately in +X: the knob sits behind the barrel, to the right. */
export function pullFromPointer(startX, currentX, maxPull = MAX_PULL_PX) {
  return clamp(currentX - startX, 0, maxPull);
}
export function powerFromPull(pull, maxPull = MAX_PULL_PX) {
  return clamp(pull / maxPull, 0, 1);
}
export function shouldFire(power) { return power >= MIN_FIRE_POWER; }
export const STAGES = Object.freeze({ idle: 'idle', hover: 'hover', charging: 'charging', firing: 'firing', recovering: 'recovering' });
export function stateForTimeSinceShot(ms) {
  if (ms < 0) return STAGES.idle;
  if (ms < 95) return STAGES.firing;
  if (ms < 380) return STAGES.recovering;
  return STAGES.idle;
}
