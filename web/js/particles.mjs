import { clamp } from './physics.mjs';
const SPRITES = {
  smoke: ['/assets/smoke_00.png', '/assets/smoke_01.png', '/assets/smoke_02.png'],
  muzzle: ['/assets/muzzle_00.png', '/assets/muzzle_01.png'],
  impact: ['/assets/impact_00.png', '/assets/impact_01.png'],
  explosion: ['/assets/explosion_00.png', '/assets/explosion_01.png', '/assets/explosion_02.png'],
};
export class ParticleSystem {
  constructor() {
    this.effects = [];
    this.images = Object.fromEntries(Object.entries(SPRITES).map(([key, urls]) => [key,
      urls.map((src) => { const img = new Image(); img.src = src; return img; })]));
  }
  spawn(kind, x, y, size = 42, life = 0.42) {
    if (this.effects.length >= 120) this.effects.shift();
    this.effects.push({ kind, x, y, size, age: 0, life });
  }
  update(dt) { for (const e of this.effects) e.age += dt; this.effects = this.effects.filter(e => e.age < e.life); }
  draw(ctx) {
    for (const e of this.effects) {
      const arr = this.images[e.kind]; if (!arr) continue;
      const u = clamp(e.age / e.life, 0, 1);
      const index = Math.min(arr.length - 1, Math.floor(u * arr.length));
      const img = arr[index];
      if (!img.complete || img.naturalWidth <= 0) continue;
      ctx.save(); ctx.globalAlpha = Math.min(1, (1 - u) * 1.5);
      const size = e.size * (1 + 0.35 * u);
      ctx.drawImage(img, e.x - size / 2, e.y - size / 2, size, size);
      ctx.restore();
    }
  }
  get active() { return this.effects.length > 0; }
}
