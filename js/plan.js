// Workout plans.
//
// Daily: a 7-day programme so no two days feel the same. Each day targets
// different muscles; Mon/Wed/Fri add dumbbells (48 h apart, per ACSM), and
// every major muscle group is trained at least twice a week. Every session is
// warm-up (dynamic) → main moves (each once) → cool-down (held stretches for
// the muscles worked, then slow breathing). Long rhythmic blocks include
// "faster" stretches so they don't drag.
import { punch } from "./moves/punch.js";
import { squat } from "./moves/squat.js";
import { slap } from "./moves/slap.js";
import { runner } from "./moves/runner.js";
import { jog } from "./moves/jog.js";
import { jacks } from "./moves/jacks.js";
import { plank } from "./moves/plank.js";
import { curtsy } from "./moves/curtsy.js";
import { core } from "./moves/core.js";
import { bamboo } from "./moves/bamboo.js";
import { breathe } from "./moves/breathe.js";
import { burpee } from "./moves/burpee.js";
import { tricep } from "./moves/tricep.js";
import { pushup } from "./moves/pushup.js";
import { climber } from "./moves/climber.js";
import { rdl } from "./moves/rdl.js";
import { bridge } from "./moves/bridge.js";
import { row } from "./moves/row.js";
import { curl } from "./moves/curl.js";
import { lateral } from "./moves/lateral.js";
import { press } from "./moves/press.js";
import { stretch } from "./moves/stretch.js";
import { circles } from "./moves/circles.js";
import { twist } from "./moves/twist.js";

// Dumbbell versions of existing moves (same coach, detection and world).
const thruster = {
  ...squat, id: "thruster", name: "Dumbbell Thrusters", weights: true, met: 7,
  blurb: "Dumbbells at your shoulders: squat to grab, drive up and press it overhead.",
  say: "Dumbbell thrusters! Squat deep, drive up, press overhead.",
};
const dbtricep = {
  ...tricep, id: "dbtricep", name: "Dumbbell Tricep Extension", weights: true, met: 4.5,
  blurb: "One dumbbell in both hands behind your head, elbows up, press it to the sky.",
  say: "Dumbbell tricep extensions. Elbows up and press.",
};

export const MOVES = {
  bamboo, jacks, punch, squat, pushup, plank, climber, slap, tricep, curtsy, runner, burpee, core, jog, breathe,
  rdl, bridge, row, curl, lateral, press, stretch, thruster, dbtricep, circles, twist,
};

export const DURATIONS = [5, 10, 15, 20, 25, 30];

// `day` matches Date.getDay() (0 = Sunday). Main moves are in priority order:
// short sessions keep the first ones.
export const DAYS = [
  { day: 1, short: "Mon", name: "Monday", focus: "Legs & Glutes", weights: true,
    main: ["thruster", "rdl", "bridge", "curtsy", "jacks"],
    extra: ["runner", "burpee", "climber"],
    stretches: ["quadL", "quadR", "hamstring", "sideL", "sideR"] },
  { day: 2, short: "Tue", name: "Tuesday", focus: "Cardio & Core",
    main: ["jacks", "climber", "plank", "runner", "core", "burpee", "jog"],
    extra: ["punch", "slap"],
    stretches: ["quadL", "quadR", "hamstring", "sideL", "sideR", "chest"] },
  { day: 3, short: "Wed", name: "Wednesday", focus: "Upper Body", weights: true,
    main: ["row", "press", "pushup", "curl", "dbtricep", "lateral"],
    extra: ["punch", "plank", "slap"],
    stretches: ["chest", "tricepL", "tricepR", "shoulderL", "shoulderR", "sideL", "sideR"] },
  { day: 4, short: "Thu", name: "Thursday", focus: "Boxing & Agility",
    main: ["punch", "jacks", "slap", "runner", "core", "curtsy", "jog"],
    extra: ["climber", "burpee"],
    stretches: ["shoulderL", "shoulderR", "chest", "quadL", "quadR", "sideL", "sideR"] },
  { day: 5, short: "Fri", name: "Friday", focus: "Full Body", weights: true,
    main: ["thruster", "row", "pushup", "rdl", "press", "burpee", "plank"],
    extra: ["curl", "lateral", "bridge"],
    stretches: ["quadL", "quadR", "hamstring", "chest", "tricepL", "tricepR"] },
  { day: 6, short: "Sat", name: "Saturday", focus: "HIIT",
    main: ["burpee", "squat", "jacks", "climber", "punch", "runner", "jog"],
    extra: ["core", "slap", "curtsy"],
    stretches: ["quadL", "quadR", "hamstring", "sideL", "sideR", "chest"] },
  { day: 0, short: "Sun", name: "Sunday", focus: "Recovery & Mobility", easy: true,
    main: ["slap", "curtsy", "tricep", "core", "plank"],
    extra: ["bridge", "squat"],
    stretches: ["sideL", "sideR", "hamstring", "quadL", "quadR", "chest", "shoulderL", "shoulderR", "tricepL", "tricepR"] },
];

export const dayInfo = (day) => DAYS.find((d) => d.day === day) ?? DAYS[0];

// Recommended time per move (seconds):
//   warm-up drills 30–60 s each, 5–10 min in total;
//   circuit exercises 30–60 s each, the circuit repeated 1–3 rounds (sets);
//   static stretches held 10–30 s, repeated to reach ~60 s per muscle.
// Phases never stretch a move past its limit — they add moves instead.
const DRILL = { min: 30, target: 45, max: 60 };
const WORK = { min: 30, target: 45, max: 60 };
const HOLD = { min: 15, target: 20, max: 30 };
const WEIGHT = { plank: 0.75, burpee: 0.9 }; // plank holds and burpee sets run a little shorter
const BREATHE = { short: 20, long: 40 };
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Warm-up drills in order; any that appear in the day's main moves are skipped.
const WARMUPS = [
  { move: "jog", variant: "warmup", tempo: 0.7, met: 4, say: "Warm up. Easy jog on the spot." },
  { move: "bamboo" },
  { move: "circles" },
  { move: "twist" },
  { move: "squat", variant: "warmup", tempo: 0.6, met: 4, say: "Easy squats to wake up the legs.", skipIf: ["squat", "thruster"] },
];

// How many moves of `target` length fit `time`, kept within [min, max] each.
function countFor(time, rule, available) {
  const fewest = Math.ceil(time / rule.max);
  const most = Math.min(available, Math.max(1, Math.floor(time / rule.min)));
  return clampN(Math.round(time / rule.target), fewest, most);
}

export function buildPlan(minutes, day = 1) {
  const d = dayInfo(day);
  const total = minutes * 60;
  const tempo = d.easy ? 0.8 : 1;

  // ----- Warm-up: dynamic drills, 30–60 s each.
  const drills = WARMUPS.filter((w) => !(w.skipIf ?? [w.move]).some((id) => d.main.includes(id)));
  let warm = Math.round(clampN(total * 0.15, 40, 600));
  const nWarm = countFor(warm, DRILL, drills.length);
  warm = Math.min(warm, nWarm * DRILL.max); // never stretch a drill past its limit
  const warmBlocks = drills.slice(0, nWarm).map((w) => ({ ...w, label: "Warm-up", dur: warm / nWarm, tempo: w.tempo ?? 1 }));

  // ----- Cool-down: held stretches for today's muscles (cycling for extra sets), then breathing.
  const cool = Math.round(clampN(total * (d.easy ? 0.3 : 0.15), 40, d.easy ? 600 : 360));
  const breatheDur = cool < 90 ? BREATHE.short : BREATHE.long;
  const stretchDur = cool - breatheDur;
  const nStretch = Math.max(1, Math.min(Math.round(stretchDur / HOLD.target), Math.floor(stretchDur / HOLD.min)), Math.ceil(stretchDur / HOLD.max));
  const stretchList = Array.from({ length: nStretch }, (_, i) => d.stretches[i % d.stretches.length]);

  // ----- Main: 30–60 s per move. Use more of today's moves first; if there's
  // still time, repeat the circuit as extra rounds.
  const main = total - warm - cool;
  const pool = [...d.main, ...(d.extra ?? [])];
  const ids = pool.slice(0, Math.max(3, countFor(main, WORK, pool.length)));
  const wsum = ids.reduce((sum, id) => sum + (WEIGHT[id] ?? 1), 0);
  const heaviest = Math.max(...ids.map((id) => WEIGHT[id] ?? 1));
  let rounds = 1;
  while (((main / rounds) * heaviest) / wsum > WORK.max) rounds++;
  const perRound = main / rounds;
  const mainBlocks = [];
  for (let r = 1; r <= rounds; r++) {
    for (const id of ids) {
      mainBlocks.push({
        move: id, dur: (perRound * (WEIGHT[id] ?? 1)) / wsum, tempo,
        round: rounds > 1 ? r : undefined, rounds: rounds > 1 ? rounds : undefined, roundStart: r > 1 && id === ids[0],
        label: rounds > 1 ? `Round ${r} of ${rounds}` : undefined,
      });
    }
  }

  const blocks = [
    ...warmBlocks,
    ...mainBlocks,
    { move: "stretch", label: "Cool-down", dur: stretchDur, tempo: 1, stretches: stretchList, hold: stretchDur / nStretch },
    { move: "breathe", label: "Cool-down", dur: breatheDur, tempo: 1 },
  ];
  let t = 0;
  for (const b of blocks) {
    b.start = t;
    t += b.dur;
  }
  return { minutes, total: t, blocks, moves: ids.length, rounds, warmups: nWarm, stretches: nStretch, day: d };
}

// Long blocks alternate 40 s at your pace with 20 s at 1.2× speed. Returns
// the coach's (warped) time and the current speed.
const SEG = 60, FAST = 20, BOOST = 0.2;
export function blockTime(block, t) {
  if (!block.fast) return { t, rate: 1, fast: false, fastFor: 0 };
  const u = t % SEG;
  const fastSoFar = Math.floor(t / SEG) * FAST + Math.max(0, u - (SEG - FAST));
  const fast = u >= SEG - FAST;
  return { t: t + BOOST * fastSoFar, rate: fast ? 1 + BOOST : 1, fast, fastFor: fast ? u - (SEG - FAST) : 0 };
}
