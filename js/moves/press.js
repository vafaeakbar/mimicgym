// Dumbbell Shoulder Press → Balloon Pop. Press the weights overhead to pop
// the party balloons floating above you. Some of them are animals.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawDumbbells, drawFigure, floorShadow, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view) ----------
const RACK = pose(FRONT, { le: [-0.3, -0.42], lw: [-0.3, -0.66], re: [0.3, -0.42], rw: [0.3, -0.66] });
const TOP = pose(FRONT, { le: [-0.2, -0.82], lw: [-0.12, -1.06], re: [0.2, -0.82], rw: [0.12, -1.06] });

// ---------- Camera detector ----------
// Press = wrists rising from shoulder height to overhead, in torso lengths.
class PressDetector {
  constructor() {
    this.press = 0;
    this.up = false;
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m) {
      const im = m.im;
      const ws = [15, 16].filter((w) => (im[w].visibility ?? 1) > 0.5);
      if (ws.length) {
        const wy = ws.reduce((s, w) => s + im[w].y, 0) / ws.length;
        this.press = damp(this.press, clamp((m.sh.y - wy) / (0.8 * m.torso)), 18, dt);
      }
    }
    if (!this.up && this.press > 0.8) {
      this.up = true;
      events.push({ type: "press" });
    } else if (this.up && this.press < 0.25) this.up = false;
    return { press: this.press, events };
  }
}

// ---------- Scene ----------
const COLORS = ["#ef5350", "#42a5f5", "#ffee58", "#66bb6a", "#ab47bc", "#ff7043"];

class BalloonScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.press = 0;
    this.popped = 0;
    this.balloons = [];
    this.nextId = 0;
    for (let i = 0; i < 6; i++) this.addBalloon(i * 0.16);
  }

  onResize() {
    this.floorY = this.H * 0.92;
    this.fig = Math.min(this.H * 0.28, (this.W - this.inset) * 0.22);
  }

  addBalloon(delay = 0) {
    const id = this.nextId++;
    this.balloons.push({
      id, t: -delay, c: COLORS[id % COLORS.length], dog: id % 5 === 4,
      dx: (Math.random() - 0.5) * 0.9, dy: Math.random(), sway: Math.random() * 6,
    });
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.press = damp(this.press, signal.press ?? 0, 18, dt);
    if (this.auto) this.pose = coach.pose;
    for (const b of this.balloons) b.t += dt;
    for (const e of signal.events) {
      if (e.type !== "press" || !this.balloons.length) continue;
      // Pop the balloon closest to your hands.
      const target = this.balloons.reduce((a, b) => (Math.abs(b.dx) + b.dy < Math.abs(a.dx) + a.dy ? b : a));
      const { x, y } = this.balloonPos(target);
      this.balloons = this.balloons.filter((b) => b !== target);
      this.popped++;
      this.fx.burst(x, y, { count: 30, colors: [target.c, "#fff", "#ffd54f"], speed: 420, gravity: 500, size: 5, shape: "rect", life: 1.2 });
      this.fx.word(target.dog ? "SQUEAK!" : "POP!", x, y - this.fig * 0.2, { size: this.fig * 0.2, color: target.c });
      target.dog ? sfx.boing() : sfx.pop();
      this.addBalloon();
    }
  }

  balloonPos(b) {
    const top = this.floorY - this.fig * 1.55;
    const rise = Math.min(1, Math.max(0, b.t) / 1.5); // new balloons float in from below
    return {
      x: this.cx + b.dx * this.fig * 1.6 + Math.sin(this.time + b.sway) * 6,
      y: top - b.dy * this.fig * 0.9 + (1 - rise) * this.H * 0.6,
    };
  }

  draw() {
    const ctx = this.begin();
    const { W, H, fig, floorY, cx } = this;

    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, "#fce4ec");
    wall.addColorStop(1, "#f8bbd0");
    ctx.fillStyle = wall;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // Streamers.
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = COLORS[k * 2];
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = this.inset; x <= W; x += 20) ctx.lineTo(x, 30 + k * 18 + Math.sin(x / 60 + k) * 12);
      ctx.stroke();
    }
    ctx.fillStyle = "#d7ccc8";
    ctx.fillRect(-20, floorY, W + 40, H - floorY + 20);

    for (const b of this.balloons) {
      const { x, y } = this.balloonPos(b);
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + fig * 0.14);
      ctx.quadraticCurveTo(x + 8, y + fig * 0.35, x, y + fig * 0.55);
      ctx.stroke();
      const g = ctx.createRadialGradient(x - fig * 0.04, y - fig * 0.05, fig * 0.01, x, y, fig * 0.15);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, b.c);
      g.addColorStop(1, b.c);
      ctx.fillStyle = g;
      ctx.beginPath();
      if (b.dog) {
        // Balloon dog: a string of sausage shapes.
        for (const [ox, oy, rx, ry] of [[0, 0, 0.14, 0.07], [0.12, -0.08, 0.06, 0.05], [-0.12, 0.06, 0.03, 0.08], [0.06, 0.06, 0.03, 0.08], [-0.16, -0.04, 0.05, 0.03]]) {
          ctx.moveTo(x + (ox + rx) * fig, y + oy * fig);
          ctx.ellipse(x + ox * fig, y + oy * fig, rx * fig, ry * fig, 0, 0, TAU);
        }
      } else {
        ctx.ellipse(x, y, fig * 0.12, fig * 0.15, 0, 0, TAU);
      }
      ctx.fill();
    }

    // You, pressing.
    const p = this.auto && this.pose ? this.pose : mix(RACK, TOP, easeInOut(clamp(this.press)));
    floorShadow(ctx, cx, floorY, fig * 0.35, fig * 0.06, 0.3);
    drawFigure(ctx, p, cx, floorY - 0.6 * fig, fig, LOOKS.party);
    drawDumbbells(ctx, p, cx, floorY - 0.6 * fig, fig);

    comicText(ctx, `${this.popped} POPPED`, cx, this.topY, fig * 0.16, "#ffffff");
    vignette(ctx, W, H, 0.15);
    this.fx.draw(ctx);
  }

  hud() {
    return `Balloons popped ${this.popped}`;
  }

  stats() {
    return { popped: this.popped };
  }
}

export const press = {
  id: "press",
  name: "Shoulder Press",
  world: "Balloon Pop",
  color: "#f06292",
  view: "front",
  weights: true,
  met: 4,
  blurb: "Dumbbells at your shoulders, press straight up overhead to pop the party balloons.",
  say: "Shoulder press. Press up and pop those balloons!",
  repEvent: "press",
  summary: (st) => `${st.popped ?? 0} balloons popped`,

  // One press every two beats; arms locked out on the beat.
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
      pose: mix(RACK, TOP, e),
      signal: { press: e },
      count: i + (f >= 0.35 ? 1 : 0),
      cue: f < 0.45 ? "PRESS UP!" : "BACK TO SHOULDERS",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "press" }),
  createDetector: () => new PressDetector(),
  createScene: (canvas, opts) => new BalloonScene(canvas, opts),
};
