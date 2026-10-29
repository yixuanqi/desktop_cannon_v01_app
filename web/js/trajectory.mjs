/** Uses the SAME integrator as the flying ball. Stops at its first collision. */
import { createProjectile, stepProjectile } from './physics.mjs';
export function predictedTrajectory(aim, bounds, spacing = 0.045, samples = 35) {
  if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y) ||
    !(aim.power > 0) || !Number.isFinite(aim.angle)) return [];
  const ball = createProjectile(aim);
  const points = [];
  for (let i=0; i<samples; i++) {
    let touched = false;
    stepProjectile(ball, spacing, bounds, () => { touched = true; });
    points.push({x:ball.x, y:ball.y, opacity: Math.max(.18, .85 - i/samples*.65)});
    if (touched || !ball.alive) break;
  }
  return points;
}
