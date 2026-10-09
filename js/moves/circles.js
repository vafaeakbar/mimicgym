// Warm-up: Arm Circles → Windmill Farm. Arms out at shoulder height, small
// circles forward then backward; your circles turn the windmills.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawFigure, floorShadow, pose } from "../figure.js";
import { TAU, clamp, damp, mulberry32 } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view) ----------
const OUT = pose(FRONT, { le: [-0.38, -0.54], lw: [-0.62, -0.56], re: [0.38, -0.54], rw: [0.62, -0.56] });

// Wrists trace small circles; elbows follow at half the radius.
function circlePose(a) {
  const r = 0.08;
  const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
  return pose(OUT, {
    lw: [OUT.lw[0] - dx, OUT.lw[1] + dy], le: [OUT.le[0] - dx / 2, OUT.le[1] + dy / 2],
    rw: [OUT.rw[0] + dx, OUT.rw[1] + dy], re: [OUT.re[0] + dx / 2, OUT.re[1] + dy / 2],
  });
}

// ---------- Camera detector ----------
// Arms held out; each full turn of a wrist around its average position is a circle.
class CircleDetector {
  constructor() {
    this.center = null;
    this.lastA = null;
    this.acc = 0;
    this.out = 0;
    this.t = 0;
    this.lastCircle = 0;
    this.speed = 0;
  }

  update(pose, dt) {
    this.t += dt;
    const events = [];
    const m = pose && measure(pose);
    const w = m && [16, 15].find((i) => (m.im[i].visibility ?? 1) > 0.5);
    if (m?.hip && w !== undefined) {
      const p = m.im[w];
      const out = Math.abs(p.x - m.sh.x) > m.shoulderW && Math.abs(p.y - m.sh.y) < 0.4 * m.torso;
      this.out = damp(this.out, out ? 1 : 0, 10, dt);
      this.center = this.center ? { x: this.center.x + (p.x - this.center.x) * Math.min(1, dt), y: this.center.y + (p.y - this.center.y) * Math.min(1, dt) } : { x: p.x, y: p.y };
      const dx = p.x - this.center.x, dy = p.y - this.center.y;
      if (out && Math.hypot(dx, dy) > 0.008) {
        const a = Math.atan2(dy, dx);
        if (this.lastA !== null) {
          let d = a - this.lastA;
          if (d > Math.PI) d -= TAU;
          if (d < -Math.PI) d += TAU;
          this.acc += d;
          if (Math.abs(this.acc) >= TAU) {
            this.acc -= Math.sign(this.acc) * TAU;
            const iv = this.t - this.lastCircle;
            if (iv > 0.2) this.speed = 1 / iv;
            this.lastCircle = this.t;
            events.push({ type: "circle" });
          }
        }
        this.lastA = a;
      }
    }
    if (this.t - this.lastCircle > 1.5) this.speed *= Math.exp(-dt * 2);
    return { speed: this.speed, out: this.out, events };
  }
}

// ---------- Scene ----------
class WindmillScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const r = mulberry32(31);
    this.mills = [0.18, 0.5, 0.82].map((x) => ({ x, s: 0.7 + r() * 0.4, off: r() * 6 }));
    this.spin = 0;
    this.spinV = 0;
    this.circles = 0;
    this.sacks = 0;
  }

  onResize() {
    this.ground = this.H * 0.8;
    this.fig = Math.min(this.H * 0.28, (this.W - this.inset) * 0.22);
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.pose = coach.pose;
    if (!this.auto) this.pose = circlePose(this.time * TAU * clamp(signal.speed ?? 0, 0, 2));
    for (const e of signal.events) {
      if (e.type !== "circle") continue;
      this.circles++;
      this.spinV += 1.6;
      if (this.circles % 8 === 0) {
        this.sacks++;
        this.fx.word(["FLOUR!", "MOO!", "BREAD TIME!"][this.sacks % 3], this.cx, this.topY, { size: this.fig * 0.16, color: "#fff8e1" });
        sfx.pop();
      }
    }
    this.spinV *= Math.exp(-dt * 0.8);
    this.spin += this.spinV * dt;
  }

  draw() {
    const ctx = this.begin();
    const { W, H, ground, fig, cx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#ffd180");
    sky.addColorStop(1, "#fff8e1");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    glow(ctx, W * 0.15 + this.inset, ground - H * 0.1, H * 0.4, "rgba(255,200,120,0.8)");
    // Rolling tulip fields.
    for (const [base, col] of [[ground - H * 0.08, "#aed581"], [ground, "#7cb342"]]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-20, H + 20);
      for (let x = -20; x <= W + 20; x += 20) ctx.lineTo(x, base - Math.sin(x * 0.008 + base) * H * 0.03);
      ctx.lineTo(W + 20, H + 20);
      ctx.fill();
    }
    ctx.fillStyle = "#e53935";
    for (let x = 10; x < W; x += 26) for (let row = 0; row < 3; row++) ctx.fillRect(x + row * 9, ground + 14 + row * 16, 5, 7);

    // Windmills, blades driven by your circles.
    for (const m of this.mills) {
      const x = this.inset + m.x * (W - this.inset), s = fig * m.s;
      ctx.fillStyle = "#8d6e63";
      ctx.beginPath();
      ctx.moveTo(x - s * 0.22, ground - H * 0.04);
      ctx.lineTo(x - s * 0.14, ground - H * 0.04 - s * 1.1);
      ctx.lineTo(x + s * 0.14, ground - H * 0.04 - s * 1.1);
      ctx.lineTo(x + s * 0.22, ground - H * 0.04);
      ctx.fill();
      const hy = ground - H * 0.04 - s * 1.1;
      ctx.fillStyle = "#5d4037";
      ctx.beginPath();
      ctx.moveTo(x - s * 0.18, hy);
      ctx.lineTo(x, hy - s * 0.2);
      ctx.lineTo(x + s * 0.18, hy);
      ctx.fill();
      ctx.save();
      ctx.translate(x, hy - s * 0.05);
      ctx.rotate(this.spin + m.off);
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = "#fafafa";
        ctx.fillRect(s * 0.04, -s * 0.05, s * 0.6, s * 0.1);
        ctx.strokeStyle = "#8d6e63";
        ctx.lineWidth = 1;
        ctx.strokeRect(s * 0.04, -s * 0.05, s * 0.6, s * 0.1);
      }
      ctx.restore();
    }

    floorShadow(ctx, cx, H * 0.96, fig * 0.4, fig * 0.06, 0.3);
    drawFigure(ctx, this.pose, cx, H * 0.96 - 0.6 * fig, fig, LOOKS.zen);
    comicText(ctx, `${this.circles} CIRCLES`, cx, this.topY + fig * 0.3, fig * 0.12, "#ffffff");
    vignette(ctx, W, H, 0.15);
    this.fx.draw(ctx);
  }

  hud() {
    return `Arm circles ${this.circles} · Flour sacks ${this.sacks}`;
  }

  stats() {
    return { circles: this.circles };
  }
}

export const circles = {
  id: "circles",
  name: "Arm Circles",
  world: "Windmill Farm",
  color: "#ffb74d",
  view: "front",
  frame: { x0: -0.78, x1: 0.78, y0: -1.12, y1: 0.68 },
  met: 3,
  steady: true,
  blurb: "Arms out at shoulder height, small circles forward, then backward. Your circles turn the windmills.",
  say: "Arm circles. Arms out, small circles. Turn those windmills.",
  repEvent: "circle",
  summary: (st) => `${st.circles ?? 0} arm circles`,

  // One circle every 1.2 s: forward for the first half of the block, then backward.
  coach(t, tempo, scene, block) {
    const len = 1.2 / tempo;
    const half = (block?.dur ?? 40) / 2;
    const dir = t < half ? 1 : -1;
    const a = (t < half ? t : half - (t - half)) / len * TAU;
    return {
      pose: circlePose(a),
      signal: { speed: 1 / len, out: 1 },
      count: Math.floor(t / len),
      cue: dir > 0 ? "CIRCLES FORWARD" : "NOW BACKWARD",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "circle" }),
  createDetector: () => new CircleDetector(),
  createScene: (canvas, opts) => new WindmillScene(canvas, opts),
};
