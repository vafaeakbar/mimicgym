// Squat & Lift → Lift It! Squat to grab whatever rolls in on the conveyor,
// stand up and lift it overhead… then see what happens. Bombs go KABOOM,
// sleeping dogs wake up happy, logs snap, boulders crumble, gifts burst.
import { Scene } from "../scene.js";
import { FRONT, SQUAT_DOWN, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, easeOut, kneeAngle, lerp, mulberry32 } from "../util.js";
import { drawGlove, comicText, star, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view) ----------
const STAND = pose(FRONT, {
  le: [-0.2, -0.32], lw: [-0.2, -0.08], re: [0.2, -0.32], rw: [0.2, -0.08],
  lk: [-0.12, 0.3], la: [-0.14, 0.6], rk: [0.12, 0.3], ra: [0.14, 0.6],
});
const HOLD = pose(STAND, { le: [-0.2, -0.34], lw: [-0.1, -0.44], re: [0.2, -0.34], rw: [0.1, -0.44] });
const PRESS = pose(STAND, { le: [-0.22, -0.82], lw: [-0.06, -1.02], re: [0.22, -0.82], rw: [0.06, -1.02] });

// Rep timeline as a fraction of one bar (4 beats = 16 music steps):
// grab on step 6, the lift/payoff on step 13 (the music's big hit).
const GRAB_AT = 6 / 16;
const LIFT_AT = 13 / 16;

// ---------- Camera detector ----------
// Depth blends knee bend (3D) with how far the hips drop in the image, relative
// to your standing height from calibration, so it works even if the ankles
// flicker in and out of view.
export class SquatDetector {
  constructor(calib) {
    this.calib = calib;
    this.depth = 0;
    this.lift = 0;
    this.down = false;
    this.baseHipY = calib?.hipY ?? null;
    this.torso = calib?.torso ?? null;
    this.standAng = calib?.kneeAng ?? 170;
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m?.hip) {
      this.baseHipY ??= m.hip.y;
      if (this.torso === null || (this.depth < 0.1 && !this.calib)) this.torso = damp(this.torso ?? m.torso, m.torso, 2, dt);
      const drop = clamp((m.hip.y - this.baseHipY) / (this.torso * 0.5));
      const ang = kneeAngle(pose.world);
      const knee = ang === null ? null : clamp((this.standAng - ang) / (this.standAng - 95));
      const raw = knee === null ? drop : (drop + knee) / 2;
      this.depth = damp(this.depth, raw, 18, dt);
      // Follow slow drift (stepping closer/further) only while standing tall.
      if (raw < 0.12 && !this.down) this.baseHipY = damp(this.baseHipY, m.hip.y, 0.6, dt);
      const im = m.im;
      const wy = (im[15].y + im[16].y) / 2;
      this.lift = damp(this.lift, clamp((m.sh.y - wy) / (this.torso * 0.6)), 15, dt);
    }
    if (!this.down && this.depth > 0.55) {
      this.down = true;
      events.push({ type: "grab" });
    } else if (this.down && this.depth < 0.2) {
      this.down = false;
      events.push({ type: "lift", strength: 1 + this.lift * 0.5 });
    }
    return { depth: this.depth, lift: this.lift, events };
  }
}

// ---------- Items ----------
const INK = "rgba(25,28,32,0.55)";
function ink(ctx, s) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.022;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();
}

function drawDog(ctx, s, { awake = false, t = 0, run = 0 } = {}) {
  const fur = "#d9a066", dark = "#a0693a", light = "#f5dcb4";
  if (run) {
    // Running, facing right.
    ctx.strokeStyle = INK;
    ctx.lineWidth = s * 0.08;
    ctx.lineCap = "round";
    for (const k of [0, Math.PI]) {
      for (const x of [-0.28, 0.24]) {
        const sw = Math.sin(t * 22 + k + x * 3) * s * 0.12;
        ctx.beginPath();
        ctx.moveTo(x * s, s * 0.12);
        ctx.lineTo(x * s + sw, s * 0.36);
        ctx.stroke();
      }
    }
  }
  // Tail (wags when awake).
  ctx.save();
  ctx.translate(-s * 0.46, -s * 0.02);
  ctx.rotate(awake ? Math.sin(t * 30) * 0.6 - 0.6 : 0.4);
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(-s * 0.12, 0, s * 0.16, s * 0.06, 0, 0, TAU);
  ink(ctx, s);
  ctx.restore();
  // Body.
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.06, s * 0.5, s * 0.26, 0, 0, TAU);
  ink(ctx, s);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-s * 0.12, -s * 0.04, s * 0.14, s * 0.1, 0.3, 0, TAU);
  ctx.fill();
  // Head (faces right).
  const hx = s * 0.36, hy = awake ? -s * 0.2 : -s * 0.02;
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.arc(hx, hy, s * 0.21, 0, TAU);
  ink(ctx, s);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(hx + s * 0.16, hy + s * 0.07, s * 0.13, s * 0.09, 0, 0, TAU);
  ink(ctx, s);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hx + s * 0.27, hy + s * 0.04, s * 0.04, 0, TAU);
  ctx.fill();
  ctx.fillStyle = dark; // floppy ear
  ctx.beginPath();
  ctx.ellipse(hx - s * 0.1, hy + s * 0.02, s * 0.07, s * 0.16, awake ? -0.6 : 0.3, 0, TAU);
  ink(ctx, s);
  // Eyes: sleepy arcs, or wide open.
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.03;
  if (awake) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(hx + s * 0.05, hy - s * 0.06, s * 0.05, 0, TAU);
    ink(ctx, s);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(hx + s * 0.065, hy - s * 0.055, s * 0.025, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ff6b8b"; // tongue
    ctx.beginPath();
    ctx.ellipse(hx + s * 0.2, hy + s * 0.17, s * 0.04, s * 0.07, 0.2, 0, TAU);
    ink(ctx, s);
  } else {
    ctx.beginPath();
    ctx.arc(hx + s * 0.05, hy - s * 0.06, s * 0.045, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
}

function drawBomb(ctx, s, { held = false, t = 0 } = {}) {
  ctx.fillStyle = "#263238";
  ctx.beginPath();
  ctx.arc(0, s * 0.04, s * 0.42, 0, TAU);
  ink(ctx, s);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, -s * 0.12, s * 0.09, s * 0.14, -0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#607d8b";
  ctx.beginPath();
  ctx.roundRect(-s * 0.11, -s * 0.46, s * 0.22, s * 0.12, s * 0.03);
  ink(ctx, s);
  ctx.strokeStyle = "#8d6e63";
  ctx.lineWidth = s * 0.045;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.46);
  ctx.quadraticCurveTo(s * 0.04, -s * 0.62, s * 0.16, -s * 0.64);
  ctx.stroke();
  if (held) {
    // Fizzing fuse.
    const r = s * (0.07 + Math.random() * 0.06);
    ctx.fillStyle = Math.sin(t * 40) > 0 ? "#ffeb3b" : "#ff9800";
    ctx.beginPath();
    star(ctx, s * 0.17, -s * 0.65, r, r * 0.45);
    ctx.fill();
  }
}

function drawLog(ctx, s) {
  ctx.fillStyle = "#8d5a2b";
  ctx.beginPath();
  ctx.roundRect(-s * 0.62, -s * 0.2, s * 1.2, s * 0.4, s * 0.12);
  ink(ctx, s);
  ctx.strokeStyle = "#5d3a1a";
  ctx.lineWidth = s * 0.025;
  for (const [x, y, w] of [[-0.4, -0.08, 0.3], [-0.05, 0.06, 0.35], [0.1, -0.1, 0.22]]) {
    ctx.beginPath();
    ctx.moveTo(x * s, y * s);
    ctx.lineTo((x + w) * s, y * s);
    ctx.stroke();
  }
  ctx.fillStyle = "#e3b27a";
  ctx.beginPath();
  ctx.ellipse(s * 0.58, 0, s * 0.1, s * 0.2, 0, 0, TAU);
  ink(ctx, s);
  ctx.strokeStyle = "#b07b45";
  for (const r of [0.12, 0.06]) {
    ctx.beginPath();
    ctx.ellipse(s * 0.58, 0, s * r * 0.5, s * r, 0, 0, TAU);
    ctx.stroke();
  }
}

const ROCK = (() => {
  const r = mulberry32(3);
  return Array.from({ length: 10 }, (_, i) => [(i / 10) * TAU, 0.4 + r() * 0.1]);
})();
function drawBoulder(ctx, s) {
  ctx.fillStyle = "#9e9e9e";
  ctx.beginPath();
  for (const [a, r] of ROCK) ctx.lineTo(Math.cos(a) * s * r * 1.1, Math.sin(a) * s * r * 0.9);
  ctx.closePath();
  ink(ctx, s);
  ctx.strokeStyle = "#616161";
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.3);
  ctx.lineTo(-s * 0.02, -s * 0.1);
  ctx.lineTo(-s * 0.14, s * 0.08);
  ctx.moveTo(s * 0.15, s * 0.05);
  ctx.lineTo(s * 0.28, s * 0.18);
  ctx.stroke();
  ctx.fillStyle = "#7cb342";
  ctx.beginPath();
  ctx.ellipse(s * 0.12, -s * 0.32, s * 0.12, s * 0.05, 0.2, 0, TAU);
  ctx.fill();
}

function drawGift(ctx, s) {
  ctx.fillStyle = "#ec407a";
  ctx.beginPath();
  ctx.roundRect(-s * 0.38, -s * 0.28, s * 0.76, s * 0.62, s * 0.04);
  ink(ctx, s);
  ctx.fillStyle = "#ffeb3b";
  ctx.fillRect(-s * 0.07, -s * 0.28, s * 0.14, s * 0.62);
  ctx.fillRect(-s * 0.38, -s * 0.02, s * 0.76, s * 0.12);
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(k * s * 0.12, -s * 0.36, s * 0.13, s * 0.08, k * 0.5, 0, TAU);
    ink(ctx, s);
  }
}

// w = half-width (in item sizes) so the gloves grip the sides.
const ITEMS = [
  { id: "dog", w: 0.62, draw: (ctx, s, st) => drawDog(ctx, s, { t: st.t }) },
  { id: "bomb", w: 0.46, draw: (ctx, s, st) => drawBomb(ctx, s, st) },
  { id: "log", w: 0.68, draw: (ctx, s) => drawLog(ctx, s) },
  { id: "boulder", w: 0.52, draw: (ctx, s) => drawBoulder(ctx, s) },
  { id: "gift", w: 0.44, draw: (ctx, s) => drawGift(ctx, s) },
];

// Shuffle-bag so every item shows up once per round, never twice in a row.
function makeBag() {
  let bag = [];
  let last = -1;
  return () => {
    if (!bag.length) {
      bag = ITEMS.map((_, i) => i).sort(() => Math.random() - 0.5);
      if (bag[0] === last) bag.push(bag.shift());
    }
    last = bag.shift();
    return last;
  };
}

const BOMB_LINES = ["...my eyebrows!", "Totally fine!", "Who packed that?!", "Still got it!"];

// ---------- Scene ----------
class LiftScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.next = makeBag();
    this.queue = [this.next(), this.next(), this.next()];
    this.state = "arrive";
    this.arrive = 0;
    this.depth = 0;
    this.lift = 0;
    this.flash = 0;
    this.soot = 0;
    this.actors = [];
    this.itemPos = { x: 0, y: 0 };
    this.counts = { lifted: 0, dogs: 0, booms: 0, logs: 0 };
  }

  onResize() {
    this.beltY = this.H * 0.76;
    this.size = Math.min(this.H * 0.2, (this.W - this.inset) * 0.22);
  }

  update(dt, signal) {
    this.step(dt);
    this.depth = damp(this.depth, signal.depth ?? 0, 20, dt);
    this.lift = damp(this.lift, signal.lift ?? 0, 20, dt);
    if (this.state === "arrive") {
      this.arrive = Math.min(1, this.arrive + dt / 0.55);
      if (this.arrive >= 1) this.state = "ready";
    }
    for (const e of signal.events) {
      if (e.type === "grab" && this.state !== "held") {
        this.state = "held";
        this.arrive = 1;
        sfx.pop();
      } else if (e.type === "lift" && this.state === "held") {
        this.payoff(e.strength ?? 1);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    this.soot = Math.max(0, this.soot - dt * 0.4);
    for (const a of this.actors) {
      a.age += dt;
      a.vy += (a.g ?? 1400) * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += (a.vr ?? 0) * dt;
      if (a.kind === "dog" && a.y > this.beltY - this.size * 0.36) {
        a.y = this.beltY - this.size * 0.36; // landed: run off happily
        a.vy = 0;
        a.vx = 560;
      }
    }
    this.actors = this.actors.filter((a) => a.age < 4 && a.x < this.W + this.size * 2 && a.y < this.H + this.size);
  }

  payoff(strength) {
    const it = ITEMS[this.queue[0]];
    const { x, y } = this.itemPos;
    const S = this.size;
    const word = (text, o = {}) => this.fx.word(text, x, Math.max(y - S * 0.9, this.H * 0.26), { size: S * 0.42, ...o });
    this.counts.lifted++;
    switch (it.id) {
      case "bomb":
        this.counts.booms++;
        this.fx.burst(x, y, { count: 60, colors: ["#ffeb3b", "#ff9800", "#f44336", "#424242"], speed: 750 * strength, gravity: 500, size: S * 0.07, shape: "blob" });
        this.fx.burst(x, y, { count: 14, colors: ["#9e9e9e", "#bdbdbd"], speed: 160, gravity: -80, size: S * 0.16, life: 1.5 });
        word("KABOOM!", { color: "#ff9800", size: S * 0.55 });
        this.fx.word(BOMB_LINES[this.counts.booms % BOMB_LINES.length], x, y + S * 0.6, { size: S * 0.2, color: "#fff", life: 1.6 });
        this.flash = 1;
        this.soot = 1;
        this.fx.kick(22);
        sfx.boom();
        break;
      case "dog":
        this.counts.dogs++;
        this.actors.push({ kind: "dog", x, y, vx: 60, vy: -360, rot: 0, age: 0 });
        this.fx.burst(x, y - S * 0.3, { count: 8, colors: ["#ff5c8a", "#ff8fab"], speed: 260, gravity: 200, size: S * 0.06, shape: "star" });
        word(["WOOF!", "GOOD MORNING!", "WALKIES?!", "BORK!"][this.counts.dogs % 4], { color: "#ffd54f" });
        sfx.woof();
        break;
      case "log":
        this.counts.logs++;
        for (const k of [-1, 1]) this.actors.push({ kind: "half", side: k, x: x + k * S * 0.3, y, vx: k * 380, vy: -520, rot: 0, vr: k * 7, age: 0 });
        this.fx.burst(x, y, { count: 26, colors: ["#8d5a2b", "#e3b27a", "#5d3a1a"], speed: 520, gravity: 900, size: S * 0.05, shape: "rect" });
        word("CRACK!", { color: "#ffe14d" });
        this.fx.kick(12);
        sfx.crack();
        break;
      case "boulder":
        this.fx.burst(x, y, { count: 50, colors: ["#9e9e9e", "#757575", "#bdbdbd", "#7cb342"], speed: 560 * strength, gravity: 1000, size: S * 0.06, shape: "rect" });
        this.fx.burst(x, y, { count: 10, colors: ["rgba(200,200,200,0.8)"], speed: 120, gravity: -40, size: S * 0.14, life: 1.2 });
        word("CRUMBLE!", { color: "#e0e0e0" });
        this.fx.kick(14);
        sfx.crunch();
        break;
      default:
        this.fx.burst(x, y, { count: 80, colors: ["#ffeb3b", "#ec407a", "#42a5f5", "#66bb6a", "#ab47bc"], speed: 650, gravity: 420, size: S * 0.05, shape: "rect", life: 1.6 });
        word("SURPRISE!", { color: "#ff80ab" });
        sfx.pop();
        sfx.ding();
    }
    this.queue.shift();
    this.queue.push(this.next());
    this.state = "arrive";
    this.arrive = 0;
  }

  draw() {
    const ctx = this.begin();
    const { W, H, cx, size, beltY } = this;

    // Warehouse wall.
    const wall = ctx.createLinearGradient(0, 0, 0, beltY);
    wall.addColorStop(0, "#cfe3f0");
    wall.addColorStop(1, "#a9c7da");
    ctx.fillStyle = wall;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.strokeStyle = "rgba(60,90,110,0.15)";
    ctx.lineWidth = 2;
    const brick = Math.max(36, size * 0.35);
    for (let y = 0, row = 0; y < beltY; y += brick * 0.5, row++) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      for (let x = (row % 2) * brick * 0.5; x < W; x += brick) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + brick * 0.5);
        ctx.stroke();
      }
    }

    // Overhead work lights.
    for (const lx of [cx - size * 2.2, cx, cx + size * 2.2]) {
      ctx.fillStyle = "#263238";
      ctx.fillRect(lx - size * 0.3, 0, size * 0.6, size * 0.1);
      const cone = ctx.createLinearGradient(0, size * 0.1, 0, beltY);
      cone.addColorStop(0, "rgba(255,248,225,0.35)");
      cone.addColorStop(1, "rgba(255,248,225,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(lx - size * 0.28, size * 0.1);
      ctx.lineTo(lx + size * 0.28, size * 0.1);
      ctx.lineTo(lx + size * 1.1, beltY);
      ctx.lineTo(lx - size * 1.1, beltY);
      ctx.fill();
    }

    // Conveyor belt.
    const beltH = size * 0.28;
    const beltG = ctx.createLinearGradient(0, beltY, 0, beltY + beltH);
    beltG.addColorStop(0, "#607d8b");
    beltG.addColorStop(0.3, "#37474f");
    beltG.addColorStop(1, "#1c262b");
    ctx.fillStyle = beltG;
    ctx.beginPath();
    ctx.roundRect(this.inset - 20, beltY, W - this.inset + 40, beltH, beltH / 2);
    ctx.fill();
    const scroll = (this.counts.lifted + easeOut(this.arrive)) * size * 1.6;
    ctx.strokeStyle = "#546e7a";
    ctx.lineWidth = 4;
    for (let x = this.inset - (scroll % 40); x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, beltY + 4);
      ctx.lineTo(x - 10, beltY + beltH - 4);
      ctx.stroke();
    }
    ctx.fillStyle = "#546e7a";
    ctx.fillRect(0, beltY + beltH, W, H);

    // Lift-o-meter plate on the front of the machine (never in the lift path).
    const plateW = size * 2.2, plateH = size * 0.42, plateY = beltY + beltH + 8;
    ctx.fillStyle = "#263238";
    ctx.beginPath();
    ctx.roundRect(cx - plateW / 2, plateY, plateW, plateH, 10);
    ctx.fill();
    ctx.fillStyle = "#80deea";
    ctx.font = `${size * 0.16}px Anton, Impact, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("LIFT-O-METER", cx - plateW / 2 + size * 0.14, plateY + plateH / 2);
    comicText(ctx, String(this.counts.lifted), cx + plateW / 2 - size * 0.32, plateY + plateH / 2, size * 0.3, "#ffe14d");

    const restY = beltY - size * 0.45;
    const slide = (1 - easeOut(this.arrive)) * size * 1.6;
    const st = { t: this.time, held: false };
    for (let i = this.queue.length - 1; i >= 1; i--) {
      ctx.save();
      ctx.translate(cx + i * size * 1.6 + slide, restY);
      ITEMS[this.queue[i]].draw(ctx, size, st);
      ctx.restore();
    }

    // Hands follow squat depth: down to the item, back up carrying it, then overhead.
    const topY = H * 0.34;
    let handY = lerp(topY, restY, this.depth);
    const held = this.state === "held";
    if (held) handY = lerp(handY, H * 0.24, this.lift);
    const item = ITEMS[this.queue[0]];
    const itemX = cx + (held ? 0 : slide);
    const itemY = held ? handY : restY;
    this.itemPos = { x: itemX, y: itemY };

    ctx.save();
    ctx.translate(itemX, itemY);
    if (held) ctx.rotate(Math.sin(this.time * 18) * 0.04 * (0.4 + this.lift));
    item.draw(ctx, size, { t: this.time, held });
    ctx.restore();
    if (item.id === "dog" && this.state !== "arrive") {
      comicText(ctx, "z Z z", itemX + size * 0.5, itemY - size * 0.55 - Math.sin(this.time * 2) * 6, size * 0.18, "#fff");
    }

    for (const a of this.actors) {
      ctx.save();
      ctx.translate(a.x, a.y);
      if (a.kind === "dog") drawDog(ctx, size, { awake: true, t: this.time, run: a.vx > 100 });
      else {
        ctx.rotate(a.rot);
        ctx.beginPath();
        ctx.rect(-size * 0.3, -size * 0.2, size * 0.6, size * 0.4);
        ctx.clip();
        ctx.translate(a.side * -size * 0.3, 0);
        drawLog(ctx, size);
      }
      ctx.restore();
    }

    const sep = size * (item.w + 0.2);
    const glove = this.soot > 0.05 ? mixHex("#ffffff", "#5a5a5a", this.soot) : "#ffffff";
    drawGlove(ctx, itemX - sep, handY, size * 0.5, 1, glove);
    drawGlove(ctx, itemX + sep, handY, size * 0.5, -1, glove);

    if (this.state === "ready" && this.depth < 0.3) {
      comicText(ctx, "SQUAT TO GRAB!", cx, topY - size * 0.55, size * 0.22, "#fff");
    }

    vignette(ctx, W, H, 0.3);
    this.fx.draw(ctx);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,245,220,${this.flash * 0.7})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
  }

  hud() {
    const c = this.counts;
    return `Lifted ${c.lifted} · Dogs woken ${c.dogs} · Kabooms ${c.booms}`;
  }

  stats() {
    return { ...this.counts };
  }
}

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(",")})`;
}

export const squat = {
  id: "squat",
  name: "Squat & Lift",
  world: "Lift It!",
  color: "#ffb74d",
  view: "front",
  met: 6,
  blurb: "Squat to grab what rolls in, lift it overhead… bombs go boom, sleeping dogs wake up happy.",
  say: "Squat down, grab it, and lift it up high!",
  repEvent: "lift",
  summary: (st) => `${st.lifted ?? 0} lifted · ${st.dogs ?? 0} dogs woken · ${st.booms ?? 0} kabooms`,

  // One rep per bar of music.
  coach(t, tempo) {
    const rep = 2.6 / tempo;
    const beat = (4 * t) / rep;
    const i = Math.floor(t / rep);
    const f = (t % rep) / rep;
    let p, depth, lift = 0, cue;
    if (f < 0.35) {
      const e = easeInOut(f / 0.35);
      p = mix(STAND, SQUAT_DOWN, e);
      depth = e;
      cue = "SQUAT DOWN";
    } else if (f < 0.45) {
      p = SQUAT_DOWN;
      depth = 1;
      cue = "GRAB IT!";
    } else if (f < 0.72) {
      const e = easeInOut((f - 0.45) / 0.27);
      p = mix(SQUAT_DOWN, HOLD, e);
      depth = 1 - e;
      cue = "STAND UP";
    } else if (f < 0.86) {
      lift = easeOut((f - 0.72) / 0.14);
      p = mix(HOLD, PRESS, lift);
      depth = 0;
      cue = "LIFT IT HIGH!";
    } else {
      const e = easeInOut((f - 0.86) / 0.14);
      p = mix(PRESS, STAND, e);
      depth = 0;
      lift = 1 - e;
      cue = "LIFT IT HIGH!";
    }
    return {
      pose: p,
      signal: { depth, lift },
      count: i * 2 + (f >= GRAB_AT ? 1 : 0) + (f >= LIFT_AT ? 1 : 0),
      cue,
      beat,
      bpm: 240 / rep,
    };
  },
  event: (k) => (k % 2 === 0 ? { type: "grab" } : { type: "lift", strength: 1.1 }),
  createDetector: (calib) => new SquatDetector(calib),
  createScene: (canvas, opts) => new LiftScene(canvas, opts),
};
