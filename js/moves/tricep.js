// Overhead Tricep Extensions → Pizza Toss. Hands behind your head, press up
// to toss the dough. Every five tosses a pizza goes to the cat customer.
import { Scene } from "../scene.js";
import { FRONT, LOOKS, drawFigure, floorShadow, mix, pose } from "../figure.js";
import { TAU, clamp, damp, easeInOut, easeOut } from "../util.js";
import { comicText, glow, vignette } from "../fx.js";
import { sfx } from "../audio.js";
import { measure } from "./body.js";

// ---------- Coach (front view) ----------
const BENT = pose(FRONT, {
  behind: true,
  le: [-0.12, -0.82], lw: [-0.04, -0.64], re: [0.12, -0.82], rw: [0.04, -0.64],
  lk: [-0.11, 0.3], la: [-0.13, 0.6], rk: [0.11, 0.3], ra: [0.13, 0.6],
});
const EXT = pose(BENT, { behind: false, lw: [-0.06, -1.08], rw: [0.06, -1.08] });

// ---------- Camera detector ----------
// Elbows stay up by your head; extension = how far the wrists rise above the
// elbows, in forearm lengths.
class TricepDetector {
  constructor() {
    this.ext = 0;
    this.armed = false;
  }

  update(pose, dt) {
    const events = [];
    const m = pose && measure(pose);
    if (m) {
      const im = m.im;
      const sides = [[13, 15], [14, 16]].filter(([e, w]) => (im[e].visibility ?? 1) > 0.5 && (im[w].visibility ?? 1) > 0.5);
      if (sides.length) {
        let ext = 0, elbowsUp = true;
        for (const [e, w] of sides) {
          const fore = Math.hypot(im[e].x - im[w].x, im[e].y - im[w].y) || 0.05;
          ext += clamp(0.5 + (im[e].y - im[w].y) / (2 * fore));
          if (im[e].y > m.sh.y - 0.1 * m.torso) elbowsUp = false;
        }
        this.ext = damp(this.ext, elbowsUp ? ext / sides.length : 0, 20, dt);
        if (elbowsUp && this.ext < 0.35) this.armed = true;
      }
    }
    if (this.armed && this.ext > 0.8) {
      this.armed = false;
      events.push({ type: "toss" });
    }
    return { ext: this.ext, events };
  }
}

// ---------- Scene ----------
const TOPPINGS = ["sauce", "cheese", "pepperoni", "basil"];
const CAT_LINES = ["Mamma mia!", "Purrfetto!", "Meow-velous!", "Another!"];

class PizzaScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.ext = 0;
    this.tosses = 0;
    this.pizzas = 0;
    this.dough = { y: 0, vy: 0, g: 1500, air: false, spin: 0 };
    this.interval = 1.6 / this.tempo;
    this.oven = null; // a finished pizza sliding into the oven
    this.catEat = 0;
  }

  onResize() {
    this.floorY = this.H * 0.94;
    this.fig = Math.min(this.H * 0.3, (this.W - this.inset) * 0.24);
    this.px = this.cx - (this.W - this.inset) * 0.05;
  }

  hands() {
    const p = this.currentPose();
    const w = [(p.lw[0] + p.rw[0]) / 2, (p.lw[1] + p.rw[1]) / 2];
    const hipY = this.floorY - 0.6 * this.fig;
    return { x: this.px + w[0] * this.fig, y: hipY + w[1] * this.fig - this.fig * 0.06 };
  }

  currentPose() {
    return this.auto && this.pose ? this.pose : mix(BENT, EXT, clamp(this.ext));
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.ext = damp(this.ext, signal.ext ?? 0, 25, dt);
    if (this.auto) this.pose = coach.pose;
    if (coach.bpm) this.interval = 120 / coach.bpm;
    const d = this.dough;
    const hand = this.hands();
    for (const e of signal.events) {
      if (e.type !== "toss") continue;
      this.tosses++;
      const T = this.interval * 0.9;
      d.g = (8 * this.fig * 0.9) / (T * T);
      d.vy = (-d.g * T) / 2;
      d.y = hand.y;
      d.air = true;
      sfx.whoosh(0.7);
      if (this.tosses % 5 === 0) this.finishPizza();
    }
    if (d.air) {
      d.vy += d.g * dt;
      d.y += d.vy * dt;
      d.spin += dt * 12;
      if (d.vy > 0 && d.y >= hand.y) d.air = false;
    } else {
      d.y = hand.y;
      d.spin = damp(d.spin, Math.round(d.spin / Math.PI) * Math.PI, 8, dt);
    }
    if (this.oven) {
      this.oven.t += dt / 1.6;
      if (this.oven.t >= 1) {
        this.oven = null;
        this.catEat = 2;
        this.fx.word(CAT_LINES[this.pizzas % CAT_LINES.length], this.catPos().x, this.catPos().y - this.fig * 0.55, { size: this.fig * 0.16, color: "#fff3e0", life: 1.6 });
        sfx.ding();
      }
    }
    this.catEat = Math.max(0, this.catEat - dt);
  }

  finishPizza() {
    this.pizzas++;
    this.oven = { t: 0 };
    this.fx.word("PIZZA READY!", this.cx, this.topY, { size: this.fig * 0.18, color: "#ffcc80" });
  }

  catPos() {
    return { x: this.W - (this.W - this.inset) * 0.14, y: this.floorY - this.fig * 0.55 };
  }

  draw() {
    const ctx = this.begin();
    const { W, H, fig, floorY, px } = this;

    // Warm pizzeria: tiles, brick oven, counter.
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, "#5d3a2a");
    wall.addColorStop(1, "#8d5a3b");
    ctx.fillStyle = wall;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let y = 0; y < floorY * 0.55; y += 34) for (let x = (y / 34) % 2 ? 17 : 0; x < W; x += 34) ctx.fillRect(x, y, 30, 30);
    const ox = this.inset + (W - this.inset) * 0.14, ow = fig * 1.1, oy = floorY - fig * 1.5;
    ctx.fillStyle = "#6d4c41";
    ctx.beginPath();
    ctx.roundRect(ox - ow / 2, oy, ow, fig * 1.5, [ow / 2, ow / 2, 0, 0]);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let y = oy + 20; y < floorY; y += 18) for (let x = ox - ow / 2 + ((y / 18) % 2) * 12; x < ox + ow / 2; x += 24) ctx.fillRect(x, y, 22, 2);
    ctx.fillStyle = "#1b0f0a";
    ctx.beginPath();
    ctx.arc(ox, oy + fig * 0.75, ow * 0.3, Math.PI, 0);
    ctx.lineTo(ox + ow * 0.3, oy + fig * 0.95);
    ctx.lineTo(ox - ow * 0.3, oy + fig * 0.95);
    ctx.fill();
    for (let i = 0; i < 5; i++) glow(ctx, ox + (i - 2) * ow * 0.1, oy + fig * 0.85 - Math.abs(Math.sin(this.time * 6 + i)) * fig * 0.1, fig * 0.18, "rgba(255,140,40,0.8)");
    // Floor.
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(-20, floorY, W + 40, H - floorY + 20);
    // Hanging lamp.
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H * 0.12);
    ctx.stroke();
    glow(ctx, px, H * 0.14, fig * 1.3, "rgba(255,220,150,0.5)");

    // A finished pizza sliding into the oven, then to the cat.
    if (this.oven) {
      const k = easeInOut(this.oven.t);
      this.drawPizza(ox + (1 - k) * fig * 0.8, oy + fig * 0.85, fig * 0.25, 4);
    }

    // The cat customer at their table.
    const c = this.catPos();
    ctx.fillStyle = "#4e342e";
    ctx.fillRect(c.x - fig * 0.45, c.y + fig * 0.2, fig * 0.9, fig * 0.06);
    ctx.fillRect(c.x - fig * 0.05, c.y + fig * 0.2, fig * 0.1, floorY - c.y - fig * 0.2);
    if (this.catEat > 0) this.drawPizza(c.x - fig * 0.1, c.y + fig * 0.16, fig * 0.2, 4, 0.2);
    this.drawCat(c.x + fig * 0.2, c.y, fig * 0.45);

    // You, tossing.
    const p = this.currentPose();
    floorShadow(ctx, px, floorY, fig * 0.35, fig * 0.06, 0.4);
    drawFigure(ctx, p, px, floorY - 0.6 * fig, fig, LOOKS.chef);
    // The dough (with toppings building up), spinning in the air.
    const hand = this.hands();
    const squash = Math.abs(Math.cos(this.dough.spin));
    this.drawPizza(hand.x, this.dough.y - fig * 0.04, fig * 0.2, this.tosses % 5, 1, 0.25 + squash * 0.3);

    comicText(ctx, `${this.pizzas} PIZZAS`, this.cx, this.topY, fig * 0.2, "#ffe0b2");
    vignette(ctx, W, H, 0.3);
    this.fx.draw(ctx);
  }

  // stage 0 = plain dough … 4 = sauce, cheese, pepperoni and basil.
  drawPizza(x, y, r, stage, alpha = 1, squash = 0.35) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha * ctx.globalAlpha;
    ctx.translate(x, y);
    ctx.scale(1, squash);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    g.addColorStop(0, "#fff3d6");
    g.addColorStop(1, "#e3b778");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    if (stage >= 1) {
      ctx.fillStyle = "#d84315";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, 0, TAU);
      ctx.fill();
    }
    if (stage >= 2) {
      ctx.fillStyle = "#ffe082";
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.22, 0, TAU);
        ctx.fill();
      }
    }
    if (stage >= 3) {
      ctx.fillStyle = "#b71c1c";
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + 0.3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.12, 0, TAU);
        ctx.fill();
      }
    }
    if (stage >= 4) {
      ctx.fillStyle = "#43a047";
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6 + 1;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, r * 0.09, r * 0.05, a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawCat(x, y, s) {
    const { ctx } = this;
    ctx.fillStyle = "#ff9800";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.2, s * 0.45, s * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - s * 0.45, s * 0.32, 0, TAU);
    ctx.fill();
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + k * s * 0.3, y - s * 0.55);
      ctx.lineTo(x + k * s * 0.22, y - s * 0.85);
      ctx.lineTo(x + k * s * 0.08, y - s * 0.68);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.3, s * 0.22, s * 0.3, 0, 0, TAU);
    ctx.fill();
    // Eyes: happy arcs while eating, round otherwise.
    ctx.fillStyle = ctx.strokeStyle = "#1d1d1d";
    ctx.lineWidth = 3;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      if (this.catEat > 0) {
        ctx.arc(x + k * s * 0.12, y - s * 0.48, s * 0.05, Math.PI, 0);
        ctx.stroke();
      } else {
        ctx.arc(x + k * s * 0.12, y - s * 0.48, s * 0.045, 0, TAU);
        ctx.fill();
      }
    }
    ctx.beginPath(); // napkin bib
    ctx.fillStyle = "#fafafa";
    ctx.moveTo(x - s * 0.2, y - s * 0.18);
    ctx.lineTo(x + s * 0.2, y - s * 0.18);
    ctx.lineTo(x, y + s * 0.05);
    ctx.fill();
  }

  hud() {
    return `Tosses ${this.tosses} · Pizzas served ${this.pizzas}`;
  }

  stats() {
    return { tosses: this.tosses, pizzas: this.pizzas };
  }
}

export const tricep = {
  id: "tricep",
  name: "Tricep Extensions",
  world: "Pizza Toss",
  color: "#ff8a65",
  view: "front",
  met: 4,
  blurb: "Hands behind your head, elbows up, press to the sky to toss the pizza dough.",
  say: "Tricep extensions. Elbows up, and toss that dough!",
  repEvent: "toss",
  summary: (st) => `${st.tosses ?? 0} tosses · ${st.pizzas ?? 0} pizzas served`,

  // One toss every two beats; arms fully up on the beat.
  coach(t, tempo) {
    const len = 1.6 / tempo;
    const u = t / len + 0.3;
    const i = Math.floor(u);
    const f = u - i;
    let e;
    if (f < 0.3) e = easeOut(f / 0.3);
    else if (f < 0.45) e = 1;
    else if (f < 0.9) e = 1 - easeInOut((f - 0.45) / 0.45);
    else e = 0;
    return {
      pose: mix(BENT, EXT, e),
      signal: { ext: e },
      count: i + (f >= 0.3 ? 1 : 0),
      cue: f < 0.45 ? "PRESS UP!" : "BEHIND YOUR HEAD",
      beat: (2 * t) / len,
      bpm: 120 / len,
    };
  },
  event: () => ({ type: "toss" }),
  createDetector: () => new TricepDetector(),
  createScene: (canvas, opts) => new PizzaScene(canvas, opts),
};
