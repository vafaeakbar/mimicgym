// Dumbbell Romanian Deadlift → Anchor Pull. Hinge at the hips and stand tall
// to haul a treasure chest up from the seabed.
import { Scene } from "../scene.js";
import { LOOKS, drawDumbbells, drawFigure, floorShadow, mix } from "../figure.js";
import { TAU, clamp, damp, easeInOut, lerp, mid, mulberry32, seen } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";

// ---------- Coach (side view, facing right, dumbbells hanging) ----------
export const STAND_D = {
  back: "l",
  head: [0.02, -0.77], neck: [0.02, -0.6], hip: [0, 0],
  rs: [0.03, -0.56], re: [0.05, -0.3], rw: [0.07, -0.04],
  ls: [0.0, -0.56], le: [0.02, -0.3], lw: [0.04, -0.04],
  rh: [0.01, 0], rk: [0.03, 0.3], ra: [0.02, 0.6],
  lh: [-0.01, 0], lk: [-0.01, 0.3], la: [-0.02, 0.6],
};
// Hips back, flat back, soft knees, weights sliding down the legs.
export const HINGE = {
  back: "l",
  head: [0.54, -0.3], neck: [0.4, -0.24], hip: [-0.12, 0.02],
  rs: [0.38, -0.22], re: [0.38, 0.04], rw: [0.38, 0.3],
  ls: [0.36, -0.23], le: [0.36, 0.03], lw: [0.36, 0.29],
  rh: [-0.11, 0.02], rk: [0.04, 0.3], ra: [0.02, 0.6],
  lh: [-0.13, 0.02], lk: [0.02, 0.3], la: [-0.02, 0.6],
};

// ---------- Camera detector ----------
// Hinge = how far the torso tips from vertical, in 3D (works facing the camera
// or side-on).
export function torsoTilt(world) {
  if (!seen(world, 11, 12, 23, 24)) return null;
  const S = mid(world[11], world[12]), Hp = mid(world[23], world[24]);
  const dx = S.x - Hp.x, dy = S.y - Hp.y, dz = S.z - Hp.z;
  return (Math.acos(clamp(-dy / (Math.hypot(dx, dy, dz) || 1), -1, 1)) * 180) / Math.PI;
}

class HingeDetector {
  constructor() {
    this.hinge = 0;
    this.down = false;
  }

  update(pose, dt) {
    const events = [];
    const tilt = pose && torsoTilt(pose.world);
    if (tilt !== null && tilt !== undefined) this.hinge = damp(this.hinge, clamp((tilt - 15) / 45), 15, dt);
    if (!this.down && this.hinge > 0.7) this.down = true;
    else if (this.down && this.hinge < 0.2) {
      this.down = false;
      events.push({ type: "pull" });
    }
    return { hinge: this.hinge, events };
  }
}

// ---------- Scene ----------
const PULLS = 6;
const FINDS = ["Arr, treasure!", "Blub blub!", "Gold!!", "Shiny!"];

class AnchorScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    const r = mulberry32(4);
    this.fish = Array.from({ length: 7 }, () => ({ x: r(), y: 0.2 + r() * 0.7, s: 0.6 + r() * 0.8, v: 0.03 + r() * 0.05, d: r() < 0.5 ? 1 : -1 }));
    this.weeds = Array.from({ length: 12 }, () => ({ x: r(), h: 0.5 + r() * 0.8, p: r() * 6 }));
    this.hinge = 0;
    this.pulls = 0;
    this.lift = 0;
    this.shown = 0;
    this.chests = 0;
    this.open = 0;
  }

  onResize() {
    this.sea = this.H * 0.52;
    this.deck = this.H * 0.5;
    this.fig = Math.min(this.H * 0.26, (this.W - this.inset) * 0.2);
    this.px = this.inset + (this.W - this.inset) * 0.3;
    this.poleX = this.px + this.fig * 0.95;
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.hinge = damp(this.hinge, signal.hinge ?? 0, 15, dt);
    if (this.auto) this.pose = coach.pose;
    for (const e of signal.events) {
      if (e.type !== "pull" || this.open > 0) continue;
      this.pulls++;
      this.lift = Math.min(PULLS, this.lift + 1);
      sfx.whoosh(0.6);
      if (this.lift >= PULLS) {
        this.chests++;
        this.open = 2.2;
        const cx = this.poleX, cy = this.sea;
        this.fx.burst(cx, cy - 20, { count: 40, colors: ["#ffd54f", "#ffecb3", "#ffca28"], speed: 480, gravity: 700, size: 6, shape: "star" });
        this.fx.word(FINDS[this.chests % FINDS.length], cx, cy - this.fig * 0.9, { size: this.fig * 0.2, color: "#ffe082" });
        sfx.coin();
        sfx.ding();
      }
    }
    if (this.open > 0) {
      this.open -= dt;
      if (this.open <= 0) this.lift = 0; // a new chest sinks to the seabed
    }
    // The chest also rises a little as you stand up, so it feels like you're pulling it.
    this.shown = damp(this.shown, this.lift + (this.open > 0 ? 0 : (1 - this.hinge) * 0.4), 4, dt);
  }

  draw() {
    const ctx = this.begin();
    const { W, H, sea, deck, fig, px, poleX } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, sea);
    sky.addColorStop(0, "#4fc3f7");
    sky.addColorStop(1, "#e1f5fe");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    glow(ctx, W * 0.8, H * 0.14, H * 0.3, "rgba(255,245,200,0.9)");
    const water = ctx.createLinearGradient(0, sea, 0, H);
    water.addColorStop(0, "#0288d1");
    water.addColorStop(1, "#01294a");
    ctx.fillStyle = water;
    ctx.fillRect(-20, sea, W + 40, H - sea + 20);
    // Light rays and seaweed.
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 5; i++) {
      const x = this.inset + ((i * 0.23 + this.time * 0.01) % 1) * (W - this.inset);
      ctx.beginPath();
      ctx.moveTo(x, sea);
      ctx.lineTo(x + 40, sea);
      ctx.lineTo(x + 140, H);
      ctx.lineTo(x + 60, H);
      ctx.fill();
    }
    ctx.strokeStyle = "#2e7d32";
    ctx.lineWidth = 5;
    for (const w of this.weeds) {
      const x = this.inset + w.x * (W - this.inset);
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(x + Math.sin(this.time + w.p) * 20, H - w.h * fig * 0.6, x + Math.sin(this.time * 1.3 + w.p) * 12, H - w.h * fig);
      ctx.stroke();
    }
    for (const f of this.fish) {
      f.x = (f.x + f.v * f.d / 60 + 1) % 1;
      const x = this.inset + f.x * (W - this.inset), y = sea + f.y * (H - sea);
      ctx.fillStyle = "#ffb74d";
      ctx.beginPath();
      ctx.ellipse(x, y, 14 * f.s, 7 * f.s, 0, 0, TAU);
      ctx.moveTo(x - f.d * 12 * f.s, y);
      ctx.lineTo(x - f.d * 22 * f.s, y - 7 * f.s);
      ctx.lineTo(x - f.d * 22 * f.s, y + 7 * f.s);
      ctx.fill();
    }

    // The chest on its rope, rising with every pull.
    const bottom = H - fig * 0.3;
    const cy = lerp(bottom, sea - fig * 0.05, clamp(this.shown / PULLS));
    ctx.strokeStyle = "#d7ccc8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(poleX, deck - fig * 1.3);
    ctx.lineTo(poleX, cy - fig * 0.15);
    ctx.stroke();
    this.drawChest(poleX, cy, fig * 0.35, this.open > 0);

    // Surface ripples.
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    for (let x = -((this.time * 30) % 60); x < W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, sea + 4);
      ctx.quadraticCurveTo(x + 15, sea, x + 30, sea + 4);
      ctx.stroke();
    }

    // Pier with a pulley post.
    ctx.fillStyle = "#6d4c41";
    ctx.fillRect(this.inset - 20, deck, poleX - this.inset + fig * 0.25, fig * 0.12);
    for (let x = this.inset + 10; x < poleX + fig * 0.2; x += fig * 0.5) ctx.fillRect(x, deck, 10, H - deck);
    ctx.fillStyle = "#4e342e";
    ctx.fillRect(poleX - fig * 0.35, deck - fig * 1.35, 8, fig * 1.35);
    ctx.fillRect(poleX - fig * 0.35, deck - fig * 1.35, fig * 0.4, 8);
    ctx.fillStyle = "#9e9e9e";
    ctx.beginPath();
    ctx.arc(poleX, deck - fig * 1.3, 9, 0, TAU);
    ctx.fill();

    // You, deadlifting on the pier.
    const p = this.auto && this.pose ? this.pose : mix(STAND_D, HINGE, easeInOut(clamp(this.hinge)));
    floorShadow(ctx, px + fig * 0.1, deck, fig * 0.35, fig * 0.05, 0.35);
    drawFigure(ctx, p, px, deck - 0.6 * fig, fig, LOOKS.lifter);
    drawDumbbells(ctx, p, px, deck - 0.6 * fig, fig);

    comicText(ctx, `${this.lift}/${PULLS}`, this.cx, this.topY, fig * 0.26, "#ffffff");
    vignette(ctx, W, H, 0.25);
    this.fx.draw(ctx);
  }

  drawChest(x, y, s, open) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#6d4c41";
    ctx.fillRect(-s, -s * 0.2, s * 2, s * 0.9);
    ctx.fillStyle = "#ffca28";
    ctx.fillRect(-s, -s * 0.2, s * 2, s * 0.1);
    ctx.fillRect(-s * 0.1, -s * 0.2, s * 0.2, s * 0.9);
    ctx.save();
    ctx.translate(-s, -s * 0.2);
    ctx.rotate(open ? -1.1 : 0);
    ctx.fillStyle = "#795548";
    ctx.beginPath();
    ctx.roundRect(0, -s * 0.5, s * 2, s * 0.5, [s * 0.4, s * 0.4, 0, 0]);
    ctx.fill();
    ctx.restore();
    if (open) glow(ctx, 0, -s * 0.3, s * 1.5, "rgba(255,213,79,0.9)");
    ctx.restore();
  }

  hud() {
    return `Pulls ${this.pulls} · Chests raised ${this.chests}`;
  }

  stats() {
    return { pulls: this.pulls, chests: this.chests };
  }
}

export const rdl = {
  id: "rdl",
  name: "Romanian Deadlift",
  world: "Anchor Pull",
  color: "#4fc3f7",
  view: "side",
  weights: true,
  met: 5,
  blurb: "Hips back, flat back, dumbbells slide down your legs, then stand tall to haul up the treasure.",
  say: "Romanian deadlifts. Hips back, flat back, and pull up that treasure.",
  repEvent: "pull",
  summary: (st) => `${st.pulls ?? 0} pulls · ${st.chests ?? 0} treasure chests`,

  // One rep per bar; standing tall lands on beat 4.
  coach(t, tempo) {
    const len = 3.0 / tempo;
    const i = Math.floor(t / len);
    const f = (t % len) / len;
    let e;
    if (f < 0.45) e = easeInOut(f / 0.45);
    else if (f < 0.55) e = 1;
    else if (f < 0.85) e = 1 - easeInOut((f - 0.55) / 0.3);
    else e = 0;
    return {
      pose: mix(STAND_D, HINGE, e),
      signal: { hinge: e },
      count: i + (f >= 0.8 ? 1 : 0),
      cue: f < 0.55 ? "HIPS BACK" : "STAND TALL",
      beat: (4 * t) / len,
      bpm: 240 / len,
    };
  },
  event: () => ({ type: "pull" }),
  createDetector: () => new HingeDetector(),
  createScene: (canvas, opts) => new AnchorScene(canvas, opts),
};
