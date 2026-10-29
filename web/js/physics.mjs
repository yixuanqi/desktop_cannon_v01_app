/** Pure, deterministic desktop projectile simulation. Units: CSS pixels, seconds. */
export const PHYSICS = Object.freeze({
  gravity: 1100, restitution: 0.69, groundFriction: 3.1,
  minSpeed: 360, maxSpeed: 1750, maxProjectiles: 12,
  maxLifetime: 13, stopSpeed: 32, maxStep: 1 / 120,
});
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function shotVelocity(power, angleDegrees = 34) {
  const p = clamp(Number.isFinite(power) ? power : 0, 0, 1);
  const speed = PHYSICS.minSpeed + p * (PHYSICS.maxSpeed - PHYSICS.minSpeed);
  const rads = angleDegrees * Math.PI / 180;
  return { vx: -speed * Math.cos(rads), vy: -speed * Math.sin(rads), speed };
}
export function createProjectile({ x, y, power, angle = 34, radius = 9, id = 1 }) {
  const velocity = shotVelocity(power, angle);
  return { id, x, y, vx: velocity.vx, vy: velocity.vy, radius, age: 0,
    trailTimer: 0, grounded: false, hitCount: 0, alive: true };
}
/**
 * Advance by dt; optional onImpact({x,y,kind,speed}) observer.
 * Uses substeps to reduce tunneling at low frame rates.
 */
export function stepProjectile(ball, dt, bounds, onImpact = () => {}) {
  if (!ball.alive || !Number.isFinite(dt) || dt <= 0) return ball;
  let remaining = Math.min(dt, 0.075);
  const left = bounds.left ?? 0;
  const top = bounds.top ?? 0;
  const right = bounds.right;
  const bottom = bounds.bottom;
  if (!(right > left && bottom > top)) return ball;
  while (remaining > 1e-8 && ball.alive) {
    const h = Math.min(remaining, PHYSICS.maxStep);
    remaining -= h;
    ball.age += h;
    if (ball.grounded) {
      ball.vx *= Math.exp(-PHYSICS.groundFriction * h);
      ball.vy = 0;
      ball.x += ball.vx * h;
      ball.y = bottom - ball.radius;
    } else {
      ball.vy += PHYSICS.gravity * h;
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
    }
    const r = ball.radius;
    if (ball.x - r < left && ball.vx < 0) {
      ball.x = left + r; const v = Math.abs(ball.vx);
      ball.vx = v * PHYSICS.restitution;
      ball.hitCount++; onImpact({ x: ball.x, y: ball.y, kind: 'wall', speed: v });
    }
    if (ball.x + r > right && ball.vx > 0) {
      ball.x = right - r; const v = Math.abs(ball.vx);
      ball.vx = -v * PHYSICS.restitution;
      ball.hitCount++; onImpact({ x: ball.x, y: ball.y, kind: 'wall', speed: v });
    }
    if (ball.y - r < top && ball.vy < 0) {
      ball.y = top + r; const v = Math.abs(ball.vy);
      ball.vy = v * PHYSICS.restitution;
      ball.hitCount++; onImpact({ x: ball.x, y: ball.y, kind: 'ceiling', speed: v });
    }
    if (ball.y + r > bottom && ball.vy > 0) {
      ball.y = bottom - r; const v = Math.abs(ball.vy);
      ball.hitCount++; onImpact({ x: ball.x, y: ball.y, kind: 'ground', speed: v });
      if (v < 115) { ball.vy = 0; ball.grounded = true; }
      else { ball.vy = -v * PHYSICS.restitution; ball.vx *= 0.83; }
    }
    if (ball.grounded && Math.abs(ball.vx) < PHYSICS.stopSpeed || ball.age > PHYSICS.maxLifetime) {
      ball.alive = false;
    }
  }
  return ball;
}
