// Curtsy Lunges → Royal Court. Curtsy before the King and Queen; they score
// every one. Deeper curtsies, better scores.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawFigure, floorShadow, mirror, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut } from "../util.js";
import { vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view) ----------
const STAND = pose(FRONT, { le: [-0.24, -0.34], lw: [-0.3, -0.12], re: [0.24, -0.34], rw: [0.3, -0.12] });
// Left leg sweeps behind to the right, both knees bend, a little bow.
const CURTSY_L = {
  back: null,
  head: [0.03, -0.6], neck: [0.02, -0.44], hip: [0.02, 0.14],
  ls: [-0.12, -0.41], le: [-0.3, -0.22], lw: [-0.42, -0.02],
  rs: [0.16, -0.41], re: [0.36, -0.22], rw: [0.46, -0.02],
  lh: [-0.06, 0.14], lk: [0.12, 0.42], la: [0.3, 0.56],
  rh: [0.1, 0.14], rk: [0.15, 0.36], ra: [0.11, 0.6],
};
const CURTSY_R = mirror(CURTSY_L);

// ---------- Camera detector ----------
// A curtsy = hips drop (vs standing, in torso lengths) while the ankles cross.
class CurtsyDetector {
  constructor(calib) {
    this.calib = calib;
    this.baseHipY = calib?.hipY ?? null;
    this.depth = 0;
    this.down = false;
    this.side = null;
    this.base = null;
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m?.hip) {
      const im = m.im;
      this.baseHipY ??= m.hip.y;
      const torso = this.calib?.torso ?? m.torso;
      const raw = clamp((m.hip.y - this.baseHipY) / (torso * 0.4));
      this.depth = damp(this.depth, raw, 15, dt);
      if (raw < 0.1 && !this.down) this.baseHipY = damp(this.baseHipY, m.hip.y, 0.6, dt);
      const ankles = (im[27].visibility ?? 1) > 0.5 && (im[28].visibility ?? 1) > 0.5;
      if (ankles && raw < 0.1) this.base = { l: im[27].x, r: im[28].x };
      const crossed = ankles && im[27].x - im[28].x < 0.02; // person's left ankle normally sits image-right
      if (!this.down && this.depth > 0.45 && (crossed || this.depth > 0.7)) {
        this.down = true;
        let side = "left";
        if (this.base && ankles) side = Math.abs(im[27].x - this.base.l) >= Math.abs(im[28].x - this.base.r) ? "left" : "right";
        events.push({ type: "curtsy", side, strength: this.depth });
      } else if (this.down && this.depth < 0.15) this.down = false;
    }
    return { depth: this.depth, side: this.side, events };
  }
}

// ---------- Scene ----------
const PRAISE = ["Splendid!", "Most elegant!", "Jolly good!", "One is impressed.", "Bravo!", "Divine!", "Marvellous!"];

class RoyalScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.depth = 0;
    this.side = "left";
    this.curtsies = 0;
    this.scores = [];
    this.card = { t: 0, score: "" };
    this.clap = 0;
    this.crown = 0;
    this.corgi = null;
  }

  onResize() {
    this.floorY = this.H * 0.62;
    this.fig = Math.min(this.H * 0.34, (this.W - this.inset) * 0.28);
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.depth = damp(this.depth, signal.depth ?? 0, 15, dt);
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "curtsy") continue;
      this.side = e.side;
      this.curtsies++;
      const score = Math.min(10, 8 + clamp(e.strength ?? 1) * 1.6 + Math.random() * 0.5);
      this.scores.push(score);
      this.card = { t: 1.6, score: score.toFixed(1) };
      this.clap = 1.2;
      if (this.curtsies % 4 === 0) this.crown = 1;
      if (this.curtsies % 6 === 3) this.corgi = { x: this.inset - 60, t: 0 };
      this.fx.word(PRAISE[this.curtsies % PRAISE.length], this.cx, this.H * 0.26, { size: this.fig * 0.18, color: "#ffe082", life: 1.4 });
      sfx.ding();
    }
    this.card.t = Math.max(0, this.card.t - dt);
    this.clap = Math.max(0, this.clap - dt);
    this.crown = Math.max(0, this.crown - dt * 1.5);
    if (this.corgi) {
      this.corgi.t += dt;
      this.corgi.x += 420 * dt;
      if (this.corgi.x > this.W + 80) this.corgi = null;
    }
  }

  draw() {
    const ctx = this.begin();
    const { W, H, floorY, fig, cx } = this;

    // Throne room: deep crimson walls, tall windows pouring light.
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, "#3a0d18");
    wall.addColorStop(1, "#7b1e2f");
    ctx.fillStyle = wall;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const span = W - this.inset;
    for (let i = 0; i < 4; i++) {
      const wx = this.inset + span * (0.12 + i * 0.25), ww = span * 0.08, wy = H * 0.08, wh = floorY * 0.62;
      const win = ctx.createLinearGradient(0, wy, 0, wy + wh);
      win.addColorStop(0, "#fff3d1");
      win.addColorStop(1, "#e6b86a");
      ctx.fillStyle = win;
      ctx.beginPath();
      ctx.moveTo(wx - ww / 2, wy + wh);
      ctx.lineTo(wx - ww / 2, wy + ww / 2);
      ctx.arc(wx, wy + ww / 2, ww / 2, Math.PI, 0);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.fill();
      ctx.fillStyle = "rgba(255,236,190,0.07)";
      ctx.beginPath();
      ctx.moveTo(wx - ww / 2, wy + ww / 2);
      ctx.lineTo(wx + ww / 2, wy + ww / 2);
      ctx.lineTo(wx + ww * 2.5, H);
      ctx.lineTo(wx - ww * 0.5, H);
      ctx.fill();
    }
    // Gold columns.
    for (const px of [this.inset + span * 0.02, W - span * 0.06]) {
      const cg = ctx.createLinearGradient(px, 0, px + span * 0.05, 0);
      cg.addColorStop(0, "#b8860b");
      cg.addColorStop(0.4, "#ffe08a");
      cg.addColorStop(1, "#8a6508");
      ctx.fillStyle = cg;
      ctx.fillRect(px, 0, span * 0.05, floorY);
    }

    // Marble floor + red carpet in perspective.
    const fl = ctx.createLinearGradient(0, floorY, 0, H);
    fl.addColorStop(0, "#d9d2c5");
    fl.addColorStop(1, "#9e958a");
    ctx.fillStyle = fl;
    ctx.fillRect(-20, floorY, W + 40, H - floorY + 20);
    ctx.strokeStyle = "rgba(90,80,70,0.25)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const y = floorY + (H - floorY) * (i / 8) ** 1.7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let k = -8; k <= 8; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + k * span * 0.06, floorY);
      ctx.lineTo(cx + k * span * 0.2, H);
      ctx.stroke();
    }
    const refl = ctx.createLinearGradient(0, floorY, 0, floorY + (H - floorY) * 0.5);
    refl.addColorStop(0, "rgba(255,236,190,0.25)");
    refl.addColorStop(1, "rgba(255,236,190,0)");
    ctx.fillStyle = refl;
    ctx.fillRect(-20, floorY, W + 40, H - floorY);
    const carpet = ctx.createLinearGradient(0, floorY, 0, H);
    carpet.addColorStop(0, "#7d1322");
    carpet.addColorStop(1, "#b3263a");
    ctx.fillStyle = carpet;
    ctx.beginPath();
    ctx.moveTo(cx - span * 0.08, floorY);
    ctx.lineTo(cx + span * 0.08, floorY);
    ctx.lineTo(cx + span * 0.28, H);
    ctx.lineTo(cx - span * 0.28, H);
    ctx.fill();
    ctx.strokeStyle = "#e0b84a";
    ctx.lineWidth = 3;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + k * span * 0.075, floorY);
      ctx.lineTo(cx + k * span * 0.265, H);
      ctx.stroke();
    }

    // The royals on their thrones.
    const rs = fig * 0.62;
    this.drawRoyal(cx - span * 0.13, floorY, rs, "queen");
    this.drawRoyal(cx + span * 0.13, floorY, rs, "king");

    // You, curtsying on the carpet (seen from behind).
    const p = this.auto && this.pose ? this.pose : mix(STAND, this.side === "right" ? CURTSY_R : CURTSY_L, clamp(this.depth));
    const fy = H * 0.97 - 0.6 * fig;
    floorShadow(ctx, cx, H * 0.97, fig * 0.4, fig * 0.07);
    drawFigure(ctx, p, cx, fy, fig, LOOKS.royal);

    if (this.corgi) this.drawCorgi(this.corgi.x, floorY + (H - floorY) * 0.35, fig * 0.35, this.corgi.t);

    vignette(ctx, W, H, 0.4);
    this.fx.draw(ctx);
  }

  drawRoyal(x, floorY, s, who) {
    const { ctx } = this;
    const queen = who === "queen";
    // Throne.
    const tg = ctx.createLinearGradient(x - s * 0.5, 0, x + s * 0.5, 0);
    tg.addColorStop(0, "#9c7412");
    tg.addColorStop(0.5, "#ffd54f");
    tg.addColorStop(1, "#8a6508");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.5, floorY - s * 1.9, s, s * 1.9, [s * 0.5, s * 0.5, s * 0.05, s * 0.05]);
    ctx.fill();
    ctx.fillStyle = "#6a1b2a";
    ctx.beginPath();
    ctx.roundRect(x - s * 0.38, floorY - s * 1.72, s * 0.76, s * 1.3, [s * 0.38, s * 0.38, 0, 0]);
    ctx.fill();
    // Robe.
    const robe = ctx.createLinearGradient(x - s * 0.4, 0, x + s * 0.4, 0);
    robe.addColorStop(0, queen ? "#7b1fa2" : "#c62828");
    robe.addColorStop(1, queen ? "#4a148c" : "#7f1414");
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.12, floorY - s * 1.08);
    ctx.quadraticCurveTo(x - s * 0.34, floorY - s * 1.06, x - s * 0.33, floorY - s * 0.85);
    ctx.lineTo(x - s * 0.44, floorY);
    ctx.lineTo(x + s * 0.44, floorY);
    ctx.lineTo(x + s * 0.33, floorY - s * 0.85);
    ctx.quadraticCurveTo(x + s * 0.34, floorY - s * 1.06, x + s * 0.12, floorY - s * 1.08);
    ctx.fill();
    // Ermine trim down the front, gold buttons.
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(x - s * 0.05, floorY - s * 1.0, s * 0.1, s * 1.0);
    ctx.fillStyle = "#212121";
    for (let k = 0; k < 5; k++) ctx.fillRect(x - s * 0.012, floorY - s * (0.9 - k * 0.18), s * 0.024, s * 0.05);
    // Sleeves toward the hands.
    ctx.strokeStyle = robe;
    ctx.lineCap = "round";
    ctx.lineWidth = s * 0.12;
    const handY = floorY - s * 0.72;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + k * s * 0.3, floorY - s * 0.95);
      ctx.quadraticCurveTo(x + k * s * 0.36, handY + s * 0.05, x + k * s * 0.12, handY);
      ctx.stroke();
    }
    // Ermine collar.
    ctx.fillStyle = "#fafafa";
    ctx.beginPath();
    ctx.ellipse(x, floorY - s * 1.04, s * 0.27, s * 0.08, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#212121";
    for (const dx of [-0.16, -0.05, 0.07, 0.17]) ctx.fillRect(x + dx * s, floorY - s * 1.06, s * 0.02, s * 0.04);
    // Head.
    const hy = floorY - s * 1.25;
    const skin = ctx.createRadialGradient(x - s * 0.05, hy - s * 0.05, 0, x, hy, s * 0.2);
    skin.addColorStop(0, "#ffe0c7");
    skin.addColorStop(1, "#d9a07a");
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(x, hy, s * 0.15, s * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = queen ? "#e0e0e0" : "#5d4037";
    ctx.beginPath();
    ctx.ellipse(x, hy - s * 0.1, s * 0.17, s * 0.1, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#3e2723";
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + k * s * 0.055, hy - s * 0.01, s * 0.018, 0, TAU);
      ctx.fill();
    }
    if (!queen) {
      ctx.fillStyle = "#5d4037"; // grand moustache
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + k * s * 0.06, hy + s * 0.07, s * 0.07, s * 0.025, k * 0.3, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(233,30,99,0.35)";
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x + k * s * 0.09, hy + s * 0.05, s * 0.035, 0, TAU);
        ctx.fill();
      }
    }
    // Crown (the King's hops off when he's really impressed).
    const hop = !queen ? Math.sin(this.crown * Math.PI) * s * 0.35 : 0;
    const cy = hy - s * 0.2 - hop;
    const cg = ctx.createLinearGradient(0, cy - s * 0.16, 0, cy);
    cg.addColorStop(0, "#fff59d");
    cg.addColorStop(1, "#f9a825");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.13, cy);
    for (let i = 0; i <= 4; i++) {
      ctx.lineTo(x - s * 0.13 + i * s * 0.065, cy - (i % 2 ? s * 0.08 : s * 0.16));
    }
    ctx.lineTo(x + s * 0.13, cy);
    ctx.fill();
    ctx.fillStyle = "#e53935";
    ctx.beginPath();
    ctx.arc(x, cy - s * 0.05, s * 0.022, 0, TAU);
    ctx.fill();
    // Hands: the King claps; the Queen raises a score card.
    const clapGap = this.clap > 0 ? Math.abs(Math.sin(this.clap * 14)) * s * 0.12 : s * 0.1;
    ctx.fillStyle = "#ffe0c7";
    if (!queen) {
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x + k * (clapGap / 2 + s * 0.02), floorY - s * 0.72, s * 0.05, 0, TAU);
        ctx.fill();
      }
    } else if (this.card.t > 0) {
      const up = Math.min(1, this.card.t * 3);
      const cx = x + s * 0.35, cyc = floorY - s * (0.8 + 0.6 * up);
      ctx.fillStyle = "#6d4c41";
      ctx.fillRect(cx - s * 0.015, cyc, s * 0.03, s * 0.5);
      ctx.fillStyle = "#fffdf5";
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.2, cyc - s * 0.3, s * 0.4, s * 0.3, s * 0.03);
      ctx.fill();
      ctx.fillStyle = "#1a237e";
      ctx.font = `${s * 0.2}px Anton, Impact, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.card.score, cx, cyc - s * 0.15);
    }
  }

  drawCorgi(x, y, s, t) {
    const { ctx } = this;
    const bob = Math.abs(Math.sin(t * 18)) * s * 0.06;
    ctx.save();
    ctx.translate(x, y - bob);
    ctx.fillStyle = "#e08a3c";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.45, s * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff3e0";
    ctx.beginPath();
    ctx.ellipse(s * 0.1, s * 0.08, s * 0.25, s * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#e08a3c";
    ctx.beginPath();
    ctx.arc(s * 0.45, -s * 0.12, s * 0.16, 0, TAU);
    ctx.fill();
    for (const k of [0.36, 0.52]) {
      ctx.beginPath();
      ctx.moveTo(s * k, -s * 0.22);
      ctx.lineTo(s * (k + 0.05), -s * 0.42);
      ctx.lineTo(s * (k + 0.1), -s * 0.22);
      ctx.fill();
    }
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(s * 0.52, -s * 0.14, s * 0.025, 0, TAU);
    ctx.arc(s * 0.61, -s * 0.08, s * 0.03, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#8d4f1c";
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = "round";
    for (const k of [-0.28, -0.1, 0.18, 0.32]) {
      const sw = Math.sin(t * 20 + k * 9) * s * 0.06;
      ctx.beginPath();
      ctx.moveTo(k * s, s * 0.12);
      ctx.lineTo(k * s + sw, s * 0.26);
      ctx.stroke();
    }
    ctx.restore();
    if (Math.sin(t * 6) > 0.97) this.fx.word("YIP!", x + s * 0.5, y - s * 0.6, { size: s * 0.3, color: "#fff", life: 0.5 });
  }

  hud() {
    const avg = this.scores.length ? this.scores.reduce((a, b) => a + b, 0) / this.scores.length : 0;
    return `Curtsies ${this.curtsies} · Royal score ${avg ? avg.toFixed(1) : "–"}`;
  }

  stats() {
    return { curtsies: this.curtsies, scoreSum: this.scores.reduce((a, b) => a + b, 0) };
  }
}

export const curtsy = {
  id: "curtsy",
  name: "Curtsy Lunges",
  world: "Royal Court",
  color: "#ce93d8",
  view: "front",
  met: 5,
  blurb: "Sweep one leg behind and curtsy before the King and Queen. They score every one.",
  say: "Curtsy lunges. The King and Queen are watching.",
  repEvent: "curtsy",
  summary: (st) => `${st.curtsies ?? 0} curtsies · royal average ${st.curtsies ? (st.scoreSum / st.curtsies).toFixed(1) : "–"}`,

  // One curtsy per bar; the bottom lands on beat 3.
  coach(t, tempo) {
    const len = 2.4 / tempo;
    const i = Math.floor(t / len);
    const f = (t % len) / len;
    const side = i % 2 ? "right" : "left";
    const target = side === "left" ? CURTSY_L : CURTSY_R;
    let e;
    if (f < 0.45) e = easeInOut(f / 0.45);
    else if (f < 0.55) e = 1;
    else if (f < 0.92) e = 1 - easeInOut((f - 0.55) / 0.37);
    else e = 0;
    return {
      pose: mix(STAND, target, e),
      signal: { depth: e },
      count: i + (f >= 0.5 ? 1 : 0),
      cue: f < 0.55 ? (side === "left" ? "LEFT LEG BACK" : "RIGHT LEG BACK") : "AND RISE",
      beat: (4 * t) / len,
      bpm: 240 / len,
    };
  },
  event: (k) => ({ type: "curtsy", side: k % 2 ? "right" : "left", strength: 0.9 }),
  createDetector: (calib) => new CurtsyDetector(calib),
  createScene: (canvas, opts) => new RoyalScene(canvas, opts),
};
