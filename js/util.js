export const TAU = Math.PI * 2;

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOut = (t) => 1 - (1 - t) ** 3;
// Frame-rate independent smoothing toward a target.
export const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Keeps a canvas' backing store matched to its CSS size.
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------- Pose landmark helpers ----------
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
export const seen = (lm, ...idx) => idx.every((i) => (lm[i].visibility ?? 1) > 0.5);

// Angle at b (degrees) between a-b-c.
export function angleAt(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const m = Math.hypot(...v1) * Math.hypot(...v2) || 1;
  return (Math.acos(clamp(dot / m, -1, 1)) * 180) / Math.PI;
}

// Average knee angle over whichever legs are visible, or null.
export function kneeAngle(w) {
  const legs = [[23, 25, 27], [24, 26, 28]].filter((ix) => seen(w, ...ix));
  if (!legs.length) return null;
  return legs.reduce((s, [h, k, a]) => s + angleAt(w[h], w[k], w[a]), 0) / legs.length;
}

// ---------- Colour helpers ----------
function parseHex(c) {
  if (typeof c !== "string" || c[0] !== "#") return null;
  const h = c.length === 4 ? c.slice(1).split("").map((x) => x + x).join("") : c.slice(1, 7);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

// f > 0 lightens toward white, f < 0 darkens toward black. Non-hex colours pass through.
export function shade(c, f) {
  const rgb = parseHex(c);
  if (!rgb) return c;
  const t = f < 0 ? 0 : 255;
  const k = Math.abs(f);
  return `rgb(${rgb.map((v) => Math.round(v + (t - v) * k)).join(",")})`;
}

export function mixHex(a, b, t) {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}
