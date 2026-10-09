// Keyframed stick-figure silhouette used by the coach and by in-world characters.
//
// A pose maps joints to [x, y] in figure units: hip at (0, 0), y down, standing
// height ≈ 1.4. "l"/"r" mean screen-left/right (the coach is a mirror).
// `back` marks which side is drawn behind the body in side views; `behind`
// draws both arms behind the head (hands behind the head, front view).
import { TAU } from "./util.js";

const KEYS = ["head", "neck", "hip", "ls", "le", "lw", "rs", "re", "rw", "lh", "lk", "la", "rh", "rk", "ra"];

export function mix(a, b, t) {
  const o = { back: t < 0.5 ? a.back : b.back, toe: t < 0.5 ? a.toe : b.toe, behind: t < 0.5 ? a.behind : b.behind };
  for (const k of KEYS) o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
  return o;
}

export function shift(p, dx, dy) {
  const o = { back: p.back, toe: p.toe, behind: p.behind };
  for (const k of KEYS) o[k] = [p[k][0] + dx, p[k][1] + dy];
  return o;
}

// Flip horizontally, swapping left and right limbs.
export function mirror(p) {
  const o = { back: p.back === "l" ? "r" : p.back === "r" ? "l" : null, toe: p.toe && [-p.toe[0], p.toe[1]], behind: p.behind };
  for (const k of KEYS) {
    const src = k.length === 2 ? (k[0] === "l" ? "r" : "l") + k[1] : k;
    o[k] = [-p[src][0], p[src][1]];
  }
  return o;
}

export const pose = (base, over) => ({ ...base, ...over });

// Front view, standing relaxed.
export const FRONT = {
  back: null,
  head: [0, -0.77], neck: [0, -0.6], hip: [0, 0],
  ls: [-0.14, -0.56], le: [-0.19, -0.31], lw: [-0.21, -0.06],
  rs: [0.14, -0.56], re: [0.19, -0.31], rw: [0.21, -0.06],
  lh: [-0.08, 0], lk: [-0.1, 0.3], la: [-0.11, 0.6],
  rh: [0.08, 0], rk: [0.1, 0.3], ra: [0.11, 0.6],
};

// Front view, bottom of a squat (knees out, hands low).
export const SQUAT_DOWN = {
  back: null,
  head: [0, -0.38], neck: [0, -0.22], hip: [0, 0.24],
  ls: [-0.14, -0.19], le: [-0.17, 0.06], lw: [-0.08, 0.34],
  rs: [0.14, -0.19], re: [0.17, 0.06], rw: [0.08, 0.34],
  lh: [-0.1, 0.24], lk: [-0.24, 0.3], la: [-0.14, 0.6],
  rh: [0.1, 0.24], rk: [0.24, 0.3], ra: [0.14, 0.6],
};

// Character colours for the in-world figures (the coach uses plain body/back).
export const LOOKS = {
  runner: { body: "#29b6f6", back: "#0277bd", outline: "#1d1d1d" },
  jogger: { body: "#ff7a45", back: "#c4541f", outline: "#2b2b2b", band: "#ffffff" },
  plank: { body: "#9575cd", back: "#5e35b1", outline: "#1d1d1d" },
  royal: { body: "#5c6bc0", back: "#303f9f", outline: "#1d1d1d" },
  football: { body: "#e53935", back: "#b71c1c", outline: "#1d1d1d" },
  zen: { body: "#26a69a", back: "#00796b", outline: "#1d1d1d" },
  burpee: { body: "#fdd835", back: "#f9a825", outline: "#1d1d1d" },
  chef: { body: "#f5f5f5", back: "#bdbdbd", outline: "#1d1d1d", band: "#e53935" },
  pusher: { body: "#ff7043", back: "#d84315", outline: "#1d1d1d" },
  climber: { body: "#ef6c00", back: "#b53d00", outline: "#1d1d1d", band: "#ffffff" },
  lifter: { body: "#5c6bc0", back: "#3949ab", outline: "#1d1d1d" },
  sailor: { body: "#e53935", back: "#b71c1c", outline: "#1d1d1d", band: "#ffffff" },
  smith: { body: "#ffb74d", back: "#e08e2b", outline: "#1d1d1d", band: "#6d4c41" },
  flyer: { body: "#29b6f6", back: "#0288d1", outline: "#1d1d1d" },
  party: { body: "#ab47bc", back: "#7b1fa2", outline: "#1d1d1d" },
  knight: { body: "#78909c", back: "#546e7a", outline: "#1d1d1d" },
};

// colors: { body, back, outline?, band? }. Far-side limbs use `back` in side
// views; `outline` draws a dark cartoon edge; `band` adds a headband.
export function drawFigure(ctx, p, x, y, s, colors) {
  const P = (q) => [x + q[0] * s, y + q[1] * s];

  const pass = (grow, override) => {
    const line = (pts, w, c) => {
      ctx.strokeStyle = override ?? c;
      ctx.lineWidth = (w + grow) * s;
      ctx.beginPath();
      pts.forEach((q, i) => {
        const [a, b] = P(q);
        i ? ctx.lineTo(a, b) : ctx.moveTo(a, b);
      });
      ctx.stroke();
    };
    const dot = (q, r, c) => {
      const [a, b] = P(q);
      ctx.fillStyle = override ?? c;
      ctx.beginPath();
      ctx.arc(a, b, (r + grow / 2) * s, 0, TAU);
      ctx.fill();
    };
    const leg = (sd, c) => line([p[sd + "h"], p[sd + "k"], p[sd + "a"]], 0.11, c);
    const arm = (sd, c) => {
      line([p[sd + "s"], p[sd + "e"], p[sd + "w"]], 0.09, c);
      dot(p[sd + "w"], 0.055, c);
    };
    const torso = () => {
      line([p.hip, p.neck], 0.16, colors.body);
      dot(p.head, 0.1, colors.body);
      if (colors.band && !override) {
        const [hx, hy] = p.head;
        line([[hx - 0.095, hy - 0.03], [hx + 0.095, hy - 0.03]], 0.035, colors.band);
      }
    };

    if (p.back) {
      const b = p.back;
      const f = b === "l" ? "r" : "l";
      leg(b, colors.back);
      arm(b, colors.back);
      torso();
      leg(f, colors.body);
      arm(f, colors.body);
    } else {
      leg("l", colors.body);
      leg("r", colors.body);
      if (p.behind) {
        arm("l", colors.body);
        arm("r", colors.body);
      }
      torso();
      line([p.ls, p.rs], 0.1, colors.body);
      if (!p.behind) {
        arm("l", colors.body);
        arm("r", colors.body);
      }
    }
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (colors.outline) pass(0.05, colors.outline);
  pass(0, null);
  ctx.restore();
}

// Soft contact shadow on the floor.
export function floorShadow(ctx, x, y, rx, ry, alpha = 0.28) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}



// A dumbbell in each hand, held across the forearm's end.
export function drawDumbbells(ctx, p, x, y, s, color = "#37474f") {
  const P = (q) => [x + q[0] * s, y + q[1] * s];
  ctx.save();
  for (const sd of ["l", "r"]) {
    const [ex, ey] = P(p[sd + "e"]), [wx, wy] = P(p[sd + "w"]);
    const a = Math.atan2(wy - ey, wx - ex) + Math.PI / 2;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(a);
    ctx.fillStyle = "#9e9e9e";
    ctx.fillRect(-s * 0.09, -s * 0.012, s * 0.18, s * 0.024);
    ctx.fillStyle = color;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(k * s * 0.09 - s * 0.025, -s * 0.045, s * 0.05, s * 0.09, s * 0.012);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
