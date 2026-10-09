// Dumbbell Lateral Raise → Bird Flight. Raise your arms out to the sides like
// wings; every flap lifts you higher and more birds join your flock.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawDumbbells, drawFigure, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, mulberry32 } from "../util.js";
import { comicText, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view) ----------
const DOWN = pose(FRONT, { le: [-0.2, -0.31], lw: [-0.22, -0.06], re: [0.2, -0.31], rw: [0.22, -0.06] });
const UP = pose(FRONT, { le: [-0.36, -0.52], lw: [-0.6, -0.54], re: [0.36, -0.52], rw: [0.6, -0.54] });

// ---------- Camera detector ----------
// Raise = wrists lifting from the hips to shoulder height, out to the sides.
class LateralDetector {
  constructor() {
    this.raise = 0;
    this.up = false;
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m?.hip) {
      const im = m.im;
      const arms = [[11, 15], [12, 16]].filter(([s, w]) => (im[w].visibility ?? 1) > 0.5);
      if (arms.length) {
        let v = 0;
        for (const [s, w] of arms) {
          const outward = Math.abs(im[w].x - m.sh.x) > Math.abs(im[s].x - m.sh.x) * 1.2;
          v += outward ? clamp((m.hip.y - im[w].y) / (m.hip.y - m.sh.y)) : 0;
        }
        this.raise = damp(this.raise, v / arms.length, 18, dt);
      }
    }
    if (!this.up && this.raise > 0.85) {
      this.up = true;
      events.push({ type: "flap" });
    } else if (this.up && this.raise < 0.3) this.up = false;
    return { raise: this.raise, events };
  }
}

// ---------- Scene ----------
class FlightScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const r = mulberry32(22);
    this.clouds = Array.from({ length: 9 }, () => ({ x: r(), y: r(), s: 0.5 + r() * 1 }));
    this.hills = Array.from({ length: 8 }, (_, i) => ({ x: i / 8, h: 0.1 + r() * 0.12 }));
    this.raise = 0;
    this.alt = 0.3; // 0..1 of the sky
    this.vy = 0;
    this.dist = 0;
    this.flaps = 0;
    this.flock = 0;
  }

  onResize() {
    this.fig = Math.min(this.H * 0.28, (this.W - this.inset) * 0.22);
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.raise = damp(this.raise, signal.raise ?? 0, 18, dt);
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "flap") continue;
      this.flaps++;
      this.vy += 0.35;
      sfx.whoosh(0.5);
      if (this.flaps % 5 === 0 && this.flock < 8) {
        this.flock++;
        this.fx.word(["A pigeon joined!", "A goose joined!", "A parrot joined!", "A seagull joined!"][this.flock % 4], this.cx, this.topY + this.fig * 0.2, { size: this.fig * 0.12, color: "#fff", life: 1.4 });
      }
    }
    this.vy -= 0.14 * dt; // gentle gravity: steady flapping holds your height
    this.vy *= Math.exp(-dt * 1.5);
    this.alt = clamp(this.alt + this.vy * dt, 0.05, 0.9);
    if (this.alt <= 0.05) this.vy = Math.max(0, this.vy);
    this.dist += (4 + this.flock) * dt;
  }

  draw() {
    const ctx = this.begin();
    const { W, H, fig, cx } = this;
    const high = this.alt;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `rgb(${Math.round(70 - 40 * high)},${Math.round(150 - 60 * high)},${Math.round(230 - 20 * high)})`);
    sky.addColorStop(1, "#e1f5fe");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // Ground far below; sinks away the higher you fly.
    const groundY = H * (0.8 + high * 0.35);
    const scroll = (this.dist * 6) % W;
    ctx.fillStyle = "#9ccc65";
    ctx.beginPath();
    ctx.moveTo(-20, H + 20);
    for (let x = -20; x <= W + 20; x += 20) ctx.lineTo(x, groundY - Math.sin((x + scroll) * 0.01) * H * 0.04);
    ctx.lineTo(W + 20, H + 20);
    ctx.fill();
    // Clouds stream past.
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const c of this.clouds) {
      const x = W - ((c.x * W * 1.3 + this.dist * 20 * c.s) % (W * 1.3)) + W * 0.15;
      const y = (c.y * 0.8 + (high - 0.5) * 0.5) * H;
      const r = fig * 0.14 * c.s;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.arc(x + r, y - r * 0.4, r * 1.2, 0, TAU);
      ctx.arc(x + r * 2.2, y, r * 0.9, 0, TAU);
      ctx.fill();
    }

    // Your flock in a V behind you, flapping when you flap.
    const flap = clamp(this.raise);
    const y0 = H * (0.72 - high * 0.35);
    for (let i = 0; i < this.flock; i++) {
      const k = i % 2 ? 1 : -1, n = Math.floor(i / 2) + 1;
      this.drawBird(cx + k * n * fig * 0.45, y0 - fig * 0.35 + n * fig * 0.2, fig * 0.12, flap);
    }
    // You, wings out.
    const p = this.auto && this.pose ? this.pose : mix(DOWN, UP, easeInOut(flap));
    const fy = y0 + fig * 0.1;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (const sd of ["l", "r"]) {
      // Feathers along each arm.
      const [sx, sy] = [cx + p[sd + "s"][0] * fig, fy + p[sd + "s"][1] * fig];
      const [wx, wy] = [cx + p[sd + "w"][0] * fig, fy + p[sd + "w"][1] * fig];
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(wx, wy);
      ctx.lineTo(wx - (wx - sx) * 0.3, wy + fig * 0.18);
      ctx.lineTo(sx, sy + fig * 0.22);
      ctx.fill();
    }
    drawFigure(ctx, p, cx, fy, fig, LOOKS.flyer);
    drawDumbbells(ctx, p, cx, fy, fig);

    comicText(ctx, `${Math.round(this.alt * 300)} m UP`, cx, this.topY, fig * 0.18, "#ffffff");
    vignette(ctx, W, H, 0.18);
    this.fx.draw(ctx);
  }

  drawBird(x, y, s, flap) {
    const { ctx } = this;
    ctx.strokeStyle = "#37474f";
    ctx.lineWidth = s * 0.25;
    ctx.lineCap = "round";
    const wing = s * (0.9 - flap * 1.2);
    ctx.beginPath();
    ctx.moveTo(x - s, y - wing);
    ctx.quadraticCurveTo(x - s * 0.4, y - wing * 0.2, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - wing * 0.2, x + s, y - wing);
    ctx.stroke();
  }

  hud() {
    return `Flaps ${this.flaps} · Flock of ${this.flock + 1}`;
  }

  stats() {
    return { flaps: this.flaps, flock: this.flock };
  }
}

export const lateral = {
  id: "lateral",
  name: "Lateral Raise",
  world: "Bird Flight",
  color: "#4fc3f7",
  view: "front",
  frame: { x0: -0.72, x1: 0.72, y0: -1.12, y1: 0.68 },
  weights: true,
  met: 3.5,
  blurb: "Raise the dumbbells out to the sides to shoulder height, like wings. Every flap lifts you higher.",
  say: "Lateral raises. Arms out like wings, and fly!",
  repEvent: "flap",
  summary: (st) => `${st.flaps ?? 0} flaps · flock of ${(st.flock ?? 0) + 1}`,

  // One raise every two beats; arms level on the beat.
  coach(t, tempo) {
    const len = 2.4 / tempo;
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
      signal: { raise: e },
      count: i + (f >= 0.35 ? 1 : 0),
      cue: f < 0.45 ? "ARMS OUT, SHOULDER HIGH" : "LOWER SLOWLY",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "flap" }),
  createDetector: () => new LateralDetector(),
  createScene: (canvas, opts) => new FlightScene(canvas, opts),
};
