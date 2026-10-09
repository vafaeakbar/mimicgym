// Bent-over Dumbbell Row → Dragon Boat. Hinge forward and pull the weights to
// your hips; every stroke surges the boat past a very smug duck.
import { Scene } from "../scene.js";
import { LOOKS, drawDumbbells, drawFigure, mix, pose } from "../figure.js";
import { TAU, angleAt, clamp, damp, easeInOut, mulberry32, seen } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { HINGE, torsoTilt } from "./rdl.js";

// ---------- Coach (side view, hinged forward) ----------
const HANG = HINGE;
const PULL = pose(HINGE, { re: [0.16, -0.28], rw: [0.2, -0.04], le: [0.14, -0.29], lw: [0.18, -0.05] });

// ---------- Camera detector ----------
// While hinged forward, the row is the elbow bending as you pull.
class RowDetector {
  constructor() {
    this.pull = 0;
    this.up = false;
  }

  update(pose, dt) {
    const events = [];
    const w = pose?.world;
    if (w) {
      const tilt = torsoTilt(w);
      const arms = [[11, 13, 15], [12, 14, 16]].filter((ix) => seen(w, ...ix));
      if (tilt !== null && arms.length) {
        const ang = arms.reduce((s, [a, b, c]) => s + angleAt(w[a], w[b], w[c]), 0) / arms.length;
        this.pull = damp(this.pull, tilt > 30 ? clamp((165 - ang) / 75) : 0, 18, dt);
      }
    }
    if (!this.up && this.pull > 0.7) {
      this.up = true;
      events.push({ type: "stroke" });
    } else if (this.up && this.pull < 0.25) this.up = false;
    return { pull: this.pull, events };
  }
}

// ---------- Scene ----------
class BoatScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const r = mulberry32(12);
    this.trees = Array.from({ length: 14 }, () => ({ x: r(), s: 0.6 + r() * 0.8 }));
    this.pull = 0;
    this.speed = 0;
    this.dist = 0;
    this.duck = 0; // duck's lead in metres (negative = behind you)
    this.strokes = 0;
    this.surge = 0;
  }

  onResize() {
    this.water = this.H * 0.62;
    this.fig = Math.min(this.H * 0.28, (this.W - this.inset) * 0.22);
    this.ppm = (this.W - this.inset) / 18;
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.pull = damp(this.pull, signal.pull ?? 0, 18, dt);
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "stroke") continue;
      this.strokes++;
      this.speed += 3.4; // ~3.8 m per stroke: steady rowing just beats the duck
      this.surge = 1;
      sfx.whoosh(0.8);
      this.fx.burst(this.cx - this.fig * 1.1, this.water, { count: 10, colors: ["#e1f5fe", "#b3e5fc"], speed: 220, gravity: 700, size: 4 });
    }
    this.speed *= Math.exp(-dt * 0.9);
    this.dist += this.speed * dt;
    this.duck = clamp(this.duck + (1.6 - this.speed) * dt, -8, 6);
    this.surge = Math.max(0, this.surge - dt * 2);
  }

  draw() {
    const ctx = this.begin();
    const { W, H, water, fig, ppm, cx } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, water);
    sky.addColorStop(0, "#ffcc80");
    sky.addColorStop(1, "#fff3e0");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    glow(ctx, W * 0.75, water * 0.45, H * 0.35, "rgba(255,210,150,0.9)");
    // Riverbank trees scroll by.
    const off = (this.dist * ppm * 0.4) % (W * 1.2);
    for (const t of this.trees) {
      const x = ((t.x * W * 1.2 - off + W * 1.2) % (W * 1.2)) - W * 0.1;
      ctx.fillStyle = "#6d4c41";
      ctx.fillRect(x - 3, water - fig * 0.9 * t.s, 6, fig * 0.9 * t.s);
      ctx.fillStyle = "#558b2f";
      ctx.beginPath();
      ctx.arc(x, water - fig * 0.95 * t.s, fig * 0.28 * t.s, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#7cb342";
    ctx.fillRect(-20, water - 10, W + 40, 12);
    const wg = ctx.createLinearGradient(0, water, 0, H);
    wg.addColorStop(0, "#4fc3f7");
    wg.addColorStop(1, "#0277bd");
    ctx.fillStyle = wg;
    ctx.fillRect(-20, water, W + 40, H - water + 20);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    const wo = (this.dist * ppm) % 80;
    for (let y = water + 18; y < H; y += 28) {
      for (let x = -wo; x < W; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 30, y);
        ctx.stroke();
      }
    }

    // The smug duck (ahead of or behind you).
    const dx = cx + this.duck * ppm;
    const dy = water + fig * 0.25;
    ctx.fillStyle = "#fdd835";
    ctx.beginPath();
    ctx.ellipse(dx, dy, fig * 0.22, fig * 0.12, 0, 0, TAU);
    ctx.arc(dx + fig * 0.16, dy - fig * 0.16, fig * 0.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fb8c00";
    ctx.beginPath();
    ctx.moveTo(dx + fig * 0.24, dy - fig * 0.17);
    ctx.lineTo(dx + fig * 0.36, dy - fig * 0.14);
    ctx.lineTo(dx + fig * 0.24, dy - fig * 0.11);
    ctx.fill();

    // Dragon boat.
    const by = water + fig * 0.05 + Math.sin(this.time * 2) * 3;
    const bl = fig * 2.2;
    ctx.save();
    ctx.translate(cx + this.surge * 10, by);
    ctx.fillStyle = "#c62828";
    ctx.beginPath();
    ctx.moveTo(-bl / 2, -fig * 0.05);
    ctx.lineTo(bl / 2, -fig * 0.05);
    ctx.quadraticCurveTo(bl / 2 - fig * 0.1, fig * 0.22, bl / 2 - fig * 0.3, fig * 0.22);
    ctx.lineTo(-bl / 2 + fig * 0.25, fig * 0.22);
    ctx.quadraticCurveTo(-bl / 2, fig * 0.2, -bl / 2, -fig * 0.05);
    ctx.fill();
    ctx.fillStyle = "#ffca28";
    ctx.fillRect(-bl / 2, -fig * 0.05, bl, fig * 0.04);
    // Dragon head at the bow.
    ctx.fillStyle = "#2e7d32";
    ctx.beginPath();
    ctx.moveTo(bl / 2 - fig * 0.05, -fig * 0.05);
    ctx.quadraticCurveTo(bl / 2 + fig * 0.1, -fig * 0.45, bl / 2 + fig * 0.28, -fig * 0.42);
    ctx.lineTo(bl / 2 + fig * 0.22, -fig * 0.3);
    ctx.quadraticCurveTo(bl / 2 + fig * 0.05, -fig * 0.25, bl / 2 + fig * 0.08, -fig * 0.05);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(bl / 2 + fig * 0.17, -fig * 0.38, fig * 0.03, 0, TAU);
    ctx.fill();
    ctx.restore();

    // You, rowing in the boat (the dumbbells are your oars' weights).
    const p = this.auto && this.pose ? this.pose : mix(HANG, PULL, easeInOut(clamp(this.pull)));
    const fy = by - fig * 0.05 - 0.6 * fig;
    drawFigure(ctx, p, cx - fig * 0.25 + this.surge * 10, fy, fig, LOOKS.sailor);
    drawDumbbells(ctx, p, cx - fig * 0.25 + this.surge * 10, fy, fig);

    const lead = -this.duck;
    comicText(ctx, lead >= 0 ? `+${lead.toFixed(1)} m AHEAD` : `${(-lead).toFixed(1)} m BEHIND THE DUCK`, cx, this.topY, fig * 0.12, lead >= 0 ? "#c8e6c9" : "#ffcdd2");
    vignette(ctx, W, H, 0.2);
    this.fx.draw(ctx);
  }

  hud() {
    return `Strokes ${this.strokes} · ${Math.round(this.dist)} m rowed`;
  }

  stats() {
    return { strokes: this.strokes, meters: this.dist };
  }
}

export const row = {
  id: "row",
  name: "Dumbbell Row",
  world: "Dragon Boat",
  color: "#ef5350",
  view: "side",
  weights: true,
  met: 5,
  blurb: "Hinge forward, flat back, and pull the dumbbells to your hips. Every stroke beats the duck.",
  say: "Dumbbell rows. Flat back, pull to your hips. Beat that duck!",
  repEvent: "stroke",
  summary: (st) => `${st.strokes ?? 0} strokes · ${Math.round(st.meters ?? 0)} m rowed`,

  // One stroke every two beats; the pull lands on the beat.
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
      pose: mix(HANG, PULL, e),
      signal: { pull: e },
      count: i + (f >= 0.35 ? 1 : 0),
      cue: f < 0.45 ? "PULL TO YOUR HIPS" : "LOWER",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "stroke" }),
  createDetector: () => new RowDetector(),
  createScene: (canvas, opts) => new BoatScene(canvas, opts),
};
