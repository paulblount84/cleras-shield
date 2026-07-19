/* ---------- API client (same-origin, cookie-based) ----------
   Every call here hits this app's own /api/* serverless functions, never
   Supabase directly. The functions hold the session as httpOnly cookies —
   this file (and every other line of client JS) never sees an access token
   or refresh token at all, not even transiently, except for the one
   unavoidable case of a password-recovery token arriving via URL hash (see
   the reset-confirm handling in App.jsx), which is held only in memory for
   the few seconds until it's handed to the server and never stored.
------------------------------------------------------------------------------- */

export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || "Something went wrong. Please try again.");
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function qrCodeToImageSrc(qr) {
  if (!qr) return "";
  if (qr.startsWith("data:")) return qr; // already a usable data URL
  return `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`; // raw SVG markup — encode it ourselves
}

export function getSession() {
  return api("/api/auth/session");
}

export function signUpRequest(email, password, role) {
  return api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, role }) });
}

export function signInRequest(email, password) {
  return api("/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logoutRequest() {
  return api("/api/auth/logout", { method: "POST" }).catch(() => {});
}

export function requestPasswordReset(email) {
  return api("/api/auth/reset-request", { method: "POST", body: JSON.stringify({ email }) }).catch(() => {});
}

export function confirmPasswordReset({ accessToken, refreshToken, expiresIn, newPassword }) {
  return api("/api/auth/reset-confirm", {
    method: "POST",
    body: JSON.stringify({ accessToken, refreshToken, expiresIn, newPassword }),
  });
}

/* ---------- TOTP MFA ---------- */

export function fetchUserFactors() {
  return api("/api/auth/session").then((d) => d.factors || []);
}

export function enrollTotpFactor() {
  return api("/api/mfa/enroll", { method: "POST" });
}

export function unenrollFactor(factorId) {
  return api("/api/mfa/unenroll", { method: "POST", body: JSON.stringify({ factorId }) }).catch(() => {});
}

export function verifyMfaChallenge(factorId, code, pendingToken) {
  return api("/api/mfa/verify", {
    method: "POST",
    body: JSON.stringify({ factorId, code, pendingToken }),
  });
}

/* ---------- Check-ins & interventions ---------- */

export function fetchCheckIns(fromDate) {
  return api(`/api/checkins/list?from=${fromDate}`);
}

export function submitCheckIn({ sleepScore, stressScore, recoveryScore, incidentLabel }) {
  return api("/api/checkins/submit", {
    method: "POST",
    body: JSON.stringify({ sleepScore, stressScore, recoveryScore, incidentLabel }),
  });
}

export function fetchInterventionCompletions() {
  return api("/api/interventions/list");
}

export function logInterventionCompletion(interventionId) {
  return api("/api/interventions/log", { method: "POST", body: JSON.stringify({ interventionId }) });
}
