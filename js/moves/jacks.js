// Jumping Jacks → Fly Catch. Jump out and clap overhead to catch the fly
// buzzing around the picnic. It doesn't always cooperate.
import { Scene } from "../scene.js";
import { FRONT, mix, pose, shift } from "../figure.js";
import { TAU, clamp, damp, easeInOut, lerp } from "../util.js";
import { comicText, drawGlove, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view) ----------
const CLOSED = pose(FRONT, {
  le: [-0.18, -0.31], lw: [-0.18, -0.06], re: [0.18, -0.31], rw: [0.18, -0.06],
  lk: [-0.09, 0.3], la: [-0.09, 0.6], rk: [0.09, 0.3], ra: [0.09, 0.6],
});
const OPEN = pose(FRONT, {
  le: [-0.28, -0.8], lw: [-0.05, -1.02], re: [0.28, -0.8], rw: [0.05, -1.02],
  lk: [-0.2, 0.29], la: [-0.3, 0.58], rk: [0.2, 0.29], ra: [0.3, 0.58],
});

// ---------- Camera detector ----------
// "Open" blends arms-overhead (wrist height vs shoulders) with feet apart
// (ankle spread in shoulder widths). A clap = reaching fully open.
class JacksDetector {
  constructor(calib) {
    this.calib = calib;
    this.open = 0;
    this.isOpen = false;
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m) {
      const im = m.im;
      const width = this.calib?.shoulderW ?? m.shoulderW;
      const wy = (im[15].y + im[16].y) / 2;
      const arms = clamp((m.sh.y + 0.3 * m.torso - wy) / (0.9 * m.torso));
      const legs = (im[27].visibility ?? 1) > 0.5 && (im[28].visibility ?? 1) > 0.5
        ? clamp((Math.abs(im[27].x - im[28].x) / width - 0.9) / 0.8) : arms;
      this.open = damp(this.open, arms * 0.6 + legs * 0.4, 25, dt);
    }
    if (!this.isOpen && this.open > 0.7) {
      this.isOpen = true;
      events.push({ type: "clap" });
    } else if (this.isOpen && this.open < 0.3) this.isOpen = false;
    return { open: this.open, events };
  }
}

// ---------- Scene ----------
const MISS = ["NOPE!", "TOO SLOW!", "BZZZT!", "NICE TRY!"];
const HIT = ["GOTCHA!", "CAUGHT!", "SWAT-TASTIC!", "BULLSEYE!"];

class FlyScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.open = 0;
    this.caught = 0;
    this.missed = 0;
    this.clapT = 0;
    this.fly = { x: 0, y: 0, vx: 0, vy: 0, away: 0 };
    this.trail = [];
    this.jarFlies = [];
    this.nextDodge = 3 + Math.floor(Math.random() * 3);
  }

  onResize() {
    this.ground = this.H * 0.8;
    this.catchPt = { x: this.cx, y: this.H * 0.34 };
    this.hand = Math.min(this.H * 0.13, (this.W - this.inset) * 0.12);
    if (!this.fly.x) Object.assign(this.fly, { x: this.cx + 80, y: this.H * 0.4 });
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.open = damp(this.open, signal.open ?? 0, 30, dt);
    this.clapT = Math.max(0, this.clapT - dt * 3);
    const f = this.fly;
    const t = this.time;

    // Where the fly wants to be: loops around the catch point; in TV mode it
    // drifts into the clap zone as the coach's hands come together.
    let tx = this.catchPt.x + Math.cos(t * 1.7) * this.hand * 1.6 + Math.sin(t * 4.3) * this.hand * 0.4;
    let ty = this.catchPt.y + Math.sin(t * 2.3) * this.hand * 0.9;
    if (this.auto) {
      const near = clamp(coach.signal.open * 1.4 - 0.2);
      tx = lerp(tx, this.catchPt.x, near);
      ty = lerp(ty, this.catchPt.y, near);
    }
    if (f.away > 0) {
      f.away -= dt;
      tx = f.x + f.vx;
      ty = f.y - 60;
    }
    f.vx = damp(f.vx, (tx - f.x) * 4, 6, dt);
    f.vy = damp(f.vy, (ty - f.y) * 4, 6, dt);
    f.x += (f.vx + Math.sin(t * 31) * 90) * dt;
    f.y += (f.vy + Math.cos(t * 27) * 70) * dt;
    this.trail.push([f.x, f.y]);
    if (this.trail.length > 14) this.trail.shift();

    for (const e of signal.events) if (e.type === "clap") this.clap();
    for (const j of this.jarFlies) j.ph += dt * (2 + j.sp);
  }

  clap() {
    this.clapT = 1;
    sfx.smack();
    const f = this.fly, c = this.catchPt;
    let hit = Math.hypot(f.x - c.x, f.y - c.y) < this.hand * 1.1;
    if (this.auto && --this.nextDodge <= 0) {
      hit = false; // it gets away sometimes, even from the coach
      this.nextDodge = 3 + Math.floor(Math.random() * 3);
    }
    if (hit) {
      this.caught++;
      this.jarFlies.push({ ph: Math.random() * 6, sp: Math.random() });
      if (this.jarFlies.length > 12) this.jarFlies.shift();
      this.fx.burst(c.x, c.y, { count: 14, colors: ["#fff8c4", "#ffe082"], speed: 320, gravity: 200, size: 7, shape: "star" });
      this.fx.word(HIT[this.caught % HIT.length], c.x, c.y - this.hand * 1.3, { size: this.hand * 0.5 });
      sfx.pop();
      // A new fly arrives from the edge.
      Object.assign(f, { x: Math.random() < 0.5 ? this.inset - 40 : this.W + 40, y: this.H * (0.2 + Math.random() * 0.3), away: 0 });
    } else {
      this.missed++;
      f.away = 0.5;
      f.vx = (f.x < c.x ? -1 : 1) * 260;
      this.fx.word(MISS[this.missed % MISS.length], f.x, f.y - 40, { size: this.hand * 0.36, color: "#ff8a80" });
      sfx.boing();
    }
  }

  draw() {
    const ctx = this.begin();
    const { W, H, ground, cx, hand, catchPt } = this;

    // Golden-hour park.
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#f6c38b");
    sky.addColorStop(0.6, "#fbe3b4");
    sky.addColorStop(1, "#dfe9c2");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    glow(ctx, W * 0.82, H * 0.2, H * 0.45, "rgba(255,236,190,0.95)");
    // Distant tree line, softened by haze.
    for (const [base, amp, col] of [[ground - H * 0.2, H * 0.08, "#a8b98a"], [ground - H * 0.1, H * 0.07, "#7f9a5f"]]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, ground);
      for (let x = 0; x <= W; x += 14) ctx.lineTo(x, base - amp * (0.6 + 0.4 * Math.sin(x * 0.021 + amp) * Math.cos(x * 0.009)));
      ctx.lineTo(W, ground);
      ctx.fill();
    }
    const grass = ctx.createLinearGradient(0, ground, 0, H);
    grass.addColorStop(0, "#8fb357");
    grass.addColorStop(1, "#557a2c");
    ctx.fillStyle = grass;
    ctx.fillRect(-20, ground, W + 40, H - ground + 20);

    // Picnic blanket in perspective, with a cake (the fly's real target).
    const bw = (W - this.inset) * 0.55, by = ground + (H - ground) * 0.25;
    ctx.save();
    ctx.translate(cx, by);
    ctx.beginPath();
    ctx.moveTo(-bw * 0.4, 0);
    ctx.lineTo(bw * 0.4, 0);
    ctx.lineTo(bw * 0.55, (H - by) * 0.9);
    ctx.lineTo(-bw * 0.55, (H - by) * 0.9);
    ctx.closePath();
    ctx.fillStyle = "#e9eef2";
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = "rgba(211,47,47,0.75)";
    for (let i = -6; i <= 6; i += 2) ctx.fillRect(i * bw * 0.05, 0, bw * 0.05, H);
    ctx.fillStyle = "rgba(211,47,47,0.45)";
    for (let j = 0; j < 8; j += 2) ctx.fillRect(-bw, j * 14, bw * 2, 14);
    ctx.restore();
    const ck = hand * 0.7;
    ctx.fillStyle = "#f8e1c4";
    ctx.beginPath();
    ctx.ellipse(cx + bw * 0.18, by + ck * 0.3, ck, ck * 0.35, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#c2185b";
    ctx.beginPath();
    ctx.ellipse(cx + bw * 0.18, by + ck * 0.05, ck * 0.9, ck * 0.3, 0, 0, TAU);
    ctx.fill();

    // The jar of caught flies.
    const jx = cx - bw * 0.22, jy = by - hand * 0.1, jw = hand * 0.55, jh = hand * 0.8;
    ctx.fillStyle = "rgba(210,235,245,0.45)";
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(jx - jw / 2, jy - jh, jw, jh, jw * 0.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8d6e63";
    ctx.fillRect(jx - jw * 0.55, jy - jh - jw * 0.14, jw * 1.1, jw * 0.16);
    for (const j of this.jarFlies) {
      const fx = jx + Math.sin(j.ph) * jw * 0.3, fy = jy - jh * 0.5 + Math.cos(j.ph * 1.3) * jh * 0.3;
      drawFly(ctx, fx, fy, hand * 0.1, this.time);
    }
    comicText(ctx, String(this.caught), jx, jy + hand * 0.25, hand * 0.3, "#ffe14d");

    // Fly + buzzing trail.
    ctx.fillStyle = "rgba(40,40,40,0.25)";
    for (let i = 0; i < this.trail.length; i += 2) {
      const [x, y] = this.trail[i];
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + i * 0.12, 0, TAU);
      ctx.fill();
    }
    drawFly(ctx, this.fly.x, this.fly.y, hand * 0.16, this.time);

    // Your hands sweep up from the sides and clap at the catch point.
    const o = clamp(this.open);
    const gap = hand * (0.55 + (1 - this.clapT) * 0.3) * (1 - o * 0.55);
    const lx = lerp(this.inset + hand * 0.4, catchPt.x - gap, o);
    const rx = lerp(W - hand * 0.4, catchPt.x + gap, o);
    const hy = lerp(H + hand * 0.3, catchPt.y, o);
    if (o < 0.3 && !this.auto) comicText(ctx, "JUMP & CLAP!", cx, H * 0.2, hand * 0.3, "#fff");
    drawGlove(ctx, lx, hy, hand, 1);
    drawGlove(ctx, rx, hy, hand, -1);

    vignette(ctx, W, H, 0.22);
    this.fx.draw(ctx);
  }

  hud() {
    return `Flies caught ${this.caught} · Escaped ${this.missed}`;
  }

  stats() {
    return { caught: this.caught, missed: this.missed };
  }
}

function drawFly(ctx, x, y, s, t) {
  const flap = Math.sin(t * 60) * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(220,235,255,0.55)";
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(k * s * 0.5, -s * 0.5, s * 0.55, s * 0.25, k * (0.6 + flap), 0, TAU);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(-s * 0.2, -s * 0.2, 0, 0, 0, s * 0.7);
  g.addColorStop(0, "#5f6b73");
  g.addColorStop(1, "#111");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.45, s * 0.35, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#b71c1c";
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(k * s * 0.22, -s * 0.2, s * 0.14, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export const jacks = {
  id: "jacks",
  name: "Jumping Jacks",
  world: "Fly Catch",
  color: "#ffd54f",
  view: "front",
  met: 8,
  blurb: "Jump out and clap overhead to catch the fly buzzing round the picnic. It's sneaky.",
  say: "Jumping jacks! Clap overhead and catch that fly.",
  repEvent: "clap",
  summary: (st) => `${st.caught ?? 0} flies caught · ${st.missed ?? 0} got away`,

  // One jack per two beats; the clap lands on beats 2 and 4.
  coach(t, tempo) {
    const len = 0.8 / tempo;
    const i = Math.floor(t / len);
    const f = (t % len) / len;
    const e = f < 0.5 ? easeInOut(f / 0.5) : 1 - easeInOut((f - 0.5) / 0.5);
    const hop = -0.05 * Math.abs(Math.sin(f * TAU));
    return {
      pose: shift(mix(CLOSED, OPEN, e), 0, hop),
      signal: { open: e },
      count: i + (f >= 0.5 ? 1 : 0),
      cue: f < 0.5 ? "OUT & CLAP!" : "IN!",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "clap" }),
  createDetector: (calib) => new JacksDetector(calib),
  createScene: (canvas, opts) => new FlyScene(canvas, opts),
};
