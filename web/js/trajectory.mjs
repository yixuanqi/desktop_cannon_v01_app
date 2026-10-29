/**
 * Predict exactly the physics steps that the live overlay executes.
 * Dots are samples of that same fixed-step simulation, not a second
 * approximation with a different integration interval.
 * The preview deliberately stops at the FIRST impact; subsequent bounces
 * belong to the real projectile and are not previewed.
 */
import { PHYSICS, createProjectile, stepProjectile } from './physics.mjs';

export function trajectoryStepCount(spacing = 0.045) {
  return Math.max(1, Math.round((Number.isFinite(spacing) && spacing > 0 ? spacing : 0.045) / PHYSICS.maxStep));
}

export function predictedTrajectory(aim, bounds, spacing = 0.045, samples = 35) {
  if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y) ||
    !(aim.power > 0) || !Number.isFinite(aim.angle) ||
    !bounds || !(bounds.right > (bounds.left ?? 0)) || !(bounds.bottom > (bounds.top ?? 0))) return [];
  const total = Math.max(0, Math.floor(samples));
  if (!total) return [];
  const ball = createProjectile(aim);
  const points = [{ x: ball.x, y: ball.y, opacity: .95 }]; // Exact firing origin.
  const substeps = trajectoryStepCount(spacing);
  for (let i=1; i<total && ball.alive; i++) {
    let touched = false;
    for (let j=0; j<substeps && ball.alive && !touched; j++) {
      stepProjectile(ball, PHYSICS.maxStep, bounds, () => { touched = true; });
    }
    points.push({x:ball.x, y:ball.y, opacity: Math.max(.18, .85 - i/total*.65)});
    if (touched) break;
  }
  return points;
}
