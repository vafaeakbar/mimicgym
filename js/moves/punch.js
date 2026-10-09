// Jab & Cross → Tree Storm. Punches blast gusts through a tree on a spring;
// big hits launch squirrels.
import { Scene } from "../scene.js";
import { mix } from "../figure.js";
import { TAU, angleAt, clamp, damp, dist3, easeInOut, easeOut, mulberry32, seen } from "../util.js";
import { measure } from "./body.js";
import { sfx } from "../audio.js";
import { vignette } from "../fx.js";

// ---------- Coach (side view, facing right; back = rear arm) ----------
const GUARD = {
  back: "l",
  head: [0.1, -0.73], neck: [0.06, -0.6], hip: [0, 0],
  rs: [0.06, -0.55], re: [0.19, -0.31], rw: [0.235, -0.565],
  ls: [0.0, -0.56], le: [0.12, -0.28], lw: [0.1, -0.54],
  rh: [0.02, 0], rk: [0.13, 0.3], ra: [0.2, 0.6],
  lh: [-0.02, 0], lk: [-0.1, 0.3], la: [-0.22, 0.6],
};
const JAB = { ...GUARD, rs: [0.08, -0.55], re: [0.35, -0.56], rw: [0.61, -0.57], head: [0.12, -0.73], neck: [0.08, -0.6] };
const CROSS = {
  ...GUARD, ls: [0.1, -0.55], le: [0.37, -0.56], lw: [0.63, -0.57], rs: [0.08, -0.55],
  head: [0.14, -0.73], neck: [0.1, -0.6], la: [-0.2, 0.58],
};

// ---------- Camera detector ----------
// Extension = how straight the elbow is (3D) blended with how far the fist
// reaches from the shoulder. Fist height comes from the image, which is far
// steadier than depth, and gates out arms hanging down or raised overhead.
const JOINTS = { left: [11, 13, 15], right: [12, 14, 16] };

class PunchDetector {
  constructor() {
    this.t = 0;
    this.arms = {
      left: { p: 0, armed: false, peak: 0, last: -9 },
      right: { p: 0, armed: false, peak: 0, last: -9 },
    };
  }

  update(pose, dt) {
    this.t += dt;
    const events = [];
    const m = pose && measure(pose);
    for (const side of ["left", "right"]) {
      const a = this.arms[side];
      const [si, ei, wi] = JOINTS[side];
      let raw = 0;
      let guard = false;
      if (m && seen(pose.world, si, ei, wi) && seen(m.im, wi)) {
        const w = pose.world;
        const ang = angleAt(w[si], w[ei], w[wi]);
        const ratio = dist3(w[si], w[wi]) / (dist3(w[si], w[ei]) + dist3(w[ei], w[wi]));
        const wy = m.im[wi].y;
        const raised = wy < m.sh.y + 0.5 * m.torso && wy > m.sh.y - 0.6 * m.torso;
        raw = raised ? (clamp((ang - 80) / 75) + clamp((ratio - 0.55) / 0.35)) / 2 : 0;
        guard = raised && ang < 110;
      }
      const prev = a.p;
      a.p = damp(a.p, raw, 30, dt);
      const v = dt > 0 ? (a.p - prev) / dt : 0;
      if (guard && a.p < 0.35) {
        a.armed = true;
        a.peak = 0;
      }
      if (a.armed) a.peak = Math.max(a.peak, v);
      if (a.armed && a.p > 0.72 && this.t - a.last > 0.18) {
        a.armed = false;
        a.last = this.t;
        events.push({ type: "punch", side, strength: clamp(a.peak / 5, 0.35, 1.6) });
      }
    }
    return { left: this.arms.left.p, right: this.arms.right.p, events };
  }
}

// ---------- Scene ----------
const MAX_DEPTH = 6;
const LEAF_COLORS = ["#2f7d3a", "#3f9a47", "#58b35a", "#7cc96b"];

function grow(depth, rand) {
  const b = { depth, angle: 0, at: 1, len: 1, kids: [], leaves: [] };
  if (depth < MAX_DEPTH) {
    const n = depth === 0 ? 3 : rand() < 0.35 ? 3 : 2;
    const spread = depth === 0 ? 0.55 : 0.5 + rand() * 0.2;
    for (let i = 0; i < n; i++) {
      const kid = grow(depth + 1, rand);
      kid.angle = (i - (n - 1) / 2) * spread + (rand() - 0.5) * 0.25;
      kid.at = depth === 0 ? 0.75 + rand() * 0.25 : 0.55 + rand() * 0.45;
      kid.len = 0.72 + rand() * 0.12;
      b.kids.push(kid);
    }
  }
  if (depth >= MAX_DEPTH - 1) {
    for (let i = 0; i < 4; i++) {
      b.leaves.push({ x: (rand() - 0.5) * 1.4, y: -rand() * 1.2, r: 0.55 + rand() * 0.6, c: Math.floor(rand() * LEAF_COLORS.length) });
    }
  }
  return b;
}

class TreeScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const rand = mulberry32(7);
    this.root = grow(0, rand);
    this.grass = Array.from({ length: 70 }, () => ({ x: rand(), h: 0.6 + rand() * 0.8, ph: rand() * 6 }));
    this.clouds = Array.from({ length: 4 }, () => ({ x: rand(), y: 0.08 + rand() * 0.22, s: 0.7 + rand() * 0.6 }));
    this.bend = 0;
    this.bendVel = 0;
    this.lean = 0;
    this.gusts = [];
    this.leaves = [];
    this.squirrels = [];
    this.tips = [];
    this.count = 0;
    this.launched = 0;
  }

  onResize() {
    this.groundY = this.H * 0.84;
    this.trunkLen = Math.min(this.H * 0.2, (this.W - this.inset) * 0.28);
    this.renderBackdrop();
  }

  punch(dir, strength) {
    this.count++;
    this.bendVel += dir * strength * 4.5;
    this.fx.kick(strength * 6);
    sfx.whoosh(strength);
    for (let i = 0; i < 5 + strength * 4; i++) {
      this.gusts.push({
        x: this.cx - dir * this.W * (0.3 + Math.random() * 0.15),
        y: this.groundY - this.trunkLen * (0.8 + Math.random() * 2.2),
        len: 90 + Math.random() * 160, speed: dir * (1800 + Math.random() * 900), life: 0.55, age: 0,
      });
    }
    const tipPoint = () => {
      const tip = this.tips[Math.floor(Math.random() * this.tips.length)];
      const pt = tip.m.transformPoint(new DOMPoint(0, 0));
      return [pt.x / this.dpr, pt.y / this.dpr];
    };
    if (!this.tips.length) return;
    for (let i = 0; i < Math.round(strength * 14); i++) {
      const [x, y] = tipPoint();
      this.leaves.push({
        x, y, vx: dir * (120 + Math.random() * 260) * strength, vy: -40 - Math.random() * 140,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, life: 2.5 + Math.random(), age: 0,
        c: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      });
    }
    if (strength > 1.35 || this.count % 7 === 0) {
      const [x, y] = tipPoint();
      this.launched++;
      this.squirrels.push({ x, y, vx: dir * (380 + Math.random() * 200), vy: -380, rot: 0, vr: dir * 9, age: 0 });
      this.fx.word(["WHEEE!", "NOT AGAIN!", "MY NUTS!", "YEEHAW!"][this.launched % 4], x, y - 30, { size: 40, color: "#fff" });
    }
  }

  update(dt, signal) {
    this.step(dt);
    for (const e of signal.events) if (e.type === "punch") this.punch(e.side === "right" ? -1 : 1, e.strength);

    const acc = -38 * this.bend - 3.2 * this.bendVel;
    this.bendVel += acc * dt;
    this.bend = clamp(this.bend + this.bendVel * dt, -1.4, 1.4);
    this.lean = damp(this.lean, ((signal.left ?? 0) - (signal.right ?? 0)) * 0.22, 10, dt);

    for (const g of this.gusts) {
      g.age += dt;
      g.x += g.speed * dt;
    }
    this.gusts = this.gusts.filter((g) => g.age < g.life);
    for (const l of this.leaves) {
      l.age += dt;
      l.vy += 140 * dt;
      l.vx *= Math.exp(-dt * 0.8);
      l.x += (l.vx + Math.sin(l.age * 5 + l.rot) * 30) * dt;
      l.y += l.vy * dt;
      l.rot += l.vr * dt;
      if (l.y > this.groundY + 6) {
        l.y = this.groundY + 6;
        l.vx *= 0.5;
        l.vy = 0;
        l.vr = 0;
      }
    }
    this.leaves = this.leaves.filter((l) => l.age < l.life);
    for (const s of this.squirrels) {
      s.age += dt;
      s.vy += 500 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
    }
    this.squirrels = this.squirrels.filter((s) => s.age < 3);
  }

  renderBackdrop() {
    const { W, H, groundY } = this;
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext("2d");
    ctx.scale(this.dpr, this.dpr);
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, "#6fa9e6");
    sky.addColorStop(1, "#d6ebf2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const sx = W * 0.85, sy = H * 0.2, sr = Math.min(W, H) * 0.06;
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 4);
    glow.addColorStop(0, "rgba(255,240,190,0.9)");
    glow.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff6d5";
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();
    const hills = (base, amp, freq, phase, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) {
        const t = x / W;
        ctx.lineTo(x, base - amp * (Math.sin(t * freq + phase) * 0.6 + Math.sin(t * freq * 2.3 + phase * 2) * 0.4));
      }
      ctx.lineTo(W, H);
      ctx.fill();
    };
    hills(groundY - H * 0.12, H * 0.06, 5, 1, "#a7cdb0");
    hills(groundY - H * 0.04, H * 0.05, 7, 3, "#7bb585");
    ctx.fillStyle = "#4f8f55";
    ctx.fillRect(0, groundY, W, H - groundY);
    this.backdrop = c;
  }

  draw() {
    this.ensureSize();
    const { ctx, W, H, dpr, groundY, trunkLen, cx } = this;
    const total = this.bend + this.lean;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0);
    this.begin();
    const base = ctx.getTransform();

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const cl of this.clouds) {
      cl.x = (cl.x + (0.004 + Math.abs(this.bendVel) * 0.003) / 60) % 1.2;
      const x = cl.x * W * 1.2 - W * 0.1, y = cl.y * H, r = H * 0.035 * cl.s;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.arc(x + r * 1.1, y - r * 0.4, r * 1.2, 0, TAU);
      ctx.arc(x + r * 2.3, y, r * 0.9, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(20,50,25,0.25)";
    ctx.beginPath();
    ctx.ellipse(cx + total * trunkLen * 0.6, groundY + 6, trunkLen * 1.3, trunkLen * 0.12, 0, 0, TAU);
    ctx.fill();

    this.tips = [];
    ctx.save();
    ctx.translate(cx, groundY + 2);
    ctx.lineCap = "round";
    this.drawBranch(this.root, trunkLen, trunkLen * 0.15, total);
    ctx.restore();

    // Leaves batched per colour: paths are transformed as built, so one fill each.
    const unit = trunkLen * 0.09;
    ctx.beginPath();
    for (const tip of this.tips) {
      ctx.setTransform(tip.m);
      for (const l of tip.b.leaves) {
        ctx.moveTo(l.x * unit + l.r * unit * 1.1, l.y * unit + unit * 0.35);
        ctx.arc(l.x * unit, l.y * unit + unit * 0.35, l.r * unit * 1.1, 0, TAU);
      }
    }
    ctx.setTransform(base);
    ctx.fillStyle = "#1d4d27";
    ctx.fill();
    for (let ci = 0; ci < LEAF_COLORS.length; ci++) {
      ctx.beginPath();
      for (const tip of this.tips) {
        ctx.setTransform(tip.m);
        for (const l of tip.b.leaves) {
          if (l.c !== ci) continue;
          ctx.moveTo(l.x * unit + l.r * unit, l.y * unit);
          ctx.arc(l.x * unit, l.y * unit, l.r * unit, 0, TAU);
        }
      }
      ctx.setTransform(base);
      ctx.fillStyle = LEAF_COLORS[ci];
      ctx.fill();
    }

    ctx.beginPath();
    for (const tip of this.tips) {
      ctx.setTransform(tip.m);
      const l = tip.b.leaves[0];
      if (!l) continue;
      ctx.moveTo(l.x * unit - unit * 0.1 + l.r * unit * 0.45, l.y * unit - unit * 0.25);
      ctx.arc(l.x * unit - unit * 0.1, l.y * unit - unit * 0.25, l.r * unit * 0.45, 0, TAU);
    }
    ctx.setTransform(base);
    ctx.fillStyle = "rgba(200,240,160,0.55)";
    ctx.fill();

    ctx.strokeStyle = "#3d7a43";
    ctx.lineWidth = 2;
    for (const g of this.grass) {
      const gx = g.x * W, gh = g.h * H * 0.025;
      const sway = Math.sin(this.time * 2 + g.ph) * 2 + total * 14;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(gx + k * 3, groundY + 10);
        ctx.quadraticCurveTo(gx + k * 4, groundY + 10 - gh * 0.6, gx + k * 5 + sway, groundY + 10 - gh);
        ctx.stroke();
      }
    }

    for (const l of this.leaves) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (l.life - l.age) / 0.6);
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.ellipse(0, 0, unit * 0.7, unit * 0.35, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (const s of this.squirrels) this.drawSquirrel(s.x, s.y, s.rot, unit * 2.2);

    ctx.lineCap = "round";
    for (const g of this.gusts) {
      const dir = Math.sign(g.speed);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - g.age / g.life)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.quadraticCurveTo(g.x - dir * g.len * 0.5, g.y - 10, g.x - dir * g.len, g.y);
      ctx.stroke();
    }
    vignette(ctx, W, H, 0.22);
    this.fx.draw(ctx);
  }

  drawSquirrel(x, y, rot, s) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = "#a0622d";
    ctx.strokeStyle = "#3b2412";
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.ellipse(-s * 0.45, -s * 0.2, s * 0.35, s * 0.5, -0.5, 0, TAU); // tail
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.3, s * 0.22, 0, 0, TAU); // body
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.3, -s * 0.12, s * 0.15, 0, TAU); // head
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s * 0.35, -s * 0.16, s * 0.06, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(s * 0.37, -s * 0.16, s * 0.03, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawBranch(b, len, width, bend) {
    const { ctx } = this;
    const flex = 0.05 + b.depth * 0.055; // thin branches flex more than the trunk
    const idle = Math.sin(this.time * 1.3 + b.depth * 0.7 + b.angle * 3) * 0.012 * b.depth;
    ctx.save();
    ctx.rotate(b.angle + bend * flex + idle);
    const w0 = Math.max(1, width), w1 = Math.max(0.8, width * 0.7);
    const bark = ctx.createLinearGradient(-w0 / 2, 0, w0 / 2, 0);
    bark.addColorStop(0, "#8a5a3a");
    bark.addColorStop(1, b.depth < 2 ? "#3e2716" : "#4e3220");
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.moveTo(-w0 / 2, 0);
    ctx.lineTo(-w1 / 2, -len);
    ctx.lineTo(w1 / 2, -len);
    ctx.lineTo(w0 / 2, 0);
    ctx.fill();
    if (b.leaves.length) {
      ctx.save();
      ctx.translate(0, -len);
      this.tips.push({ m: ctx.getTransform(), b });
      ctx.restore();
    }
    for (const kid of b.kids) {
      ctx.save();
      ctx.translate(0, -len * kid.at);
      this.drawBranch(kid, len * kid.len, width * 0.66, bend);
      ctx.restore();
    }
    ctx.restore();
  }

  hud() {
    return `Gusts ${this.count} · Squirrels launched ${this.launched}`;
  }

  stats() {
    return { squirrels: this.launched };
  }
}

export const punch = {
  id: "punch",
  name: "Jab & Cross",
  world: "Tree Storm",
  color: "#7ee081",
  view: "side",
  met: 7.5,
  blurb: "Every punch blasts wind through the tree. Hit hard and the squirrels go flying.",
  say: "Jab and cross! Blow that tree over.",
  repEvent: "punch",
  summary: (st, reps) => `${reps} punches · ${st.squirrels ?? 0} squirrels launched`,

  // One punch per music beat, with full extension landing exactly on the beat.
  coach(t, tempo) {
    const beatLen = 0.62 / tempo;
    const beat = t / beatLen;
    const u = beat + 0.3;
    const i = Math.floor(u);
    const f = u - i;
    const cross = i % 2 === 1;
    const e = f < 0.3 ? easeOut(f / 0.3) : f < 0.65 ? 1 - easeInOut((f - 0.3) / 0.35) : 0;
    return {
      pose: mix(GUARD, cross ? CROSS : JAB, e),
      signal: { left: cross ? 0 : e, right: cross ? e : 0 },
      count: i + (f >= 0.3 ? 1 : 0),
      cue: cross ? "CROSS!" : "JAB!",
      beat,
      bpm: 60 / beatLen,
    };
  },
  event: (k) => ({ type: "punch", side: k % 2 ? "right" : "left", strength: 0.9 + ((k * 7) % 5) * 0.1 }),
  createDetector: () => new PunchDetector(),
  createScene: (canvas, opts) => new TreeScene(canvas, opts),
};
