// Cool-down: Breathe → Mountain Lake. Slow breaths with arm raises: in for 4,
// hold for 1, out for 5. A glowing orb breathes with you. No camera needed.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawFigure, floorShadow, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, mulberry32 } from "../util.js";
import { glow } from "../fx.js";

// ---------- Coach (front view) ----------
const DOWN = pose(FRONT, { le: [-0.2, -0.32], lw: [-0.24, -0.08], re: [0.2, -0.32], rw: [0.24, -0.08] });
const UP = pose(FRONT, { le: [-0.34, -0.76], lw: [-0.46, -0.98], re: [0.34, -0.76], rw: [0.46, -0.98], head: [0, -0.79] });

const INHALE = 4, HOLD = 1, EXHALE = 5;
const CYCLE = INHALE + HOLD + EXHALE;

function breathAt(t) {
  const c = t % CYCLE;
  if (c < INHALE) return { b: easeInOut(c / INHALE), phase: "in" };
  if (c < INHALE + HOLD) return { b: 1, phase: "hold" };
  return { b: 1 - easeInOut((c - INHALE - HOLD) / EXHALE), phase: "out" };
}

// ---------- Scene ----------
// Also used by the stretching cool-down, which passes `label` in its signal.
export class LakeScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const r = mulberry32(21);
    this.stars = Array.from({ length: 90 }, () => ({ x: r(), y: r() * 0.5, p: r() * 6, s: 0.5 + r() * 1.3 }));
    this.embers = Array.from({ length: 26 }, () => ({ x: r(), y: r(), p: r() * 6 }));
    this.breath = 0;
    this.phase = "in";
    this.breaths = 0;
    this.stretches = 0;
    this.label = null;
    this.ripples = [];
  }

  onResize() {
    this.lake = this.H * 0.62;
    this.fig = Math.min(this.H * 0.3, (this.W - this.inset) * 0.26);
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.breath = damp(this.breath, signal.breath ?? 0, 6, dt);
    this.pose = coach.pose;
    if (signal.phase === "out" && this.phase !== "out") this.ripples.push({ t: 0 });
    this.phase = signal.phase ?? this.phase;
    this.label = signal.label ?? null;
    for (const e of signal.events) {
      if (e.type === "breath") this.breaths++;
      if (e.type === "stretch") this.stretches++;
    }
    for (const r of this.ripples) r.t += dt / 4;
    this.ripples = this.ripples.filter((r) => r.t < 1);
  }

  draw() {
    const ctx = this.begin();
    const { W, H, lake, fig, cx } = this;
    const dusk = clamp(this.time / 60); // the sky darkens through the cool-down

    const sky = ctx.createLinearGradient(0, 0, 0, lake);
    sky.addColorStop(0, dusk > 0.5 ? "#0d1633" : "#1f2a5c");
    sky.addColorStop(0.55, "#6b4f8f");
    sky.addColorStop(1, "#f2a37a");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    for (const s of this.stars) {
      ctx.globalAlpha = dusk * (0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.8 + s.p)));
      ctx.fillStyle = "#fff";
      ctx.fillRect(s.x * W, s.y * lake, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // Mountains, drawn once for the sky and once flipped for the reflection.
    const ridge = (base, amp, col, seed, flip) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, lake);
      for (let x = 0; x <= W; x += 8) {
        const n = Math.abs(Math.sin(x * 0.004 + seed)) * 0.7 + Math.sin(x * 0.017 + seed * 3) * 0.2 + Math.sin(x * 0.05 + seed) * 0.1;
        const y = base - amp * n;
        ctx.lineTo(x, flip ? lake + (lake - y) * 0.55 : y);
      }
      ctx.lineTo(W, lake);
      ctx.fill();
    };
    const ranges = [[lake - H * 0.08, H * 0.28, "#584a7e", 1], [lake - H * 0.02, H * 0.18, "#3b3160", 3], [lake, H * 0.08, "#231d3d", 5]];
    for (const [b, a, c, s] of ranges) ridge(b, a, c, s, false);

    // The breathing orb: rises and swells on the in-breath.
    const or = fig * (0.32 + 0.22 * this.breath);
    const oy = lake - H * 0.16 - this.breath * H * 0.05;
    glow(ctx, cx, oy, or * 3.2, "rgba(255,214,170,0.5)");
    const og = ctx.createRadialGradient(cx - or * 0.3, oy - or * 0.3, or * 0.1, cx, oy, or);
    og.addColorStop(0, "#fff8ec");
    og.addColorStop(1, "#ffb88a");
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(cx, oy, or, 0, TAU);
    ctx.fill();

    // Lake with the reflection and exhale ripples.
    const water = ctx.createLinearGradient(0, lake, 0, H);
    water.addColorStop(0, "#5c4a7a");
    water.addColorStop(1, "#141026");
    ctx.fillStyle = water;
    ctx.fillRect(-20, lake, W + 40, H - lake + 20);
    ctx.globalAlpha = 0.35;
    for (const [b, a, c, s] of ranges) ridge(b, a, c, s, true);
    glow(ctx, cx, lake + (lake - oy) * 0.55, or * 1.6, "rgba(255,200,160,0.6)");
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,220,200,0.18)";
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 9; k++) {
      const y = lake + 8 + k * (H - lake) * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.1 - k * 18 + Math.sin(this.time + k) * 10, y);
      ctx.lineTo(cx + W * 0.1 + k * 18 + Math.sin(this.time + k) * 10, y);
      ctx.stroke();
    }
    for (const r of this.ripples) {
      ctx.strokeStyle = `rgba(255,230,210,${0.4 * (1 - r.t)})`;
      ctx.beginPath();
      ctx.ellipse(cx, H * 0.86, fig * (0.4 + r.t * 2.5), fig * (0.06 + r.t * 0.35), 0, 0, TAU);
      ctx.stroke();
    }

    // Embers drifting up faster as you breathe in.
    for (const e of this.embers) {
      const y = ((e.y - this.time * (0.02 + this.breath * 0.03)) % 1 + 1) % 1;
      glow(ctx, e.x * W + Math.sin(this.time + e.p) * 15, y * lake, 7, "rgba(255,210,160,0.7)");
    }

    // You, on a flat rock at the water's edge.
    ctx.fillStyle = "#2a2340";
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.95, fig * 0.7, fig * 0.12, 0, 0, TAU);
    ctx.fill();
    floorShadow(ctx, cx, H * 0.94, fig * 0.38, fig * 0.06, 0.4);
    drawFigure(ctx, this.pose, cx, H * 0.94 - 0.6 * fig, fig, LOOKS.zen);

    const label = this.label ?? (this.phase === "in" ? "Breathe in" : this.phase === "hold" ? "Hold" : "Breathe out");
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#fff4ea";
    ctx.font = `600 ${fig * 0.14}px Outfit, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, H * 0.14);
    ctx.restore();
    this.fx.draw(ctx);
  }

  hud() {
    return this.label ? `Stretches ${this.stretches}` : `Breaths ${this.breaths}`;
  }

  stats() {
    return { breaths: this.breaths, stretches: this.stretches };
  }
}

export const breathe = {
  id: "breathe",
  name: "Deep Breathing",
  world: "Mountain Lake",
  color: "#b39ddb",
  view: "front",
  met: 2,
  steady: true,
  autoOnly: true, // follows the coach even in camera mode
  blurb: "Arms rise as you breathe in for four, lower as you breathe out for five. Let it all settle.",
  say: "Cool down. Breathe in slowly… and out.",
  repEvent: "breath",
  summary: (st) => `${st.breaths ?? 0} slow breaths`,

  coach(t) {
    const { b, phase } = breathAt(t);
    return {
      pose: mix(DOWN, UP, b),
      signal: { breath: b, phase },
      count: Math.floor(t / CYCLE),
      cue: phase === "in" ? "BREATHE IN" : phase === "hold" ? "HOLD" : "BREATHE OUT",
      say: phase === "in" ? "Breathe in" : phase === "out" ? "and out" : null,
      beat: t,
      bpm: 60,
    };
  },
  event: () => ({ type: "breath" }),
  createDetector: () => null,
  createScene: (canvas, opts) => new LakeScene(canvas, opts),
};
