// Shared helper used by every /api/* function. Nothing in this file is ever
// sent to the browser directly — it's the only place that touches Supabase's
// URL/anon key on the server side and the only place that reads/writes the
// httpOnly session cookies.

export const SUPABASE_URL = "https://rayuaqfwcxzqwekbrpbs.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_uFpL72MpnDQGNJtXVYrP5A_oRUodxp7";

const ACCESS_COOKIE = "cs_at";
const REFRESH_COOKIE = "cs_rt";

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function cookieString(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
  ];
  if (maxAgeSeconds != null) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  list.push(cookie);
  res.setHeader("Set-Cookie", list);
}

export function setSessionCookies(res, { access_token, refresh_token, expires_in }) {
  appendSetCookie(res, cookieString(ACCESS_COOKIE, access_token, expires_in || 3600));
  if (refresh_token) {
    appendSetCookie(res, cookieString(REFRESH_COOKIE, refresh_token, 60 * 60 * 24 * 30));
  }
}

export function clearSessionCookies(res) {
  appendSetCookie(res, cookieString(ACCESS_COOKIE, "", 0));
  appendSetCookie(res, cookieString(REFRESH_COOKIE, "", 0));
}

export async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* empty/non-JSON body, e.g. 204 No Content */
  }
  return { ok: res.ok, status: res.status, data };
}

export async function refreshTokens(refreshToken) {
  return supaFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

async function getAccessToken(req, res) {
  const cookies = parseCookies(req);
  if (cookies[ACCESS_COOKIE]) return cookies[ACCESS_COOKIE];
  if (!cookies[REFRESH_COOKIE]) return null;
  const refreshed = await refreshTokens(cookies[REFRESH_COOKIE]);
  if (!refreshed.ok) return null;
  setSessionCookies(res, refreshed.data);
  return refreshed.data.access_token;
}

export async function withAuth(req, res, fn) {
  const token = await getAccessToken(req, res);
  if (!token) return { ok: false, status: 401, data: { message: "Not authenticated" } };

  let result = await fn(token);
  if (result.status === 401) {
    const cookies = parseCookies(req);
    if (cookies[REFRESH_COOKIE]) {
      const refreshed = await refreshTokens(cookies[REFRESH_COOKIE]);
      if (refreshed.ok) {
        setSessionCookies(res, refreshed.data);
        result = await fn(refreshed.data.access_token);
      }
    }
  }
  return result;
}

export function mapSignupError(rawMessage) {
  const msg = (rawMessage || "").toLowerCase();
  if (msg.includes("already registered") || msg.includes("already exists")) {
    return "That email may already have an account. Try signing in instead.";
  }
  if (msg.includes("password")) return "Password must be at least 12 characters.";
  if (msg.includes("email") && msg.includes("invalid")) return "Enter a valid email address.";
  return "Something went wrong. Please try again.";
}
