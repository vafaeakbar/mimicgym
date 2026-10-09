// Side Slaps → Jelly Slap. Wide arm swings across the body smack a very
// wobbly jelly from alternating sides.
import { Scene } from "../scene.js";
import { FRONT, mirror, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, easeOut, lerp, seen } from "../util.js";
import { measure } from "./body.js";
import { drawGlove, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";

// ---------- Coach (front view) ----------
const NEUTRAL = pose(FRONT, {
  le: [-0.22, -0.36], lw: [-0.12, -0.52], re: [0.22, -0.36], rw: [0.12, -0.52],
  lk: [-0.13, 0.3], la: [-0.17, 0.6], rk: [0.13, 0.3], ra: [0.17, 0.6],
});
const WIND_R = pose(NEUTRAL, { re: [0.38, -0.6], rw: [0.56, -0.72], neck: [0.02, -0.6], head: [0.03, -0.77] });
const THRU_R = pose(NEUTRAL, { re: [0.05, -0.46], rw: [-0.2, -0.52], neck: [-0.03, -0.6], head: [-0.05, -0.77] });
const WIND_L = mirror(WIND_R);
const THRU_L = mirror(THRU_R);

// ---------- Camera detector ----------
// Works in image space, where sideways swings are measured most reliably.
// "out" = wrist position along the shoulder line: 1 at the shoulder, >1 wound
// out to the side, <0 swung across the body.
class SlapDetector {
  constructor() {
    this.t = 0;
    this.arms = { left: { h: 0.35, woundAt: -9 }, right: { h: 0.35, woundAt: -9 } };
  }

  update(pose, dt) {
    this.t += dt;
    const events = [];
    const m = pose && measure(pose);
    if (m) {
      const bottom = m.hip ? m.hip.y - 0.1 * m.torso : m.sh.y + 0.8 * m.torso;
      for (const [side, si, wi] of [["left", 11, 15], ["right", 12, 16]]) {
        if (!seen(m.im, si, wi)) continue;
        const sx = m.im[si].x - m.sh.x;
        if (Math.abs(sx) < 0.01) continue;
        const out = (m.im[wi].x - m.sh.x) / sx;
        const wy = m.im[wi].y;
        const raised = wy < bottom && wy > m.sh.y - 0.9 * m.torso;
        const a = this.arms[side];
        a.h = damp(a.h, raised ? clamp((2.2 - out) / 2.4) : 0.35, 25, dt);
        if (raised && out > 1.6) a.woundAt = this.t;
        const since = this.t - a.woundAt;
        if (out < 0.25 && since < 0.8) {
          a.woundAt = -9;
          events.push({ type: "slap", side, strength: since < 0.35 ? 1.3 : 0.9 });
        }
      }
    }
    return { left: this.arms.left.h, right: this.arms.right.h, events };
  }
}

// ---------- Scene ----------
const FLAVORS = ["#ff4d6d", "#4dabf7", "#69db7c", "#ffa94d", "#b197fc", "#ffd43b"];
const WORDS = ["SMACK!", "WHAP!", "SLAP!", "BOING!", "THWACK!", "WOBBLE!"];

class JellyScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.off = { x: 0, v: 0 };
    this.sq = { x: 0, v: 0 };
    this.ouch = 0;
    this.prints = [];
    this.recent = [];
    this.slaps = 0;
    this.flavor = Math.floor(Math.random() * FLAVORS.length);
    this.flavors = 1;
    this.hands = { left: 0.35, right: 0.35 };
  }

  onResize() {
    this.tableY = this.H * 0.8;
    this.bw = Math.min((this.W - this.inset) * 0.42, this.H * 0.5);
    this.bh = this.bw * 0.92;
  }

  slap(side, strength) {
    const dir = side === "right" ? -1 : 1;
    this.slaps++;
    this.off.v += dir * strength * 5.5;
    this.sq.v -= 3 * strength;
    this.ouch = 0.55;
    this.prints.push({ side, age: 0 });
    this.recent.push(this.time);
    const hitX = this.cx - dir * this.bw * 0.42;
    const hitY = this.tableY - this.bh * 0.5;
    this.fx.burst(hitX, hitY, { count: 10, colors: ["#fff59d", "#ffffff"], speed: 380, gravity: 200, size: 9, shape: "star" });
    this.fx.burst(hitX, hitY, { count: 8, colors: [FLAVORS[this.flavor]], speed: 300, gravity: 800, size: 6, shape: "blob" });
    this.fx.word(WORDS[Math.floor(Math.random() * WORDS.length)], hitX, hitY - this.bh * 0.55, { size: this.bw * 0.2 });
    this.fx.kick(8 * strength);
    sfx.smack();
    if (this.slaps % 12 === 0) {
      this.flavor = (this.flavor + 1) % FLAVORS.length;
      this.flavors++;
      this.fx.word("NEW FLAVOR!", this.cx, this.tableY - this.bh * 1.25, { size: this.bw * 0.16, color: "#fff", life: 1.4 });
      sfx.boing();
    }
  }

  update(dt, signal) {
    this.step(dt);
    for (const e of signal.events) if (e.type === "slap") this.slap(e.side, e.strength);
    for (const side of ["left", "right"]) this.hands[side] = damp(this.hands[side], signal[side] ?? 0.35, 30, dt);

    this.off.v += (-55 * this.off.x - 4 * this.off.v) * dt;
    this.off.x += this.off.v * dt;
    this.sq.v += (-90 * this.sq.x - 6 * this.sq.v) * dt;
    this.sq.x += this.sq.v * dt;
    this.ouch = Math.max(0, this.ouch - dt);
    for (const p of this.prints) p.age += dt;
    this.prints = this.prints.filter((p) => p.age < 1.4);
    this.recent = this.recent.filter((t) => this.time - t < 2.5);
  }

  draw() {
    const ctx = this.begin();
    const { W, H, cx, tableY, bw, bh } = this;

    // Evening dinner party: warm wall, soft bokeh fairy lights.
    const wall = ctx.createLinearGradient(0, 0, 0, tableY);
    wall.addColorStop(0, "#3b2340");
    wall.addColorStop(1, "#7a3b52");
    ctx.fillStyle = wall;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    for (let i = 0; i < 26; i++) {
      const bx = ((i * 137.5) % 100) / 100 * W, by = (((i * 61) % 55) / 100 + 0.04) * tableY;
      const hue = ["255,214,120", "255,160,190", "180,220,255"][i % 3];
      glow(ctx, bx, by, 18 + (i % 4) * 10, `rgba(${hue},0.55)`);
    }
    ctx.strokeStyle = "rgba(255,230,180,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, tableY * 0.12 + Math.sin(x / 90) * 18);
    ctx.stroke();
    // Checked tablecloth.
    ctx.fillStyle = "#f3ede4";
    ctx.fillRect(-20, tableY, W + 40, H - tableY + 20);
    ctx.fillStyle = "rgba(160,40,50,0.35)";
    const c = 36;
    for (let y = tableY; y < H; y += c) {
      for (let x = ((y - tableY) / c) % 2 ? c : 0; x < W; x += c * 2) ctx.fillRect(x, y, c, c);
    }

    // Plate.
    ctx.fillStyle = "#eceff1";
    ctx.strokeStyle = "#90a4ae";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, tableY + 6, bw * 0.72, bw * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Jelly body, skewed by the spring and squashed on impact.
    const skew = clamp(this.off.x, -1.3, 1.3) * bw * 0.5;
    const sy = 1 + this.sq.x * 0.25;
    const sx = 1 - this.sq.x * 0.15;
    const color = FLAVORS[this.flavor];
    ctx.save();
    ctx.translate(cx, tableY);
    ctx.scale(sx, sy);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-bw / 2, 0);
      ctx.bezierCurveTo(-bw * 0.55 + skew * 0.3, -bh * 0.5, -bw * 0.45 + skew * 0.8, -bh * 0.9, -bw * 0.33 + skew, -bh);
      ctx.quadraticCurveTo(skew, -bh * 1.12, bw * 0.33 + skew, -bh);
      ctx.bezierCurveTo(bw * 0.45 + skew * 0.8, -bh * 0.9, bw * 0.55 + skew * 0.3, -bh * 0.5, bw / 2, 0);
      ctx.quadraticCurveTo(0, bh * 0.05, -bw / 2, 0);
      ctx.closePath();
    };
    const g = ctx.createLinearGradient(-bw / 2, -bh, bw / 2, 0);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.25, color);
    g.addColorStop(1, color);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = g;
    path();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Mould ridges + shine.
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = bw * 0.03;
    for (const k of [-0.2, 0.2]) {
      ctx.beginPath();
      ctx.moveTo(k * bw, -bh * 0.05);
      ctx.quadraticCurveTo(k * bw + skew * 0.4, -bh * 0.5, k * bw * 0.8 + skew * 0.95, -bh * 0.97);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.ellipse(-bw * 0.22 + skew * 0.85, -bh * 0.8, bw * 0.07, bh * 0.12, -0.4, 0, TAU);
    ctx.fill();

    // Handprints on the cheek that got slapped.
    for (const p of this.prints) {
      const side = p.side === "right" ? 1 : -1;
      ctx.globalAlpha = 0.55 * (1 - p.age / 1.4);
      ctx.fillStyle = "#d50000";
      const hx = side * bw * 0.27 + skew * 0.55, hy = -bh * 0.42, r = bw * 0.06;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, TAU);
      for (let f = 0; f < 4; f++) {
        const fx = hx - side * r * 0.2 + (f - 1.5) * r * 0.55;
        ctx.moveTo(fx + r * 0.22, hy - r * 1.4);
        ctx.ellipse(fx, hy - r * 1.4, r * 0.22, r * 0.55, 0, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Face.
    const fx = skew * 0.6, ey = -bh * 0.6;
    const dizzy = this.recent.length >= 5;
    ctx.strokeStyle = "#1d1d1d";
    ctx.fillStyle = "#1d1d1d";
    ctx.lineWidth = bw * 0.022;
    ctx.lineCap = "round";
    for (const k of [-1, 1]) {
      const x = fx + k * bw * 0.13;
      if (dizzy) {
        ctx.beginPath();
        for (let a = 0; a < TAU * 2; a += 0.3) {
          const r = (a / (TAU * 2)) * bw * 0.06;
          ctx.lineTo(x + Math.cos(a + this.time * 8) * r, ey + Math.sin(a + this.time * 8) * r);
        }
        ctx.stroke();
      } else if (this.ouch > 0) {
        const r = bw * 0.04;
        ctx.beginPath();
        ctx.moveTo(x - r, ey - r * k * -1);
        ctx.lineTo(x + r * 0.2 * k, ey);
        ctx.lineTo(x - r, ey + r * k * -1);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, ey, bw * 0.055, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1d1d1d";
        ctx.beginPath();
        ctx.arc(x + skew * 0.05, ey + bw * 0.01, bw * 0.025, 0, TAU);
        ctx.fill();
      }
    }
    const my = -bh * 0.4;
    ctx.beginPath();
    if (this.ouch > 0) ctx.ellipse(fx, my, bw * 0.06, bw * 0.08, 0, 0, TAU);
    else if (dizzy) {
      for (let i = 0; i <= 8; i++) ctx.lineTo(fx - bw * 0.1 + i * bw * 0.025, my + Math.sin(i * 1.6 + this.time * 10) * bw * 0.015);
    } else ctx.arc(fx, my - bw * 0.03, bw * 0.08, 0.2 * Math.PI, 0.8 * Math.PI);
    if (this.ouch > 0) ctx.fill();
    else ctx.stroke();
    ctx.restore();

    // Spinning stars when dizzy.
    if (dizzy) {
      ctx.fillStyle = "#ffe14d";
      for (let i = 0; i < 4; i++) {
        const a = this.time * 4 + (i * TAU) / 4;
        const x = cx + skew * sx + Math.cos(a) * bw * 0.4;
        const y = tableY - bh * sy * 1.12 + Math.sin(a) * bw * 0.08;
        ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const aa = -Math.PI / 2 + (j * Math.PI) / 5, r = j % 2 ? 6 : 14;
          ctx.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
        }
        ctx.fill();
      }
    }

    // Gloves follow each arm's swing.
    const handY = tableY - bh * 0.48;
    const gs = bw * 0.28;
    const lx = lerp(this.inset + gs, cx - bw * 0.52 - gs * 0.3, clamp(this.hands.left) ** 1.5);
    const rx = lerp(W - gs, cx + bw * 0.52 + gs * 0.3, clamp(this.hands.right) ** 1.5);
    drawGlove(ctx, lx, handY, gs, 1);
    drawGlove(ctx, rx, handY, gs, -1);

    vignette(ctx, W, H, 0.3);
    this.fx.draw(ctx);
  }

  hud() {
    return `Slaps ${this.slaps} · Flavor #${this.flavors}`;
  }

  stats() {
    return { flavors: this.flavors };
  }
}

export const slap = {
  id: "slap",
  name: "Side Slaps",
  world: "Jelly Slap",
  color: "#f06292",
  view: "front",
  met: 5,
  blurb: "Swing your arms wide and slap a very wobbly jelly. Slap fast enough and it gets dizzy.",
  say: "Side slaps! Swing wide and slap that jelly.",
  repEvent: "slap",
  summary: (st, reps) => `${reps} slaps · ${st.flavors ?? 1} jelly flavors`,

  // One slap every two beats, landing on the claps (beats 2 and 4).
  coach(t, tempo) {
    const slapLen = 0.95 / tempo;
    const i = Math.floor(t / slapLen);
    const f = (t % slapLen) / slapLen;
    const side = i % 2 ? "left" : "right";
    const W = side === "right" ? WIND_R : WIND_L;
    const T = side === "right" ? THRU_R : THRU_L;
    let p, h;
    if (f < 0.42) {
      const e = easeInOut(f / 0.42);
      p = mix(NEUTRAL, W, e);
      h = lerp(0.35, 0, e);
    } else if (f < 0.55) {
      h = easeOut((f - 0.42) / 0.13);
      p = mix(W, T, h);
    } else if (f < 0.7) {
      p = T;
      h = 1;
    } else {
      const e = easeInOut((f - 0.7) / 0.3);
      p = mix(T, NEUTRAL, e);
      h = lerp(1, 0.35, e);
    }
    return {
      pose: p,
      signal: { left: side === "left" ? h : 0.35, right: side === "right" ? h : 0.35 },
      count: i + (f >= 0.5 ? 1 : 0),
      cue: side === "right" ? "RIGHT SLAP!" : "LEFT SLAP!",
      beat: (2 * t) / slapLen,
      bpm: 120 / slapLen,
    };
  },
  event: (k) => ({ type: "slap", side: k % 2 ? "left" : "right", strength: 1 }),
  createDetector: () => new SlapDetector(),
  createScene: (canvas, opts) => new JellyScene(canvas, opts),
};
