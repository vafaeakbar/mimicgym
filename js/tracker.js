// Wraps MediaPipe Pose Landmarker. Loaded lazily so the app still works
// (TV mode) if the camera or CDN is unavailable.
import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
// "full" is noticeably steadier than "lite" for limbs and knees, and still real-time on a laptop.
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

// One Euro filter: smooths jitter when still, stays responsive when moving fast
// (so punches and jumps aren't delayed). https://gery.casiez.net/1euro/
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, dt) {
    if (this.x === null || dt <= 0) {
      this.x = x;
      return x;
    }
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}

function makeSmoother() {
  const filters = Array.from({ length: 33 }, () => [0, 1, 2].map(() => new OneEuro(1.6, 3)));
  const vis = new Float32Array(33).fill(-1);
  return (landmarks, dt) =>
    landmarks.map((p, i) => {
      const [fx, fy, fz] = filters[i];
      const v = p.visibility ?? 1;
      vis[i] = vis[i] < 0 ? v : vis[i] * 0.5 + v * 0.5;
      return { x: fx.filter(p.x, dt), y: fy.filter(p.y, dt), z: fz.filter(p.z, dt), visibility: vis[i] };
    });
}

export async function createTracker(video) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.6,
  });

  let landmarker;
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    landmarker = await PoseLandmarker.createFromOptions(fileset, options("CPU"));
  }

  let smoothImage = makeSmoother();
  let smoothWorld = makeSmoother();
  let lastVideoTime = -1;
  let lastNow = 0;

  return {
    // Returns null when there is no new video frame, otherwise the pose (if any).
    detect(now) {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return null;
      lastVideoTime = video.currentTime;
      const dt = lastNow ? Math.min(0.2, (now - lastNow) / 1000) : 0;
      lastNow = now;
      const result = landmarker.detectForVideo(video, now);
      if (!result.landmarks.length) {
        // Start fresh when the person comes back, rather than sliding in.
        smoothImage = makeSmoother();
        smoothWorld = makeSmoother();
        return { found: false };
      }
      return {
        found: true,
        image: smoothImage(result.landmarks[0], dt),
        world: smoothWorld(result.worldLandmarks[0], dt),
      };
    },
  };
}
