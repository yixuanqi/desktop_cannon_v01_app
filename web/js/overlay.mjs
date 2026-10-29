import { listen, emit, getLayout } from './bridge.mjs';
import { PHYSICS, createProjectile, advanceProjectileFrame } from './physics.mjs';
import { ParticleSystem } from './particles.mjs';
import { predictedTrajectory } from './trajectory.mjs';
const canvas = document.querySelector('#field');
const ctx = canvas.getContext('2d', { alpha: true });
const sprite = new Image(); sprite.src = '/assets/cannonball.png';
const fx = new ParticleSystem(); const projectiles = [];
let layout; let rafId = 0; let lastTick = 0; let width = 0; let height = 0;
let renderedFrames = 0; let lastImpactSoundAt = 0; let aim = null;
let aimDots = [], aimDirty = true, aimBoundsKey = '';
function resize() {
  width = window.innerWidth; height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  aimDirty = true;
}
function onImpact(event) {
  const power = Math.min(event.speed / 650, 1);
  fx.spawn('impact', event.x, event.y, 24 + 30 * power, 0.28);
  if (event.kind === 'ground' && event.speed < 115) fx.spawn('smoke', event.x, event.y, 43, 0.45);
  if (performance.now() - lastImpactSoundAt > 140 && power > .3) {
    lastImpactSoundAt = performance.now();
    emit('cannon:impact', { power }).catch(() => {});
  }
}
function render() {
  ctx.clearRect(0, 0, width, height);
  if (aim) {
    const bounds = { left:0, top:0, right:width, bottom:Math.min(height,layout?.taskbarTop ?? height-48) };
    const key = `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`;
    if (aimDirty || key !== aimBoundsKey) {
      aimDots = predictedTrajectory(aim,bounds);
      aimDirty = false;
      aimBoundsKey = key;
    }
    ctx.save();
    for (const p of aimDots) {
      ctx.globalAlpha=p.opacity;
      ctx.beginPath(); ctx.arc(p.x,p.y,3.1,0,Math.PI*2);
      ctx.fillStyle='#f7c96b'; ctx.fill();
    }
    ctx.restore();
  }
  for (const ball of projectiles) {
    if (sprite.complete && sprite.naturalWidth) {
      ctx.drawImage(sprite, ball.x-ball.radius, ball.y-ball.radius,ball.radius*2,ball.radius*2);
    } else {
      ctx.beginPath();ctx.arc(ball.x,ball.y,ball.radius,0,Math.PI*2);ctx.fillStyle='#394352';ctx.fill();
    }
  }
  fx.draw(ctx);
  renderedFrames++;
}
function loop(timestamp) {
  rafId = 0;
  const dt = Math.min((timestamp - lastTick)/1000 || 0, 0.075);
  lastTick = timestamp;
  const bounds = { left: 0, top: 0, right: width,
    bottom: Math.min(height, (layout?.taskbarTop ?? height-48)) };
  for (const ball of projectiles) {
    const oldX = ball.x; const oldY = ball.y;
    advanceProjectileFrame(ball, dt, bounds, onImpact);
    ball.trailTimer += dt;
    if (ball.alive && ball.trailTimer > 0.07 && !ball.grounded && Math.hypot(ball.x - oldX,ball.y-oldY)>0.8) {
      ball.trailTimer = 0; fx.spawn('smoke',ball.x,ball.y,20,0.34);
    }
    if (!ball.alive) fx.spawn('explosion',ball.x,ball.y,46,0.50);
  }
  for(let i=projectiles.length-1;i>=0;i--) if(!projectiles[i].alive) projectiles.splice(i,1);
  fx.update(dt);
  render();
  if (projectiles.length || fx.active || aim) rafId = requestAnimationFrame(loop);
  else lastTick = 0;
}
function wake() { if (!rafId) { lastTick = 0; rafId=requestAnimationFrame(loop); } }
listen('cannon:aim', payload => {
  if (Number.isFinite(payload?.x) && Number.isFinite(payload?.y)) { aim=payload; aimDirty=true; wake(); }
});
listen('cannon:aim-stop', () => { aim=null; aimDots=[]; aimDirty=true; render(); });
listen('cannon:fire', (payload) => {
  if (!payload || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
  if (projectiles.length >= PHYSICS.maxProjectiles) projectiles.shift();
  projectiles.push(createProjectile(payload));
  fx.spawn('muzzle',payload.x,payload.y,70,0.17);
  wake();
});
window.addEventListener('resize', () => { resize(); render(); });
getLayout().then((value) => { layout = value; resize(); }).catch(console.error);
resize();
window.__overlayDebug = { projectiles, get renderedFrames(){return renderedFrames;}, get active(){ return Boolean(rafId); }, get aim(){return aim;}, get layout(){return layout;}, fire:(payload) => { emit('cannon:fire', payload); } };
