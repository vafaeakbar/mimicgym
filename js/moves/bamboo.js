// Warm-up: Side Reach → Bamboo Grove. Reach up and over to each side to pick
// bamboo for a hungry panda. Slow and loosening.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawFigure, floorShadow, mirror, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, lerp, mulberry32 } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view) ----------
export const WIDE = pose(FRONT, {
  lk: [-0.14, 0.3], la: [-0.2, 0.6], rk: [0.14, 0.3], ra: [0.2, 0.6],
  le: [-0.2, -0.31], lw: [-0.22, -0.06], re: [0.2, -0.31], rw: [0.22, -0.06],
});
// Right arm sweeps up and over to the left; left hand slides down the leg.
export const REACH_L = pose(WIDE, {
  neck: [-0.1, -0.58], head: [-0.17, -0.74], ls: [-0.23, -0.52], rs: [0.04, -0.58],
  re: [-0.02, -0.84], rw: [-0.26, -1.02], le: [-0.3, -0.28], lw: [-0.34, -0.04],
});
export const REACH_R = mirror(REACH_L);

// ---------- Camera detector ----------
// A reach = a wrist above your head and well out to one side (screen side, in
// shoulder widths).
class ReachDetector {
  constructor(calib) {
    this.calib = calib;
    this.lean = 0;
    this.state = 0;
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m) {
      const im = m.im;
      const width = this.calib?.shoulderW ?? m.shoulderW;
      const cx = 1 - (m.hip ? (m.sh.x + m.hip.x) / 2 : m.sh.x);
      let best = 0;
      for (const w of [15, 16]) {
        if ((im[w].visibility ?? 1) < 0.5 || im[w].y > im[0].y) continue; // must be above the head
        const d = (1 - im[w].x - cx) / width;
        if (Math.abs(d) > Math.abs(best)) best = d;
      }
      this.lean = damp(this.lean, clamp(best / 1.5, -1, 1), 10, dt);
    }
    const s = this.lean < -0.6 ? -1 : this.lean > 0.6 ? 1 : Math.abs(this.lean) < 0.3 ? 0 : this.state;
    if (s !== 0 && s !== this.state) events.push({ type: "reach", side: s < 0 ? "left" : "right" });
    this.state = s;
    return { lean: this.lean, events };
  }
}

// ---------- Scene ----------
class BambooScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const r = mulberry32(11);
    this.stalks = Array.from({ length: 34 }, () => ({ x: r(), d: r(), sway: r() * 6, w: 0.6 + r() * 0.8 }));
    this.stalks.sort((a, b) => a.d - b.d);
    this.lean = 0;
    this.picked = 0;
    this.flying = [];
    this.munch = 0;
    this.motes = Array.from({ length: 30 }, () => ({ x: r(), y: r(), p: r() * 6 }));
  }

  onResize() {
    this.ground = this.H * 0.78;
    this.fig = Math.min(this.H * 0.34, (this.W - this.inset) * 0.28);
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.lean = damp(this.lean, signal.lean ?? 0, 8, dt);
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "reach") continue;
      this.picked++;
      const k = e.side === "left" ? -1 : 1;
      const from = { x: this.cx + k * this.fig * 0.45, y: this.ground - this.fig * 1.65 };
      const to = this.pandaMouth();
      this.flying.push({ ...from, sx: from.x, sy: from.y, tx: to.x, ty: to.y, t: 0 });
      this.fx.burst(from.x, from.y, { count: 8, colors: ["#9ccc65", "#c5e1a5"], speed: 160, gravity: 250, size: 5, shape: "blob" });
      sfx.pop();
    }
    for (const f of this.flying) f.t += dt / 0.9;
    const landed = this.flying.filter((f) => f.t >= 1).length;
    if (landed) {
      this.munch = 1.4;
      this.fx.word(["nom nom", "munch", "yum!", "more!"][this.picked % 4], this.pandaMouth().x + this.fig * 0.3, this.pandaMouth().y - this.fig * 0.25, { size: this.fig * 0.13, color: "#f1f8e9", life: 1 });
    }
    this.flying = this.flying.filter((f) => f.t < 1);
    this.munch = Math.max(0, this.munch - dt);
  }

  pandaMouth() {
    const s = this.fig * 0.6;
    return { x: this.cx + (this.W - this.inset) * 0.26, y: this.ground - s * 0.95 };
  }

  draw() {
    const ctx = this.begin();
    const { W, H, ground, fig, cx } = this;

    // Misty morning grove.
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#d7ecd9");
    sky.addColorStop(1, "#f3f7e8");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    glow(ctx, W * 0.7, H * 0.12, H * 0.6, "rgba(255,250,225,0.9)");

    // Bamboo in depth: far stalks pale and thin, near ones rich and wide.
    for (const s of this.stalks) {
      const depth = s.d;
      const x = s.x * W + Math.sin(this.time * 0.6 + s.sway) * 3 * depth;
      const w = (6 + depth * 22) * s.w;
      const c1 = `rgba(${Math.round(150 - depth * 90)},${Math.round(190 - depth * 60)},${Math.round(140 - depth * 90)},${0.35 + depth * 0.6})`;
      ctx.fillStyle = c1;
      ctx.fillRect(x - w / 2, -10, w, ground + 10 - (1 - depth) * 20);
      ctx.fillStyle = `rgba(40,70,30,${0.15 + depth * 0.3})`;
      for (let y = 40 + (s.sway * 30) % 60; y < ground; y += 90 + depth * 40) ctx.fillRect(x - w / 2 - 1, y, w + 2, 3);
      if (depth > 0.55) {
        ctx.fillStyle = `rgba(90,140,60,${depth * 0.8})`;
        for (let y = 60 + (s.sway * 50) % 80; y < ground * 0.8; y += 140) {
          ctx.beginPath();
          ctx.ellipse(x + w * 1.4, y, w * 1.6, w * 0.35, -0.5, 0, TAU);
          ctx.fill();
        }
      }
    }
    // Low mist.
    const mist = ctx.createLinearGradient(0, ground - H * 0.25, 0, ground);
    mist.addColorStop(0, "rgba(245,250,240,0)");
    mist.addColorStop(1, "rgba(245,250,240,0.85)");
    ctx.fillStyle = mist;
    ctx.fillRect(-20, ground - H * 0.25, W + 40, H * 0.25);
    const moss = ctx.createLinearGradient(0, ground, 0, H);
    moss.addColorStop(0, "#9bb36b");
    moss.addColorStop(1, "#5f7a3a");
    ctx.fillStyle = moss;
    ctx.fillRect(-20, ground, W + 40, H - ground + 20);

    // Floating light motes.
    for (const m of this.motes) {
      glow(ctx, m.x * W + Math.sin(this.time * 0.4 + m.p) * 30, (m.y * 0.8 + 0.05) * ground + Math.cos(this.time * 0.3 + m.p) * 20, 8, "rgba(255,255,220,0.7)");
    }

    // Two bamboo stalks within reach, left and right of you.
    for (const k of [-1, 1]) {
      const sx = cx + k * fig * 0.6;
      const g = ctx.createLinearGradient(sx - 12, 0, sx + 12, 0);
      g.addColorStop(0, "#9ccc65");
      g.addColorStop(1, "#4e7a27");
      ctx.fillStyle = g;
      ctx.fillRect(sx - 12, -10, 24, ground + 10);
      ctx.fillStyle = "rgba(40,70,20,0.5)";
      for (let y = 30; y < ground; y += 70) ctx.fillRect(sx - 13, y, 26, 4);
      ctx.fillStyle = "#7cb342";
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.ellipse(sx - k * 26, ground - fig * (1.5 + j * 0.12), 30, 8, -k * (0.4 + j * 0.15), 0, TAU);
        ctx.fill();
      }
    }

    this.drawPanda();

    // Bamboo shoots flying to the panda.
    for (const f of this.flying) {
      const x = lerp(f.sx, f.tx, f.t), y = lerp(f.sy, f.ty, f.t) - Math.sin(Math.PI * f.t) * fig * 0.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.t * 8);
      ctx.fillStyle = "#8bc34a";
      ctx.fillRect(-18, -3, 36, 6);
      ctx.fillStyle = "#aed581";
      ctx.beginPath();
      ctx.ellipse(18, 0, 12, 4, 0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // You (seen from behind), reaching.
    const p = this.auto && this.pose ? this.pose
      : this.lean < 0 ? mix(WIDE, REACH_L, clamp(-this.lean)) : mix(WIDE, REACH_R, clamp(this.lean));
    floorShadow(ctx, cx, H * 0.96, fig * 0.42, fig * 0.07);
    drawFigure(ctx, p, cx, H * 0.96 - 0.6 * fig, fig, LOOKS.zen);

    vignette(ctx, W, H, 0.18);
    this.fx.draw(ctx);
  }

  drawPanda() {
    const { ctx } = this;
    const s = this.fig * 0.6;
    const x = this.cx + (this.W - this.inset) * 0.26, y = this.ground;
    const chew = this.munch > 0 ? Math.abs(Math.sin(this.time * 14)) * s * 0.03 : 0;
    floorShadow(ctx, x, y + 4, s * 0.6, s * 0.1, 0.25);
    const fur = (cx, cy, r) => {
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#d6dbd6");
      return g;
    };
    ctx.fillStyle = "#1e1e1e";
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + k * s * 0.32, y - s * 0.08, s * 0.2, s * 0.13, 0, 0, TAU); // feet
      ctx.fill();
    }
    ctx.fillStyle = fur(x, y - s * 0.45, s * 0.5);
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.4, s * 0.46, s * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1e1e1e";
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.62, s * 0.5, s * 0.14, 0, 0, TAU); // arms band
    ctx.fill();
    const hy = y - s * 0.95;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + k * s * 0.26, hy - s * 0.22, s * 0.11, 0, TAU); // ears
      ctx.fill();
    }
    ctx.fillStyle = fur(x, hy, s * 0.34);
    ctx.beginPath();
    ctx.ellipse(x, hy, s * 0.34, s * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1e1e1e";
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + k * s * 0.13, hy - s * 0.03, s * 0.08, s * 0.1, k * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + k * s * 0.12, hy - s * 0.05, s * 0.025, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#1e1e1e";
    ctx.beginPath();
    ctx.ellipse(x, hy + s * 0.08, s * 0.05, s * 0.035, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#6d4c41";
    ctx.beginPath();
    ctx.ellipse(x, hy + s * 0.16 + chew, s * 0.06, s * 0.025 + chew, 0, 0, TAU);
    ctx.fill();
    if (this.munch > 0) {
      ctx.fillStyle = "#8bc34a";
      ctx.fillRect(x - s * 0.02, hy + s * 0.13, s * 0.28, s * 0.04);
    }
    comicText(ctx, String(this.picked), x, hy - s * 0.55, s * 0.28, "#dcedc8");
  }

  hud() {
    return `Bamboo picked ${this.picked}`;
  }

  stats() {
    return { picked: this.picked };
  }
}

export const bamboo = {
  id: "bamboo",
  name: "Side Reach",
  world: "Bamboo Grove",
  color: "#9ccc65",
  view: "front",
  met: 3,
  steady: true,
  blurb: "Reach up and over to each side to pick bamboo for a hungry panda. Nice and slow.",
  say: "Warm up! Reach up and over, left and right. The panda's hungry.",
  repEvent: "reach",
  summary: (st) => `${st.picked ?? 0} bamboo shoots for the panda`,

  // One reach per bar, alternating sides; the grab lands on beat 2.
  coach(t, tempo) {
    const len = 3.2 / tempo;
    const i = Math.floor(t / len);
    const f = (t % len) / len;
    const side = i % 2 ? "right" : "left";
    let e;
    if (f < 0.4) e = easeInOut(f / 0.4);
    else if (f < 0.6) e = 1;
    else e = 1 - easeInOut((f - 0.6) / 0.4);
    return {
      pose: mix(WIDE, side === "left" ? REACH_L : REACH_R, e),
      signal: { lean: (side === "left" ? -1 : 1) * e },
      count: i + (f >= 0.45 ? 1 : 0),
      cue: f < 0.6 ? (side === "left" ? "REACH LEFT" : "REACH RIGHT") : "AND BACK",
      beat: (4 * t) / len,
      bpm: 240 / len,
    };
  },
  event: (k) => ({ type: "reach", side: k % 2 ? "right" : "left" }),
  createDetector: (calib) => new ReachDetector(calib),
  createScene: (canvas, opts) => new BambooScene(canvas, opts),
};
