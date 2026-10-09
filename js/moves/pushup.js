// Push-ups → Castle Pump. Every push-up squeezes the air pump under your
// chest and inflates a bouncy castle. Fill it up and the penguins party.
import { Scene } from "../scene.js";
import { LOOKS, drawFigure, floorShadow, mix } from "../figure.js";
import { TAU, angleAt, clamp, damp, easeInOut, mid, seen } from "../util.js";
import { comicText, vignette } from "../fx.js";
import { sfx } from "../audio.js";

// ---------- Coach (side view, facing right, on tiptoes) ----------
export const UP = {
  back: "l", toe: [0.03, 0.06],
  head: [0.66, -0.24], neck: [0.52, -0.2], hip: [0, 0],
  rs: [0.48, -0.19], re: [0.5, 0.05], rw: [0.53, 0.28],
  ls: [0.45, -0.2], le: [0.47, 0.04], lw: [0.5, 0.28],
  rh: [0.02, 0], rk: [-0.3, 0.13], ra: [-0.62, 0.25],
  lh: [-0.02, 0], lk: [-0.32, 0.13], la: [-0.64, 0.25],
};
const DOWN = {
  ...UP,
  head: [0.72, 0.11], neck: [0.58, 0.13], hip: [0, 0.19],
  rs: [0.56, 0.14], re: [0.36, 0.1], rw: [0.53, 0.28],
  ls: [0.53, 0.13], le: [0.33, 0.09], lw: [0.5, 0.28],
  rh: [0.02, 0.19], rk: [-0.3, 0.22], lh: [-0.02, 0.19], lk: [-0.32, 0.22],
};

// ---------- Camera detector ----------
// Side-on. Only counts while your body is horizontal; depth from elbow bend.
class PushupDetector {
  constructor() {
    this.depth = 0;
    this.down = false;
    this.inPlank = false;
  }

  update(pose, dt) {
    const events = [];
    const im = pose?.image, w = pose?.world;
    if (im && seen(im, 11, 12, 23, 24)) {
      const S = mid(im[11], im[12]);
      const A = seen(im, 27, 28) ? mid(im[27], im[28]) : seen(im, 25, 26) ? mid(im[25], im[26]) : null;
      if (A) this.inPlank = Math.abs(A.y - S.y) < 0.6 * Math.abs(A.x - S.x);
      const arms = [[11, 13, 15], [12, 14, 16]].filter((ix) => seen(w, ...ix));
      if (arms.length && this.inPlank) {
        const ang = arms.reduce((s, [a, b, c]) => s + angleAt(w[a], w[b], w[c]), 0) / arms.length;
        this.depth = damp(this.depth, clamp((165 - ang) / 80), 18, dt);
      }
    }
    if (!this.inPlank) this.depth = damp(this.depth, 0, 6, dt);
    if (!this.down && this.depth > 0.6) this.down = true;
    else if (this.down && this.depth < 0.2) {
      this.down = false;
      events.push({ type: "push" });
    }
    return { depth: this.depth, inPlank: this.inPlank, events };
  }
}

// ---------- Scene ----------
const FULL = 8;

class CastleScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.depth = 0;
    this.air = 0;
    this.airShown = 0;
    this.pushes = 0;
    this.castles = 0;
    this.party = 0;
    this.penguins = [];
    this.inPlank = true;
  }

  onResize() {
    this.ground = this.H * 0.86;
    this.fig = Math.min(this.H * 0.32, (this.W - this.inset) * 0.26);
    this.px = this.inset + (this.W - this.inset) * 0.32;
    this.castleX = this.inset + (this.W - this.inset) * 0.74;
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.depth = damp(this.depth, signal.depth ?? 0, 20, dt);
    this.inPlank = signal.inPlank ?? true;
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "push" || this.party > 0) continue;
      this.pushes++;
      this.air = Math.min(FULL, this.air + 1);
      sfx.pop();
      if (this.air >= FULL) this.startParty();
    }
    this.airShown = damp(this.airShown, this.air, 5, dt);
    if (this.party > 0) {
      this.party -= dt;
      for (const p of this.penguins) {
        p.vy += 1800 * dt;
        p.y += p.vy * dt;
        if (p.y > 0) {
          p.y = 0;
          p.vy = -(500 + Math.random() * 300);
        }
      }
      if (this.party <= 0) {
        this.air = 0;
        this.penguins = [];
        this.fx.word("NEXT CASTLE!", this.castleX, this.topY, { size: this.fig * 0.13, color: "#fff" });
      }
    }
  }

  startParty() {
    this.castles++;
    this.party = 4;
    this.penguins = Array.from({ length: 4 }, (_, i) => ({ dx: (i - 1.5) * 0.28, y: -i * 30, vy: -600 }));
    this.fx.word("PARTY TIME!", this.castleX, this.topY, { size: this.fig * 0.16, color: "#ffe082", life: 1.5 });
    this.fx.burst(this.castleX, this.ground - this.fig * 0.8, { count: 60, colors: ["#ff4081", "#40c4ff", "#ffee58", "#69f0ae"], speed: 500, gravity: 500, size: 5, shape: "rect", life: 1.6 });
    sfx.ding();
  }

  draw() {
    const ctx = this.begin();
    const { W, H, ground, fig, px, castleX } = this;

    // Sunny backyard.
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#81d4fa");
    sky.addColorStop(1, "#e1f5fe");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = "#fff8e1";
    for (let x = -10; x < W; x += 36) ctx.fillRect(x, ground - fig * 0.55, 26, fig * 0.55);
    ctx.fillRect(-10, ground - fig * 0.45, W + 20, 8);
    ctx.fillStyle = "#7cb342";
    ctx.fillRect(-20, ground, W + 40, H - ground + 20);

    // Bouncy castle, inflating with every push-up.
    const k = this.airShown / FULL;
    const wob = Math.sin(this.time * 8) * 0.02 * k + (this.party > 0 ? Math.sin(this.time * 20) * 0.03 : 0);
    const cw = fig * 1.1 * (0.35 + 0.65 * k), ch = fig * 0.9 * (0.15 + 0.85 * k) * (1 + wob);
    const cxL = castleX - cw / 2, cyT = ground - ch;
    const colors = ["#e53935", "#1e88e5", "#fdd835"];
    ctx.fillStyle = colors[this.castles % 3];
    ctx.beginPath();
    ctx.roundRect(cxL, cyT + ch * 0.35, cw, ch * 0.65, cw * 0.06);
    ctx.fill();
    for (const [tx, tw] of [[0, 0.22], [0.78, 0.22]]) {
      ctx.fillStyle = colors[(this.castles + 1) % 3];
      ctx.beginPath();
      ctx.roundRect(cxL + tx * cw, cyT, tw * cw, ch, cw * 0.05);
      ctx.fill();
      ctx.fillStyle = colors[(this.castles + 2) % 3];
      ctx.beginPath();
      ctx.arc(cxL + (tx + tw / 2) * cw, cyT, tw * cw * 0.55, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(cxL + cw * 0.3, cyT + ch * 0.5, cw * 0.4, ch * 0.45);
    for (const p of this.penguins) this.drawPenguin(castleX + p.dx * cw, cyT + ch * 0.5 + p.y * 0.25, fig * 0.14);

    // The pump (under your chest) and its hose.
    const squeeze = clamp(this.depth);
    const pumpX = px + fig * 0.3, pumpH = fig * (0.2 - squeeze * 0.12);
    ctx.strokeStyle = "#455a64";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(pumpX + fig * 0.1, ground - pumpH * 0.4);
    ctx.bezierCurveTo(pumpX + fig * 0.6, ground + 20, castleX - cw * 0.8, ground + 20, cxL, ground - ch * 0.2);
    ctx.stroke();
    ctx.fillStyle = "#26a69a";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.roundRect(pumpX - fig * 0.12, ground - pumpH * ((i + 1) / 4), fig * 0.24, pumpH / 4 - 2, 4);
      ctx.fill();
    }

    // You.
    const p = this.auto && this.pose ? this.pose : mix(UP, DOWN, easeInOut(clamp(this.depth)));
    floorShadow(ctx, px, ground, fig * 0.7, fig * 0.05, 0.35);
    drawFigure(ctx, p, px, ground - 0.28 * fig, fig, LOOKS.pusher);
    if (!this.inPlank && !this.auto) comicText(ctx, "GET INTO PUSH-UP POSITION", this.cx, this.topY + fig * 0.2, fig * 0.1, "#fff");

    // Air gauge.
    comicText(ctx, `${Math.round(k * 100)}%`, castleX, ground - fig * 1.15, fig * 0.14, "#ffffff");
    vignette(ctx, W, H, 0.2);
    this.fx.draw(ctx);
  }

  drawPenguin(x, y, s) {
    const { ctx } = this;
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.5, s * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fafafa";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.1, s * 0.32, s * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ff9800";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.1, y - s * 0.3);
    ctx.lineTo(x + s * 0.1, y - s * 0.3);
    ctx.lineTo(x, y - s * 0.15);
    ctx.fill();
    ctx.fillStyle = "#fff";
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + k * s * 0.14, y - s * 0.45, s * 0.08, 0, TAU);
      ctx.fill();
    }
  }

  hud() {
    return `Push-ups ${this.pushes} · Castles inflated ${this.castles}`;
  }

  stats() {
    return { pushes: this.pushes, castles: this.castles };
  }
}

export const pushup = {
  id: "pushup",
  name: "Push-ups",
  world: "Castle Pump",
  color: "#ff7043",
  view: "plank",
  frame: { x0: -0.72, x1: 0.82, y0: -0.36, y1: 0.34 },
  floor: 0.29,
  met: 8,
  blurb: "Every push-up squeezes the air pump under your chest. Fill the bouncy castle and the penguins party.",
  say: "Push-ups! Chest down, push up. Pump up that castle.",
  repEvent: "push",
  summary: (st) => `${st.pushes ?? 0} push-ups · ${st.castles ?? 0} castles inflated`,

  // One push-up every two beats; top of the push on the beat.
  coach(t, tempo) {
    const len = 1.8 / tempo;
    const i = Math.floor(t / len);
    const f = (t % len) / len;
    let d;
    if (f < 0.45) d = easeInOut(f / 0.45);
    else if (f < 0.5) d = 1;
    else if (f < 0.8) d = 1 - easeInOut((f - 0.5) / 0.3);
    else d = 0;
    return {
      pose: mix(UP, DOWN, d),
      signal: { depth: d, inPlank: true },
      count: i + (f >= 0.75 ? 1 : 0),
      cue: f < 0.5 ? "CHEST DOWN" : "PUSH UP!",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "push" }),
  createDetector: () => new PushupDetector(),
  createScene: (canvas, opts) => new CastleScene(canvas, opts),
};
