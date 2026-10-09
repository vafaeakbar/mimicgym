// Mountain Climbers → Cliff Climb. Core + cardio: every knee drive climbs you
// further up a real cliff, past mountain goats, toward the snowline.
import { Scene } from "../scene.js";
import { LOOKS, drawFigure, mix, pose } from "../figure.js";
import { TAU, clamp, damp, lerp, mid, mulberry32, seen } from "../util.js";
import { comicText, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { UP } from "./pushup.js";

// ---------- Coach (side view, high plank, knees driving in) ----------
const hipsUp = { hip: [0, -0.03], rh: [0.02, -0.03], lh: [-0.02, -0.03] };
// Near ("r") knee in, far leg extended — and the other way round.
const KNEE_R = pose(UP, { ...hipsUp, rk: [0.24, 0.1], ra: [0.0, 0.23] });
const KNEE_L = pose(UP, { ...hipsUp, lk: [0.22, 0.1], la: [-0.02, 0.22] });

// ---------- Camera detector ----------
// Side-on. Knee drive = how far each knee comes forward of the hip along the
// body line (ankles → shoulders), in torso lengths.
class ClimberDetector {
  constructor() {
    this.t = 0;
    this.lastStep = -1;
    this.cadence = 0;
    this.legs = { left: { d: 0, armed: true, h: 23, k: 25 }, right: { d: 0, armed: true, h: 24, k: 26 } };
  }

  update(pose, dt) {
    this.t += dt;
    const events = [];
    const im = pose?.image;
    if (im && seen(im, 11, 12, 23, 24)) {
      const S = mid(im[11], im[12]), Hp = mid(im[23], im[24]);
      const A = seen(im, 27, 28) ? mid(im[27], im[28]) : null;
      if (A) {
        const ax = S.x - A.x, ay = S.y - A.y;
        const L = Math.hypot(ax, ay) || 1;
        const torso = Math.hypot(S.x - Hp.x, S.y - Hp.y) || 0.1;
        const horizontal = Math.abs(ay) < 0.6 * Math.abs(ax);
        for (const [side, g] of Object.entries(this.legs)) {
          if ((im[g.k].visibility ?? 1) < 0.5) continue;
          const drive = ((im[g.k].x - im[g.h].x) * ax + (im[g.k].y - im[g.h].y) * ay) / L / torso;
          g.d = damp(g.d, horizontal ? clamp(drive / 0.4) : 0, 25, dt);
          if (g.d < 0.15) g.armed = true;
          if (g.armed && g.d > 0.5) {
            g.armed = false;
            if (this.lastStep >= 0) {
              const iv = this.t - this.lastStep;
              if (iv > 0.1) this.cadence = lerp(this.cadence, clamp(1 / iv, 0, 6), 0.5);
            }
            this.lastStep = this.t;
            events.push({ type: "step", side });
          }
        }
      }
    }
    if (this.t - this.lastStep > 0.8) this.cadence *= Math.exp(-dt * 2);
    return { left: this.legs.left.d, right: this.legs.right.d, cadence: this.cadence, events };
  }
}

// ---------- Scene ----------
const GOAT_LINES = ["Baa-rilliant!", "Nice legs!", "Keep climbing!", "Baaa!"];

class CliffScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const r = mulberry32(17);
    this.cracks = Array.from({ length: 40 }, () => ({ y: r() * 2000, x: r(), len: 20 + r() * 50, a: r() * 6 }));
    this.clouds = Array.from({ length: 6 }, () => ({ x: r(), y: r() * 1500, s: 0.6 + r() * 0.8 }));
    this.alt = 0;
    this.shown = 0;
    this.steps = 0;
    this.left = 0;
    this.right = 0;
    this.goatSaid = -1;
  }

  onResize() {
    this.fig = Math.min(this.H * 0.4, (this.W - this.inset) * 0.3);
    this.wallX = this.cx + this.fig * 0.1;
    this.ppm = this.H / 12; // pixels per metre of cliff
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.left = damp(this.left, signal.left ?? 0, 25, dt);
    this.right = damp(this.right, signal.right ?? 0, 25, dt);
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "step") continue;
      this.steps++;
      this.alt += 0.45;
      if (this.steps % 20 === 0) sfx.pop();
    }
    this.shown = damp(this.shown, this.alt, 6, dt);
    const flag = Math.floor(this.alt / 25);
    if (flag > 0 && flag !== this.goatSaid) {
      this.goatSaid = flag;
      this.fx.word(`${flag * 25} m!`, this.cx, this.topY + this.fig * 0.15, { size: this.fig * 0.16, color: "#fff" });
      sfx.ding();
    }
  }

  draw() {
    const ctx = this.begin();
    const { W, H, fig, wallX, ppm } = this;
    const alt = this.shown;
    const high = clamp(alt / 150); // bluer sky and snow as you climb

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `rgb(${Math.round(90 - 60 * high)},${Math.round(160 - 80 * high)},${Math.round(230 - 60 * high)})`);
    sky.addColorStop(1, "#e3f2fd");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // Distant valley falling away below.
    const valley = H + alt * ppm * 0.08;
    ctx.fillStyle = "#90a4ae";
    ctx.beginPath();
    ctx.moveTo(this.inset, valley);
    for (let x = this.inset; x <= wallX; x += 20) ctx.lineTo(x, valley - H * 0.2 - Math.sin(x * 0.01) * H * 0.06);
    ctx.lineTo(wallX, H + 20);
    ctx.lineTo(this.inset, H + 20);
    ctx.fill();
    // Clouds drift down past you as you climb.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const c of this.clouds) {
      const y = ((c.y + alt * ppm * 0.6) % (H * 1.6)) - H * 0.3;
      const x = this.inset + c.x * (wallX - this.inset);
      const r = fig * 0.12 * c.s;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.arc(x + r, y - r * 0.4, r * 1.2, 0, TAU);
      ctx.arc(x + r * 2.1, y, r * 0.9, 0, TAU);
      ctx.fill();
    }

    // The cliff face, scrolling down.
    const rock = ctx.createLinearGradient(wallX, 0, W, 0);
    rock.addColorStop(0, "#8d6e63");
    rock.addColorStop(1, "#4e342e");
    ctx.fillStyle = rock;
    ctx.fillRect(wallX, -20, W - wallX + 20, H + 40);
    const scroll = alt * ppm;
    ctx.strokeStyle = "rgba(40,20,10,0.45)";
    ctx.lineWidth = 2;
    for (const c of this.cracks) {
      const y = ((c.y + scroll) % 2000) - 300;
      if (y < -60 || y > H + 60) continue;
      const x = wallX + 10 + c.x * (W - wallX - 20);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(c.a) * c.len * 0.4, y + c.len * 0.5);
      ctx.lineTo(x + Math.sin(c.a) * c.len * 0.3, y + c.len);
      ctx.stroke();
    }
    // Snow patches higher up.
    if (high > 0.2) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * high})`;
      for (const c of this.cracks.slice(0, 14)) {
        const y = ((c.y * 1.3 + scroll) % 2000) - 300;
        ctx.beginPath();
        ctx.ellipse(wallX + 20 + c.x * (W - wallX) * 0.8, y, 30, 8, 0, 0, TAU);
        ctx.fill();
      }
    }
    // Ledges every 25 m, with a goat on each one.
    for (let m = Math.floor(alt / 25) * 25 - 25; m <= alt + 25; m += 25) {
      if (m <= 0) continue;
      const y = H * 0.55 - (m - alt) * ppm;
      if (y < -80 || y > H + 80) continue;
      ctx.fillStyle = "#6d4c41";
      ctx.fillRect(wallX - fig * 0.35, y, fig * 0.35, 10);
      this.drawGoat(wallX - fig * 0.2, y, fig * 0.3);
      if (Math.abs(y - H * 0.5) < H * 0.25) {
        ctx.fillStyle = "#fff";
        ctx.font = `600 ${fig * 0.07}px Outfit, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(GOAT_LINES[(m / 25) % GOAT_LINES.length], wallX - fig * 0.2, y - fig * 0.4);
      }
    }
    // Rope from above.
    ctx.strokeStyle = "#ffca28";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wallX - fig * 0.04, -10);
    ctx.lineTo(wallX - fig * 0.04, H * 0.5);
    ctx.stroke();

    // You: the mountain-climber pose, turned upright against the wall.
    const p = this.auto && this.pose ? this.pose : mix(KNEE_R, KNEE_L, clamp(0.5 + (this.left - this.right) / 2));
    ctx.save();
    ctx.translate(wallX - 0.28 * fig, H * 0.58);
    ctx.rotate(-Math.PI / 2);
    drawFigure(ctx, p, 0, 0, fig, LOOKS.climber);
    ctx.restore();

    comicText(ctx, `${Math.floor(alt)} m`, this.cx - fig * 0.7, this.topY, fig * 0.22, "#ffffff");
    vignette(ctx, W, H, 0.22);
    this.fx.draw(ctx);
  }

  drawGoat(x, y, s) {
    const { ctx } = this;
    ctx.fillStyle = "#fafafa";
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.3, s * 0.35, s * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + s * 0.32, y - s * 0.5, s * 0.13, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#5d4037";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + s * 0.3, y - s * 0.66, s * 0.1, Math.PI, Math.PI * 1.8);
    ctx.stroke();
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = s * 0.07;
    for (const dx of [-0.22, -0.08, 0.1, 0.22]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * s, y - s * 0.2);
      ctx.lineTo(x + dx * s, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#1d1d1d";
    ctx.beginPath();
    ctx.arc(x + s * 0.36, y - s * 0.53, s * 0.025, 0, TAU);
    ctx.fill();
  }

  hud() {
    return `Altitude ${Math.floor(this.alt)} m · Steps ${this.steps}`;
  }

  stats() {
    return { meters: this.alt, steps: this.steps };
  }
}

export const climber = {
  id: "climber",
  name: "Mountain Climbers",
  world: "Cliff Climb",
  color: "#a1887f",
  view: "plank",
  frame: { x0: -0.72, x1: 0.82, y0: -0.36, y1: 0.34 },
  floor: 0.29,
  met: 8,
  blurb: "Core and cardio: from a high plank, drive your knees in to climb a real cliff past the mountain goats.",
  say: "Mountain climbers! Drive those knees and climb.",
  repEvent: "step",
  summary: (st) => `${Math.floor(st.meters ?? 0)} m climbed`,

  // One knee drive per beat.
  coach(t, tempo) {
    const steps = 2.2 * tempo * t;
    const u = (steps / 2) % 1;
    const s = (1 - Math.cos(TAU * u)) / 2;
    return {
      pose: mix(KNEE_R, KNEE_L, s),
      signal: { left: s, right: 1 - s, cadence: 2.2 * tempo },
      count: Math.floor(steps),
      cue: "DRIVE YOUR KNEES!",
      beat: steps,
      bpm: 132 * tempo,
    };
  },
  event: (k) => ({ type: "step", side: k % 2 ? "left" : "right" }),
  createDetector: () => new ClimberDetector(),
  createScene: (canvas, opts) => new CliffScene(canvas, opts),
};
