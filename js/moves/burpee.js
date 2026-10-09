// Burpees → Firework Launch. Drop to the floor to load a rocket, jump up to
// launch it over the harbour.
import { Scene } from "../scene.js";
import { LOOKS, drawFigure, floorShadow, mix, shift } from "../figure.js";
import { TAU, clamp, damp, easeInOut, mid, mulberry32, seen } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";

// ---------- Coach (side view, facing right; floor at y = 0.6) ----------
const STAND = {
  back: "l",
  head: [0.02, -0.77], neck: [0.02, -0.6], hip: [0, 0],
  rs: [0.03, -0.56], re: [0.06, -0.3], rw: [0.08, -0.06],
  ls: [0.0, -0.56], le: [0.02, -0.3], lw: [0.04, -0.06],
  rh: [0.01, 0], rk: [0.03, 0.3], ra: [0.02, 0.6],
  lh: [-0.01, 0], lk: [-0.01, 0.3], la: [-0.02, 0.6],
};
const SQUAT = {
  back: "l",
  head: [0.38, -0.02], neck: [0.24, 0.02], hip: [-0.22, 0.22],
  rs: [0.22, 0.04], re: [0.26, 0.3], rw: [0.3, 0.56],
  ls: [0.2, 0.04], le: [0.23, 0.3], lw: [0.26, 0.56],
  rh: [-0.21, 0.22], rk: [0.06, 0.3], ra: [0.0, 0.6],
  lh: [-0.23, 0.22], lk: [0.04, 0.31], la: [-0.03, 0.6],
};
const PLANK = {
  back: "l", toe: [0.03, 0.05],
  head: [0.64, 0.04], neck: [0.5, 0.1], hip: [0, 0.32],
  rs: [0.5, 0.1], re: [0.52, 0.36], rw: [0.54, 0.6],
  ls: [0.47, 0.1], le: [0.49, 0.36], lw: [0.51, 0.6],
  rh: [0.02, 0.32], rk: [-0.3, 0.45], ra: [-0.6, 0.58],
  lh: [-0.02, 0.32], lk: [-0.32, 0.45], la: [-0.62, 0.58],
};
const JUMP = shift({
  ...STAND,
  rs: [0.03, -0.56], re: [0.08, -0.82], rw: [0.1, -1.08],
  ls: [0.0, -0.56], le: [0.04, -0.82], lw: [0.06, -1.08],
  rk: [0.06, 0.28], ra: [0.0, 0.56], lk: [0.02, 0.28], la: [-0.04, 0.56],
}, 0, -0.22);

// down: 0 standing, 0.5 squat, 1 plank. jump: 0..1 airborne.
function burpeePose(down, jump) {
  let p = down < 0.5 ? mix(STAND, SQUAT, easeInOut(down / 0.5)) : mix(SQUAT, PLANK, easeInOut((down - 0.5) / 0.5));
  if (jump > 0) p = mix(p, JUMP, jump);
  return p;
}

// ---------- Camera detector ----------
// Stages from the body's angle (shoulders → ankles): upright, then horizontal
// (on the floor), then upright again; the jump (hips rising) launches.
class BurpeeDetector {
  constructor(calib) {
    this.calib = calib;
    this.t = 0;
    this.stage = "stand";
    this.upAt = 0;
    this.baseY = calib?.hipY ?? null;
    this.down = 0;
    this.jump = 0;
  }

  update(pose, dt) {
    this.t += dt;
    const events = [];
    const im = pose?.image;
    if (im && seen(im, 11, 12, 23, 24)) {
      const S = mid(im[11], im[12]), Hp = mid(im[23], im[24]);
      const A = seen(im, 27, 28) ? mid(im[27], im[28]) : seen(im, 25, 26) ? mid(im[25], im[26]) : null;
      if (A) {
        const dx = A.x - S.x, dy = A.y - S.y;
        const horizontal = Math.abs(dy) < 0.6 * Math.abs(dx);
        const upright = Math.abs(dy) > 1.5 * Math.abs(dx);
        const torso = this.calib?.torso ?? Math.max(0.05, Math.abs(Hp.y - S.y));
        this.baseY ??= Hp.y;
        const up = (this.baseY - Hp.y) / torso;
        if (upright && this.stage === "stand" && Math.abs(up) < 0.06) this.baseY = damp(this.baseY, Hp.y, 0.5, dt);
        this.jump = damp(this.jump, upright ? clamp((up - 0.08) / 0.2) : 0, 30, dt);
        const squat = upright ? clamp((Hp.y - this.baseY) / (torso * 0.5)) * 0.5 : 0.6;
        this.down = damp(this.down, horizontal ? 1 : squat, 10, dt);
        if (horizontal) this.stage = "floor";
        else if (this.stage === "floor" && upright) {
          this.stage = "up";
          this.upAt = this.t;
        }
        if (this.stage === "up" && (this.jump > 0.5 || this.t - this.upAt > 0.8)) {
          this.stage = "stand";
          events.push({ type: "launch", strength: this.jump > 0.5 ? 1.3 : 0.8 });
        }
      }
    }
    return { down: this.down, jump: this.jump, events };
  }
}

// ---------- Scene ----------
const PALETTES = [
  ["#ff5252", "#ffab40", "#ffee58"],
  ["#40c4ff", "#b388ff", "#ffffff"],
  ["#69f0ae", "#eeff41", "#ffffff"],
  ["#ff4081", "#ea80fc", "#ffd740"],
];

class FireworkScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const r = mulberry32(9);
    this.city = Array.from({ length: 30 }, (_, i) => ({ x: i / 30, w: 0.025 + r() * 0.03, h: 0.06 + r() * 0.16 }));
    this.stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.5, p: r() * 6 }));
    this.rockets = [];
    this.flashes = [];
    this.launched = 0;
    this.down = 0;
    this.jump = 0;
    this.loaded = 0;
  }

  onResize() {
    this.water = this.H * 0.7;
    this.fig = Math.min(this.H * 0.26, (this.W - this.inset) * 0.22);
    this.px = this.inset + (this.W - this.inset) * 0.38;
    this.padX = this.px + this.fig * 1.1;
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.down = damp(this.down, signal.down ?? 0, 15, dt);
    this.jump = damp(this.jump, signal.jump ?? 0, 30, dt);
    if (this.auto) this.pose = coach.pose;
    this.loaded = damp(this.loaded, this.down > 0.8 ? 1 : this.loaded, 6, dt);
    for (const e of signal.events) if (e.type === "launch") this.launch(e.strength ?? 1);
    for (const r of this.rockets) {
      r.vy += 260 * dt;
      r.y += r.vy * dt;
      r.x += r.vx * dt;
      r.trail.push([r.x, r.y]);
      if (r.trail.length > 16) r.trail.shift();
      if (r.vy > -40 && !r.done) this.explode(r);
    }
    this.rockets = this.rockets.filter((r) => !r.done);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < 0.6);
  }

  launch(strength) {
    this.launched++;
    this.loaded = 0;
    const kind = ["peony", "ring", "willow"][this.launched % 3];
    this.rockets.push({
      x: this.padX, y: this.water - this.fig * 0.2, vx: (Math.random() - 0.5) * 60,
      vy: -Math.sqrt(2 * 260 * this.H * (0.35 + strength * 0.12)), trail: [], kind,
      colors: PALETTES[this.launched % PALETTES.length], done: false,
    });
    sfx.whoosh(1.2);
  }

  explode(r) {
    r.done = true;
    const n = 70;
    if (r.kind === "ring") {
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        this.fx.parts.push({ x: r.x, y: r.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, g: 120, s: 3.5, life: 1.5, age: 0, c: r.colors[i % 3], shape: "circle", rot: 0, vr: 0 });
      }
    } else if (r.kind === "willow") {
      this.fx.burst(r.x, r.y, { count: n, colors: ["#ffd54f", "#ffb300", "#fff8e1"], speed: 260, gravity: 260, size: 2.8, life: 2.2 });
    } else {
      this.fx.burst(r.x, r.y, { count: n, colors: r.colors, speed: 380, gravity: 150, size: 3.5, life: 1.6 });
    }
    this.flashes.push({ x: r.x, y: r.y, t: 0, c: r.colors[0] });
    if (this.launched % 5 === 0) this.fx.word(["OOOH!", "AAAH!", "BRAVO!"][(this.launched / 5) % 3], this.cx, this.H * 0.55, { size: this.fig * 0.22, color: "#fff" });
    sfx.boom();
  }

  draw() {
    const ctx = this.begin();
    const { W, H, water, fig, px, padX, cx } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, water);
    sky.addColorStop(0, "#050716");
    sky.addColorStop(1, "#1c2350");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    for (const s of this.stars) {
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(this.time + s.p));
      ctx.fillStyle = "#fff";
      ctx.fillRect(s.x * W, s.y * water, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
    for (const f of this.flashes) glow(ctx, f.x, f.y, this.H * 0.35 * (1 - f.t / 0.6), f.c, 0.35 * (1 - f.t / 0.6));

    // City skyline with lit windows.
    for (const b of this.city) {
      const bx = b.x * W, bw = b.w * W, bh = b.h * H, by = water - bh;
      ctx.fillStyle = "#0d1230";
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = "rgba(255,214,120,0.6)";
      for (let wy = by + 5; wy < water - 5; wy += 8) for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) if ((wx * 13 + wy * 7) % 9 < 2) ctx.fillRect(wx, wy, 2, 3);
    }
    // Harbour water with reflections of the sky show.
    const wg = ctx.createLinearGradient(0, water, 0, H);
    wg.addColorStop(0, "#141a3d");
    wg.addColorStop(1, "#05060f");
    ctx.fillStyle = wg;
    ctx.fillRect(-20, water, W + 40, H - water + 20);
    for (const f of this.flashes) glow(ctx, f.x, water + (water - f.y) * 0.3, this.H * 0.15, f.c, 0.25 * (1 - f.t / 0.6));

    // Dock you stand on, and the launch pad.
    const dockY = water + (H - water) * 0.45;
    ctx.fillStyle = "#3e2c23";
    ctx.fillRect(this.inset - 20, dockY, W - this.inset + 40, H - dockY + 20);
    ctx.fillStyle = "#5d4037";
    ctx.fillRect(this.inset - 20, dockY, W - this.inset + 40, 8);
    ctx.fillStyle = "#37474f";
    ctx.fillRect(padX - fig * 0.18, dockY - fig * 0.1, fig * 0.36, fig * 0.1);
    // A loaded rocket waits on the pad while you're down.
    if (this.loaded > 0.2) {
      const ry = dockY - fig * 0.1 - fig * 0.45 * this.loaded;
      ctx.fillStyle = "#e53935";
      ctx.fillRect(padX - fig * 0.05, ry, fig * 0.1, fig * 0.4 * this.loaded);
      ctx.fillStyle = "#ffca28";
      ctx.beginPath();
      ctx.moveTo(padX - fig * 0.07, ry);
      ctx.lineTo(padX, ry - fig * 0.12);
      ctx.lineTo(padX + fig * 0.07, ry);
      ctx.fill();
      glow(ctx, padX, dockY - fig * 0.12, fig * 0.2, "rgba(255,200,80,0.8)", 0.5 + 0.5 * Math.sin(this.time * 30));
    }
    for (const r of this.rockets) {
      ctx.strokeStyle = "rgba(255,210,140,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      r.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      glow(ctx, r.x, r.y, 14, "rgba(255,240,200,1)");
    }

    // You.
    const p = this.auto && this.pose ? this.pose : burpeePose(clamp(this.down), clamp(this.jump));
    floorShadow(ctx, px + fig * 0.1, dockY, fig * 0.55, fig * 0.06, 0.45);
    drawFigure(ctx, p, px, dockY - 0.6 * fig, fig, LOOKS.burpee);

    comicText(ctx, String(this.launched), cx, this.topY, fig * 0.3, "#ffe082");
    vignette(ctx, W, H, 0.3);
    this.fx.draw(ctx);
  }

  hud() {
    return `Fireworks launched ${this.launched}`;
  }

  stats() {
    return { launched: this.launched };
  }
}

export const burpee = {
  id: "burpee",
  name: "Burpees",
  world: "Firework Launch",
  color: "#ffca28",
  view: "side",
  frame: { x0: -0.72, x1: 0.76, y0: -1.35, y1: 0.7 },
  floor: 0.62,
  met: 9,
  blurb: "Drop to the floor to load a rocket, jump up to launch it over the harbour.",
  say: "Burpees! Down, back, up, and jump. Light up the sky.",
  repEvent: "launch",
  summary: (st) => `${st.launched ?? 0} fireworks launched`,

  // One burpee per bar; the jump lands on beat 4.
  coach(t, tempo) {
    const len = 3.2 / tempo;
    const i = Math.floor(t / len);
    const f = (t % len) / len;
    let down = 0, jump = 0, cue;
    if (f < 0.15) { down = (f / 0.15) * 0.5; cue = "SQUAT DOWN"; }
    else if (f < 0.3) { down = 0.5 + ((f - 0.15) / 0.15) * 0.5; cue = "JUMP BACK"; }
    else if (f < 0.45) { down = 1; cue = "PLANK!"; }
    else if (f < 0.6) { down = 1 - ((f - 0.45) / 0.15) * 0.5; cue = "FEET IN"; }
    else if (f < 0.68) { down = 0.5 - ((f - 0.6) / 0.08) * 0.5; cue = "STAND…"; }
    else if (f < 0.88) { jump = Math.sin(Math.PI * ((f - 0.68) / 0.2)); cue = "JUMP!"; }
    else cue = "AGAIN";
    return {
      pose: burpeePose(down, jump),
      signal: { down, jump },
      count: i + (f >= 0.75 ? 1 : 0),
      cue,
      beat: (4 * t) / len,
      bpm: 240 / len,
    };
  },
  event: () => ({ type: "launch", strength: 1.1 }),
  createDetector: (calib) => new BurpeeDetector(calib),
  createScene: (canvas, opts) => new FireworkScene(canvas, opts),
};
