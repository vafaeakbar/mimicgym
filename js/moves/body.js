// Shared body measurements for the camera detectors.
//
// Image landmarks (normalized 0..1, y down, not mirrored) are the most reliable
// for anything left/right or up/down. World landmarks (metres, 3D) are only
// used where depth matters: elbow straightness for punches and knee bend.
import { kneeAngle, mid, seen } from "../util.js";

export function measure(pose) {
  const im = pose.image;
  if (!seen(im, 11, 12)) return null;
  const sh = mid(im[11], im[12]);
  const hip = seen(im, 23, 24) ? mid(im[23], im[24]) : null;
  const shoulderW = Math.max(0.03, Math.abs(im[11].x - im[12].x));
  const torso = hip ? Math.max(0.05, hip.y - sh.y) : shoulderW * 1.4;
  return { im, sh, hip, shoulderW, torso };
}

// Built from a few seconds of standing still on the position screen, so
// thresholds scale to your body and distance from the camera.
export function calibrate(poses) {
  const vals = { shoulderW: [], torso: [], hipX: [], hipY: [], thigh: [], ankleY: [], kneeAng: [] };
  for (const p of poses) {
    const m = measure(p);
    if (!m?.hip) continue;
    vals.shoulderW.push(m.shoulderW);
    vals.torso.push(m.torso);
    vals.hipX.push(m.hip.x);
    vals.hipY.push(m.hip.y);
    if (seen(m.im, 25, 26)) vals.thigh.push((m.im[25].y + m.im[26].y) / 2 - m.hip.y);
    if (seen(m.im, 27, 28)) vals.ankleY.push((m.im[27].y + m.im[28].y) / 2);
    const k = kneeAngle(p.world);
    if (k !== null) vals.kneeAng.push(k);
  }
  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  const c = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, median(v)]));
  if (c.shoulderW === null) return null;
  c.kneeAng = Math.min(178, Math.max(150, c.kneeAng ?? 170));
  return c;
}
