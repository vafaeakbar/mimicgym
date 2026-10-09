// Synthesized backing music that follows the coach.
//
// The engine doesn't keep its own clock: every frame the app passes the coach's
// beat position and BPM, and the engine schedules the next few 16th-note steps
// ahead on the audio clock. So punches, slaps, steps and squats land on the
// beat, the music speeds up when the coach sprints, and it stops when paused.
import { audioCtx, envelope, isMusicOn, musicOut, noiseBuffer } from "./audio.js";

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// Everything is in A minor / C major so moves flow into each other.
const CHORDS = {
  Am: { root: 45, notes: [57, 60, 64] },
  F: { root: 41, notes: [57, 60, 65] },
  C: { root: 48, notes: [55, 60, 64] },
  G: { root: 43, notes: [55, 59, 62] },
  E: { root: 40, notes: [56, 59, 64] },
  Dm: { root: 38, notes: [57, 62, 65] },
};

// 16 steps per bar. x = hit, o = accent. Beat 1 of the bar = step 0.
const STYLES = {
  // Boom-bap. One punch per beat: jabs on the kicks, crosses on the snares.
  punch: {
    prog: ["Am", "Am", "F", "E"], swing: 0.14,
    kick: "x.....x...x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
    bass: "x.....x...x.....", stab: "..........x.....", lead: "square",
  },
  // Heavy half-time. One rep per bar; the big hit on step 13 is the lift.
  squat: {
    prog: ["Am", "G", "F", "E"],
    kick: "x.....x.........", snare: "........x.......", hat: "..x...x...x...x.",
    accent: ".............o..", bass: "x.....x......x..", drone: true,
  },
  // Four-on-the-floor house. Slaps land on the claps.
  slap: {
    prog: ["Am", "F", "C", "G"],
    kick: "x...x...x...x...", clap: "....x.......x...", hat: "..o...o...o...o.",
    bass: "..x...x...x...x.", stab: "...x.....x......",
  },
  // Drum & bass feel (half-time count): your steps are the 8th notes.
  runner: {
    prog: ["Am", "F", "C", "G"],
    kick: "x.........x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
    bass: "x..x..x...x..x..", arp: true,
  },
  // Upbeat pop-punk. One step per beat.
  jog: {
    prog: ["C", "G", "Am", "F"],
    kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
    bass: "x.x.x.x.x.x.x.x.", stab: "x.......x.......",
  },
  // Electro. The clap on beats 2 and 4 is when you catch the fly.
  jacks: {
    prog: ["Am", "F", "C", "G"],
    kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.",
    bass: "..x...x...x...x.", arp: true,
  },
  // Tense jungle drums under a rising drone.
  plank: {
    prog: ["Am", "Am", "F", "E"],
    kick: "x.......x.......", tom: "x..x..x...x.x...", shaker: "xxxxxxxxxxxxxxxx", drone: true,
  },
  // Stately baroque: harpsichord arpeggios and timpani.
  curtsy: {
    prog: ["C", "G", "Am", "E"],
    bass: "x...x...x...x...", harp: true, timp: "x.......x.......",
  },
  // Stadium stomp-stomp-clap; knees land on the stomps.
  core: {
    prog: ["Am", "Am", "Dm", "E"],
    kick: "x...x...........", clap: "........x.......", hat: "x.x.x.x.x.x.x.x.",
    bass: "x.......x.......",
  },
  // Shoulder press: driving rock, eighth-note bass.
  press: {
    prog: ["Am", "F", "G", "E"],
    kick: "x...x...x...x.x.", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
    bass: "x.x.x.x.x.x.x.x.", stab: "..x...x...x...x.", arp: true,
  },
  // Burpees: big half-time build; the drop hits on the jump (beat 4).
  burpee: {
    prog: ["Am", "F", "C", "G"],
    kick: "x.......x.......", snare: "........x.......", hat: "..x...x...x...x.",
    accent: "............o...", bass: "x.......x...x...", drone: true,
  },
  // Triceps: laid-back funk, toss on the beat.
  tricep: {
    prog: ["Dm", "Am", "Dm", "E"], swing: 0.12,
    kick: "x..x....x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
    bass: "x..x..x.x..x....", stab: "......x.......x.",
  },
  // Push-ups: heavy and steady.
  pushup: {
    prog: ["Am", "G", "F", "E"],
    kick: "x.......x.......", snare: "....x.......x...", hat: "x...x...x...x...",
    bass: "x.......x.......", drone: true,
  },
  // Mountain climbers: fast and driving, one knee per beat.
  climber: {
    prog: ["Am", "F", "C", "G"],
    kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
    bass: "x.x.x.x.x.x.x.x.", arp: true,
  },
  // Warm-up: calm pentatonic plucks.
  bamboo: {
    prog: ["C", "Am", "F", "G"],
    kick: "x.......x.......", hat: "....x.......x...", pluck: "x.x.x.x.x.x.x.x.", pad: true,
  },
  // Cool-down: no drums, just pads and bells.
  breathe: {
    prog: ["F", "C", "Am", "G"],
    bass: "x...............", pad: true, bell: "x.......x.......",
  },
};

const PENTA = [0, 3, 5, 7, 10]; // minor pentatonic steps above the chord root

// Moves without their own style borrow one with a matching feel.
const ALIAS = {
  thruster: "squat", dbtricep: "tricep", rdl: "pushup", bridge: "bamboo", row: "climber",
  curl: "core", lateral: "slap", stretch: "breathe", circles: "bamboo", twist: "bamboo",
};

export function styleFor(block) {
  return STYLES[block.move] ? block.move : ALIAS[block.move] ?? "jog";
}

export class Music {
  constructor() {
    this.style = null;
    this.last = -1;
    this.energy = 0;
  }

  // energy 0..2: later laps and sprints add layers.
  start(name, energy = 0) {
    this.style = STYLES[name] ?? null;
    this.energy = energy;
    this.last = -1;
  }

  stop() {
    this.style = null;
  }

  update(beat, bpm, energy = this.energy) {
    const ac = audioCtx();
    if (!ac || ac.state !== "running" || !this.style || !isMusicOn() || !(bpm > 0)) return;
    this.energy = energy;
    const rate = (bpm / 60) * 4; // 16th steps per second
    const now = ac.currentTime;
    const pos = beat * 4;
    let step = this.last + 1;
    if (step < Math.floor(pos)) step = Math.ceil(pos - 1e-6); // after a stall, don't replay the past
    for (; step <= pos + rate * 0.12; step++) {
      this.play(step, now + Math.max(0, (step - pos) / rate), 1 / rate);
      this.last = step;
    }
  }

  play(step, t, sd) {
    const st = this.style;
    const s = ((step % 16) + 16) % 16;
    const bar = Math.floor(step / 16);
    const ch = CHORDS[st.prog[((bar % st.prog.length) + st.prog.length) % st.prog.length]];
    if (st.swing && s % 2 === 1) t += st.swing * sd;
    const at = (p) => p?.[s];

    if (at(st.kick) === "x") kick(t, 1);
    if (at(st.snare) === "x") snare(t);
    if (at(st.clap) === "x") clap(t);
    const h = at(st.hat);
    if (h === "x" || h === "o") hat(t, h === "o");
    else if (this.energy >= 1 && st.hat && s % 2 === 1) hat(t, false, 0.05); // extra 16ths when it heats up
    if (at(st.tom) === "x") tom(t, s % 3 ? 110 : 80);
    if (at(st.shaker) === "x") hat(t, false, s % 4 === 2 ? 0.06 : 0.03);
    if (at(st.timp) === "x") tom(t, 65, 0.5);
    if (st.harp && s % 2 === 0) pluck(t, ch.notes[(s / 2) % 3] + (s >= 8 ? 12 : 0), sd * 3, "sawtooth");
    if (at(st.pluck) === "x") pluck(t, ch.root + 24 + PENTA[(s / 2 + bar * 2) % 5], sd * 4, "triangle");
    if (at(st.accent) === "o") {
      kick(t, 1.3);
      clap(t);
      crash(t);
    }
    if (s === 0 && bar % 4 === 0 && st.kick) crash(t, 0.12);

    if (at(st.bass) === "x") bass(t, ch.root, sd * (st.drone ? 3.5 : 1.8));
    if (at(st.stab) === "x") stab(t, ch.notes, sd * 2);
    if (st.drone && s === 0) drone(t, ch.root + 12, sd * 16);
    if (st.pad && s === 0) pad(t, ch.notes, sd * 16);
    if (at(st.bell) === "x") bell(t, ch.notes[(bar + s) % 3] + 12);
    if ((st.arp || this.energy >= 2) && s % 2 === 0) arp(t, ch.notes[(s / 2) % 3] + (s >= 8 ? 12 : 0));
  }
}

// ---------- Instruments ----------
function osc(type, freq, t) {
  const o = audioCtx().createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  return o;
}

function noiseSrc(t, dur, type, freq, q = 1) {
  const ac = audioCtx();
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer();
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
  return f;
}

function kick(t, v) {
  const o = osc("sine", 160, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  envelope(o, t, 0.32, 0.9 * v, musicOut(), 0.002);
  o.start(t);
  o.stop(t + 0.4);
}

function snare(t) {
  envelope(noiseSrc(t, 0.16, "bandpass", 1900, 0.7), t, 0.16, 0.45, musicOut(), 0.001);
  const o = osc("triangle", 190, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  envelope(o, t, 0.08, 0.25, musicOut(), 0.001);
  o.start(t);
  o.stop(t + 0.12);
}

function clap(t) {
  for (let i = 0; i < 3; i++) envelope(noiseSrc(t + i * 0.012, 0.02, "bandpass", 1300, 1.2), t + i * 0.012, 0.02, 0.35, musicOut(), 0.001);
  envelope(noiseSrc(t + 0.036, 0.14, "bandpass", 1200, 1), t + 0.036, 0.14, 0.3, musicOut(), 0.001);
}

function tom(t, freq, vol = 0.45) {
  const o = osc("sine", freq * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.15);
  envelope(o, t, 0.35, vol, musicOut(), 0.002);
  o.start(t);
  o.stop(t + 0.4);
}

function pluck(t, midi, dur, type) {
  const ac = audioCtx();
  const o = osc(type, mtof(midi), t);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(3200, t);
  f.frequency.exponentialRampToValueAtTime(500, t + dur);
  o.connect(f);
  envelope(f, t, dur, 0.07, musicOut(), 0.002);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hat(t, open, vol = 0.14) {
  const d = open ? 0.18 : 0.035;
  envelope(noiseSrc(t, d, "highpass", 7500), t, d, vol, musicOut(), 0.001);
}

function crash(t, vol = 0.2) {
  envelope(noiseSrc(t, 1.1, "highpass", 5200), t, 1.1, vol, musicOut(), 0.002);
}

function bass(t, midi, dur) {
  const ac = audioCtx();
  const o = osc("sawtooth", mtof(midi), t);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 6;
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(220, t + dur);
  o.connect(f);
  envelope(f, t, dur, 0.3, musicOut());
  o.start(t);
  o.stop(t + dur + 0.05);
}

function stab(t, notes, dur) {
  const ac = audioCtx();
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 2000;
  envelope(f, t, dur, 0.09, musicOut());
  for (const n of notes) {
    for (const det of [-6, 6]) {
      const o = osc("sawtooth", mtof(n), t);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

function drone(t, midi, dur) {
  const ac = audioCtx();
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(300, t);
  f.frequency.linearRampToValueAtTime(1400, t + dur * 0.8); // swells up to the lift
  envelope(f, t, dur, 0.1, musicOut(), 0.08);
  for (const n of [midi, midi + 7]) {
    const o = osc("sawtooth", mtof(n), t);
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

function pad(t, notes, dur) {
  const ac = audioCtx();
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  g.connect(musicOut());
  for (const n of notes) {
    const o = osc("triangle", mtof(n), t);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

function bell(t, midi) {
  const o = osc("sine", mtof(midi), t);
  envelope(o, t, 0.9, 0.08, musicOut(), 0.003);
  o.start(t);
  o.stop(t + 1);
}

function arp(t, midi) {
  const ac = audioCtx();
  const o = osc("square", mtof(midi), t);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 2400;
  o.connect(f);
  envelope(f, t, 0.1, 0.045, musicOut());
  o.start(t);
  o.stop(t + 0.15);
}
