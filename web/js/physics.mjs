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
    trailTimer: 0, grounded: false, hitCount: 0, alive: true, simRemainder: 0 };
}
/**
 * Advance by dt; optional onImpact({x,y,kind,speed}) observer.
 * Uses substeps to reduce tunneling at low frame rates.
 */
export function stepProjectile(ball, dt, bounds, onImpact = () => {}, onSegment = () => {}) {
  if (!ball.alive || !Number.isFinite(dt) || dt <= 0) return ball;
  let remaining = Math.min(dt, 0.075);
  const left = bounds.left ?? 0;
  const top = bounds.top ?? 0;
  const right = bounds.right;
  const bottom = bounds.bottom;
  if (!(right > left && bottom > top)) return ball;
  while (remaining > 1e-8 && ball.alive) {
    const h = Math.min(remaining, PHYSICS.maxStep);
    const fromX=ball.x, fromY=ball.y;
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
    // Observe the *actual* bounded physics segment, never a separately
    // approximated animation path. Debug/icon collisions are non-invasive.
    onSegment({x0:fromX,y0:fromY,x1:ball.x,y1:ball.y,radius:ball.radius,
      shotId:ball.id,velocityX:ball.vx,velocityY:ball.vy});
    if (ball.grounded && Math.abs(ball.vx) < PHYSICS.stopSpeed || ball.age > PHYSICS.maxLifetime) {
      ball.alive = false;
    }
  }
  return ball;
}

/**
 * Live projectiles advance in exactly the same 1/120s steps as trajectory.mjs.
 * Accumulate fractional frame time rather than using a different final
 * fractional physics step for each requestAnimationFrame callback. This
 * removes refresh-rate-dependent trajectory drift on 60/120/144Hz screens.
 */
export function advanceProjectileFrame(ball, dt, bounds, onImpact = () => {}, onSegment = () => {}) {
  if (!ball.alive || !Number.isFinite(dt) || dt <= 0) return ball;
  ball.simRemainder = (ball.simRemainder ?? 0) + Math.min(dt, 0.075);
  while (ball.simRemainder + 1e-10 >= PHYSICS.maxStep && ball.alive) {
    stepProjectile(ball, PHYSICS.maxStep, bounds, onImpact, onSegment);
    ball.simRemainder -= PHYSICS.maxStep;
  }
  if (ball.simRemainder < 0) ball.simRemainder = 0;
  return ball;
}
