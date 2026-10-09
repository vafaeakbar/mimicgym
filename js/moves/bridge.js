// Glute Bridge → Drawbridge. Lying on your back, drive your hips up to lower
// the castle drawbridge; one traveller crosses the moat per rep.
import { Scene } from "../scene.js";
import { LOOKS, drawFigure, mix } from "../figure.js";
import { TAU, clamp, damp, easeInOut, mid, seen } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";

// ---------- Coach (side view, lying on the back, head to the left) ----------
const DOWN = {
  back: "l", toe: [0.08, 0.0],
  head: [-0.64, 0.17], neck: [-0.5, 0.17], hip: [0, 0.2],
  rs: [-0.46, 0.18], re: [-0.26, 0.22], rw: [-0.04, 0.22],
  ls: [-0.48, 0.18], le: [-0.28, 0.22], lw: [-0.06, 0.22],
  rh: [0.01, 0.2], rk: [0.24, -0.02], ra: [0.42, 0.22],
  lh: [-0.01, 0.2], lk: [0.22, -0.02], la: [0.4, 0.22],
};
const UP = {
  ...DOWN,
  hip: [0, -0.06], rh: [0.01, -0.06], lh: [-0.01, -0.06],
  rk: [0.32, -0.08], lk: [0.3, -0.08],
};

// ---------- Camera detector ----------
// Side-on, lying down: the bridge is "up" when the hips reach the straight
// line from shoulders to knees.
class BridgeDetector {
  constructor() {
    this.lift = 0;
    this.up = false;
  }

  update(pose, dt) {
    const events = [];
    const im = pose?.image;
    if (im && seen(im, 11, 12, 23, 24) && seen(im, 25, 26)) {
      const S = mid(im[11], im[12]), Hp = mid(im[23], im[24]), K = mid(im[25], im[26]);
      const lying = Math.abs(Hp.y - S.y) < Math.abs(Hp.x - S.x);
      const dx = K.x - S.x;
      if (lying && Math.abs(dx) > 0.02) {
        const lineY = S.y + ((Hp.x - S.x) / dx) * (K.y - S.y);
        const dev = (Hp.y - lineY) / Math.hypot(dx, K.y - S.y); // + = hips below the line
        this.lift = damp(this.lift, clamp(1 - dev / 0.18), 15, dt);
      }
    }
    if (!this.up && this.lift > 0.7) {
      this.up = true;
      events.push({ type: "bridge" });
    } else if (this.up && this.lift < 0.3) this.up = false;
    return { lift: this.lift, events };
  }
}

// ---------- Scene ----------
const TRAVELLERS = [
  { kind: "knight", line: "Much obliged!" },
  { kind: "duck", line: "Quack!" },
  { kind: "snail", line: "…made it." },
  { kind: "knight", line: "For the realm!" },
  { kind: "duck", line: "Quack quack!" },
];

class DrawbridgeScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.lift = 0;
    this.crossed = 0;
    this.walker = null;
    this.next = 0;
  }

  onResize() {
    this.ground = this.H * 0.72;
    this.fig = Math.min(this.H * 0.34, (this.W - this.inset) * 0.26);
    this.px = this.inset + (this.W - this.inset) * 0.22;
    this.moatL = this.inset + (this.W - this.inset) * 0.52;
    this.moatR = this.inset + (this.W - this.inset) * 0.74;
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.lift = damp(this.lift, signal.lift ?? 0, 15, dt);
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "bridge" || this.walker) continue;
      this.walker = { ...TRAVELLERS[this.next % TRAVELLERS.length], t: 0 };
      this.next++;
    }
    if (this.walker) {
      this.walker.t += dt / 1.1;
      if (this.walker.t >= 1) {
        this.crossed++;
        this.fx.word(this.walker.line, this.moatR + this.fig * 0.3, this.ground - this.fig * 0.5, { size: this.fig * 0.1, color: "#fff", life: 1.2 });
        sfx.pop();
        this.walker = null;
      }
    }
  }

  draw() {
    const ctx = this.begin();
    const { W, H, ground, fig, px, moatL, moatR } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#90caf9");
    sky.addColorStop(1, "#e3f2fd");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    glow(ctx, W * 0.2 + this.inset, H * 0.15, H * 0.25, "rgba(255,248,210,0.9)");
    // Castle.
    const cx0 = moatR, cw = W - moatR + 20, ch = fig * 1.6;
    ctx.fillStyle = "#9e9e9e";
    ctx.fillRect(cx0, ground - ch, cw, ch);
    for (let x = cx0; x < W; x += fig * 0.2) ctx.fillRect(x, ground - ch - fig * 0.12, fig * 0.12, fig * 0.12);
    ctx.fillStyle = "#757575";
    ctx.fillRect(cx0 + fig * 0.3, ground - ch - fig * 0.5, fig * 0.4, fig * 0.5);
    ctx.fillStyle = "#e53935";
    ctx.beginPath();
    ctx.moveTo(cx0 + fig * 0.5, ground - ch - fig * 0.5);
    ctx.lineTo(cx0 + fig * 0.5, ground - ch - fig * 0.85);
    ctx.lineTo(cx0 + fig * 0.75, ground - ch - fig * 0.72);
    ctx.fill();
    ctx.fillStyle = "#3e2723";
    ctx.beginPath();
    ctx.roundRect(cx0 + 4, ground - fig * 0.7, fig * 0.4, fig * 0.7, [fig * 0.2, fig * 0.2, 0, 0]);
    ctx.fill();
    // Grass and moat.
    ctx.fillStyle = "#7cb342";
    ctx.fillRect(-20, ground, W + 40, H - ground + 20);
    const mg = ctx.createLinearGradient(0, ground, 0, H);
    mg.addColorStop(0, "#26a69a");
    mg.addColorStop(1, "#00695c");
    ctx.fillStyle = mg;
    ctx.fillRect(moatL, ground, moatR - moatL, H - ground + 20);

    // Drawbridge: hinged at the castle gate, lowered by your hips.
    const angle = (1 - easeInOut(clamp(this.lift))) * 1.35;
    const len = moatR - moatL + 10;
    ctx.save();
    ctx.translate(moatR, ground);
    ctx.rotate(angle);
    ctx.fillStyle = "#8d6e63";
    ctx.fillRect(-len, -12, len, 12);
    ctx.fillStyle = "#5d4037";
    for (let x = -len; x < 0; x += 22) ctx.fillRect(x, -12, 3, 12);
    ctx.restore();
    ctx.strokeStyle = "#424242";
    ctx.lineWidth = 3;
    const tipX = moatR - Math.cos(angle) * len, tipY = ground - Math.sin(angle) * len;
    ctx.beginPath();
    ctx.moveTo(cx0 + fig * 0.2, ground - fig * 1.0);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Traveller crossing.
    if (this.walker) {
      const x = moatL - fig * 0.2 + (moatR - moatL + fig * 0.4) * this.walker.t;
      this.drawTraveller(this.walker.kind, x, ground - 12, fig * 0.25);
    } else {
      this.drawTraveller(TRAVELLERS[this.next % TRAVELLERS.length].kind, moatL - fig * 0.25, ground, fig * 0.25);
    }

    // You, lying on the grass.
    const p = this.auto && this.pose ? this.pose : mix(DOWN, UP, easeInOut(clamp(this.lift)));
    drawFigure(ctx, p, px, ground - 0.22 * fig, fig, LOOKS.knight);

    comicText(ctx, `${this.crossed} CROSSED`, this.cx, this.topY, fig * 0.14, "#ffffff");
    vignette(ctx, W, H, 0.2);
    this.fx.draw(ctx);
  }

  drawTraveller(kind, x, y, s) {
    const { ctx } = this;
    const bob = Math.abs(Math.sin(this.time * 10)) * s * 0.05;
    ctx.save();
    ctx.translate(x, y - bob);
    if (kind === "duck") {
      ctx.fillStyle = "#fdd835";
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.3, s * 0.4, s * 0.28, 0, 0, TAU);
      ctx.arc(s * 0.3, -s * 0.65, s * 0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fb8c00";
      ctx.beginPath();
      ctx.moveTo(s * 0.48, -s * 0.66);
      ctx.lineTo(s * 0.7, -s * 0.6);
      ctx.lineTo(s * 0.48, -s * 0.56);
      ctx.fill();
    } else if (kind === "snail") {
      ctx.fillStyle = "#a1887f";
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.1, s * 0.5, s * 0.12, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ff8a65";
      ctx.beginPath();
      ctx.arc(-s * 0.1, -s * 0.35, s * 0.28, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = "#b0bec5";
      ctx.fillRect(-s * 0.2, -s * 1.1, s * 0.4, s * 0.8);
      ctx.beginPath();
      ctx.arc(0, -s * 1.25, s * 0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#e53935";
      ctx.fillRect(-s * 0.05, -s * 1.55, s * 0.1, s * 0.15);
      ctx.fillStyle = "#607d8b";
      ctx.fillRect(-s * 0.18, -s * 0.3, s * 0.12, s * 0.3);
      ctx.fillRect(s * 0.06, -s * 0.3, s * 0.12, s * 0.3);
    }
    ctx.restore();
  }

  hud() {
    return `Travellers crossed ${this.crossed}`;
  }

  stats() {
    return { crossed: this.crossed };
  }
}

export const bridge = {
  id: "bridge",
  name: "Glute Bridge",
  world: "Drawbridge",
  color: "#8d6e63",
  view: "plank",
  frame: { x0: -0.78, x1: 0.56, y0: -0.3, y1: 0.3 },
  floor: 0.25,
  met: 3.5,
  blurb: "Lie on your back, knees bent, and drive your hips up to lower the castle drawbridge.",
  say: "Glute bridges. Squeeze and drive those hips up.",
  repEvent: "bridge",
  summary: (st) => `${st.crossed ?? 0} travellers crossed the moat`,

  // One rep every two beats; hips up on the beat.
  coach(t, tempo) {
    const len = 2.4 / tempo;
    const u = t / len + 0.35;
    const i = Math.floor(u);
    const f = u - i;
    let e;
    if (f < 0.35) e = easeInOut(f / 0.35);
    else if (f < 0.55) e = 1;
    else if (f < 0.9) e = 1 - easeInOut((f - 0.55) / 0.35);
    else e = 0;
    return {
      pose: mix(DOWN, UP, e),
      signal: { lift: e },
      count: i + (f >= 0.35 ? 1 : 0),
      cue: f < 0.55 ? "HIPS UP, SQUEEZE" : "LOWER SLOWLY",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "bridge" }),
  createDetector: () => new BridgeDetector(),
  createScene: (canvas, opts) => new DrawbridgeScene(canvas, opts),
};
