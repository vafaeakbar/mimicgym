// Lane Dash → Subway-style endless runner. Jog to run; step left/right to
// switch lanes, jump over hurdles, squat under bars. Never game over: a hit
// is just an "OOF!" and you keep going.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, SQUAT_DOWN, floorShadow, mirror, mix, pose, shift } from "../figure.js";
import { TAU, clamp, damp } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { JogDetector, drawRunner } from "./jog.js";
import { SquatDetector } from "./squat.js";
import { measure } from "./body.js";

// ---------- Poses (front view: the coach faces you, the runner is seen from behind) ----------
const RUN_A = pose(FRONT, {
  lk: [-0.1, -0.06], la: [-0.12, 0.24], rk: [0.1, 0.3], ra: [0.11, 0.6],
  le: [-0.21, -0.3], lw: [-0.16, -0.14], re: [0.21, -0.38], rw: [0.13, -0.58],
});
const RUN_B = mirror(RUN_A);
const JUMP = pose(FRONT, {
  le: [-0.3, -0.78], lw: [-0.42, -1.0], re: [0.3, -0.78], rw: [0.42, -1.0],
  lk: [-0.14, 0.22], la: [-0.12, 0.48], rk: [0.14, 0.22], ra: [0.12, 0.48],
});
// Duck with hands on your head, obviously.
const DUCK = pose(SQUAT_DOWN, { le: [-0.26, -0.36], lw: [-0.05, -0.5], re: [0.26, -0.36], rw: [0.05, -0.5] });

function runPose(phase, a) {
  const u = phase % 1;
  let p = shift(mix(RUN_A, RUN_B, (1 - Math.cos(TAU * u)) / 2), 0, -0.03 * Math.abs(Math.sin(TAU * u)));
  if (a.duck > 0) p = mix(p, DUCK, a.duck);
  if (a.jump > 0) p = shift(mix(p, JUMP, Math.min(1, a.jump * 1.5)), 0, -a.jump * 0.28);
  return p;
}

// ---------- Camera detector ----------
// Lane: how far your body centre moves sideways from where you stood when the
// block began, in shoulder widths (so it scales with distance). Jump: body
// centre rising above its resting height. Duck: the squat detector. Speed:
// the jog detector.
class RunnerDetector {
  constructor(calib) {
    this.calib = calib;
    this.jog = new JogDetector(calib);
    this.squat = new SquatDetector(calib);
    this.t = 0;
    this.xs = [];
    this.baseX = null;
    this.baseY = null;
    this.lane = 0;
    this.jump = 0;
  }

  update(pose, dt) {
    this.t += dt;
    const j = this.jog.update(pose, dt);
    const duck = this.squat.update(pose, dt).depth;
    const m = pose && measure(pose);
    if (m?.hip) {
      const cx = 1 - (m.sh.x + m.hip.x) / 2; // mirrored
      const cy = (m.sh.y + m.hip.y) / 2;
      const width = this.calib?.shoulderW ?? m.shoulderW;
      const torso = this.calib?.torso ?? m.torso;
      if (this.xs.length < 15) {
        this.xs.push(cx); // centre = average of the first half second
        this.baseX = this.xs.reduce((a, b) => a + b, 0) / this.xs.length;
      }
      this.baseY ??= cy;
      const dx = (cx - this.baseX) / width;
      if (dx < -0.9) this.lane = -1;
      else if (dx > 0.9) this.lane = 1;
      else if (Math.abs(dx) < 0.45) this.lane = 0;
      const up = (this.baseY - cy) / torso;
      this.jump = damp(this.jump, clamp((up - 0.08) / 0.2), 30, dt);
      if (Math.abs(up) < 0.06 && duck < 0.2) this.baseY = damp(this.baseY, cy, 0.8, dt);
    }
    return { lane: this.lane, jump: this.jump, duck, cadence: j.cadence, events: j.events };
  }
}

// ---------- Scene ----------
const D = 7; // perspective constant (metres)
const CART_COLORS = ["#e53935", "#1e88e5", "#8e24aa", "#fb8c00", "#00897b"];

class RunnerScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.base = 10 * this.tempo; // m/s
    this.speed = this.base;
    this.dist = 0;
    this.gapT = 2.3 / this.tempo; // seconds between obstacles
    this.nextPos = 30;
    this.obstacles = [];
    this.coins = [];
    this.player = { x: 0, jump: 0, duck: 0, stumble: 0 };
    this.autoLane = 0;
    this.autoX = 0;
    this.autoInfo = { x: 0, jump: 0, duck: 0, cue: "RUN!" };
    this.phase = 0;
    this.coinCount = 0;
    this.dodges = 0;
    this.hits = 0;
    const r = Math.random;
    this.skyline = Array.from({ length: 22 }, (_, i) => ({ x: i / 22, w: 0.03 + r() * 0.04, h: 0.05 + r() * 0.14 }));
  }

  onResize() {
    this.horizon = this.H * 0.36;
    this.baseY = this.H * 0.94;
    this.laneW = Math.min((this.W - this.inset) * 0.2, this.H * 0.32);
    this.unit = this.laneW / 2.4; // px per metre at the player
  }

  sc(z) {
    return D / (z + D);
  }
  y(z, h = 0) {
    const s = this.sc(z);
    return this.horizon + (this.baseY - this.horizon) * s - h * this.unit * s;
  }
  x(lane, z) {
    return this.cx + lane * this.laneW * this.sc(z);
  }

  spawn() {
    while (this.nextPos < this.dist + 130) {
      const roll = Math.random();
      const type = roll < 0.3 ? "hurdle" : roll < 0.55 ? "bar" : "cart";
      let lanes = [-1, 0, 1];
      if (type === "cart") {
        lanes = [-1, 0, 1].sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.5 ? 1 : 2);
      }
      this.obstacles.push({ pos: this.nextPos, type, lanes, color: CART_COLORS[Math.floor(Math.random() * 5)], done: false });
      const gap = this.base * this.gapT * (0.85 + Math.random() * 0.3);
      const coinLane = [-1, 0, 1][Math.floor(Math.random() * 3)];
      for (let k = 0; k < 4; k++) this.coins.push({ pos: this.nextPos + gap * (0.3 + k * 0.1), lane: coinLane, got: false });
      this.nextPos += gap;
    }
  }

  // What the coach should show and, in TV mode, what the runner does.
  plan(dt) {
    const ref = this.auto ? this.autoLane : Math.round(this.player.x);
    let jump = 0, duck = 0, cue = "RUN!", target = ref;
    for (const o of this.obstacles) {
      const T = (o.pos - this.dist) / this.speed;
      if (T < -0.4 || T > 1.6) continue;
      if (o.type === "hurdle") {
        if (T < 1.0 && T > 0) cue = "JUMP!";
        if (T < 0.32 && T > -0.3) jump = Math.max(jump, Math.sin(Math.PI * clamp((0.32 - T) / 0.62)));
      } else if (o.type === "bar") {
        if (T < 1.1 && T > 0) cue = "DUCK!";
        if (T < 0.5 && T > -0.35) duck = Math.max(duck, clamp((0.5 - T) / 0.15) * clamp((T + 0.35) / 0.15));
      } else if (o.lanes.includes(ref) && T > 0) {
        const free = [-1, 0, 1].filter((l) => !o.lanes.includes(l)).sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref));
        target = free[0];
        cue = target < ref ? "STEP LEFT!" : "STEP RIGHT!";
      }
    }
    if (this.auto) {
      if (target !== ref) this.autoLane = target;
    } else {
      this.autoLane = target;
    }
    this.autoX = damp(this.autoX, this.autoLane, 10, dt);
    this.autoInfo = { x: this.autoX, jump, duck, cue };
  }

  update(dt, signal) {
    this.step(dt);
    const p = this.player;
    p.stumble = Math.max(0, p.stumble - dt);
    const effort = this.auto ? 1 : 0.65 + 0.5 * clamp((signal.cadence ?? 0) / 2.6);
    this.speed = Math.max(1, this.base * effort * (p.stumble > 0 ? 0.6 : 1));
    const prev = this.dist;
    this.dist += this.speed * dt;
    this.phase += (this.auto ? 2.8 * this.tempo : Math.max(1.2, signal.cadence ?? 0)) * dt * 0.5;

    this.spawn();
    this.plan(dt);
    const src = this.auto ? { lane: this.autoX, jump: this.autoInfo.jump, duck: this.autoInfo.duck } : signal;
    p.x = damp(p.x, src.lane ?? 0, 12, dt);
    p.jump = damp(p.jump, src.jump ?? 0, 30, dt);
    p.duck = damp(p.duck, src.duck ?? 0, 25, dt);

    const lane = Math.round(p.x);
    for (const o of this.obstacles) {
      if (o.done || o.pos > this.dist) continue;
      o.done = true;
      const hit = o.type === "hurdle" ? p.jump < 0.35 : o.type === "bar" ? p.duck < 0.45 : o.lanes.includes(lane);
      if (hit) {
        this.hits++;
        p.stumble = 0.8;
        this.fx.word(["OOF!", "OUCH!", "WHOOPS!", "BONK!"][this.hits % 4], this.cx, this.H * 0.45, { size: this.laneW * 0.4, color: "#ff5252" });
        this.fx.kick(14);
        sfx.oof();
      } else {
        this.dodges++;
        if (this.dodges % 5 === 0) this.fx.word(`${this.dodges} DODGES!`, this.cx, this.H * 0.42, { size: this.laneW * 0.3 });
      }
    }
    for (const c of this.coins) {
      if (c.got || c.pos > this.dist || c.pos < prev - 2) continue;
      c.got = true;
      if (c.lane === lane && p.duck < 0.6) {
        this.coinCount++;
        sfx.coin();
        this.fx.burst(this.x(p.x, 0), this.y(0, 1.2), { count: 6, colors: ["#ffd54f", "#fff59d"], speed: 220, gravity: 300, size: 5, shape: "star" });
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.pos > this.dist - 5);
    this.coins = this.coins.filter((c) => c.pos > this.dist - 5);
  }

  draw() {
    const ctx = this.begin();
    const { W, H, horizon, cx, laneW } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#5aa9f0");
    sky.addColorStop(1, "#cde8ff");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, horizon + 20);
    glow(ctx, W * 0.78, horizon * 0.35, H * 0.35, "rgba(255,244,214,0.9)");
    for (const b of this.skyline) {
      const bx = b.x * W, bw = b.w * W, bh = b.h * H, by = horizon - bh;
      const bg = ctx.createLinearGradient(bx, by, bx + bw, by);
      bg.addColorStop(0, "#9fb3c8");
      bg.addColorStop(1, "#7489a0");
      ctx.fillStyle = bg;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = "rgba(255,241,200,0.55)";
      for (let wy = by + 6; wy < horizon - 6; wy += 9) {
        for (let wx = bx + 4; wx < bx + bw - 4; wx += 8) if ((wx * 7 + wy * 3) % 5 < 2) ctx.fillRect(wx, wy, 3, 4);
      }
    }
    const hz = ctx.createLinearGradient(0, horizon - H * 0.12, 0, horizon);
    hz.addColorStop(0, "rgba(220,235,250,0)");
    hz.addColorStop(1, "rgba(220,235,250,0.7)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, horizon - H * 0.12, W, H * 0.12);
    const grass = ctx.createLinearGradient(0, horizon, 0, H);
    grass.addColorStop(0, "#9ccc65");
    grass.addColorStop(1, "#558b2f");
    ctx.fillStyle = grass;
    ctx.fillRect(-20, horizon, W + 40, H - horizon + 20);

    // Track.
    const far = 160, near = -2.5;
    const edge = (lane, z) => this.x(lane, z);
    ctx.fillStyle = "#8d7b68";
    ctx.beginPath();
    ctx.moveTo(edge(-1.6, far), this.y(far));
    ctx.lineTo(edge(1.6, far), this.y(far));
    ctx.lineTo(edge(1.6, near), this.y(near));
    ctx.lineTo(edge(-1.6, near), this.y(near));
    ctx.fill();
    // Sleepers scroll toward you.
    ctx.fillStyle = "#6d5d4d";
    for (let k = 0; k < 60; k++) {
      const z = k * 3 - (this.dist % 3);
      if (z < near || z > far) continue;
      const y1 = this.y(z), y2 = this.y(z + 0.5);
      ctx.fillRect(edge(-1.5, z), y2, edge(1.5, z) - edge(-1.5, z), Math.max(1, y1 - y2));
    }
    ctx.strokeStyle = "#cfd8dc";
    for (const l of [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25]) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(edge(l, far), this.y(far));
      ctx.lineTo(edge(l, near), this.y(near));
      ctx.stroke();
    }
    // Lamp posts for a sense of speed.
    for (let k = 0; k < 12; k++) {
      const z = k * 14 - (this.dist % 14);
      if (z < near) continue;
      const s = this.sc(z);
      for (const side of [-2.1, 2.1]) {
        ctx.fillStyle = "#455a64";
        ctx.fillRect(edge(side, z) - 3 * s, this.y(z, 3.2), 6 * s, this.y(z) - this.y(z, 3.2));
        ctx.fillStyle = "#fff59d";
        ctx.beginPath();
        ctx.arc(edge(side, z), this.y(z, 3.2), 8 * s, 0, TAU);
        ctx.fill();
      }
    }

    // Objects far → near; anything behind the runner is drawn over them.
    const items = [
      ...this.obstacles.map((o) => ({ z: o.pos - this.dist, o })),
      ...this.coins.filter((c) => !c.got).map((c) => ({ z: c.pos - this.dist, c })),
    ].filter((it) => it.z < far && it.z > near).sort((a, b) => b.z - a.z);
    const drawItem = (it) => (it.o ? this.drawObstacle(it.o, it.z) : this.drawCoin(it.c, it.z));
    for (const it of items) if (it.z >= 0) drawItem(it);
    this.drawPlayer();
    for (const it of items) if (it.z < 0) drawItem(it);

    // Big cue for what's coming.
    if (this.autoInfo.cue !== "RUN!") comicText(ctx, this.autoInfo.cue, cx, horizon + (H - horizon) * 0.12, laneW * 0.32, "#ffffff");
    vignette(ctx, W, H, 0.3);
    this.fx.draw(ctx);
  }

  drawObstacle(o, z) {
    const { ctx } = this;
    const s = this.sc(z);
    const u = this.unit * s;
    if (o.type === "hurdle") {
      const x1 = this.x(-1.5, z), x2 = this.x(1.5, z);
      const top = this.y(z, 1.0), bot = this.y(z, 0.6);
      ctx.fillStyle = "#37474f";
      ctx.fillRect(x1, top, 5 * s, this.y(z) - top);
      ctx.fillRect(x2 - 5 * s, top, 5 * s, this.y(z) - top);
      const stripes = 8;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? "#ffffff" : "#e53935";
        ctx.fillRect(x1 + ((x2 - x1) * i) / stripes, top, (x2 - x1) / stripes + 1, bot - top);
      }
    } else if (o.type === "bar") {
      const x1 = this.x(-1.6, z), x2 = this.x(1.6, z);
      const top = this.y(z, 1.9), bot = this.y(z, 1.45);
      ctx.fillStyle = "#37474f";
      ctx.fillRect(x1, top, 6 * s, this.y(z) - top);
      ctx.fillRect(x2 - 6 * s, top, 6 * s, this.y(z) - top);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? "#212121" : "#ffca28";
        ctx.fillRect(x1 + ((x2 - x1) * i) / 10, top, (x2 - x1) / 10 + 1, bot - top);
      }
      if (s > 0.12 && z > 2) comicText(ctx, "DUCK!", (x1 + x2) / 2, top - u * 0.3, u * 0.5, "#ffca28");
    } else {
      for (const lane of o.lanes) {
        const w = this.laneW * 0.86 * s, h = 2.1 * u;
        const x = this.x(lane, z) - w / 2, y = this.y(z) - h;
        ctx.fillStyle = o.color;
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.lineWidth = Math.max(1, 2 * s);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 10 * s);
        ctx.fill();
        ctx.stroke();
        // Grumpy face.
        ctx.fillStyle = "#fff";
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(x + w / 2 + k * w * 0.2, y + h * 0.35, w * 0.12, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = "#1d1d1d";
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(x + w / 2 + k * w * 0.18, y + h * 0.37, w * 0.05, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + w / 2 + k * w * 0.34, y + h * 0.2);
          ctx.lineTo(x + w / 2 + k * w * 0.08, y + h * 0.28);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.7, w * 0.15, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    }
  }

  drawCoin(c, z) {
    const { ctx } = this;
    const s = this.sc(z);
    const r = this.unit * 0.3 * s;
    const x = this.x(c.lane, z), y = this.y(z, 1.1);
    ctx.fillStyle = "#ffd54f";
    ctx.strokeStyle = "#e6a100";
    ctx.lineWidth = Math.max(1, 3 * s);
    ctx.beginPath();
    ctx.ellipse(x, y, r * Math.abs(Math.cos(this.time * 4 + c.pos)), r, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  drawPlayer() {
    const { ctx } = this;
    const p = this.player;
    const x = this.x(p.x, 0);
    const ground = this.y(0);
    const s = this.unit * 1.45;
    floorShadow(ctx, x, ground, s * 0.34, s * 0.08, 0.35 * (1 - p.jump * 0.6));
    ctx.save();
    if (p.stumble > 0) {
      ctx.translate(x, ground);
      ctx.rotate(Math.sin(p.stumble * 25) * 0.15);
      ctx.translate(-x, -ground);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(p.stumble * 40);
    }
    drawRunner(ctx, runPose(this.phase, p), x, ground - s * 0.62, s, LOOKS.runner);
    ctx.restore();
  }

  hud() {
    return `Coins ${this.coinCount} · Dodged ${this.dodges} · Bonks ${this.hits}`;
  }

  stats() {
    return { coins: this.coinCount, dodges: this.dodges };
  }
}

export const runner = {
  id: "runner",
  name: "Lane Dash",
  world: "Subway Dash",
  color: "#4fc3f7",
  view: "front",
  met: 9,
  blurb: "Jog to run. Step left or right to switch lanes, jump the hurdles, squat under the bars.",
  say: "Lane dash! Jog, jump, duck and dodge.",
  repEvent: "step",
  summary: (st) => `${st.coins ?? 0} coins · ${st.dodges ?? 0} dodges`,

  coach(t, tempo, scene) {
    const steps = 2.8 * tempo * t;
    const a = scene?.autoInfo ?? { x: 0, jump: 0, duck: 0, cue: "RUN!" };
    return {
      pose: shift(runPose(steps / 2, a), a.x * 0.3, 0),
      signal: { lane: a.x, jump: a.jump, duck: a.duck, cadence: 2.8 * tempo },
      count: Math.floor(steps),
      cue: a.cue,
      beat: steps / 2, // steps are the 8th notes
      bpm: 84 * tempo,
    };
  },
  event: () => ({ type: "step" }),
  createDetector: (calib) => new RunnerDetector(calib),
  createScene: (canvas, opts) => new RunnerScene(canvas, opts),
};
