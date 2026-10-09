// Plank → Croc River. Hold a plank on a log over the river. Let your hips sag
// and the crocodile gets ideas. (It always misses. Just.)
import { Scene } from "../scene.js";
import { LOOKS, drawFigure, mix, pose } from "../figure.js";
import { TAU, clamp, damp, fmtTime, mid, seen } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";

// ---------- Coach (side view forearm plank, facing right, on tiptoes) ----------
const PLANK = {
  back: "l", toe: [0.03, 0.07],
  head: [0.66, -0.1], neck: [0.52, -0.08], hip: [0, 0],
  rs: [0.46, -0.06], re: [0.47, 0.2], rw: [0.7, 0.21],
  ls: [0.43, -0.07], le: [0.44, 0.2], lw: [0.67, 0.21],
  rh: [0.02, 0], rk: [-0.31, 0.1], ra: [-0.62, 0.17],
  lh: [-0.02, 0], lk: [-0.33, 0.1], la: [-0.64, 0.17],
};
const SAG = pose(PLANK, { hip: [0, 0.1], lh: [-0.02, 0.1], rh: [0.02, 0.1], lk: [-0.33, 0.16], rk: [-0.31, 0.16] });

// ---------- Camera detector ----------
// Works side-on. Body is "in plank" when shoulders→ankles is near horizontal;
// sag = how far the hips drop below that line (image space).
class PlankDetector {
  constructor() {
    this.sag = 0;
    this.hold = 0;
    this.inPlank = false;
    this.held = 0;
    this.lastSec = 0;
  }

  update(pose, dt) {
    const events = [];
    const im = pose?.image;
    if (im && seen(im, 11, 12, 23, 24)) {
      const S = mid(im[11], im[12]);
      const Hp = mid(im[23], im[24]);
      const A = seen(im, 27, 28) ? mid(im[27], im[28]) : seen(im, 25, 26) ? mid(im[25], im[26]) : null;
      if (A) {
        const dx = A.x - S.x, dy = A.y - S.y;
        const len2 = dx * dx + dy * dy || 1e-6;
        this.inPlank = Math.abs(dy) < 0.55 * Math.abs(dx);
        const t = ((Hp.x - S.x) * dx + (Hp.y - S.y) * dy) / len2;
        const dev = (Hp.y - (S.y + t * dy)) / Math.sqrt(len2); // + = hips low
        this.sag = damp(this.sag, clamp(dev / 0.12), 10, dt);
        const pike = clamp(-dev / 0.15);
        this.hold = damp(this.hold, this.inPlank ? 1 - Math.max(this.sag, pike) : 0, 8, dt);
      }
    } else {
      this.hold = damp(this.hold, 0, 4, dt);
    }
    if (this.hold > 0.5) this.held += dt;
    if (Math.floor(this.held) > this.lastSec) {
      this.lastSec = Math.floor(this.held);
      events.push({ type: "second" });
    }
    return { hold: this.hold, sag: this.sag, inPlank: this.inPlank, events };
  }
}

// ---------- Scene ----------
class CrocScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.held = 0;
    this.sag = 0;
    this.hold = 1;
    this.inPlank = true;
    this.croc = { x: 0, lunge: -1, dir: 1, jaw: 0 };
    this.nextLunge = 4;
    this.dodged = 0;
    this.close = 0;
    this.flies = Array.from({ length: 18 }, () => ({ x: Math.random(), y: Math.random() * 0.5, p: Math.random() * 6 }));
  }

  onResize() {
    this.water = this.H * 0.68;
    this.logY = this.H * 0.56;
    this.fig = Math.min(this.H * 0.34, (this.W - this.inset) * 0.3);
    this.croc.x ||= this.cx;
  }

  update(dt, signal) {
    this.step(dt);
    this.sag = damp(this.sag, signal.sag ?? 0, 8, dt);
    this.hold = damp(this.hold, signal.hold ?? 0, 8, dt);
    this.inPlank = signal.inPlank ?? true;
    for (const e of signal.events) if (e.type === "second") this.held++;

    // The croc patrols, then lunges; saggy hips make it lunge sooner.
    const c = this.croc;
    const span = (this.W - this.inset) * 0.35;
    if (c.lunge < 0) {
      c.x += c.dir * 90 * dt;
      if (Math.abs(c.x - this.cx) > span) c.dir *= -1;
      this.nextLunge -= dt * (1 + this.sag * 3 + (this.inPlank ? 0 : 2));
      if (this.nextLunge <= 0) {
        c.lunge = 0;
        c.lungeX = this.cx + (Math.random() - 0.5) * this.fig * 0.4;
      }
    } else {
      c.lunge += dt / 1.1;
      c.x = damp(c.x, c.lungeX, 6, dt);
      if (c.lunge >= 0.45 && !c.snapped) {
        c.snapped = true;
        const risky = this.sag > 0.45 || !this.inPlank;
        sfx.crunch();
        this.fx.kick(risky ? 14 : 8);
        this.fx.word(risky ? ["HIPS UP!", "YIKES!", "TOO CLOSE!"][this.dodged % 3] : ["CHOMP!", "MISSED ME!", "NOT TODAY!"][this.dodged % 3],
          this.cx, this.logY - this.fig * 0.55, { size: this.fig * 0.2, color: risky ? "#ff8a80" : "#ffe14d" });
        this.dodged++;
      }
      if (c.lunge >= 1) {
        c.lunge = -1;
        c.snapped = false;
        this.nextLunge = 5 + Math.random() * 3;
        this.fx.burst(c.x, this.water, { count: 24, colors: ["#b3e5fc", "#e1f5fe"], speed: 380, gravity: 900, size: 5 });
      }
    }
    c.jaw = c.lunge < 0 ? 0.08 + Math.sin(this.time * 2) * 0.04 : c.lunge < 0.45 ? clamp(c.lunge / 0.3) : clamp(1 - (c.lunge - 0.45) / 0.1) * 0.1;
    this.close = damp(this.close, this.sag, 4, dt);
  }

  draw() {
    const ctx = this.begin();
    const { W, H, water, logY, fig, cx } = this;

    // Jungle at dusk: layered canopy fading into haze.
    const sky = ctx.createLinearGradient(0, 0, 0, water);
    sky.addColorStop(0, "#0f2b2a");
    sky.addColorStop(0.55, "#2f6b52");
    sky.addColorStop(1, "#b9d7a3");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    glow(ctx, W * 0.7, water * 0.55, H * 0.5, "rgba(255,238,190,0.6)");
    const canopy = (base, amp, col, seed) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, water);
      for (let x = 0; x <= W; x += 10) {
        const n = Math.sin(x * 0.013 + seed) * 0.5 + Math.sin(x * 0.041 + seed * 2) * 0.3 + Math.sin(x * 0.09 + seed) * 0.2;
        ctx.lineTo(x, base - amp * n);
      }
      ctx.lineTo(W, water);
      ctx.fill();
    };
    canopy(water - H * 0.3, H * 0.1, "rgba(74,120,86,0.8)", 1);
    canopy(water - H * 0.18, H * 0.08, "rgba(40,84,58,0.9)", 4);
    canopy(water - H * 0.07, H * 0.06, "#1d3d2b", 7);
    // Hanging vines.
    ctx.strokeStyle = "rgba(20,45,30,0.85)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const vx = this.inset + ((i * 0.17 + 0.05) % 1) * (W - this.inset);
      const len = H * (0.18 + (i % 3) * 0.09);
      ctx.beginPath();
      ctx.moveTo(vx, -5);
      ctx.quadraticCurveTo(vx + Math.sin(this.time + i) * 12, len * 0.6, vx + 6, len);
      ctx.stroke();
    }
    // Fireflies.
    for (const f of this.flies) {
      const a = 0.4 + 0.6 * Math.max(0, Math.sin(this.time * 2 + f.p));
      glow(ctx, f.x * W + Math.sin(this.time * 0.7 + f.p) * 20, f.y * H + H * 0.1, 10, `rgba(230,255,160,${a})`);
    }

    // River.
    const riv = ctx.createLinearGradient(0, water, 0, H);
    riv.addColorStop(0, "#3c7f7a");
    riv.addColorStop(1, "#123b3d");
    ctx.fillStyle = riv;
    ctx.fillRect(-20, water, W + 40, H - water + 20);

    // Crocodile (behind the water surface line when submerged).
    const c = this.croc;
    const rise = c.lunge < 0 ? 0 : Math.sin(Math.PI * clamp(c.lunge / 0.9)) * (logY - water + fig * (0.18 - this.close * 0.1));
    drawCroc(ctx, c.x, water + fig * 0.1 - rise, fig * 0.9, c.jaw, c.lunge < 0 ? c.dir : 1, c.lunge >= 0);

    // Water surface over the croc, with ripples.
    ctx.fillStyle = "rgba(40,110,105,0.55)";
    ctx.fillRect(-20, water + fig * 0.12, W + 40, H);
    ctx.strokeStyle = "rgba(220,255,250,0.35)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const ry = water + 10 + k * (H - water) * 0.13;
      const off = (this.time * 30 * (1 + k * 0.2)) % 120;
      ctx.beginPath();
      for (let x = -off; x < W; x += 120) {
        ctx.moveTo(x, ry);
        ctx.quadraticCurveTo(x + 30, ry - 3, x + 60, ry);
      }
      ctx.stroke();
    }

    // The log bridge.
    const lx0 = this.inset - 20, lx1 = W + 20, lh = fig * 0.16;
    const lg = ctx.createLinearGradient(0, logY, 0, logY + lh);
    lg.addColorStop(0, "#8b5e3c");
    lg.addColorStop(1, "#3e2616");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.roundRect(lx0, logY, lx1 - lx0, lh, lh / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,22,10,0.5)";
    ctx.lineWidth = 2;
    for (let x = lx0 + 40; x < lx1; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, logY + lh * 0.35);
      ctx.lineTo(x + 50, logY + lh * 0.3);
      ctx.stroke();
    }

    // You, planking on the log. Hips follow your real sag (or a gentle wobble).
    const breathe = Math.sin(this.time * 1.6) * 0.012;
    const p = mix(PLANK, SAG, clamp(this.sag));
    for (const k of ["hip", "lh", "rh"]) p[k] = [p[k][0], p[k][1] + breathe];
    drawFigure(ctx, p, cx - fig * 0.05, logY - fig * 0.2, fig, LOOKS.plank);

    // Big hold timer.
    comicText(ctx, fmtTime(this.held), cx, this.topY, fig * 0.3, this.hold > 0.5 ? "#b9f6ca" : "#ff8a80");
    if (!this.inPlank && !this.auto) comicText(ctx, "GET INTO PLANK!", cx, this.topY + fig * 0.25, fig * 0.14, "#fff");

    vignette(ctx, W, H, 0.35);
    this.fx.draw(ctx);
  }

  hud() {
    return `Held ${fmtTime(this.held)} · Croc snaps dodged ${this.dodged}`;
  }

  stats() {
    return { seconds: this.held, dodged: this.dodged };
  }
}

function drawCroc(ctx, x, y, s, jaw, dir, lunging) {
  ctx.save();
  ctx.translate(x, y);
  if (lunging) ctx.rotate(-0.9); // snout points up at you
  else ctx.scale(dir, 1);
  const skin = ctx.createLinearGradient(0, -s * 0.12, 0, s * 0.12);
  skin.addColorStop(0, "#6f8f3a");
  skin.addColorStop(1, "#2f4a1d");
  ctx.fillStyle = skin;
  // Tail + body.
  ctx.beginPath();
  ctx.moveTo(-s * 1.1, 0);
  ctx.quadraticCurveTo(-s * 0.6, -s * 0.1, -s * 0.1, -s * 0.12);
  ctx.lineTo(s * 0.2, -s * 0.1);
  ctx.lineTo(s * 0.2, s * 0.1);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.14, -s * 1.1, 0);
  ctx.fill();
  // Back scutes.
  ctx.fillStyle = "#4e6b2a";
  for (let i = 0; i < 9; i++) {
    const bx = -s * 0.9 + i * s * 0.12;
    ctx.beginPath();
    ctx.moveTo(bx, -s * 0.07 - i * 0.004 * s);
    ctx.lineTo(bx + s * 0.05, -s * 0.13);
    ctx.lineTo(bx + s * 0.1, -s * 0.07);
    ctx.fill();
  }
  // Jaws, hinged at the head.
  const hx = s * 0.2;
  const drawJaw = (ang, upper) => {
    ctx.save();
    ctx.translate(hx, 0);
    ctx.rotate(ang);
    ctx.fillStyle = upper ? skin : "#56722c";
    ctx.beginPath();
    ctx.moveTo(0, upper ? -s * 0.1 : 0);
    ctx.lineTo(s * 0.55, upper ? -s * 0.04 : 0);
    ctx.quadraticCurveTo(s * 0.62, upper ? 0 : s * 0.02, s * 0.5, upper ? s * 0.01 : s * 0.06);
    ctx.lineTo(0, upper ? 0 : s * 0.1);
    ctx.fill();
    ctx.fillStyle = "#fffde7";
    for (let i = 0; i < 7; i++) {
      const tx = s * 0.06 + i * s * 0.065;
      ctx.beginPath();
      ctx.moveTo(tx, upper ? 0 : 0);
      ctx.lineTo(tx + s * 0.025, upper ? s * 0.04 : -s * 0.04);
      ctx.lineTo(tx + s * 0.05, 0);
      ctx.fill();
    }
    ctx.restore();
  };
  drawJaw(jaw * 0.5, false);
  drawJaw(-jaw * 0.7, true);
  // Eye bump.
  ctx.fillStyle = "#56722c";
  ctx.beginPath();
  ctx.arc(hx + s * 0.02, -s * 0.12, s * 0.06, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fdd835";
  ctx.beginPath();
  ctx.ellipse(hx + s * 0.03, -s * 0.13, s * 0.035, s * 0.028, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(hx + s * 0.025, -s * 0.155, s * 0.01, s * 0.05);
  ctx.restore();
}

const CUES = ["HOLD STRONG", "HIPS LEVEL", "SQUEEZE YOUR CORE", "BREATHE"];

export const plank = {
  id: "plank",
  name: "Plank",
  world: "Croc River",
  color: "#8bc34a",
  view: "plank",
  frame: { x0: -0.72, x1: 0.8, y0: -0.3, y1: 0.3 },
  floor: 0.25,
  met: 4,
  steady: true,
  blurb: "Hold a plank on a log over the river. Let your hips sag and the crocodile gets ideas.",
  say: "Plank time! Hips level. Don't feed the croc.",
  repEvent: "second",
  summary: (st) => `${Math.round(st.seconds ?? 0)} s held · ${st.dodged ?? 0} croc snaps dodged`,

  coach(t, tempo, scene, block) {
    const left = (block?.dur ?? 60) - t;
    const p = mix(PLANK, SAG, 0.05 + 0.05 * Math.sin(t * 1.6));
    return {
      pose: p,
      signal: { hold: 1, sag: 0.1 + 0.06 * Math.sin(t * 0.9), inPlank: true },
      count: Math.floor(t),
      cue: left < 10 ? "LAST 10 SECONDS!" : CUES[Math.floor(t / 5) % CUES.length],
      beat: t * 1.6,
      bpm: 96,
    };
  },
  event: () => ({ type: "second" }),
  createDetector: () => new PlankDetector(),
  createScene: (canvas, opts) => new CrocScene(canvas, opts),
};
