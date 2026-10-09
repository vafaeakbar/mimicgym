// Audio graph, synthesized sound effects (no audio files) and spoken cues.
//   sfx bus ─┐
//            ├─ master ─ compressor ─ speakers
//  music bus ┘
let ac = null;
let master, sfxBus, musicBus;
let muted = false;
let musicOn = true;
let noiseBuf = null;
const MUSIC_LEVEL = 0.32;

export function unlockAudio() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(ac.destination);
      master = ac.createGain();
      master.connect(comp);
      sfxBus = ac.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      musicBus = ac.createGain();
      musicBus.gain.value = musicOn ? MUSIC_LEVEL : 0;
      musicBus.connect(master);
    }
    if (ac.state === "suspended") ac.resume();
  } catch {
    ac = null;
  }
}

export const audioCtx = () => ac;
export const musicOut = () => musicBus;

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.02);
  if (m && "speechSynthesis" in window) speechSynthesis.cancel();
}
export const isMuted = () => muted;

export function setMusicOn(on) {
  musicOn = on;
  if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, ac.currentTime, 0.05);
}
export const isMusicOn = () => musicOn;

export function noiseBuffer() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// Attack-decay envelope on a new gain node: node → gain → dest.
export function envelope(node, t0, dur, peak, dest, attack = 0.005) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
  node.connect(g);
  g.connect(dest);
  return g;
}

const ready = () => ac && !muted && ac.state === "running";

function tone(type, f0, f1, dur, vol = 0.2, delay = 0) {
  if (!ready()) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  envelope(o, t, dur, vol, sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, filterType, freq, vol = 0.3, q = 1, delay = 0) {
  if (!ready()) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer();
  const f = ac.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(freq, t);
  f.Q.value = q;
  src.connect(f);
  envelope(f, t, dur, vol, sfxBus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  whoosh: (s = 1) => noise(0.25, "bandpass", 700 + 500 * s, 0.22 * s, 0.8),
  smack: () => { noise(0.08, "highpass", 1800, 0.5); tone("triangle", 320, 110, 0.1, 0.2); },
  crunch: () => { for (let i = 0; i < 5; i++) noise(0.06, "bandpass", 900 + Math.random() * 1600, 0.35, 2, i * 0.05); },
  boom: () => { noise(0.9, "lowpass", 380, 0.95); tone("sine", 95, 28, 0.7, 0.7); noise(0.3, "bandpass", 1200, 0.3, 0.8, 0.02); },
  woof: () => { tone("sawtooth", 420, 170, 0.12, 0.14); tone("sawtooth", 400, 160, 0.13, 0.12, 0.17); },
  crack: () => { noise(0.05, "highpass", 2600, 0.6); noise(0.18, "bandpass", 600, 0.35, 1, 0.02); tone("triangle", 150, 55, 0.2, 0.25); },
  coin: () => { tone("square", 988, 988, 0.07, 0.06); tone("square", 1319, 1319, 0.18, 0.06, 0.07); },
  honk: () => { tone("sawtooth", 430, 300, 0.22, 0.1); tone("sawtooth", 440, 310, 0.22, 0.07, 0.02); },
  boing: () => tone("sine", 160, 540, 0.3, 0.22),
  oof: () => tone("triangle", 260, 85, 0.28, 0.25),
  pop: () => tone("sine", 600, 1200, 0.06, 0.12),
  ding: () => { tone("sine", 880, 880, 0.3, 0.12); tone("sine", 1320, 1320, 0.4, 0.08, 0.1); },
};

// Spoken cue; the music ducks while the coach talks.
export function say(text) {
  if (muted || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.pitch = 1.05;
  const duck = (level) => musicBus && musicOn && musicBus.gain.setTargetAtTime(level, ac.currentTime, 0.08);
  u.onstart = () => duck(MUSIC_LEVEL * 0.35);
  u.onend = u.onerror = () => duck(MUSIC_LEVEL);
  speechSynthesis.speak(u);
}
