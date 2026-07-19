/* ---------- Lock timer helpers ---------- */

export const LOCK_MS = 24 * 60 * 60 * 1000;

function hexToRgb(hex) {
  const v = hex.replace("#", "");
  return { r: parseInt(v.substring(0, 2), 16), g: parseInt(v.substring(2, 4), 16), b: parseInt(v.substring(4, 6), 16) };
}

function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function lockProgressColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.5) return lerpColor("#D6484A", "#E8833F", clamped / 0.5);
  return lerpColor("#E8833F", "#3FB871", (clamped - 0.5) / 0.5);
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* ---------- Date helpers ---------- */

export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shortLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}/${d}`;
}
