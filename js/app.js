import { MOVES, DAYS, DURATIONS, buildPlan, blockTime, dayInfo } from "./plan.js";
import { drawDumbbells, drawFigure } from "./figure.js";
import { fitCanvas, fmtTime, seen } from "./util.js";
import { unlockAudio, setMuted, isMuted, setMusicOn, isMusicOn, say, sfx } from "./audio.js";
import { Music, styleFor } from "./music.js";
import { calibrate } from "./moves/body.js";

const $ = (id) => document.getElementById(id);
const css = getComputedStyle(document.documentElement);
const COACH_COLORS = {
  body: css.getPropertyValue("--figure").trim(),
  back: css.getPropertyValue("--figure-back").trim(),
};
const WEIGHT_KG = 70; // for the rough calorie estimate
const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");
const NEEDS_LEGS = new Set(["squat", "jog", "runner", "jacks", "plank", "curtsy", "core", "burpee", "pushup", "climber"]);
const music = new Music();

function loadPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// ---------- Screens ----------
let screen = "setup";
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === name));
  screen = name;
  const first = document.querySelector(`#${name} .btn.primary`);
  first?.focus({ preventScroll: true });
}

// ---------- Setup ----------
const TODAY = new Date().getDay();
const settings = { minutes: 10, mode: "tv", day: TODAY };

function renderDays() {
  $("days").innerHTML = DAYS.map((d) => `<button role="radio" data-day="${d.day}" aria-checked="${d.day === settings.day}">
      <b>${d.short}${d.day === TODAY ? " · today" : ""}</b><span>${d.focus}</span>${d.weights ? "<em>Dumbbells</em>" : ""}
    </button>`).join("");
}

function setDay(day) {
  settings.day = day;
  document.querySelectorAll("#days button").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.day) === day)));
  updateSummary();
}

function renderDurations() {
  $("durations").innerHTML = DURATIONS.map(
    (m) => `<button role="radio" data-min="${m}" aria-checked="${m === settings.minutes}">${m}<small>min</small></button>`,
  ).join("");
}

function setMode(mode) {
  settings.mode = mode;
  document.querySelectorAll(".mode").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
  updateSummary();
}

function updateSummary() {
  const p = buildPlan(settings.minutes, settings.day);
  const how = settings.mode === "tv"
    ? "Copy the coach on the left. The world moves to the coach's beat."
    : "Stand 2 to 3 metres back so the camera sees you head to toe.";
  const kit = p.day.weights ? "You'll need a pair of dumbbells (or two filled water bottles)." : "No equipment needed.";
  $("plan-summary").textContent =
    `${p.day.name}: ${p.day.focus}. ${p.minutes} minutes: ${p.warmups} warm-up drill${p.warmups > 1 ? "s" : ""}, ${p.moves} moves${p.rounds > 1 ? ` × ${p.rounds} rounds` : ""}, ${p.stretches} stretch${p.stretches > 1 ? "es" : ""} and breathing. ${kit} ${how}`;
  buildLineup(p);
}

async function detectCamera() {
  let has = false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    has = devices.some((d) => d.kind === "videoinput");
  } catch {
    has = false;
  }
  const btn = document.querySelector('[data-mode="camera"]');
  btn.disabled = !has;
  $("cam-note").hidden = has;
  $("cam-note").textContent = "No camera found, so this device will use TV mode.";
  setMode(has ? "camera" : "tv");
}

let lineupPlan = null;
function buildLineup(plan) {
  lineupPlan = plan;
  // Later rounds repeat round 1, so the lineup shows each move once.
  $("lineup").innerHTML = plan.blocks.map((b, i) => {
    if (b.round > 1) return "";
    const m = MOVES[b.move];
    const tag = b.rounds ? `× ${b.rounds} rounds` : b.label ?? "Main";
    return `<div class="lineup-card" style="--move:${m.color}">
      <canvas data-idx="${i}"></canvas>
      <small>${tag} · ${fmtTime(b.dur)}${b.rounds ? " each" : ""}${m.weights ? " · dumbbells" : ""}</small><h4>${m.name}</h4><p><b>${m.world}.</b> ${m.blurb}</p>
    </div>`;
  }).join("");
}

// Coach framing per view, in figure units (side views reach forward; the plank lies down).
const FRAMES = {
  front: { x0: -0.62, x1: 0.62, y0: -1.12, y1: 0.68 },
  side: { x0: -0.36, x1: 0.72, y0: -0.95, y1: 0.68 },
};
function drawPose(canvas, move, pose, floor = true) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const f = move.frame ?? FRAMES[move.view] ?? FRAMES.front;
  const s = Math.min((w * 0.92) / (f.x1 - f.x0), (h * 0.92) / (f.y1 - f.y0));
  const x = w / 2 - ((f.x0 + f.x1) / 2) * s;
  const y = h / 2 - ((f.y0 + f.y1) / 2) * s;
  if (floor) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.ellipse(x, y + (move.floor ?? 0.62) * s, (f.x1 - f.x0) * s * 0.36, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawFigure(ctx, pose, x, y, s, COACH_COLORS);
  if (move.weights) drawDumbbells(ctx, pose, x, y, s, "#9fb7a8");
}

function drawLineup(t) {
  if (!lineupPlan) return;
  document.querySelectorAll("#lineup canvas").forEach((c) => {
    const b = lineupPlan.blocks[c.dataset.idx];
    const move = MOVES[b.move];
    drawPose(c, move, move.coach(t, 1, null, b).pose);
  });
}

// ---------- Camera + pose tracking ----------
const video = $("cam");
let tracker = null;
let camState = "idle"; // idle | loading | ready | failed
let lastPose = null;
let lastPoseAt = 0;
let lastFrameAt = 0;

function setPosStatus(text, kind = "") {
  $("pos-status").textContent = text;
  $("pos-status").className = `status ${kind}`;
}

async function startCamera() {
  if (camState === "ready" || camState === "loading") return;
  camState = "loading";
  try {
    setPosStatus("Asking for camera access…");
    if (!video.srcObject) {
      video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      await video.play();
    }
    $("chk-cam").classList.add("ok");
    if (!tracker) {
      setPosStatus("Loading the motion tracker…");
      const { createTracker } = await import("./tracker.js");
      tracker = await createTracker(video);
    }
    camState = "ready";
    setPosStatus("Hold still in view for 3 seconds and we'll start.");
  } catch (err) {
    console.warn("Camera unavailable:", err);
    camState = "failed";
    setPosStatus("Couldn't start the camera. You can still play without one.", "warn");
    $("pos-tv").focus();
  }
}

function stopCamera() {
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  $("chk-cam").classList.remove("ok");
  if (camState !== "loading") camState = "idle";
  lastPose = null;
}

// Returns the new pose result (with its dt) if the camera produced a frame.
function pollPose(now) {
  if (!tracker || camState !== "ready") return null;
  const r = tracker.detect(now);
  if (!r) return null;
  const dt = Math.min(0.1, (now - (lastFrameAt || now)) / 1000);
  lastFrameAt = now;
  lastPose = r.found ? r : null;
  if (r.found) lastPoseAt = now;
  return { ...r, dt };
}

const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];
function drawCameraView(canvas, color = "#7ee081") {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.fillStyle = "#0b140f";
  ctx.fillRect(0, 0, w, h);
  if (!video.srcObject || video.readyState < 2) return;
  // Cover-fit the video, mirrored so it behaves like a mirror.
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const k = Math.max(w / vw, h / vh);
  const dw = vw * k, dh = vh * k, ox = (w - dw) / 2, oy = (h - dh) / 2;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, ox, oy, dw, dh);
  ctx.restore();
  if (!lastPose) return;
  const lm = lastPose.image;
  const pt = (i) => [w - (ox + lm[i].x * dw), oy + lm[i].y * dh];
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const [a, b] of BONES) {
    if (!seen(lm, a, b)) continue;
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// ---------- Position check ----------
let posHold = 0;
let calibSamples = [];
let calib = null;
function positionFrame(now, dt) {
  const fresh = pollPose(now);
  drawCameraView($("pos-canvas"));
  const lm = lastPose?.image;
  const inFrame = lm && seen(lm, 0, 11, 12, 23, 24, 25, 26, 27, 28) &&
    [0, 27, 28].every((i) => lm[i].y > 0 && lm[i].y < 1);
  $("chk-body").classList.toggle("ok", !!inFrame);
  posHold = inFrame ? posHold + dt : 0;
  if (!inFrame) calibSamples = [];
  else if (fresh?.found && posHold > 0.5) calibSamples.push(fresh); // measure you standing still
  $("pos-count").textContent = inFrame && camState === "ready" ? String(Math.max(1, Math.ceil(3 - posHold))) : "";
  if (inFrame && posHold >= 3) {
    calib = calibrate(calibSamples);
    startSession();
  }
}

// ---------- Workout session ----------
let session = null;

function coachInset() {
  return window.innerWidth <= 720 ? 0 : $("coach-panel").getBoundingClientRect().right + 8;
}

function buildPlanBar(plan) {
  const bar = $("plan-bar");
  bar.querySelectorAll(".plan-seg").forEach((n) => n.remove());
  for (const b of plan.blocks) {
    const seg = document.createElement("div");
    seg.className = "plan-seg";
    seg.style.flexGrow = b.dur;
    seg.style.setProperty("--seg", MOVES[b.move].color);
    seg.title = b.label ?? MOVES[b.move].name;
    bar.insertBefore(seg, $("plan-head"));
  }
}

function startSession() {
  unlockAudio();
  const plan = buildPlan(settings.minutes, settings.day);
  session = {
    plan, elapsed: 0, idx: -1, paused: false, countdown: 3, done: false,
    reps: {}, stats: {}, total: 0, kcal: 0, lastCount: 0, signal: { events: [] }, spokeHalf: false,
  };
  buildPlanBar(plan);
  $("cam-card").hidden = settings.mode !== "camera";
  $("pause").hidden = true;
  show("workout");
  enterBlock(0);
}

function enterBlock(i) {
  const s = session;
  const b = s.plan.blocks[i];
  const move = MOVES[b.move];
  s.idx = i;
  s.block = b;
  s.move = move;
  // TV mode (or moves like breathing that don't need tracking) follow the coach's pace.
  s.auto = settings.mode === "tv" || !!move.autoOnly;
  s.scene = move.createScene($("scene"), { auto: s.auto, tempo: b.tempo, inset: coachInset, block: b, variant: b.variant });
  s.detector = s.auto ? null : move.createDetector(calib);
  s.energy = 0;
  s.fastOn = false;
  s.lastSay = null;
  music.start(styleFor(b), s.energy);
  s.lastCount = 0;
  s.signal = { events: [] };

  $("workout").style.setProperty("--move", move.color);
  $("coach-world").textContent = b.label ? `${b.label} · ${move.world}` : move.world;
  $("coach-move").textContent = move.name;
  $("next-banner").hidden = true;
  const wipe = $("wipe");
  wipe.classList.remove("go");
  void wipe.offsetWidth;
  wipe.classList.add("go");
  document.querySelectorAll(".plan-seg").forEach((seg, k) => {
    seg.classList.toggle("past", k < i);
    seg.classList.toggle("now", k === i);
  });

  const line = b.say ?? move.say;
  say(b.roundStart ? `Round ${b.round}! ${line}` : line);
  if (i > 0) sfx.ding();
}

function mergeStats() {
  const s = session;
  const acc = (s.stats[s.move.id] ??= {});
  for (const [k, v] of Object.entries(s.scene.stats())) {
    acc[k] = k.startsWith("best") ? Math.max(acc[k] ?? 0, v) : (acc[k] ?? 0) + v; // bests don't add up
  }
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function workoutFrame(now, dt) {
  const s = session;
  if (s.done) return;
  const running = !s.paused && s.countdown <= 0;
  if (!s.paused) {
    if (s.countdown > 0) s.countdown -= dt;
    else s.elapsed += dt;
  }
  while (s.elapsed >= s.block.start + s.block.dur) {
    mergeStats();
    if (s.idx + 1 >= s.plan.blocks.length) return finish(false);
    enterBlock(s.idx + 1);
  }

  const b = s.block, move = s.move;
  const t = s.elapsed - b.start;
  // Long blocks have faster stretches: the coach runs on warped time.
  const bt = blockTime(b, t);
  const coach = move.coach(bt.t, b.tempo, s.scene, b);
  coach.bpm *= bt.rate;
  if (bt.fast) {
    if (bt.fastFor < 1.5) coach.cue = "FASTER!";
    coach.energy = Math.max(coach.energy ?? 0, 1);
    if (!s.fastOn && running) say("Speed it up!");
  }
  s.fastOn = bt.fast;
  if (running && coach.say && coach.say !== s.lastSay) {
    s.lastSay = coach.say;
    say(coach.say);
  }

  // Movement signal: the camera, or the coach's own pace in TV mode.
  let signal;
  if (s.auto) {
    const events = [];
    if (running) for (let k = s.lastCount; k < coach.count; k++) events.push(move.event(k, coach));
    s.lastCount = coach.count;
    signal = { ...coach.signal, events };
  } else {
    signal = { ...s.signal, events: [] };
    const r = pollPose(now);
    if (r) {
      s.signal = s.detector.update(r.found ? r : null, r.dt);
      signal = running ? s.signal : { ...s.signal, events: [] };
    }
  }

  if (running) music.update(coach.beat, coach.bpm, coach.energy ?? s.energy);

  if (running) {
    const n = signal.events.filter((e) => e.type === move.repEvent).length;
    if (n && !s.auto) flash($("cam-card"));
    s.reps[move.id] = (s.reps[move.id] ?? 0) + n;
    s.total += n;
    s.kcal += (((b.met ?? move.met) * 3.5 * WEIGHT_KG) / 200 / 60) * dt;
  }

  s.scene.update(s.paused ? 0 : dt, signal, coach);
  s.scene.draw();

  // Coach panel.
  drawPose($("coach-canvas"), move, coach.pose);
  setText($("coach-cue"), s.countdown > 0 ? "GET READY" : coach.cue);
  $("block-fill").style.width = `${Math.min(100, (t / b.dur) * 100)}%`;
  setText($("block-left"), `${fmtTime(b.dur - t)} left in this move`);

  // Top bar.
  setText($("time-left"), fmtTime(s.plan.total - s.elapsed));
  setText($("rep-count"), String(s.total));
  const bar = $("plan-bar");
  $("plan-head").style.left = `${10 + (s.elapsed / s.plan.total) * (bar.clientWidth - 23)}px`;
  setText($("scene-hud"), s.scene.hud());

  // Next-up banner.
  const next = s.plan.blocks[s.idx + 1];
  const left = b.dur - t;
  const banner = $("next-banner");
  if (next && left <= 7) {
    const nm = MOVES[next.move];
    if (banner.hidden) {
      banner.hidden = false;
      banner.style.setProperty("--move", nm.color);
      $("next-name").textContent = next.label ? `${next.label}: ${nm.name}` : `${nm.name} · ${nm.world}`;
    }
    setText($("next-count"), String(Math.ceil(left)));
    drawPose($("next-canvas"), nm, nm.coach(now / 1000, 1, null, next).pose, false);
  } else if (!banner.hidden) banner.hidden = true;

  // Countdown and milestones.
  let msg = "";
  if (s.countdown > 0) msg = String(Math.ceil(s.countdown));
  else if (s.elapsed < 0.7) msg = "GO!";
  setText($("center-msg"), msg);
  if (!s.spokeHalf && s.elapsed > s.plan.total / 2) {
    s.spokeHalf = true;
    say("Halfway there. Keep going!");
  }

  if (settings.mode === "camera") {
    drawCameraView($("cam-canvas"), move.color);
    const lm = lastPose?.image;
    let hint = "";
    if (now - lastPoseAt > 1500) hint = "Can't see you. Step back into view.";
    else if (lm && NEEDS_LEGS.has(move.id) && !seen(lm, 25, 26, 27, 28)) hint = "Step back so we can see your legs.";
    else if (lm && !seen(lm, 13, 14, 15, 16)) hint = "Keep both arms in view.";
    setText($("cam-hint"), hint);
    $("cam-hint").hidden = !running || !hint || s.auto;
    if (DEBUG) {
      const sig = s.signal;
      setText($("cam-debug"), Object.entries(sig).filter(([k]) => k !== "events")
        .map(([k, v]) => `${k} ${typeof v === "number" ? v.toFixed(2) : v}`).join("  "));
    }
  }
}

function flash(el) {
  el.classList.remove("hit");
  void el.offsetWidth;
  el.classList.add("hit");
}

function togglePause(force) {
  const s = session;
  if (!s || s.done) return;
  s.paused = force ?? !s.paused;
  $("pause").hidden = !s.paused;
  $("pause-btn").textContent = s.paused ? "Resume" : "Pause";
  if (s.paused) {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    $("resume-btn").focus();
  }
}

const TITLES = [
  "The tree felt that.",
  "The panda is well fed and so are your muscles.",
  "The crocodile went home hungry.",
  "The King demands an encore.",
  "The flies have filed a complaint.",
  "The goose respects you now.",
];

function finish(early) {
  const s = session;
  if (s.done) return;
  if (early) mergeStats();
  s.done = true;
  s.paused = false;
  music.stop();
  $("pause").hidden = true;
  say(early ? "Nice work. Every move counts." : "Workout complete! Amazing job.");
  sfx.ding();

  $("stat-time").textContent = fmtTime(s.elapsed);
  $("stat-reps").textContent = String(s.total);
  $("stat-reps-label").textContent = settings.mode === "tv" ? "Moves (paced)" : "Moves";
  $("stat-kcal").textContent = String(Math.round(s.kcal));
  const order = [...new Set(s.plan.blocks.map((b) => b.move))];
  $("breakdown").innerHTML = order.filter((id) => s.stats[id]).map((id) => {
    const m = MOVES[id];
    return `<li style="--move:${m.color}"><b>${m.world}</b><span>${m.summary(s.stats[id], s.reps[id] ?? 0)}</span></li>`;
  }).join("");
  const honks = s.stats.jog?.honks ?? 0;
  const next = dayInfo(s.plan.day.day === 6 ? 0 : s.plan.day.day + 1);
  $("done-title").textContent = !early ? `${s.plan.day.name} done! Tomorrow: ${next.focus}.`
    : early ? "Good effort. The goose will be back."
    : honks >= 3 ? "That goose got you. Rematch?"
    : TITLES[Math.floor(Math.random() * TITLES.length)];
  show("done");
}

// ---------- Main loop ----------
// ?debug in the URL exposes window.mimic for testing: speed and block jumps.
let speed = 1;
if (DEBUG) {
  window.mimic = {
    speed: (x) => (speed = x),
    jump: (i) => {
      if (!session) return;
      session.countdown = 0;
      session.elapsed = session.plan.blocks[i].start;
      mergeStats();
      enterBlock(i);
    },
    session: () => session,
  };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * speed;
  last = now;
  if (screen === "setup") drawLineup(now / 1000);
  else if (screen === "position") positionFrame(now, dt);
  else if (screen === "workout" && session) workoutFrame(now, dt);
  requestAnimationFrame(frame);
}

// ---------- Wiring ----------
function begin() {
  unlockAudio();
  if (settings.mode === "camera") {
    posHold = 0;
    calibSamples = [];
    calib = null;
    show("position");
    startCamera();
  } else {
    startSession();
  }
}

$("durations").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-min]");
  if (!b) return;
  settings.minutes = Number(b.dataset.min);
  document.querySelectorAll("#durations button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  updateSummary();
});
document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$("days").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-day]");
  if (b) setDay(Number(b.dataset.day));
});
$("start-btn").addEventListener("click", begin);
$("pos-back").addEventListener("click", () => {
  stopCamera();
  show("setup");
});
$("pos-tv").addEventListener("click", () => {
  stopCamera();
  setMode("tv");
  startSession();
});
$("pos-start").addEventListener("click", () => {
  if (camState !== "ready") setMode("tv"); // camera failed or still loading
  else calib = calibrate(calibSamples);
  startSession();
});
$("pause-btn").addEventListener("click", () => togglePause());
$("resume-btn").addEventListener("click", () => togglePause(false));
$("finish-btn").addEventListener("click", () => finish(true));
$("mute-btn").addEventListener("click", () => {
  setMuted(!isMuted());
  $("mute-btn").textContent = isMuted() ? "Sound off" : "Sound on";
});
$("music-btn").addEventListener("click", () => {
  setMusicOn(!isMusicOn());
  savePref("mimic.music", isMusicOn() ? "on" : "off");
  $("music-btn").textContent = isMusicOn() ? "Music on" : "Music off";
});
if (loadPref("mimic.music", "on") === "off") {
  setMusicOn(false);
  $("music-btn").textContent = "Music off";
}
$("again-btn").addEventListener("click", begin);
$("menu-btn").addEventListener("click", () => {
  stopCamera();
  show("setup");
});

// Keyboard / TV remote: arrows move focus spatially, Space/Esc/P pause.
window.addEventListener("keydown", (e) => {
  const k = e.key;
  if (screen === "workout" && session && !session.done) {
    const onButton = document.activeElement?.tagName === "BUTTON";
    if (k === "Escape" || k.toLowerCase() === "p" || (k === " " && !onButton)) {
      e.preventDefault();
      togglePause();
      return;
    }
  }
  const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (!dirs[k]) return;
  const scope = session && !$("pause").hidden ? $("pause") : document.querySelector(".screen.active");
  const items = [...scope.querySelectorAll("button:not([disabled])")].filter((b) => b.offsetParent !== null);
  if (!items.length) return;
  e.preventDefault();
  const cur = document.activeElement;
  if (!items.includes(cur)) return items[0].focus();
  const [dx, dy] = dirs[k];
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestScore = Infinity;
  for (const b of items) {
    if (b === cur) continue;
    const q = b.getBoundingClientRect();
    const ox = q.left + q.width / 2 - cx, oy = q.top + q.height / 2 - cy;
    const along = ox * dx + oy * dy;
    if (along <= 4) continue;
    const score = along + Math.abs(ox * dy + oy * dx) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  best?.focus();
});

renderDays();
renderDurations();
updateSummary();
detectCamera();
requestAnimationFrame(frame);
