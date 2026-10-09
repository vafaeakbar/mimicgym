// Base class for the reactive worlds. Each move's scene extends this.
//
// update(dt, signal, coach): signal is the movement input (from the camera
// detector, or from the coach's pace in TV mode) and carries `events` for this
// frame. coach is the coach's current output, for pacing cues.
import { FX } from "./fx.js";

export class Scene {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = opts;
    this.auto = opts.auto;
    this.tempo = opts.tempo ?? 1;
    this.variant = opts.variant ?? null;
    this.fx = new FX();
    this.time = 0;
    this.W = 0;
    this.H = 0;
  }

  // Sizes the canvas; `cx` is the middle of the area not covered by the coach.
  ensureSize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === this.W && h === this.H) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.W = w;
    this.H = h;
    this.inset = this.opts.inset?.() ?? 0;
    this.cx = (this.inset + w) / 2;
    this.topY = w <= 720 ? h * 0.34 : h * 0.2; // clear of the HUD for big in-scene labels
    this.onResize();
  }

  onResize() {}

  // Resets the transform and applies screen shake. Call at the start of draw().
  begin() {
    this.ensureSize();
    const [sx, sy] = this.fx.offset();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    return this.ctx;
  }

  step(dt) {
    this.ensureSize();
    this.time += dt;
    this.fx.update(dt);
  }

  hud() {
    return "";
  }

  stats() {
    return {};
  }
}
