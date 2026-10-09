// Cool-down: held static stretches for the muscles the day worked (about 18 s
// each), by the calm mountain lake. No camera needed.
import { FRONT, mirror, mix, pose } from "../figure.js";
import { easeInOut } from "../util.js";
import { LakeScene } from "./breathe.js";
import { REACH_L, REACH_R } from "./bamboo.js";

// ---------- Stretch poses ----------
// Side view, standing on one leg, near foot pulled up behind.
const QUAD = {
  back: "l",
  head: [0.03, -0.77], neck: [0.02, -0.6], hip: [0, 0],
  rs: [0.03, -0.56], re: [-0.08, -0.32], rw: [-0.14, 0.04],
  ls: [0.0, -0.56], le: [0.24, -0.5], lw: [0.48, -0.5],
  rh: [0.01, 0], rk: [0.02, 0.3], ra: [-0.14, 0.06],
  lh: [-0.01, 0], lk: [-0.01, 0.3], la: [-0.02, 0.6],
};
// Side view forward fold, reaching for the toes.
const HAMSTRING = {
  back: "l",
  head: [0.44, 0.42], neck: [0.34, 0.32], hip: [0, 0],
  rs: [0.33, 0.33], re: [0.28, 0.56], rw: [0.12, 0.56],
  ls: [0.31, 0.33], le: [0.26, 0.55], lw: [0.1, 0.56],
  rh: [0.01, 0], rk: [0.02, 0.3], ra: [0.02, 0.6],
  lh: [-0.01, 0], lk: [-0.01, 0.3], la: [-0.02, 0.6],
};
// Front view: hands clasped behind the back, chest open.
const CHEST = pose(FRONT, { behind: true, head: [0, -0.79], le: [-0.22, -0.34], lw: [-0.08, -0.1], re: [0.22, -0.34], rw: [0.08, -0.1] });
// Front view: one elbow up behind the head, the other hand on it.
const TRICEP_L = pose(FRONT, { behind: true, le: [-0.1, -0.9], lw: [0.04, -0.68], re: [0.1, -0.82], rw: [-0.08, -0.9] });
// Front view: one straight arm across the chest, held by the other.
const SHOULDER_L = pose(FRONT, { le: [0.02, -0.52], lw: [0.26, -0.5], re: [0.2, -0.36], rw: [0.06, -0.5] });
const STAND = pose(FRONT, { le: [-0.2, -0.32], lw: [-0.24, -0.08], re: [0.2, -0.32], rw: [0.24, -0.08] });

export const STRETCHES = {
  quadL: { name: "Left quad stretch", pose: QUAD },
  quadR: { name: "Right quad stretch", pose: mirror(QUAD) },
  hamstring: { name: "Hamstring fold", pose: HAMSTRING },
  sideL: { name: "Side stretch left", pose: REACH_L },
  sideR: { name: "Side stretch right", pose: REACH_R },
  chest: { name: "Chest opener", pose: CHEST },
  tricepL: { name: "Left tricep stretch", pose: TRICEP_L },
  tricepR: { name: "Right tricep stretch", pose: mirror(TRICEP_L) },
  shoulderL: { name: "Left shoulder stretch", pose: SHOULDER_L },
  shoulderR: { name: "Right shoulder stretch", pose: mirror(SHOULDER_L) },
};

export const HOLD = 18; // seconds per stretch

export const stretch = {
  id: "stretch",
  name: "Stretch",
  world: "Mountain Lake",
  color: "#9fa8da",
  view: "front",
  frame: { x0: -0.62, x1: 0.72, y0: -1.12, y1: 0.68 },
  met: 2.3,
  steady: true,
  autoOnly: true,
  blurb: "Hold each stretch, breathe slowly, let your heart rate come down.",
  say: "Cool down. Hold each stretch and breathe.",
  repEvent: "stretch",
  summary: (st) => `${st.stretches ?? 0} stretches held`,

  coach(t, tempo, scene, block) {
    const ids = block?.stretches?.length ? block.stretches : ["sideL", "sideR"];
    const hold = block?.hold ?? HOLD;
    const i = Math.min(ids.length - 1, Math.floor(t / hold));
    const local = t - i * hold;
    const cur = STRETCHES[ids[i]];
    const prev = i > 0 ? STRETCHES[ids[i - 1]].pose : STAND;
    const k = easeInOut(Math.min(1, local / 1.4));
    const left = Math.max(0, Math.ceil(hold - local));
    const breath = (1 - Math.cos((t / 5) * Math.PI * 2)) / 2; // slow 5 s breaths
    return {
      pose: mix(prev, cur.pose, k),
      signal: { breath, phase: breath > 0.5 ? "in" : "out", label: cur.name },
      count: Math.floor(t / hold),
      cue: `${cur.name.toUpperCase()} · ${left}`,
      say: cur.name,
      beat: t,
      bpm: 60,
    };
  },
  event: () => ({ type: "stretch" }),
  createDetector: () => null,
  createScene: (canvas, opts) => new LakeScene(canvas, opts),
};
