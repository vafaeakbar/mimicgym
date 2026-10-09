// Shared cartoon effects: particles, comic words, screen shake, gloves.
import { TAU, easeOut, shade } from "./util.js";

export class FX {
  constructor() {
    this.parts = [];
    this.words = [];
    this.shake = 0;
  }

  burst(x, y, o = {}) {
    const {
      count = 12, colors = ["#fff"], speed = 320, gravity = 700, size = 6,
      life = 0.9, angle = -Math.PI / 2, spread = TAU, shape = "circle",
    } = o;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity,
        s: size * (0.6 + Math.random() * 0.8), life: life * (0.7 + Math.random() * 0.6), age: 0,
        c: colors[i % colors.length], shape, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  word(text, x, y, o = {}) {
    this.words.push({
      text, x, y, age: 0,
      color: o.color ?? "#ffe14d", size: o.size ?? 56, life: o.life ?? 0.95,
      rot: o.rot ?? (Math.random() - 0.5) * 0.3,
    });
  }

  kick(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  offset() {
    return [(Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake];
  }

  update(dt) {
    for (const p of this.parts) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const w of this.words) w.age += dt;
    this.words = this.words.filter((w) => w.age < w.life);
    this.shake *= Math.exp(-dt * 12);
  }

  draw(ctx) {
    for (const p of this.parts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      if (p.shape === "rect") ctx.rect(-p.s, -p.s * 0.5, p.s * 2, p.s);
      else if (p.shape === "star") star(ctx, 0, 0, p.s, p.s * 0.45);
      else if (p.shape === "blob") ctx.ellipse(0, 0, p.s * 1.3, p.s * 0.8, 0, 0, TAU);
      else ctx.arc(0, 0, p.s, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    for (const w of this.words) {
      const t = w.age / w.life;
      const scale = t < 0.15 ? easeOut(t / 0.15) * 1.2 : 1.2 - 0.2 * Math.min(1, (t - 0.15) / 0.2);
      ctx.save();
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.translate(w.x, w.y - 30 * t);
      ctx.rotate(w.rot);
      ctx.scale(scale, scale);
      comicText(ctx, w.text, 0, 0, w.size, w.color);
      ctx.restore();
    }
  }
}

// Bold, slanted sports-broadcast lettering with a soft drop shadow.
export function comicText(ctx, text, x, y, size, color = "#ffe14d") {
  ctx.save();
  ctx.font = `${size}px Anton, Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(x, y);
  ctx.transform(1, 0, -0.14, 1, 0, 0);
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = size * 0.2;
  ctx.shadowOffsetY = size * 0.06;
  ctx.strokeStyle = "rgba(12,18,24,0.92)";
  ctx.lineWidth = size * 0.11;
  ctx.strokeText(text, 0, 0);
  ctx.shadowColor = "transparent";
  const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = g;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Radial glow (lamps, sun, orb).
export function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// Darkened edges to focus the eye on the middle of the scene.
export function vignette(ctx, W, H, strength = 0.35) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
}

export function star(ctx, x, y, r, r2) {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r2 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// Padded training glove. facing = +1 fingers point right, -1 left.
export function drawGlove(ctx, x, y, size, facing = 1, color = "#f2f5f7") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  // Contact shadow.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath();
  ctx.ellipse(size * 0.06, size * 0.12, size * 0.62, size * 0.42, 0, 0, TAU);
  ctx.fill();
  // Cuff with accent stripe.
  const cg = ctx.createLinearGradient(0, -size * 0.3, 0, size * 0.3);
  cg.addColorStop(0, "#455a64");
  cg.addColorStop(1, "#1f2a30");
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.roundRect(-size * 0.82, -size * 0.3, size * 0.4, size * 0.6, size * 0.12);
  ctx.fill();
  ctx.fillStyle = "#7ee081";
  ctx.fillRect(-size * 0.6, -size * 0.3, size * 0.06, size * 0.6);
  // Mitt.
  const g = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
  g.addColorStop(0, shade(color, 0.25));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-size * 0.5, -size * 0.38, size * 1.06, size * 0.76, size * 0.34);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = size * 0.03;
  for (const fy of [-0.13, 0.06, 0.24]) {
    ctx.beginPath();
    ctx.moveTo(size * 0.18, fy * size);
    ctx.quadraticCurveTo(size * 0.4, fy * size - size * 0.02, size * 0.52, fy * size);
    ctx.stroke();
  }
  // Thumb.
  ctx.fillStyle = shade(color, 0.1);
  ctx.beginPath();
  ctx.ellipse(size * 0.06, -size * 0.4, size * 0.12, size * 0.2, 0.55, 0, TAU);
  ctx.fill();
  // Shine.
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.ellipse(-size * 0.12, -size * 0.2, size * 0.24, size * 0.08, -0.15, 0, TAU);
  ctx.fill();
  ctx.restore();
}
