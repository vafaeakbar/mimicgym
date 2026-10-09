// Dumbbell Bicep Curl → Blacksmith Forge. Every curl swings the hammer onto
// the anvil. Eight strikes forge something legendary (usually).
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawDumbbells, drawFigure, floorShadow, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, lerp } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view, elbows pinned to the sides) ----------
const DOWN = pose(FRONT, { le: [-0.19, -0.31], lw: [-0.2, -0.06], re: [0.19, -0.31], rw: [0.2, -0.06] });
const UP = pose(DOWN, { lw: [-0.16, -0.55], rw: [0.16, -0.55] });

// ---------- Camera detector ----------
// Elbows stay low by your sides; the curl is the wrists rising above them.
class CurlDetector {
  constructor() {
    this.curl = 0;
    this.up = false;
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m) {
      const im = m.im;
      const arms = [[13, 15], [14, 16]].filter(([e, w]) => (im[e].visibility ?? 1) > 0.5 && (im[w].visibility ?? 1) > 0.5);
      if (arms.length) {
        let v = 0, low = true;
        for (const [e, w] of arms) {
          const fore = Math.hypot(im[e].x - im[w].x, im[e].y - im[w].y) || 0.05;
          v += clamp(0.5 + (im[e].y - im[w].y) / (2 * fore));
          if (im[e].y < m.sh.y + 0.3 * m.torso) low = false; // elbows must stay down
        }
        this.curl = damp(this.curl, low ? v / arms.length : 0, 18, dt);
      }
    }
    if (!this.up && this.curl > 0.8) {
      this.up = true;
      events.push({ type: "curl" });
    } else if (this.up && this.curl < 0.25) this.up = false;
    return { curl: this.curl, events };
  }
}

// ---------- Scene ----------
const ITEMS = [
  { name: "LEGENDARY SWORD!", kind: "sword" },
  { name: "MIGHTY SHIELD!", kind: "shield" },
  { name: "…A FRYING PAN?", kind: "pan" },
  { name: "BATTLE AXE!", kind: "axe" },
];
const STRIKES = 8;

class ForgeScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.curl = 0;
    this.strikes = 0;
    this.progress = 0;
    this.items = 0;
    this.hammer = 0;
    this.quench = 0;
  }

  onResize() {
    this.floorY = this.H * 0.9;
    this.fig = Math.min(this.H * 0.32, (this.W - this.inset) * 0.24);
    this.px = this.inset + (this.W - this.inset) * 0.3;
    this.anvilX = this.inset + (this.W - this.inset) * 0.66;
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.curl = damp(this.curl, signal.curl ?? 0, 18, dt);
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "curl" || this.quench > 0) continue;
      this.strikes++;
      this.progress++;
      this.hammer = 1;
      sfx.smack();
      this.fx.burst(this.anvilX, this.floorY - this.fig * 0.62, { count: 18, colors: ["#ffeb3b", "#ff9800", "#fff"], speed: 420, gravity: 900, size: 3, shape: "star" });
      this.fx.kick(5);
      if (this.progress >= STRIKES) {
        this.items++;
        this.quench = 1.8;
        this.fx.word(ITEMS[(this.items - 1) % ITEMS.length].name, this.anvilX, this.topY, { size: this.fig * 0.16, color: "#ffe082", life: 1.6 });
        sfx.ding();
      }
    }
    this.hammer = Math.max(0, this.hammer - dt * 5);
    if (this.quench > 0) {
      this.quench -= dt;
      if (this.quench <= 0) this.progress = 0;
    }
  }

  draw() {
    const ctx = this.begin();
    const { W, H, fig, floorY, px, anvilX } = this;

    // Stone forge lit by the furnace.
    ctx.fillStyle = "#2b2320";
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let y = 0, r = 0; y < floorY; y += 40, r++) for (let x = (r % 2) * 40; x < W; x += 80) ctx.fillRect(x, y, 76, 36);
    const fx0 = W - (W - this.inset) * 0.12;
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(fx0 - fig * 0.5, floorY - fig * 1.3, fig, fig * 1.3);
    for (let i = 0; i < 6; i++) glow(ctx, fx0 + (i - 2.5) * fig * 0.12, floorY - fig * 0.5 - Math.abs(Math.sin(this.time * 7 + i)) * fig * 0.2, fig * 0.3, "rgba(255,120,30,0.8)");
    glow(ctx, anvilX, floorY - fig * 0.6, fig * 1.6, "rgba(255,120,40,0.25)");
    ctx.fillStyle = "#1c1511";
    ctx.fillRect(-20, floorY, W + 40, H - floorY + 20);

    // Anvil with the glowing work piece.
    ctx.fillStyle = "#455a64";
    ctx.beginPath();
    ctx.moveTo(anvilX - fig * 0.45, floorY - fig * 0.55);
    ctx.lineTo(anvilX + fig * 0.35, floorY - fig * 0.55);
    ctx.quadraticCurveTo(anvilX + fig * 0.6, floorY - fig * 0.52, anvilX + fig * 0.65, floorY - fig * 0.45);
    ctx.lineTo(anvilX + fig * 0.2, floorY - fig * 0.42);
    ctx.lineTo(anvilX + fig * 0.15, floorY - fig * 0.1);
    ctx.lineTo(anvilX - fig * 0.25, floorY - fig * 0.1);
    ctx.lineTo(anvilX - fig * 0.3, floorY - fig * 0.42);
    ctx.lineTo(anvilX - fig * 0.45, floorY - fig * 0.45);
    ctx.fill();
    ctx.fillRect(anvilX - fig * 0.3, floorY - fig * 0.1, fig * 0.5, fig * 0.1);
    const item = ITEMS[this.items % ITEMS.length];
    const heat = this.quench > 0 ? clamp(this.quench - 0.8) : 1;
    this.drawItem(item.kind, anvilX, floorY - fig * 0.62, fig * 0.5, this.progress / STRIKES, heat);
    if (this.quench > 0) this.fx.burst(anvilX, floorY - fig * 0.7, { count: 1, colors: ["rgba(230,230,230,0.6)"], speed: 60, gravity: -120, size: 14, life: 1 });

    // The hammer that strikes with each curl.
    const swing = this.hammer > 0 ? this.hammer : 0.9 - clamp(this.curl) * 0.9;
    ctx.save();
    ctx.translate(anvilX + fig * 0.5, floorY - fig * 0.7);
    ctx.rotate(-0.2 - swing * 1.1);
    ctx.fillStyle = "#6d4c41";
    ctx.fillRect(-fig * 0.55, -6, fig * 0.55, 12);
    ctx.fillStyle = "#90a4ae";
    ctx.fillRect(-fig * 0.6, -fig * 0.1, fig * 0.14, fig * 0.2);
    ctx.restore();

    // You, curling.
    const p = this.auto && this.pose ? this.pose : mix(DOWN, UP, easeInOut(clamp(this.curl)));
    floorShadow(ctx, px, floorY, fig * 0.35, fig * 0.06, 0.5);
    drawFigure(ctx, p, px, floorY - 0.6 * fig, fig, LOOKS.smith);
    drawDumbbells(ctx, p, px, floorY - 0.6 * fig, fig);

    comicText(ctx, `${this.progress}/${STRIKES}`, anvilX, floorY - fig * 1.15, fig * 0.2, "#ffcc80");
    vignette(ctx, W, H, 0.35);
    this.fx.draw(ctx);
  }

  // progress 0..1 shapes the piece; heat 1 = glowing orange, 0 = cooled steel.
  drawItem(kind, x, y, s, progress, heat) {
    const { ctx } = this;
    const hot = `rgb(255,${Math.round(lerp(200, 120, heat))},${Math.round(lerp(210, 40, heat))})`;
    const color = heat > 0.05 ? hot : "#cfd8dc";
    ctx.save();
    ctx.translate(x, y);
    if (heat > 0.05) glow(ctx, 0, 0, s * 1.1, `rgba(255,140,40,${0.6 * heat})`);
    ctx.fillStyle = color;
    const k = 0.4 + 0.6 * progress;
    if (kind === "shield") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.4 * k, -s * 0.15);
      ctx.lineTo(s * 0.4 * k, -s * 0.15);
      ctx.quadraticCurveTo(s * 0.35 * k, s * 0.3 * k, 0, s * 0.4 * k);
      ctx.quadraticCurveTo(-s * 0.35 * k, s * 0.3 * k, -s * 0.4 * k, -s * 0.15);
      ctx.fill();
    } else if (kind === "pan") {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.3 * k, s * 0.12 * k, 0, 0, TAU);
      ctx.fill();
      ctx.fillRect(s * 0.28 * k, -s * 0.03, s * 0.4, s * 0.06);
    } else if (kind === "axe") {
      ctx.fillRect(-s * 0.5, -s * 0.03, s, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s * 0.03);
      ctx.quadraticCurveTo(s * 0.55, -s * 0.3 * k, s * 0.5, -s * 0.03);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-s * 0.7 * k, -s * 0.04);
      ctx.lineTo(s * 0.4 * k, -s * 0.04);
      ctx.lineTo(s * (0.4 * k + 0.15 * progress), 0);
      ctx.lineTo(s * 0.4 * k, s * 0.04);
      ctx.lineTo(-s * 0.7 * k, s * 0.04);
      ctx.fill();
      ctx.fillStyle = "#8d6e63";
      ctx.fillRect(-s * 0.95 * k, -s * 0.03, s * 0.25, s * 0.06);
      ctx.fillStyle = "#ffca28";
      ctx.fillRect(-s * 0.72 * k, -s * 0.1, s * 0.05, s * 0.2);
    }
    ctx.restore();
  }

  hud() {
    return `Curls ${this.strikes} · Items forged ${this.items}`;
  }

  stats() {
    return { curls: this.strikes, items: this.items };
  }
}

export const curl = {
  id: "curl",
  name: "Bicep Curl",
  world: "Blacksmith Forge",
  color: "#ff7043",
  view: "front",
  weights: true,
  met: 3.5,
  blurb: "Elbows pinned to your sides, curl the dumbbells up. Every curl swings the hammer onto the anvil.",
  say: "Bicep curls. Elbows tight, curl up, and forge something legendary.",
  repEvent: "curl",
  summary: (st) => `${st.curls ?? 0} curls · ${st.items ?? 0} items forged`,

  // One curl every two beats; the top lands on the beat (the hammer strike).
  coach(t, tempo) {
    const len = 2.0 / tempo;
    const u = t / len + 0.35;
    const i = Math.floor(u);
    const f = u - i;
    let e;
    if (f < 0.35) e = easeInOut(f / 0.35);
    else if (f < 0.45) e = 1;
    else if (f < 0.9) e = 1 - easeInOut((f - 0.45) / 0.45);
    else e = 0;
    return {
      pose: mix(DOWN, UP, e),
      signal: { curl: e },
      count: i + (f >= 0.35 ? 1 : 0),
      cue: f < 0.45 ? "CURL UP" : "LOWER SLOWLY",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "curl" }),
  createDetector: () => new CurlDetector(),
  createScene: (canvas, opts) => new ForgeScene(canvas, opts),
};
