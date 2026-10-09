// High-Knee Jog → Goose Chase. Jog in place to outrun an angry goose. Also
// used (gently) for the warm-up and cool-down.
import { Scene } from "../scene.js";
import { LOOKS, drawFigure, floorShadow, mix, shift } from "../figure.js";
import { TAU, clamp, damp, lerp, seen } from "../util.js";
import { comicText, vignette } from "../fx.js";
import { sfx } from "../audio.js";

// ---------- Coach (side view, facing right) ----------
const KA = { // front ("r") knee up, back arm forward
  back: "l",
  head: [0.08, -0.76], neck: [0.05, -0.6], hip: [0, 0],
  rs: [0.05, -0.55], re: [-0.12, -0.36], rw: [-0.06, -0.16],
  ls: [0.03, -0.55], le: [0.14, -0.34], lw: [0.28, -0.48],
  rh: [0.02, 0], rk: [0.24, -0.06], ra: [0.22, 0.26],
  lh: [-0.02, 0], lk: [0.0, 0.3], la: [-0.02, 0.6],
};
const KB = { // back ("l") knee up, front arm forward
  ...KA,
  re: [0.16, -0.34], rw: [0.3, -0.48],
  le: [-0.1, -0.36], lw: [-0.04, -0.16],
  rk: [0.02, 0.3], ra: [0.02, 0.6],
  lk: [0.2, -0.06], la: [0.18, 0.26],
};

export function jogPose(phase) {
  const u = phase % 1;
  const s = (1 - Math.cos(TAU * u)) / 2;
  return shift(mix(KA, KB, s), 0, -0.035 * Math.abs(Math.sin(TAU * u)));
}

// Goose-chase rhythm (seconds within each 20 s cycle): the goose charges at
// 12, you sprint from 14 to 20.
const CYCLE = 20;
const CHARGE = [12, 17];
const SPRINT = 14;

// ---------- Camera detector (also used by the runner) ----------
// Image space: a step is a knee lift (knee rises toward the hip) or a heel
// kick (ankle rises), each measured against your standing leg length, so
// small jogs count as well as proper high knees.
export class JogDetector {
  constructor(calib) {
    this.t = 0;
    this.lastStep = -1;
    this.cadence = 0;
    const leg = () => ({ lift: 0, armed: true, thigh: calib?.thigh ?? null, ankle: calib?.ankleY ?? null });
    this.legs = { left: leg(), right: leg() };
  }

  update(pose, dt) {
    this.t += dt;
    const events = [];
    const im = pose?.image;
    for (const [side, h, k, a] of [["left", 23, 25, 27], ["right", 24, 26, 28]]) {
      if (!im || !seen(im, h, k)) continue;
      const L = this.legs[side];
      const thigh = im[k].y - im[h].y;
      // Standing references follow the longest thigh / lowest ankle seen, slowly forgetting.
      L.thigh = L.thigh === null ? thigh : Math.max(thigh, L.thigh - dt * 0.01);
      let lift = clamp((L.thigh - thigh) / (L.thigh * 0.5));
      if (seen(im, a)) {
        L.ankle = L.ankle === null ? im[a].y : Math.max(im[a].y, L.ankle - dt * 0.01);
        lift = Math.max(lift, clamp((L.ankle - im[a].y) / (L.thigh * 0.45)));
      }
      L.lift = damp(L.lift, lift, 25, dt);
      if (L.lift < 0.15) L.armed = true;
      if (L.armed && L.lift > 0.38) {
        L.armed = false;
        if (this.lastStep >= 0) {
          const iv = this.t - this.lastStep;
          if (iv > 0.12) this.cadence = lerp(this.cadence, clamp(1 / iv, 0, 5), 0.5);
        }
        this.lastStep = this.t;
        events.push({ type: "step", side });
      }
    }
    if (this.t - this.lastStep > 0.9) this.cadence *= Math.exp(-dt * 2);
    return { cadence: this.cadence, events };
  }
}

// ---------- Scene ----------
const SKIES = {
  warmup: ["#ffd3b6", "#ffeedd"],
  main: ["#79c2ff", "#dff1ff"],
  cooldown: ["#6a4c93", "#f7a072"],
};
const STRIDE = 0.85; // metres per step

class GooseScene extends Scene {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.mode = opts.variant ?? "main";
    this.dist = 0;
    this.phase = 0;
    this.cadence = 0;
    this.gap = 5;
    this.honks = 0;
    this.hop = 0;
    this.honkT = 0;
    this.charging = false;
  }

  onResize() {
    this.groundY = this.H * 0.8;
    this.ppm = (this.W - this.inset) / 14; // pixels per metre
    this.fig = this.H * 0.21;
    this.px = this.inset + (this.W - this.inset) * 0.62;
  }

  update(dt, signal, coach) {
    this.step(dt);
    this.cadence = damp(this.cadence, signal.cadence ?? 0, 4, dt);
    const speed = this.cadence * STRIDE;
    this.dist += speed * dt;
    this.phase += this.cadence * dt * 0.5;
    this.hop = Math.max(0, this.hop - dt * 2.2);
    this.honkT = Math.max(0, this.honkT - dt);

    if (this.mode === "main") {
      const charge = !!coach.signal.charge;
      if (charge && !this.charging) this.honk("HONK!");
      this.charging = charge;
      const goose = coach.signal.base * STRIDE * (charge ? 1.45 : 1);
      this.gap = clamp(this.gap + (speed - goose) * dt, 0, 8);
      if (this.gap < 0.6) {
        this.honks++;
        this.honk(["OUCH, MY BUTT!", "HONK HONK!", "NOT THE SHORTS!"][this.honks % 3]);
        sfx.oof();
        this.gap = 3.2;
        this.hop = 1;
      }
    } else {
      this.gap = this.mode === "cooldown" ? 1.4 : 5;
    }
  }

  honk(text) {
    this.honkT = 0.5;
    sfx.honk();
    this.fx.word(text, this.gooseX(), this.groundY - this.fig * 1.3, { size: this.fig * 0.22, color: "#fff" });
  }

  gooseX() {
    return this.px - this.gap * this.ppm - this.fig * 0.35;
  }

  draw() {
    const ctx = this.begin();
    const { W, H, groundY, ppm, fig, px } = this;
    const [top, bottom] = SKIES[this.mode];
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    ctx.fillStyle = this.mode === "cooldown" ? "#ffcf8a" : "#fff7d6";
    ctx.beginPath();
    ctx.arc(W * 0.82, H * (this.mode === "cooldown" ? 0.5 : 0.18), H * 0.06, 0, TAU);
    ctx.fill();

    // Parallax layers.
    const layer = (factor, base, amp, freq, color) => {
      const off = this.dist * ppm * factor;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 10) {
        const t = (x + off) / W;
        ctx.lineTo(x, base - amp * (Math.sin(t * freq) * 0.6 + Math.sin(t * freq * 2.7 + 1) * 0.4));
      }
      ctx.lineTo(W, H);
      ctx.fill();
    };
    const dusk = this.mode === "cooldown";
    layer(0.05, groundY - H * 0.16, H * 0.06, 6, dusk ? "#8e6c9e" : "#b8d8c0");
    const haze = ctx.createLinearGradient(0, groundY - H * 0.3, 0, groundY);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(1, "rgba(255,255,255,0.35)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, groundY - H * 0.3, W, H * 0.3);
    layer(0.15, groundY - H * 0.06, H * 0.05, 9, dusk ? "#6d5a86" : "#8cc49a");

    // Lollipop trees.
    const spacing = 240;
    const off = (this.dist * ppm * 0.45) % spacing;
    for (let x = -off; x < W + spacing; x += spacing) {
      const tx = x + 60;
      ctx.fillStyle = "#6d4c41";
      ctx.fillRect(tx - 5, groundY - fig * 0.9, 10, fig * 0.9);
      ctx.fillStyle = dusk ? "#4a6d4f" : "#4caf50";
      ctx.beginPath();
      ctx.arc(tx, groundY - fig * 1.0, fig * 0.3, 0, TAU);
      ctx.fill();
    }

    // Ground + distance markers.
    ctx.fillStyle = dusk ? "#5b6f4a" : "#6ab04c";
    ctx.fillRect(-20, groundY, W + 40, H - groundY + 20);
    ctx.fillStyle = dusk ? "#8b7d6b" : "#d9c9a3";
    ctx.fillRect(-20, groundY + 6, W + 40, fig * 0.18);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    const dOff = (this.dist * ppm) % 70;
    for (let x = -dOff; x < W; x += 70) ctx.fillRect(x, groundY + fig * 0.08, 24, 4);
    const nextFlag = Math.ceil(this.dist / 50) * 50;
    for (let m = nextFlag - 50; m <= nextFlag + 50; m += 50) {
      const fx = px + (m - this.dist) * ppm;
      if (fx < -50 || fx > W + 50 || m <= 0) continue;
      ctx.fillStyle = "#795548";
      ctx.fillRect(fx - 2, groundY - fig * 0.7, 4, fig * 0.7);
      ctx.fillStyle = "#ff5252";
      ctx.beginPath();
      ctx.moveTo(fx + 2, groundY - fig * 0.7);
      ctx.lineTo(fx + fig * 0.3, groundY - fig * 0.6);
      ctx.lineTo(fx + 2, groundY - fig * 0.5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${fig * 0.09}px Outfit, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${m} m`, fx, groundY + fig * 0.35);
    }

    // Goose.
    this.drawGoose(this.gooseX(), groundY);

    // Runner.
    const hopY = Math.sin(this.hop * Math.PI) * fig * 0.3;
    floorShadow(ctx, px + fig * 0.05, groundY + 4, fig * 0.32, fig * 0.06);
    drawRunner(ctx, jogPose(this.phase), px, groundY - fig * 0.62 - hopY, fig);

    if (this.mode === "warmup") comicText(ctx, "Z z z", this.gooseX() - fig * 0.1, groundY - fig * 0.9, fig * 0.14, "#fff");
    vignette(ctx, W, H, 0.25);
    this.fx.draw(ctx);
  }

  drawGoose(x, gy) {
    const { ctx, fig } = this;
    const s = fig * 0.55;
    const asleep = this.mode === "warmup";
    const angry = this.mode === "main";
    const step = this.phase * TAU * 1.3;
    const lean = this.charging ? 0.25 : 0;
    ctx.save();
    ctx.translate(x, gy);
    ctx.strokeStyle = "rgba(30,30,30,0.55)";
    ctx.lineWidth = s * 0.025;
    if (!asleep) {
      ctx.strokeStyle = "#ff9800";
      ctx.lineWidth = s * 0.06;
      for (const k of [0, Math.PI]) {
        const sw = Math.sin(step + k) * s * 0.18;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.45);
        ctx.lineTo(sw, 0);
        ctx.lineTo(sw + s * 0.12, 0);
        ctx.stroke();
      }
    }
    ctx.rotate(lean);
    const by = asleep ? -s * 0.28 : -s * 0.62;
    ctx.fillStyle = "#fafafa";
    ctx.strokeStyle = "rgba(30,30,30,0.55)";
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.ellipse(0, by, s * 0.5, s * 0.3, -0.15, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // tail
    ctx.moveTo(-s * 0.45, by - s * 0.05);
    ctx.lineTo(-s * 0.7, by - s * 0.22);
    ctx.lineTo(-s * 0.48, by + s * 0.1);
    ctx.fill();
    ctx.stroke();
    // Neck + head.
    const headX = asleep ? s * 0.35 : s * (0.45 + lean * 0.8);
    const headY = asleep ? by - s * 0.05 : by - s * (0.75 - lean);
    ctx.lineWidth = s * 0.2;
    ctx.strokeStyle = "#1d1d1d";
    ctx.beginPath();
    ctx.moveTo(s * 0.3, by - s * 0.1);
    ctx.quadraticCurveTo(s * 0.6, by - s * 0.35, headX, headY);
    ctx.stroke();
    ctx.lineWidth = s * 0.14;
    ctx.strokeStyle = "#fafafa";
    ctx.stroke();
    ctx.fillStyle = "#fafafa";
    ctx.strokeStyle = "rgba(30,30,30,0.55)";
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.arc(headX, headY, s * 0.14, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Beak (opens when honking).
    const open = this.honkT > 0 ? s * 0.08 : s * 0.015;
    ctx.fillStyle = "#ff9800";
    ctx.beginPath();
    ctx.moveTo(headX + s * 0.1, headY - s * 0.03);
    ctx.lineTo(headX + s * 0.36, headY - open);
    ctx.lineTo(headX + s * 0.12, headY + s * 0.02);
    ctx.lineTo(headX + s * 0.34, headY + open);
    ctx.lineTo(headX + s * 0.1, headY + s * 0.05);
    ctx.fill();
    ctx.stroke();
    // Eye + brow.
    ctx.fillStyle = "#1d1d1d";
    if (asleep) {
      ctx.beginPath();
      ctx.moveTo(headX - s * 0.02, headY - s * 0.02);
      ctx.lineTo(headX + s * 0.08, headY - s * 0.02);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(headX + s * 0.04, headY - s * 0.03, s * 0.03, 0, TAU);
      ctx.fill();
      if (angry) {
        ctx.beginPath();
        ctx.moveTo(headX - s * 0.04, headY - s * 0.13);
        ctx.lineTo(headX + s * 0.12, headY - s * 0.06);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (this.mode === "cooldown" && Math.sin(this.time * 2) > 0.95) {
      this.fx.word("♥", x + s * 0.4, gy - s * 1.6, { size: s * 0.35, color: "#ff5c8a", life: 0.8 });
    }
  }

  hud() {
    const d = `${Math.round(this.dist)} m`;
    if (this.mode === "warmup") return `${d} · the goose is still asleep`;
    if (this.mode === "cooldown") return `${d} · you and the goose are friends now`;
    return `${d} · goose ${this.gap.toFixed(1)} m behind`;
  }

  stats() {
    return { meters: this.dist, honks: this.honks };
  }
}

// Shared cartoon runner used by the jog and runner worlds.
export function drawRunner(ctx, p, x, y, s, colors = LOOKS.jogger) {
  drawFigure(ctx, p, x, y, s, colors);
}

export const jog = {
  id: "jog",
  name: "High-Knee Jog",
  world: "Goose Chase",
  color: "#ba68c8",
  view: "side",
  met: 8,
  blurb: "Jog in place with high knees. Slow down and the angry goose catches up.",
  say: "High knees! Don't let the goose catch you.",
  repEvent: "step",
  summary: (st) => `${Math.round(st.meters ?? 0)} m jogged · ${st.honks ?? 0} goose attacks`,

  coach(t, tempo, scene, block) {
    const main = !block?.variant;
    const base = 2.6 * tempo;
    const u = t % CYCLE;
    const sprinting = main && u >= SPRINT;
    const extra = main ? (Math.floor(t / CYCLE) * (CYCLE - SPRINT) + Math.max(0, u - SPRINT)) * 0.4 : 0;
    const steps = base * (t + extra);
    const charge = main && u >= CHARGE[0] && u < CHARGE[1];
    let cue = "HIGH KNEES!";
    if (block?.variant === "warmup") cue = "EASY JOG";
    else if (block?.variant === "cooldown") cue = "SLOW IT DOWN";
    else if (sprinting) cue = "SPRINT!";
    else if (charge) cue = "GOOSE ALERT!";
    const cadence = base * (sprinting ? 1.4 : 1);
    return {
      pose: jogPose(steps / 2),
      signal: { cadence, base, charge },
      count: Math.floor(steps),
      cue,
      beat: steps, // one step per beat
      bpm: cadence * 60,
      energy: sprinting ? 2 : charge ? 1 : undefined,
    };
  },
  event: (k) => ({ type: "step", side: k % 2 ? "left" : "right" }),
  createDetector: (calib) => new JogDetector(calib),
  createScene: (canvas, opts) => new GooseScene(canvas, opts),
};
