// Warm-up: Torso Twists → Carousel. Hips facing forward, elbows up, twist
// side to side; every twist spins the fairground carousel.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawFigure, floorShadow, mirror, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, seen } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";

// ---------- Coach (front view) ----------
const CENTER = pose(FRONT, { le: [-0.28, -0.44], lw: [-0.08, -0.46], re: [0.28, -0.44], rw: [0.08, -0.46] });
// Turned to screen-left: shoulders narrow and the arms swing across.
const TWIST_L = pose(CENTER, {
  ls: [-0.1, -0.56], rs: [0.09, -0.56], le: [-0.34, -0.46], lw: [-0.22, -0.46],
  re: [-0.02, -0.44], rw: [-0.16, -0.47], head: [-0.03, -0.77],
});
const TWIST_R = mirror(TWIST_L);

// ---------- Camera detector ----------
// Rotation from the shoulders' depth difference (3D), in shoulder widths.
class TwistDetector {
  constructor() {
    this.rot = 0;
    this.lastSide = 0;
  }

  update(pose, dt) {
    const events = [];
    const w = pose?.world;
    if (w && seen(w, 11, 12)) {
      const width = Math.hypot(w[11].x - w[12].x, w[11].z - w[12].z) || 0.3;
      this.rot = damp(this.rot, clamp((w[11].z - w[12].z) / width, -1, 1), 15, dt);
    }
    const side = this.rot > 0.45 ? 1 : this.rot < -0.45 ? -1 : 0;
    if (side && side !== this.lastSide) {
      this.lastSide = side;
      events.push({ type: "twist", side: side > 0 ? "left" : "right" });
    }
    return { rot: this.rot, events };
  }
}

// ---------- Scene ----------
const RIDERS = ["#fafafa", "#ffcc80", "#ce93d8", "#90caf9", "#a5d6a7", "#ef9a9a"];

class CarouselScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.rot = 0;
    this.spin = 0;
    this.spinV = 0;
    this.twists = 0;
  }

  onResize() {
    this.ground = this.H * 0.86;
    this.fig = Math.min(this.H * 0.26, (this.W - this.inset) * 0.2);
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.rot = damp(this.rot, signal.rot ?? 0, 12, dt);
    this.pose = this.auto ? coach.pose : this.rot >= 0 ? mix(CENTER, TWIST_L, clamp(this.rot)) : mix(CENTER, TWIST_R, clamp(-this.rot));
    for (const e of signal.events) {
      if (e.type !== "twist") continue;
      this.twists++;
      this.spinV += 0.9;
      if (this.twists % 10 === 0) {
        this.fx.word("WHEEE!", this.cx, this.topY, { size: this.fig * 0.18, color: "#fff" });
        sfx.ding();
      }
    }
    this.spinV *= Math.exp(-dt * 0.7);
    this.spin += this.spinV * dt;
  }

  draw() {
    const ctx = this.begin();
    const { W, H, ground, fig, cx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#283593");
    sky.addColorStop(1, "#7e57c2");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(-20, ground, W + 40, H - ground + 20);

    // Carousel: striped canopy, pole lights and riders going round.
    const ccx = cx, top = H * 0.2, rw = Math.min((W - this.inset) * 0.36, fig * 2.4), baseY = ground - fig * 0.9;
    for (let i = 0; i < 16; i++) {
      const a = this.spin + (i / 16) * TAU;
      glow(ctx, ccx + Math.cos(a) * rw, top + fig * 0.45 + Math.sin(a) * rw * 0.12, 12, "rgba(255,236,150,0.9)");
    }
    const riders = RIDERS.map((c, i) => {
      const a = this.spin + (i / RIDERS.length) * TAU;
      return { a, c, depth: Math.sin(a) };
    }).sort((p, q) => p.depth - q.depth);
    const drawRider = (r) => {
      const x = ccx + Math.cos(r.a) * rw * 0.85;
      const bob = Math.sin(this.time * 3 + r.a * 2) * fig * 0.08;
      const y = baseY - fig * 0.35 + r.depth * rw * 0.1 + bob;
      const s = fig * (0.28 + 0.06 * r.depth);
      ctx.strokeStyle = "#ffd54f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, top + fig * 0.5);
      ctx.lineTo(x, baseY);
      ctx.stroke();
      ctx.fillStyle = r.c;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.6, s * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + s * 0.5, y - s * 0.35, s * 0.18, s * 0.3, 0.5, 0, TAU);
      ctx.fill();
      ctx.fillRect(x - s * 0.4, y, s * 0.1, s * 0.45);
      ctx.fillRect(x + s * 0.3, y, s * 0.1, s * 0.45);
    };
    for (const r of riders) if (r.depth < 0) drawRider(r);
    ctx.fillStyle = "#c62828";
    ctx.beginPath();
    ctx.ellipse(ccx, baseY, rw * 1.05, rw * 0.14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#6d4c41";
    ctx.fillRect(ccx - 8, top + fig * 0.3, 16, baseY - top - fig * 0.3);
    for (const r of riders) if (r.depth >= 0) drawRider(r);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? "#fafafa" : "#e53935";
      ctx.beginPath();
      ctx.moveTo(ccx, top);
      ctx.lineTo(ccx - rw * 1.1 + (i / 12) * rw * 2.2, top + fig * 0.5);
      ctx.lineTo(ccx - rw * 1.1 + ((i + 1) / 12) * rw * 2.2, top + fig * 0.5);
      ctx.fill();
    }

    floorShadow(ctx, cx, H * 0.97, fig * 0.4, fig * 0.06, 0.4);
    drawFigure(ctx, this.pose, cx, H * 0.97 - 0.6 * fig, fig, LOOKS.party);
    comicText(ctx, `${this.twists} TWISTS`, cx, this.topY + fig * 0.1, fig * 0.14, "#fff59d");
    vignette(ctx, W, H, 0.3);
    this.fx.draw(ctx);
  }

  hud() {
    return `Twists ${this.twists}`;
  }

  stats() {
    return { twists: this.twists };
  }
}

export const twist = {
  id: "twist",
  name: "Torso Twists",
  world: "Carousel",
  color: "#9575cd",
  view: "front",
  met: 3,
  steady: true,
  blurb: "Hips facing forward, elbows up, twist your upper body side to side to spin the carousel.",
  say: "Torso twists. Hips still, twist side to side.",
  repEvent: "twist",
  summary: (st) => `${st.twists ?? 0} twists`,

  // One twist per beat, alternating sides.
  coach(t, tempo) {
    const len = 1.4 / tempo;
    const i = Math.floor(t / len);
    const f = (t % len) / len;
    const target = i % 2 ? TWIST_R : TWIST_L;
    const e = f < 0.5 ? easeInOut(f / 0.5) : 1 - easeInOut((f - 0.5) / 0.5);
    return {
      pose: mix(CENTER, target, e),
      signal: { rot: (i % 2 ? -1 : 1) * e },
      count: i + (f >= 0.5 ? 1 : 0),
      cue: i % 2 ? "TWIST RIGHT" : "TWIST LEFT",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: (k) => ({ type: "twist", side: k % 2 ? "right" : "left" }),
  createDetector: () => new TwistDetector(),
  createScene: (canvas, opts) => new CarouselScene(canvas, opts),
};
