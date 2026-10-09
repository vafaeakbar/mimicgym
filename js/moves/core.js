// Knee-to-Elbow Crunch → Keepy-Uppy. Standing cross crunches keep a football
// in the air under the stadium lights. Drop it and the crowd groans.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawFigure, floorShadow, mirror, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, easeOut } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view, hands behind head) ----------
const READY = pose(FRONT, {
  le: [-0.34, -0.66], lw: [-0.1, -0.8], re: [0.34, -0.66], rw: [0.1, -0.8],
  lk: [-0.1, 0.3], la: [-0.12, 0.6], rk: [0.1, 0.3], ra: [0.12, 0.6],
});
// Left knee drives up, right elbow crunches down to meet it.
const CRUNCH_L = pose(READY, {
  neck: [-0.04, -0.52], head: [-0.07, -0.68], ls: [-0.17, -0.5], rs: [0.09, -0.5],
  re: [-0.04, -0.28], rw: [0.0, -0.6], le: [-0.38, -0.58], lw: [-0.16, -0.72],
  lk: [-0.05, -0.2], la: [-0.1, 0.12],
});
const CRUNCH_R = mirror(CRUNCH_L);

// ---------- Camera detector ----------
// A crunch = one knee lifts (image space, vs standing thigh length) and gets
// close to the opposite elbow.
class CoreDetector {
  constructor(calib) {
    this.legs = {
      left: { lift: 0, armed: true, thigh: calib?.thigh ?? null, k: 25, e: 14 },
      right: { lift: 0, armed: true, thigh: calib?.thigh ?? null, k: 26, e: 13 },
    };
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m?.hip) {
      const im = m.im;
      for (const [side, L] of Object.entries(this.legs)) {
        if ((im[L.k].visibility ?? 1) < 0.5) continue;
        const thigh = im[L.k].y - m.hip.y;
        L.thigh = L.thigh === null ? thigh : Math.max(thigh, L.thigh - dt * 0.01);
        L.lift = damp(L.lift, clamp((L.thigh - thigh) / (L.thigh * 0.75)), 25, dt);
        const elbowSeen = (im[L.e].visibility ?? 1) > 0.5;
        const close = elbowSeen ? Math.hypot(im[L.k].x - im[L.e].x, im[L.k].y - im[L.e].y) / m.torso < 0.55 : true;
        if (L.lift < 0.2) L.armed = true;
        if (L.armed && L.lift > 0.55 && close) {
          L.armed = false;
          events.push({ type: "knee", side });
        }
      }
    }
    return { kneeL: this.legs.left.lift, kneeR: this.legs.right.lift, events };
  }
}

// ---------- Scene ----------
const G = 1800; // px/s², for a dropped ball bouncing

class KeepyScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, state: "rest", t: 0 };
    this.streak = 0;
    this.best = 0;
    this.touches = 0;
    this.drops = 0;
    this.kneeL = 0;
    this.kneeR = 0;
    this.interval = 1.25 / this.tempo; // seconds between knees, updated from the coach
    this.crowd = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), c: Math.floor(Math.random() * 5), p: Math.random() * 6 }));
    this.cheer = 0;
  }

  onResize() {
    this.pitchY = this.H * 0.52;
    this.fig = Math.min(this.H * 0.36, (this.W - this.inset) * 0.3);
    this.feetY = this.H * 0.95;
    this.hipY = this.feetY - 0.6 * this.fig;
    if (this.ball.state === "rest") this.resetBall();
  }

  kneePoint(side) {
    const k = side === "left" ? -1 : 1;
    return { x: this.cx + k * this.fig * 0.08, y: this.hipY - this.fig * 0.22 };
  }

  resetBall() {
    const kp = this.kneePoint("left");
    Object.assign(this.ball, { x: kp.x, y: kp.y - this.fig * 0.1, vx: 0, vy: 0, state: "rest" });
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.kneeL = damp(this.kneeL, signal.kneeL ?? 0, 25, dt);
    this.kneeR = damp(this.kneeR, signal.kneeR ?? 0, 25, dt);
    if (this.auto) this.pose = coach.pose;
    if (coach.bpm) this.interval = 120 / coach.bpm;
    this.cheer = Math.max(0, this.cheer - dt);
    const b = this.ball;

    for (const e of signal.events) {
      if (e.type !== "knee") continue;
      const kp = this.kneePoint(e.side);
      const reachable = b.state === "rest" || (b.state === "air" && b.y > kp.y - this.fig * 0.9);
      if (!reachable) continue;
      // Launch so the ball lands on the other knee after one crunch interval.
      const T = this.interval;
      const other = this.kneePoint(e.side === "left" ? "right" : "left");
      // Gravity is set per touch so the ball peaks about head height, whatever the tempo.
      const g = (8 * this.fig * 0.7) / (T * T);
      Object.assign(b, { x: kp.x, y: Math.min(b.y, kp.y), vx: (other.x - kp.x) / T, vy: (-g * T) / 2, g, state: "air" });
      this.touches++;
      this.streak++;
      this.best = Math.max(this.best, this.streak);
      sfx.pop();
      if (this.streak % 10 === 0) {
        this.cheer = 1.5;
        this.fx.word(`${this.streak} IN A ROW!`, this.cx, this.H * 0.2, { size: this.fig * 0.2, color: "#ffe082", life: 1.3 });
        sfx.ding();
      }
    }

    if (b.state === "air") {
      b.vy += b.g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vx * dt * 0.02 + dt * 4;
      if (b.y > this.feetY - this.fig * 0.06) {
        b.state = "dropped";
        b.t = 0;
        b.vy = -b.vy * 0.35;
        this.drops++;
        if (this.streak >= 3) this.fx.word(["DROPPED IT!", "OOPS!", "AWW!"][this.drops % 3], this.cx, this.H * 0.3, { size: this.fig * 0.16, color: "#ff8a80" });
        this.streak = 0;
      }
    } else if (b.state === "dropped") {
      b.t += dt;
      b.vy += G * dt;
      b.y = Math.min(this.feetY - this.fig * 0.06, b.y + b.vy * dt);
      b.x += 160 * dt;
      b.rot += dt * 6;
      if (b.t > 1.1) this.resetBall();
    }
  }

  draw() {
    const ctx = this.begin();
    const { W, H, pitchY, fig, cx } = this;

    // Night stadium.
    const sky = ctx.createLinearGradient(0, 0, 0, pitchY);
    sky.addColorStop(0, "#050b1a");
    sky.addColorStop(1, "#1b2d4f");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // Stands with a flickering crowd.
    const standTop = H * 0.16;
    ctx.fillStyle = "#101a2c";
    ctx.fillRect(-20, standTop, W + 40, pitchY - standTop);
    const cols = ["#e53935", "#fafafa", "#1e88e5", "#fdd835", "#43a047"];
    for (const c of this.crowd) {
      const jump = this.cheer > 0 ? Math.abs(Math.sin(this.time * 12 + c.p)) * 4 : 0;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 3 + c.p);
      ctx.fillStyle = cols[c.c];
      ctx.fillRect(c.x * W, standTop + 8 + c.y * (pitchY - standTop - 20) - jump, 4, 5);
    }
    ctx.globalAlpha = 1;
    // Floodlights.
    for (const lx of [this.inset + (W - this.inset) * 0.1, W - (W - this.inset) * 0.1]) {
      ctx.fillStyle = "#cfd8dc";
      ctx.fillRect(lx - 30, standTop - 40, 60, 22);
      glow(ctx, lx, standTop - 30, H * 0.35, "rgba(235,245,255,0.45)");
      const beam = ctx.createLinearGradient(0, standTop, 0, H);
      beam.addColorStop(0, "rgba(235,245,255,0.18)");
      beam.addColorStop(1, "rgba(235,245,255,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(lx - 25, standTop - 20);
      ctx.lineTo(lx + 25, standTop - 20);
      ctx.lineTo(cx + (lx < cx ? 60 : 200), H);
      ctx.lineTo(cx - (lx < cx ? 200 : 60), H);
      ctx.fill();
    }
    // Pitch with mown stripes in perspective.
    for (let i = 0; i < 10; i++) {
      const y0 = pitchY + (H - pitchY) * (i / 10) ** 1.6;
      const y1 = pitchY + (H - pitchY) * ((i + 1) / 10) ** 1.6;
      ctx.fillStyle = i % 2 ? "#2e7d32" : "#388e3c";
      ctx.fillRect(-20, y0, W + 40, y1 - y0 + 1);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, pitchY + (H - pitchY) * 0.35, (W - this.inset) * 0.25, (H - pitchY) * 0.12, 0, 0, TAU);
    ctx.stroke();

    // You.
    const p = this.auto && this.pose ? this.pose
      : this.kneeL >= this.kneeR ? mix(READY, CRUNCH_L, clamp(this.kneeL)) : mix(READY, CRUNCH_R, clamp(this.kneeR));
    floorShadow(ctx, cx, this.feetY, fig * 0.4, fig * 0.07, 0.4);
    drawFigure(ctx, p, cx, this.hipY, fig, LOOKS.football);

    // Ball.
    const b = this.ball;
    const r = fig * 0.07;
    floorShadow(ctx, b.x, this.feetY, r * 1.4, r * 0.35, 0.3);
    drawBall(ctx, b.x, b.y, r, b.rot);

    comicText(ctx, String(this.streak), cx, this.topY, fig * 0.22, "#ffffff");

    vignette(ctx, W, H, 0.35);
    this.fx.draw(ctx);
  }

  hud() {
    return `Streak ${this.streak} · Best ${this.best} · Touches ${this.touches}`;
  }

  stats() {
    return { touches: this.touches, best: this.best };
  }
}

function drawBall(ctx, x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#b0bec5");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.rotate(rot);
  ctx.fillStyle = "#263238";
  const pent = (px, py, pr) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      ctx.lineTo(px + Math.cos(a) * pr, py + Math.sin(a) * pr);
    }
    ctx.fill();
  };
  pent(0, 0, r * 0.36);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 5;
    pent(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3);
  }
  ctx.restore();
  ctx.restore();
}

export const core = {
  id: "core",
  name: "Knee-to-Elbow Crunch",
  world: "Keepy-Uppy",
  color: "#4dd0e1",
  view: "front",
  met: 5,
  blurb: "Hands behind your head, drive each knee up to the opposite elbow to keep the ball in the air.",
  say: "Core time! Knee to elbow, keep that ball up.",
  repEvent: "knee",
  summary: (st) => `${st.touches ?? 0} touches · best streak ${st.best ?? 0}`,

  // One crunch every two beats, knee meeting elbow on the beat (the stomps).
  coach(t, tempo) {
    const len = 1.25 / tempo;
    const u = t / len + 0.4;
    const i = Math.floor(u);
    const f = u - i;
    const side = i % 2 ? "right" : "left";
    const e = f < 0.4 ? easeOut(f / 0.4) : f < 0.8 ? 1 - easeInOut((f - 0.4) / 0.4) : 0;
    return {
      pose: mix(READY, side === "left" ? CRUNCH_L : CRUNCH_R, e),
      signal: { kneeL: side === "left" ? e : 0, kneeR: side === "right" ? e : 0 },
      count: i + (f >= 0.4 ? 1 : 0),
      cue: side === "left" ? "LEFT KNEE UP!" : "RIGHT KNEE UP!",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: (k) => ({ type: "knee", side: k % 2 ? "right" : "left" }),
  createDetector: (calib) => new CoreDetector(calib),
  createScene: (canvas, opts) => new KeepyScene(canvas, opts),
};
