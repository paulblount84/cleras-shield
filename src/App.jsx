import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/* ---------- Supabase (REST, no SDK) ----------
   The session (access token, refresh token, expiry) persists in sessionStorage
   so a page refresh doesn't sign people out — but it's scoped to the browser
   tab: closing the tab or browser clears it, and it's never shared across
   tabs the way localStorage would be. Every read/write of check-in data goes
   straight to Supabase and is scoped by Postgres RLS to auth.uid(), so this
   file never holds another officer's data regardless of what's cached locally.
------------------------------------------------------------------------------- */

const SUPABASE_URL = "https://rayuaqfwcxzqwekbrpbs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uFpL72MpnDQGNJtXVYrP5A_oRUodxp7";

// Session persists in sessionStorage (per-tab, cleared when the tab/browser
// closes) rather than staying purely in-memory — a deliberate tradeoff so a
// page refresh doesn't sign people out, at the cost of the token being
// readable by any script running on the page for the life of that tab.
const SESSION_STORAGE_KEY = "cs-session";

function loadStoredSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveStoredSession(sessionObj) {
  try {
    if (sessionObj) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionObj));
    } else {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (e) {
    /* storage unavailable (private browsing, quota, etc.) — fail silently, session just won't persist */
  }
}

// Columns the browser is actually allowed to SELECT (matches the column-level
// GRANTs in the database — this list isn't just cosmetic, the server enforces it).
const CHECK_IN_COLUMNS =
  "check_date,readiness_index,condition,sleep_score,stress_score,recovery_score,incident_flag,incident_label,created_at";

function qrCodeToImageSrc(qr) {
  if (!qr) return "";
  if (qr.startsWith("data:")) return qr; // already a usable data URL
  return `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`; // raw SVG markup — encode it ourselves
}

function mapAuthError(rawMessage, context) {
  // Never surface raw Supabase/Postgres error internals to the person using the app.
  if (context === "signin") return "Unable to sign in with those credentials.";
  const msg = (rawMessage || "").toLowerCase();
  if (msg.includes("already registered") || msg.includes("already exists")) {
    return "That email may already have an account. Try signing in instead.";
  }
  if (msg.includes("password")) {
    return "Password must be at least 12 characters.";
  }
  if (msg.includes("email") && msg.includes("invalid")) {
    return "Enter a valid email address.";
  }
  return "Something went wrong. Please try again.";
}

async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }
  if (!res.ok) {
    const raw = data && (data.error_description || data.msg || data.error);
    const err = new Error(raw || "Authentication failed");
    err.raw = raw;
    throw err;
  }
  return data;
}

function signUpRequest(email, password, role) {
  return authRequest("signup", { email, password, data: { role } });
}

function signInRequest(email, password) {
  return authRequest("token?grant_type=password", { email, password });
}

async function requestPasswordReset(email) {
  // Supabase always responds 200 here regardless of whether the email exists,
  // to avoid confirming/denying account existence to the caller.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* ignore parse failure, fall through to generic message */
    }
    throw new Error(data.error_description || data.msg || "Could not send reset email.");
  }
}

async function updatePasswordWithRecoveryToken(accessToken, newPassword) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Could not update password.");
  return data; // updated user object
}

function refreshSessionRequest(refreshToken) {
  return authRequest("token?grant_type=refresh_token", { refresh_token: refreshToken });
}

async function logoutRequest(accessToken) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    // Even if the network call fails, the caller clears local session state anyway.
  }
}

/* ---------- TOTP MFA ---------- */

async function fetchUserFactors(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Could not check two-factor status.");
  return data.factors || [];
}

async function enrollTotpFactor(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/factors`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ factor_type: "totp" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Could not start two-factor setup.");
  return data; // { id, totp: { qr_code, secret, uri } }
}

async function unenrollFactor(accessToken, factorId) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    /* best-effort cleanup of an abandoned/unverified factor, not critical */
  }
}

async function createMfaChallenge(accessToken, factorId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Could not start verification.");
  return data; // { id, expires_at }
}

async function verifyMfaChallenge(accessToken, factorId, challengeId, code) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("That code didn't match. Try again.");
  return data; // new aal2 session: { access_token, refresh_token, expires_in, user }
}

async function fetchCheckIns(accessToken, fromDate) {
  // No user_id filter here on purpose — RLS identifies the caller server-side.
  // Adding one client-side would be cosmetic, not a security control.
  const url = `${SUPABASE_URL}/rest/v1/check_ins?select=${CHECK_IN_COLUMNS}&check_date=gte.${fromDate}&order=check_date.asc`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = new Error("Failed to load check-ins");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function submitCheckIn(accessToken, { sleepScore, stressScore, recoveryScore, incidentLabel }) {
  // The browser sends only raw answer choices. readiness_index, condition,
  // incident_flag, and check_date are all computed/derived server-side inside
  // this RPC — the only way the check_ins table can be written to at all
  // (direct INSERT/UPDATE privileges are revoked).
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_check_in`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_sleep_score: sleepScore,
      p_stress_score: stressScore,
      p_recovery_score: recoveryScore,
      p_incident_label: incidentLabel,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const raw = (data && (data.message || data.hint)) || "";
    if (raw.includes("24 hours")) {
      throw new Error("You can check in again 24 hours after your last check-in.");
    }
    const err = new Error("Could not save your check-in. Please try again.");
    err.status = res.status;
    throw err;
  }
  return Array.isArray(data) ? data[0] : data;
}

async function fetchInterventionCompletions(accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/intervention_completions?select=intervention_id,completed_at`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = new Error("Failed to load intervention history");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function logInterventionCompletion(accessToken, interventionId) {
  // Same pattern as check-ins: user_id is never sent by the client, the RPC
  // derives it from auth.uid(). Direct INSERT on the table is revoked.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_intervention_completion`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_intervention_id: interventionId }),
  });
  if (!res.ok) {
    const err = new Error("Failed to log completion");
    err.status = res.status;
    throw err;
  }
}

/* ---------- Scoring model ---------- */

const WEIGHTS = { sleep: 0.4, stress: 0.3, recovery: 0.3 };

const QUESTIONS = [
  {
    key: "sleep",
    label: "SLEEP",
    prompt: "How much sleep did you get last night?",
    options: [
      { label: "Under 4h", sub: "Barely any rest", value: 20 },
      { label: "4–5h", sub: "Short", value: 45 },
      { label: "6–7h", sub: "Reasonable", value: 75 },
      { label: "8h+", sub: "Full night", value: 100 },
    ],
  },
  {
    key: "stress",
    label: "STRESS",
    prompt: "How would you rate your stress level right now?",
    options: [
      { label: "Overwhelming", sub: "Hard to manage", value: 15 },
      { label: "High", sub: "Noticeable strain", value: 40 },
      { label: "Manageable", sub: "Under control", value: 70 },
      { label: "Low", sub: "Steady", value: 100 },
    ],
  },
  {
    key: "recovery",
    label: "RECOVERY",
    prompt: "How recovered do you feel going into today?",
    options: [
      { label: "Depleted", sub: "Running on empty", value: 15 },
      { label: "Low", sub: "Still catching up", value: 40 },
      { label: "Moderate", sub: "Mostly recharged", value: 70 },
      { label: "Fully recovered", sub: "Ready to go", value: 100 },
    ],
  },
];

const INCIDENT_QUESTION = {
  key: "incident",
  label: "INCIDENT",
  prompt: "Any critical incident exposure on your last shift?",
  options: [
    { label: "Critical incident", sub: "High-severity call", flag: true },
    { label: "Minor call", sub: "Routine stress", flag: false },
    { label: "None", sub: "No exposure", flag: false },
  ],
};

const ALL_STEPS = [QUESTIONS[0], QUESTIONS[1], INCIDENT_QUESTION, QUESTIONS[2]];

/* ---------- Interventions library ---------- */

const INTERVENTIONS = [
  {
    id: "paced-breathing",
    modalities: ["CBT", "DBT"],
    title: "Paced Breathing",
    duration: "~1 min",
    blurb: "Slow your exhale to bring your heart rate down.",
    type: "breathing",
    steps: [
      "A slower exhale than inhale signals safety to your nervous system. Follow the circle: breathe in as it expands, out as it contracts.",
    ],
  },
  {
    id: "tipp",
    modalities: ["DBT"],
    title: "TIPP",
    duration: "~3 min",
    blurb: "For genuinely acute distress, right after a hard call.",
    type: "steps",
    steps: [
      "T — Temperature. Splash cold water on your face, or hold something cold. This triggers a reflex that drops your heart rate fast.",
      "I — Intense Exercise. If you can, do 30-60 seconds of something physical — push-ups, running in place. Burn off the surge.",
      "P — Paced Breathing. Slow your exhale so it's longer than your inhale. A few rounds is enough.",
      "P — Paired Muscle Relaxation. Tense one muscle group hard for 5 seconds, then release. Work through your body, one group at a time.",
    ],
  },
  {
    id: "grounding-54321",
    modalities: ["DBT", "ACT"],
    title: "5-4-3-2-1 Grounding",
    duration: "~2 min",
    blurb: "Interrupt a spiral and land back in the present.",
    type: "steps",
    steps: [
      "Name 5 things you can see around you right now.",
      "Name 4 things you can physically feel — the ground, your clothes, the air.",
      "Name 3 things you can hear.",
      "Name 2 things you can smell.",
      "Name 1 thing you can taste, or one thing you appreciate about yourself right now.",
    ],
  },
  {
    id: "stop-skill",
    modalities: ["DBT"],
    title: "STOP Skill",
    duration: "~1 min",
    blurb: "For when you're about to react and shouldn't.",
    type: "steps",
    steps: [
      "S — Stop. Don't react. Just pause exactly where you are.",
      "T — Take a step back. Take a breath. Create space, physically or mentally, before you respond.",
      "O — Observe. What's happening, inside and around you, right now? Just notice — don't judge it.",
      "P — Proceed mindfully. Ask: what response actually fits this moment, and who I want to be?",
    ],
  },
  {
    id: "quick-thought-check",
    modalities: ["CBT"],
    title: "Quick Thought Check",
    duration: "~2 min",
    blurb: "A condensed thought record for a shift, not a therapy session.",
    type: "steps",
    steps: [
      "What's the thought that's stuck with you right now?",
      "What's the evidence this thought is completely true? What's the evidence against it?",
      "If a partner or colleague had this exact thought after this exact shift, what would you tell them?",
      "What's a more balanced way to see it?",
    ],
  },
  {
    id: "spot-the-distortion",
    modalities: ["CBT"],
    title: "Spot The Distortion",
    duration: "~1 min",
    blurb: "A quick reference for recognizing unhelpful thinking patterns.",
    type: "steps",
    steps: [
      "All-or-Nothing: \"I completely botched that call.\" More accurate: \"That part didn't go how I wanted.\"",
      "Catastrophizing: \"This is going to end my career.\" More accurate: \"This was a bad moment, not a verdict.\"",
      "Mind Reading: \"My sergeant thinks I'm weak for asking for help.\" More accurate: \"I don't actually know what they think.\"",
      "Should Statements: \"I should never feel rattled by this job.\" More accurate: \"It makes sense that this affected me.\"",
      "Discounting the Positive: \"Anyone would've made that same good call.\" More accurate: \"That was a good call, and I made it.\"",
    ],
  },
  {
    id: "name-it",
    modalities: ["ACT"],
    title: "Name It",
    duration: "~1 min",
    blurb: "Create distance from a thought that's stuck.",
    type: "steps",
    steps: [
      "Notice the thought that's bothering you.",
      "Now say it to yourself starting with \"I'm having the thought that...\" — for example, \"I'm having the thought that I failed.\"",
      "Notice: the thought is something your mind is doing, not a fact about you. You can hold it loosely instead of fusing with it.",
    ],
  },
  {
    id: "radical-acceptance",
    modalities: ["DBT"],
    title: "Radical Acceptance",
    duration: "~2 min",
    blurb: "For something that already happened and can't be changed.",
    type: "steps",
    steps: [
      "Something happened that you wish hadn't. Acceptance doesn't mean you're okay with it — it means you stop fighting the fact that it happened.",
      "Say to yourself: \"This happened. Fighting that fact only adds more pain on top of what's already there.\"",
      "Ask: what's one thing within my control right now, given that this is reality?",
    ],
  },
  {
    id: "values-checkin",
    modalities: ["ACT"],
    title: "Values Check-In",
    duration: "~2 min",
    blurb: "For a low-motivation day — reconnect with what matters.",
    type: "steps",
    steps: [
      "Zoom out for a second. What matters to you in how you show up at this job — not what you're supposed to say, what actually matters to you?",
      "Given today, what's one small action in the next hour that fits that?",
      "That's it. Small and doable beats big and abandoned.",
    ],
  },
];

const INTERVENTION_DOMAINS = [
  { id: "CBT", label: "CBT", full: "Cognitive Behavioral Therapy" },
  { id: "DBT", label: "DBT", full: "Dialectical Behavior Therapy" },
  { id: "ACT", label: "ACT", full: "Acceptance & Commitment Therapy" },
];

function suggestedInterventionIds(pct, incidentFlag) {
  if (incidentFlag) return ["tipp", "radical-acceptance"];
  if (pct < 45) return ["paced-breathing", "quick-thought-check"];
  if (pct < 75) return ["stop-skill", "values-checkin"];
  return [];
}

function getCondition(pct) {
  if (pct >= 75)
    return {
      code: "HIGH READINESS",
      dbValue: "green",
      color: "var(--sig-green)",
      hex: "#3FB871",
      headline: "Ready for duty.",
      note: "Your indicators are steady. Standard vigilance.",
    };
  if (pct >= 45)
    return {
      code: "MODERATE READINESS",
      dbValue: "amber",
      color: "var(--sig-amber)",
      hex: "#E8833F",
      headline: "Elevated load.",
      note: "Recovery is lagging. Pace yourself and check in with a peer if it persists.",
    };
  return {
    code: "LOW READINESS",
    dbValue: "red",
    color: "var(--sig-red)",
    hex: "#D6484A",
    headline: "Readiness compromised.",
    note: "Multiple factors are stacked against you today. Talk to your supervisor or peer support before shift.",
  };
}

/* ---------- Lock timer helpers ---------- */

const LOCK_MS = 24 * 60 * 60 * 1000;

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

function lockProgressColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.5) return lerpColor("#D6484A", "#E8833F", clamped / 0.5);
  return lerpColor("#E8833F", "#3FB871", (clamped - 0.5) / 0.5);
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* ---------- Date helpers ---------- */

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}/${d}`;
}

/* ---------- Gauge ---------- */

function Gauge({ pct, color }) {
  const r = 80;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - pct / 100);

  return (
    <svg viewBox="0 0 200 118" className="gauge-svg">
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke="var(--panel-border)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1), stroke 400ms" }}
      />
    </svg>
  );
}

/* ---------- Breathing pacer ---------- */

function BreathingPacer({ onCycleComplete }) {
  const [phase, setPhase] = useState("inhale"); // 'inhale' | 'hold' | 'exhale'
  const [cycles, setCycles] = useState(0);
  const PHASE_MS = { inhale: 4000, hold: 1000, exhale: 6000 };

  useEffect(() => {
    const t = setTimeout(() => {
      if (phase === "inhale") setPhase("hold");
      else if (phase === "hold") setPhase("exhale");
      else {
        setPhase("inhale");
        setCycles((c) => {
          const next = c + 1;
          if (onCycleComplete) onCycleComplete(next);
          return next;
        });
      }
    }, PHASE_MS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  const scale = phase === "inhale" ? 1 : phase === "hold" ? 1 : 0.55;
  const label = phase === "inhale" ? "IN" : phase === "hold" ? "HOLD" : "OUT";
  const duration = phase === "inhale" ? 4000 : phase === "hold" ? 200 : 6000;

  return (
    <div className="cs-breathe-wrap">
      <div
        className="cs-breathe-circle"
        style={{ transform: `scale(${scale})`, transitionDuration: `${duration}ms` }}
      >
        <span>{label}</span>
      </div>
      <div className="cs-breathe-cycles">{cycles} cycles</div>
    </div>
  );
}

/* ---------- Trend chart bits ---------- */

function TrendDot(props) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null || payload.pct == null) return null;
  const color = getCondition(payload.pct).hex;
  const delay = `${((index || 0) % 5) * 0.25}s`;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={3.5}
        className="cs-trend-pulse-ring"
        style={{ fill: color, animationDelay: delay }}
      />
      <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#0A0D12" strokeWidth={1} />
    </g>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length || payload[0].value == null) return null;
  const p = payload[0].payload;
  const cond = getCondition(p.pct);
  return (
    <div
      style={{
        background: "#171C24",
        border: "1px solid #232B35",
        borderRadius: 3,
        padding: "8px 10px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 11,
      }}
    >
      <div style={{ color: "#7E8896", marginBottom: 4 }}>{label}</div>
      <div style={{ color: cond.hex, fontWeight: 600 }}>
        {p.pct} · {cond.code}
      </div>
    </div>
  );
}

const ROLE_OPTIONS = [
  "Police Officer",
  "Sheriff Deputy",
  "Public Safety Dispatcher",
  "Custody Officer",
  "Public Service Officer",
  "Community Service Officer",
  "Police Cadet",
];

/* ---------- Homepage ---------- */

function Homepage({ onGetStarted, onSignIn }) {
  return (
    <div className="cs-home">
      <section id="overview" className="cs-home-section cs-home-hero">
        <h1 className="cs-home-h1">Operational readiness, in under a minute.</h1>
        <p className="cs-home-p">
          Designed exclusively for first responders, Cleras helps you better understand how
          sleep, stress, critical incidents, and recovery may be affecting your readiness.
          Four quick questions provide a simple, private readiness signal; so you can
          recognize small changes before they become bigger challenges.
        </p>
        <div className="cs-home-cta">
          <button className="cs-cta-primary cs-full-width" onClick={onGetStarted}>
            GET STARTED
          </button>
          <button className="cs-cta-secondary cs-full-width" onClick={onSignIn}>
            SIGN IN
          </button>
        </div>
      </section>

      <section id="why-it-matters" className="cs-home-section">
        <div className="cs-eyebrow">WHY IT MATTERS</div>
        <h2 className="cs-home-h2">The job rarely gives you time to notice what it's taking from you.</h2>
        <p className="cs-home-p">
          Poor sleep, chronic stress, and repeated exposure to critical incidents don't
          usually hit all at once, they build gradually over time. By the time you notice
          the change, it may already be affecting your health, your performance, or life at
          home. Cleras Shield gives you a quick, private check-in to help you recognize
          those changes early and helps navigate you to next care steps.
        </p>
      </section>

      <section id="how-it-works" className="cs-home-section">
        <div className="cs-eyebrow">HOW IT WORKS</div>
        <h2 className="cs-home-h2">Four questions. One readiness signal.</h2>
        <p className="cs-home-p">
          Your daily check-in takes about a minute. You'll answer four simple questions
          about your sleep, current stress, exposure to critical incidents, and how
          recovered you feel heading into your shift. Together, those responses generate
          your personalized Readiness Index and a Green, Amber, or Red Readiness Status, a
          familiar color system that provides an easy-to-understand snapshot of how you're
          doing today. Over time, your daily check-ins build a history of your readiness,
          helping you recognize trends and catch small changes before they become bigger
          challenges.
        </p>
        <div className="cs-condition-dist" style={{ marginTop: 20 }}>
          <div className="cs-dist-chip" style={{ color: "var(--sig-green)" }}>
            GREEN
          </div>
          <div className="cs-dist-chip" style={{ color: "var(--sig-amber)" }}>
            AMBER
          </div>
          <div className="cs-dist-chip" style={{ color: "var(--sig-red)" }}>
            RED
          </div>
        </div>
      </section>

      <section id="privacy-security" className="cs-home-section">
        <div className="cs-eyebrow">PRIVACY & SECURITY</div>
        <h2 className="cs-home-h2">Your check-ins are yours and yours alone.</h2>
        <p className="cs-home-p">
          Your responses are protected using industry-standard security practices so only
          you can access your personal check-in history. Your individual answers are never
          shared with command staff, supervisors, or your agency. This information exists
          to help you better understand your own well-being.
        </p>
      </section>

      <section id="who-its-for" className="cs-home-section">
        <div className="cs-eyebrow">WHO IT'S FOR</div>
        <h2 className="cs-home-h2">Built for the people who run toward it.</h2>
        <p className="cs-home-p">
          Cleras Shield was built specifically for public safety dispatchers, police
          officers, custody officers, and sheriff's deputies to provide a simple, private
          way to check in before every shift. In about a minute, you'll receive a
          personalized Readiness Index based on how you're sleeping, recovering, managing
          stress, and responding to the demands of the job.
        </p>
      </section>

      <section className="cs-home-section cs-home-closing">
        <h2 className="cs-home-h2">One minute could help you notice what the job has been quietly changing.</h2>
        <div className="cs-home-cta">
          <button className="cs-cta-primary cs-full-width" onClick={onGetStarted}>
            GET STARTED
          </button>
          <button className="cs-cta-secondary cs-full-width" onClick={onSignIn}>
            SIGN IN
          </button>
        </div>
      </section>
    </div>
  );
}

/* ---------- Main ---------- */

export default function CleraShieldCheckIn() {
  const [session, setSession] = useState(loadStoredSession); // { accessToken, refreshToken, expiresAt, userId, email }
  const [authMode, setAuthMode] = useState("signin"); // 'signin' | 'signup' | 'reset-request' | 'reset-confirm'
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRole, setAuthRole] = useState("");
  const [page, setPage] = useState("home"); // 'home' | 'auth' — only relevant when signed out
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingScroll, setPendingScroll] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Password recovery: tokens arrive in the URL hash after the person clicks
  // the emailed reset link and gets redirected back here.
  const [recoveryAccessToken, setRecoveryAccessToken] = useState(null);
  const [recoveryRefreshToken, setRecoveryRefreshToken] = useState(null);
  const [recoveryExpiresIn, setRecoveryExpiresIn] = useState(3600);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  // MFA step-up state. `pendingSession` holds an aal1 session obtained from
  // primary sign-in/sign-up while a second factor is being resolved — it is
  // never treated as the "real" session (never fed to authedRequest/history
  // loading) until MFA is satisfied or explicitly skipped.
  const [mfaStage, setMfaStage] = useState(null); // null | 'offer' | 'setup' | 'challenge'
  const [pendingSession, setPendingSession] = useState(null);
  const [mfaFactorId, setMfaFactorId] = useState(null);
  const [mfaChallengeId, setMfaChallengeId] = useState(null);
  const [mfaQrSvg, setMfaQrSvg] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  const [view, setView] = useState("checkin");
  const [step, setStep] = useState(-1);
  const [values, setValues] = useState({});
  const [incidentLabel, setIncidentLabel] = useState(null);
  const [incidentFlag, setIncidentFlag] = useState(false);
  const [clock, setClock] = useState(new Date());

  const [history, setHistory] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lockNow, setLockNow] = useState(Date.now());

  const [activeInterventionId, setActiveInterventionId] = useState(null);
  const [interventionStepIndex, setInterventionStepIndex] = useState(0);
  const [breathingCycles, setBreathingCycles] = useState(0);
  const [completionCounts, setCompletionCounts] = useState({});
  const [openDomains, setOpenDomains] = useState({ CBT: true, DBT: false, ACT: false });

  // sessionRef mirrors `session` for use inside async callbacks, which would
  // otherwise close over a stale value. authEpochRef increments on every
  // sign-in and sign-out; any in-flight refresh checks its captured epoch
  // before applying its result, so a refresh started before logout (or before
  // a *different* login) can never resurrect/overwrite the wrong session.
  const sessionRef = useRef(null);
  const authEpochRef = useRef(0);
  const refreshingRef = useRef(null);

  useEffect(() => {
    sessionRef.current = session;
    saveStoredSession(session);
  }, [session]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setLockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const at = params.get("access_token");
      const rt = params.get("refresh_token");
      const ei = params.get("expires_in");
      if (at) {
        setRecoveryAccessToken(at);
        setRecoveryRefreshToken(rt);
        if (ei) setRecoveryExpiresIn(parseInt(ei, 10) || 3600);
        setAuthMode("reset-confirm");
        setPage("auth");
      }
      // Scrub the token out of the visible URL/history — it's single-purpose
      // and shouldn't linger in the address bar or browser history.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  function buildSession(data) {
    const expiresInMs = (data.expires_in || 3600) * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + expiresInMs,
      userId: data.user.id,
      email: data.user.email,
    };
  }

  // Single-flight refresh: concurrent callers (the proactive timer and any
  // 401-triggered retry) share the same in-flight promise instead of firing
  // duplicate refresh requests, which would race to rotate the refresh token
  // and could invalidate each other.
  async function refreshSession() {
    if (refreshingRef.current) return refreshingRef.current;
    const epochAtStart = authEpochRef.current;
    const current = sessionRef.current;
    if (!current) throw new Error("Not authenticated");

    refreshingRef.current = (async () => {
      try {
        const data = await refreshSessionRequest(current.refreshToken);
        const next = buildSession(data);
        // Only apply this result if nothing logged out/in again while it was in flight.
        if (authEpochRef.current === epochAtStart) {
          setSession(next);
          sessionRef.current = next;
        }
        return next;
      } catch (e) {
        if (authEpochRef.current === epochAtStart) {
          setSession(null);
          sessionRef.current = null;
          setAuthError("Your session expired. Please sign in again.");
          setPage("auth");
          setAuthMode("signin");
        }
        throw e;
      } finally {
        refreshingRef.current = null;
      }
    })();

    return refreshingRef.current;
  }

  // Wraps a data call: uses the current token, and on a 401 (which can still
  // happen even with proactive refresh — e.g. a backgrounded mobile tab
  // throttling timers) refreshes exactly once and retries exactly once.
  async function authedRequest(fn) {
    const current = sessionRef.current;
    if (!current) throw new Error("Not authenticated");
    try {
      return await fn(current.accessToken);
    } catch (e) {
      if (e.status === 401) {
        const refreshed = await refreshSession();
        return await fn(refreshed.accessToken);
      }
      throw e;
    }
  }

  // Proactively refresh shortly before expiry so a normal, foregrounded
  // session never has to hit the 401-retry path at all.
  useEffect(() => {
    if (!session) return;
    const msUntilRefresh = Math.max(session.expiresAt - Date.now() - 60000, 5000);
    const t = setTimeout(() => {
      refreshSession().catch(() => {
        /* refreshSession already clears state and surfaces an error on failure */
      });
    }, msUntilRefresh);
    return () => clearTimeout(t);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoadingHistory(true);
      try {
        const from = new Date();
        from.setDate(from.getDate() - 13);
        const rows = await authedRequest((token) => fetchCheckIns(token, dateKey(from)));
        const h = {};
        rows.forEach((r) => {
          h[r.check_date] = {
            date: r.check_date,
            pct: r.readiness_index,
            sleep: r.sleep_score,
            stress: r.stress_score,
            recovery: r.recovery_score,
            incidentFlag: r.incident_flag,
            createdAt: r.created_at,
          };
        });
        setHistory(h);
      } catch (e) {
        setSaveError("Could not load your check-in history.");
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const rows = await authedRequest((token) => fetchInterventionCompletions(token));
        const counts = {};
        rows.forEach((r) => {
          counts[r.intervention_id] = (counts[r.intervention_id] || 0) + 1;
        });
        setCompletionCounts(counts);
      } catch (e) {
        /* non-critical, fail silently */
      }
    })();
  }, [session]);

  function finalizeSession(sessionObj) {
    authEpochRef.current += 1;
    sessionRef.current = sessionObj;
    setSession(sessionObj);
    setMfaStage(null);
    setPendingSession(null);
    setMfaFactorId(null);
    setMfaChallengeId(null);
    setMfaQrSvg("");
    setMfaSecret("");
    setMfaCode("");
    setMfaError("");
    setMfaLoading(false);
  }

  async function handlePostPrimaryAuth(data) {
    const pending = buildSession(data); // aal1 — not yet the "real" session
    let factors = [];
    try {
      factors = await fetchUserFactors(pending.accessToken);
    } catch (e) {
      // Fail open on a transient factor-check error rather than locking the
      // person out of an app they just correctly authenticated into.
      finalizeSession(pending);
      return;
    }
    const verifiedTotp = factors.find((f) => f.factor_type === "totp" && f.status === "verified");

    if (verifiedTotp) {
      setPendingSession(pending);
      setMfaFactorId(verifiedTotp.id);
      setMfaStage("challenge");
      try {
        const challenge = await createMfaChallenge(pending.accessToken, verifiedTotp.id);
        setMfaChallengeId(challenge.id);
      } catch (e) {
        setMfaError("Could not start verification. Try again.");
      }
      return;
    }

    // No factor enrolled yet — offer setup, but it's skippable so nobody gets
    // permanently locked out of the app by this rollout.
    setPendingSession(pending);
    setMfaStage("offer");
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const data = await signUpRequest(authEmail, authPassword, authRole);
        if (data.access_token && data.user) {
          await handlePostPrimaryAuth(data);
        } else {
          setAuthNotice("Account created. Check your email to confirm it, then sign in.");
          setAuthMode("signin");
        }
      } else {
        const data = await signInRequest(authEmail, authPassword);
        await handlePostPrimaryAuth(data);
      }
    } catch (err) {
      setAuthError(mapAuthError(err.raw || err.message, authMode === "signin" ? "signin" : "signup"));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRequestReset(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    try {
      await requestPasswordReset(authEmail);
    } catch (e2) {
      /* Intentionally show the same message on failure — not confirming or
         denying whether the email has an account (matches Supabase's own
         anti-enumeration behavior on this endpoint). */
    } finally {
      setAuthNotice("If that email has an account, a reset link is on its way. Check your inbox.");
      setAuthLoading(false);
    }
  }

  async function handleConfirmReset(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    if (newPassword.length < 12) {
      setAuthError("Password must be at least 12 characters.");
      setAuthLoading(false);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setAuthError("Passwords don't match.");
      setAuthLoading(false);
      return;
    }
    try {
      const updatedUser = await updatePasswordWithRecoveryToken(recoveryAccessToken, newPassword);
      const sessionData = {
        access_token: recoveryAccessToken,
        refresh_token: recoveryRefreshToken,
        expires_in: recoveryExpiresIn,
        user: updatedUser,
      };
      setNewPassword("");
      setNewPasswordConfirm("");
      setRecoveryAccessToken(null);
      setRecoveryRefreshToken(null);
      await handlePostPrimaryAuth(sessionData);
    } catch (err) {
      setAuthError(
        "That reset link has expired or was already used. Request a new one."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  function cancelMfa() {
    if (pendingSession) {
      logoutRequest(pendingSession.accessToken);
      if (mfaStage === "setup" && mfaFactorId) {
        unenrollFactor(pendingSession.accessToken, mfaFactorId);
      }
    }
    setMfaStage(null);
    setPendingSession(null);
    setMfaFactorId(null);
    setMfaChallengeId(null);
    setMfaQrSvg("");
    setMfaSecret("");
    setMfaCode("");
    setMfaError("");
  }

  function skipMfaSetup() {
    if (pendingSession) finalizeSession(pendingSession);
  }

  async function startMfaSetup() {
    setMfaError("");
    setMfaLoading(true);
    try {
      const enrolled = await enrollTotpFactor(pendingSession.accessToken);
      setMfaFactorId(enrolled.id);
      setMfaQrSvg((enrolled.totp && enrolled.totp.qr_code) || "");
      setMfaSecret((enrolled.totp && enrolled.totp.secret) || "");
      setMfaStage("setup");
    } catch (e) {
      setMfaError(e.message || "Could not start two-factor setup.");
    } finally {
      setMfaLoading(false);
    }
  }

  async function submitMfaSetupCode() {
    setMfaError("");
    setMfaLoading(true);
    try {
      const challenge = await createMfaChallenge(pendingSession.accessToken, mfaFactorId);
      const verified = await verifyMfaChallenge(pendingSession.accessToken, mfaFactorId, challenge.id, mfaCode);
      finalizeSession(buildSession(verified));
    } catch (e) {
      setMfaError(e.message || "That code didn't match. Try again.");
      setMfaLoading(false);
    }
  }

  async function submitMfaChallengeCode() {
    setMfaError("");
    setMfaLoading(true);
    try {
      let challengeId = mfaChallengeId;
      if (!challengeId) {
        const challenge = await createMfaChallenge(pendingSession.accessToken, mfaFactorId);
        challengeId = challenge.id;
        setMfaChallengeId(challengeId);
      }
      const verified = await verifyMfaChallenge(pendingSession.accessToken, mfaFactorId, challengeId, mfaCode);
      finalizeSession(buildSession(verified));
    } catch (e) {
      setMfaError(e.message || "That code didn't match. Try again.");
      setMfaCode("");
      setMfaLoading(false);
    }
  }

  async function signOut() {
    const accessToken = session && session.accessToken;
    // Bump the epoch first: any refresh already in flight will see this new
    // epoch when it resolves and discard its own result instead of reviving
    // a session that's about to be cleared.
    authEpochRef.current += 1;
    // Clear local state next so the UI responds instantly regardless of
    // whether the network call below succeeds — per the "clear state even if
    // logout fails" requirement.
    sessionRef.current = null;
    setSession(null);
    setHistory({});
    setView("checkin");
    setPage("home");
    resetToIntro();
    setAuthMode("signin");
    setAuthEmail("");
    setAuthPassword("");
    setAuthNotice("");
    setAuthError("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setRecoveryAccessToken(null);
    setRecoveryRefreshToken(null);
    setCompletionCounts({});
    closeIntervention();
    setMfaStage(null);
    setPendingSession(null);
    setMfaFactorId(null);
    setMfaChallengeId(null);
    setMfaQrSvg("");
    setMfaSecret("");
    setMfaCode("");
    setMfaError("");
    if (accessToken) {
      logoutRequest(accessToken);
    }
  }

  const NAV_ITEMS = [
    { id: "overview", label: "Overview" },
    { id: "why-it-matters", label: "Why It Matters" },
    { id: "how-it-works", label: "How It Works" },
    { id: "privacy-security", label: "Privacy & Security" },
    { id: "who-its-for", label: "Who It's For" },
    { id: "signin", label: "Sign In" },
  ];

  function handleNavClick(id) {
    if (id === "signin") {
      setPage("auth");
    } else {
      setPage("home");
      setPendingScroll(id);
    }
    setMenuOpen(false);
  }

  useEffect(() => {
    if (page === "home" && pendingScroll) {
      const el = document.getElementById(pendingScroll);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScroll(null);
    }
  }, [page, pendingScroll]);

  const totalSteps = ALL_STEPS.length;
  const isQuestion = view === "checkin" && step >= 0 && step < totalSteps;
  const isResult = view === "checkin" && step === totalSteps;

  const pct = useMemo(() => {
    if (!isResult) return 0;
    const composite =
      (values.sleep ?? 0) * WEIGHTS.sleep +
      (values.stress ?? 0) * WEIGHTS.stress +
      (values.recovery ?? 0) * WEIGHTS.recovery;
    return Math.round(composite);
  }, [values, isResult]);

  const condition = isResult ? getCondition(pct) : null;

  function selectOption(question, opt) {
    if (question.key === "incident") {
      setIncidentLabel(opt.label);
      setIncidentFlag(!!opt.flag);
    } else {
      setValues((prev) => ({ ...prev, [question.key]: opt.value }));
    }
    setTimeout(() => setStep((s) => s + 1), 220);
  }

  function resetToIntro() {
    setValues({});
    setIncidentLabel(null);
    setIncidentFlag(false);
    setStep(-1);
  }

  async function finishCheckIn() {
    setSaveError("");
    try {
      const saved = await authedRequest((token) =>
        submitCheckIn(token, {
          sleepScore: values.sleep ?? 0,
          stressScore: values.stress ?? 0,
          recoveryScore: values.recovery ?? 0,
          incidentLabel: incidentLabel ?? "None",
        })
      );
      // Trust only what the server computed and returned — not the client-side
      // preview values used to render the result screen a moment ago.
      const key = saved.check_date;
      setHistory((prev) => ({
        ...prev,
        [key]: {
          date: key,
          pct: saved.readiness_index,
          sleep: saved.sleep_score,
          stress: saved.stress_score,
          recovery: saved.recovery_score,
          incidentFlag: saved.incident_flag,
          createdAt: saved.created_at,
        },
      }));
      resetToIntro();
      setView("trends");
    } catch (e) {
      setSaveError(e.message || "Could not save your check-in. Please try again.");
    }
  }

  function toggleDomain(domainId) {
    setOpenDomains((prev) => ({ ...prev, [domainId]: !prev[domainId] }));
  }

  function openIntervention(id) {
    setActiveInterventionId(id);
    setInterventionStepIndex(0);
    setBreathingCycles(0);
  }

  function closeIntervention() {
    setActiveInterventionId(null);
    setInterventionStepIndex(0);
    setBreathingCycles(0);
  }

  function advanceIntervention(totalSteps) {
    if (interventionStepIndex + 1 >= totalSteps) {
      completeIntervention();
      closeIntervention();
    } else {
      setInterventionStepIndex((i) => i + 1);
    }
  }

  async function completeIntervention() {
    const id = activeInterventionId;
    setCompletionCounts((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    if (session) {
      try {
        await authedRequest((token) => logInterventionCompletion(token, id));
      } catch (e) {
        /* non-critical, completion still shown locally */
      }
    }
  }

  const dateStr = clock.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const timeStr = clock.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const currentQ = isQuestion ? ALL_STEPS[step] : null;

  const last7 = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      days.push({ key, entry: history[key] || null });
    }
    return days;
  }, [history]);

  const last14 = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      days.push({ key, entry: history[key] || null });
    }
    return days;
  }, [history]);

  const chartData = useMemo(
    () => last14.map((d) => ({ label: shortLabel(d.key), pct: d.entry ? d.entry.pct : null })),
    [last14]
  );

  const streak = useMemo(() => {
    let count = 0;
    const cursor = new Date();
    if (!history[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (history[dateKey(cursor)]) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [history]);

  const present14 = last14.filter((d) => d.entry);

  const dist = present14.reduce(
    (acc, d) => {
      const dbValue = getCondition(d.entry.pct).dbValue;
      if (dbValue === "green") acc.green++;
      else if (dbValue === "amber") acc.amber++;
      else acc.red++;
      return acc;
    },
    { green: 0, amber: 0, red: 0 }
  );

  const avg = present14.length
    ? {
        sleep: Math.round(present14.reduce((s, d) => s + d.entry.sleep, 0) / present14.length),
        stress: Math.round(present14.reduce((s, d) => s + d.entry.stress, 0) / present14.length),
        recovery: Math.round(present14.reduce((s, d) => s + d.entry.recovery, 0) / present14.length),
      }
    : { sleep: 0, stress: 0, recovery: 0 };

  const incidentCount14 = present14.filter((d) => d.entry.incidentFlag).length;

  const lastCheckIn = useMemo(() => {
    const entries = Object.values(history).filter((e) => e.createdAt);
    if (!entries.length) return null;
    return entries.reduce((latest, e) =>
      new Date(e.createdAt).getTime() > new Date(latest.createdAt).getTime() ? e : latest
    );
  }, [history]);

  const unlockAt = lastCheckIn ? new Date(lastCheckIn.createdAt).getTime() + LOCK_MS : null;
  const lockRemainingMs = unlockAt ? unlockAt - lockNow : 0;
  const isCheckInLocked = !!unlockAt && lockRemainingMs > 0;
  const lockProgress = unlockAt ? 1 - lockRemainingMs / LOCK_MS : 1;
  const lockColor = lockProgressColor(lockProgress);
  const lastCondition = lastCheckIn ? getCondition(lastCheckIn.pct) : null;

  return (
    <div className="cs-root">
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { overflow-x: hidden; margin: 0; padding: 0; background: #0A0D12; }
        #root { min-height: 100vh; background: #0A0D12; }
        .cs-root {
          --bg: #0A0D12;
          --panel: #12161D;
          --panel-border: #232B35;
          --text-primary: #EDEFF2;
          --text-muted: #7E8896;
          --sig-green: #3FB871;
          --sig-yellow: #E8B93F;
          --sig-amber: #E8833F;
          --sig-red: #D6484A;
          min-height: 100vh;
          width: 100%;
          background: var(--bg);
          background-image: radial-gradient(circle at 50% 0%, rgba(232,179,63,0.05), transparent 55%);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          justify-content: center;
          padding: max(32px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
        }
        .cs-shell { width: 100%; max-width: 420px; display: flex; flex-direction: column; min-height: 640px; transition: max-width 200ms ease; }
        @media (min-width: 640px) {
          .cs-shell { max-width: 480px; }
          .cs-h1 { font-size: 31.5px; }
          .cs-card { padding: 34px 30px; }
        }
        @media (min-width: 768px) {
          .cs-shell { max-width: 500px; }
          .cs-shell-home { max-width: 640px; }
        }
        @media (min-width: 1024px) {
          .cs-root { align-items: center; }
          .cs-shell { max-width: 520px; }
          .cs-shell-home { max-width: 760px; }
          .cs-card { padding: 40px 36px; }
          .cs-pct { font-size: 45px; }
        }
        @media (min-width: 1280px) {
          .cs-shell-home { max-width: 860px; }
        }
        .cs-topbar { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 18px; border-bottom: 1px solid var(--panel-border); margin-bottom: 20px; }
        .cs-wordmark { font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; font-weight: 600; font-size: 17px; letter-spacing: 0.14em; color: var(--text-primary); }
        .cs-wordmark span { color: var(--sig-amber); }
        .cs-clock { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; color: var(--text-muted); letter-spacing: 0.03em; text-align: right; }
        .cs-signout {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13.5px;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          background: #171C24;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          cursor: pointer;
          padding: 7px 12px;
          margin-top: 8px;
        }
        .cs-signout:hover { color: var(--text-primary); border-color: var(--text-muted); }
        .cs-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
        .cs-tab { flex: 1; text-align: center; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; letter-spacing: 0.1em; border: 1px solid var(--panel-border); border-radius: 3px; background: transparent; color: var(--text-muted); cursor: pointer; }
        .cs-tab.active { border-color: var(--sig-amber); color: var(--text-primary); background: #171C24; }
        .cs-progress { display: flex; gap: 6px; margin-bottom: 28px; }
        .cs-seg { flex: 1; height: 4px; border-radius: 2px; background: var(--panel-border); overflow: hidden; }
        .cs-seg-fill { height: 100%; width: 0%; background: var(--sig-amber); transition: width 300ms ease; }
        .cs-seg-fill.filled { width: 100%; }
        .cs-body { flex: 1; display: flex; flex-direction: column; }
        .cs-card { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 4px; padding: 28px 24px; flex: 1; display: flex; flex-direction: column; }
        .cs-card-compact { flex: 0 0 auto; }
        .cs-card-compact .cs-begin-btn { margin-top: 10px; }
        .cs-eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; letter-spacing: 0.18em; color: var(--sig-amber); margin-bottom: 14px; }
        .cs-h1 { font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; font-weight: 500; font-size: 29px; line-height: 1.25; margin: 0 0 8px 0; color: var(--text-primary); }
        .cs-sub { color: var(--text-muted); font-size: 15.5px; line-height: 1.5; margin: 0 0 28px 0; }
        .cs-options { display: flex; flex-direction: column; gap: 10px; }
        .cs-opt { text-align: left; background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 16px 18px; color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: border-color 150ms, background 150ms, transform 100ms; }
        .cs-opt:hover { border-color: var(--sig-amber); background: #1C222C; }
        .cs-opt:active { transform: scale(0.99); }
        .cs-opt-label { font-size: 17px; font-weight: 600; }
        .cs-opt-sub { font-size: 14px; color: var(--text-muted); }
        .cs-begin-btn { margin-top: auto; background: var(--sig-amber); color: #14100A; border: none; border-radius: 3px; padding: 16px; font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; font-weight: 600; font-size: 15.5px; letter-spacing: 0.08em; cursor: pointer; }
        .cs-begin-btn:hover { filter: brightness(1.05); }
        .cs-begin-btn:disabled { opacity: 0.6; cursor: default; }
        .cs-secondary-btn { margin-top: 12px; background: transparent; color: var(--text-muted); border: 1px solid var(--panel-border); border-radius: 3px; padding: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14.5px; cursor: pointer; }
        .cs-secondary-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
        .gauge-wrap { display: flex; justify-content: center; margin: 6px 0 4px 0; }
        .gauge-svg { width: 100%; max-width: 280px; }
        .cs-readout { text-align: center; margin-top: -46px; margin-bottom: 18px; }
        .cs-pct { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 38px; font-weight: 600; line-height: 1; }
        .cs-pct-label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--text-muted); letter-spacing: 0.14em; margin-top: 4px; }
        .cs-condition-badge { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13.5px; letter-spacing: 0.12em; padding: 6px 12px; border-radius: 2px; display: inline-block; margin-bottom: 16px; border: 1px solid currentColor; }
        .cs-incident-banner { display: flex; align-items: center; gap: 10px; background: rgba(214, 72, 74, 0.1); border: 1px solid var(--sig-red); border-radius: 3px; padding: 12px 14px; margin-bottom: 20px; }
        .cs-incident-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sig-red); flex-shrink: 0; }
        .cs-incident-text { font-size: 14px; line-height: 1.4; }
        .cs-incident-text b { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; letter-spacing: 0.08em; color: var(--sig-red); margin-bottom: 2px; }
        .cs-breakdown { display: flex; flex-direction: column; gap: 8px; margin: 18px 0; padding-top: 18px; border-top: 1px solid var(--panel-border); }
        .cs-breakdown-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .cs-breakdown-row b { color: var(--text-primary); font-weight: 500; }
        .cs-footer-note { font-size: 12.5px; color: var(--text-muted); text-align: center; margin-top: 18px; line-height: 1.5; }
        .cs-streak-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
        .cs-streak-num { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 31.5px; font-weight: 600; color: var(--sig-amber); line-height: 1; }
        .cs-streak-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.1em; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin-top: 4px; }
        .cs-day-chips { display: flex; gap: 6px; }
        .cs-day-chip { width: 24px; height: 24px; border-radius: 3px; border: 1px solid var(--panel-border); }
        .cs-chart-wrap { height: 170px; margin: 4px -6px 22px -6px; }
        .cs-trend-pulse-ring {
          transform-box: fill-box;
          transform-origin: center;
          opacity: 0.55;
          animation: cs-trend-pulse 2.2s ease-out infinite;
        }
        @keyframes cs-trend-pulse {
          0% { transform: scale(1); opacity: 0.55; }
          70% { transform: scale(3.2); opacity: 0; }
          100% { transform: scale(3.2); opacity: 0; }
        }
        .cs-condition-dist { display: flex; gap: 8px; margin-bottom: 16px; }
        .cs-dist-chip { flex: 1; text-align: center; padding: 10px 4px; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; letter-spacing: 0.04em; border: 1px solid currentColor; }
        .cs-stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .cs-stat-card { background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 12px 6px; text-align: center; }
        .cs-stat-value { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 20px; font-weight: 600; }
        .cs-stat-label { font-size: 10.5px; color: var(--text-muted); letter-spacing: 0.06em; margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .cs-lock-badge {
          position: absolute;
          top: 18px;
          right: 18px;
          display: flex;
          align-items: center;
          gap: 7px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13.5px;
          padding: 6px 11px;
          border-radius: 20px;
          border: 1px solid currentColor;
          background: #171C24;
          transition: color 1s linear, border-color 1s linear;
        }
        .cs-lock-dot { width: 8px; height: 8px; border-radius: 50%; transition: background 1s linear; }

        .cs-breathe-wrap { display: flex; flex-direction: column; align-items: center; margin: 28px 0; }
        .cs-breathe-circle {
          width: 140px;
          height: 140px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,131,63,0.35), rgba(232,131,63,0.08));
          border: 2px solid var(--sig-amber);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 14px;
          letter-spacing: 0.1em;
          color: var(--text-primary);
          transition-property: transform;
          transition-timing-function: ease-in-out;
        }
        .cs-breathe-cycles { margin-top: 18px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; color: var(--text-muted); letter-spacing: 0.06em; }

        .cs-domain-group {
          margin-top: 14px;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          overflow: hidden;
        }
        .cs-domain-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #171C24;
          border: none;
          padding: 14px 16px;
          cursor: pointer;
          text-align: left;
        }
        .cs-domain-header:hover { background: #1C222C; }
        .cs-domain-label {
          font-family: 'Oswald', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-weight: 600;
          font-size: 15.5px;
          letter-spacing: 0.06em;
          color: var(--text-primary);
        }
        .cs-domain-full {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .cs-domain-caret {
          color: var(--sig-amber);
          font-size: 14px;
          transition: transform 200ms ease;
          transform: rotate(-90deg);
          flex-shrink: 0;
        }
        .cs-domain-caret.open { transform: rotate(0deg); }
        .cs-domain-body { padding: 14px; background: var(--panel); }
        .cs-domain-body .cs-intervention-card:last-child { margin-bottom: 0; }
        .cs-intervention-card {
          width: 100%;
          text-align: left;
          background: #171C24;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          padding: 14px 16px;
          margin-bottom: 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cs-intervention-card:hover { border-color: var(--sig-amber); }
        .cs-intervention-card-top { display: flex; justify-content: space-between; align-items: baseline; }
        .cs-intervention-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight: 600; font-size: 15.5px; color: var(--text-primary); }
        .cs-intervention-duration { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--text-muted); }
        .cs-intervention-blurb { font-size: 13.5px; color: var(--text-muted); line-height: 1.4; }
        .cs-intervention-modality { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--sig-amber); letter-spacing: 0.04em; margin-top: 2px; }

        .cs-intervention-step-text {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 17px;
          line-height: 1.6;
          color: var(--text-primary);
          margin: 0 0 28px 0;
        }

        .cs-suggestion-box {
          background: #171C24;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          padding: 14px 16px;
          margin-bottom: 20px;
        }
        .cs-suggestion-label {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          color: var(--sig-amber);
          margin-bottom: 10px;
        }
        .cs-suggestion-item {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: transparent;
          border: none;
          border-top: 1px solid var(--panel-border);
          padding: 10px 0;
          cursor: pointer;
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 14.5px;
          font-weight: 600;
        }
        .cs-suggestion-item:first-of-type { border-top: none; }
        .cs-suggestion-duration { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--text-muted); font-weight: 400; }
        .cs-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .cs-field label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; letter-spacing: 0.08em; color: var(--text-muted); }
        .cs-field-hint { font-size: 11.5px; color: var(--text-muted); margin-top: 4px; }
        .cs-mfa-qr {
          background: #FFFFFF;
          border-radius: 4px;
          padding: 16px;
          display: flex;
          justify-content: center;
          margin: 8px 0 16px 0;
        }
        .cs-mfa-qr img { width: 100%; max-width: 200px; height: auto; display: block; }
        .cs-mfa-secret {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12.5px;
          color: var(--text-muted);
          text-align: center;
          line-height: 1.6;
          margin-bottom: 20px;
          word-break: break-all;
        }
        .cs-mfa-secret b { color: var(--text-primary); letter-spacing: 0.04em; }
        .cs-field input, .cs-field select { background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 12px 14px; color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15.5px; }
        .cs-field input:focus, .cs-field select:focus { outline: none; border-color: var(--sig-amber); }
        .cs-full-width { width: 100%; }

        .cs-hamburger {
          width: 34px;
          height: 34px;
          background: #171C24;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          cursor: pointer;
        }
        .cs-hamburger span { width: 16px; height: 2px; background: var(--text-primary); border-radius: 1px; }

        .cs-nav-menu {
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: var(--panel);
          border: 1px solid var(--panel-border);
          border-radius: 4px;
          padding: 10px;
          margin-bottom: 20px;
        }
        .cs-nav-item {
          text-align: left;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13px;
          letter-spacing: 0.04em;
          padding: 12px 10px;
          border-radius: 3px;
          cursor: pointer;
        }
        .cs-nav-item:hover { background: #1C222C; color: var(--sig-amber); }

        .cs-home { display: flex; flex-direction: column; gap: 0; }
        .cs-home-section {
          padding: 30px 0;
          border-bottom: 1px solid var(--panel-border);
        }
        .cs-home-section:last-child { border-bottom: none; }
        .cs-home-hero { padding-top: 8px; }
        .cs-home-h1 {
          font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 500;
          font-size: 32px;
          line-height: 1.2;
          margin: 0 0 16px 0;
          color: var(--text-primary);
        }
        .cs-home-h2 {
          font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 500;
          font-size: 22px;
          line-height: 1.3;
          margin: 0 0 14px 0;
          color: var(--text-primary);
        }
        .cs-home-p {
          color: var(--text-muted);
          font-size: 15.5px;
          line-height: 1.65;
          margin: 0;
          max-width: 640px;
        }
        .cs-home-closing { text-align: center; }
        .cs-home-closing .cs-home-h2 { font-size: 20px; margin-bottom: 20px; }
        .cs-home-cta { display: flex; flex-direction: column; gap: 12px; margin-top: 32px; }
        .cs-cta-primary {
          background: var(--sig-amber);
          color: #14100A;
          border: none;
          border-radius: 3px;
          padding: 16px;
          font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 600;
          font-size: 15.5px;
          letter-spacing: 0.08em;
          cursor: pointer;
        }
        .cs-cta-primary:hover { filter: brightness(1.05); }
        .cs-cta-secondary {
          background: transparent;
          color: var(--text-primary);
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          padding: 16px;
          font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 600;
          font-size: 15.5px;
          letter-spacing: 0.08em;
          cursor: pointer;
        }
        .cs-cta-secondary:hover { border-color: var(--sig-amber); color: var(--sig-amber); }
        @media (min-width: 640px) {
          .cs-home-h1 { font-size: 38px; }
          .cs-home-h2 { font-size: 25px; }
        }
        @media (min-width: 768px) {
          .cs-home-section { padding: 40px 0; }
          .cs-home-p { font-size: 16.5px; }
          .cs-home-hero { text-align: left; max-width: 640px; margin-left: auto; margin-right: auto; }
        }
        @media (min-width: 1024px) {
          .cs-home-h1 { font-size: 44px; }
          .cs-home-h2 { font-size: 27px; }
          .cs-home-section { padding: 48px 0; }
        }
        .cs-auth-error { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: var(--sig-red); margin-bottom: 14px; line-height: 1.5; }
        .cs-auth-notice { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: var(--sig-green); margin-bottom: 14px; line-height: 1.5; }
        .cs-auth-toggle { text-align: center; margin-top: 14px; font-size: 14px; color: var(--text-muted); }
        .cs-auth-toggle button { background: none; border: none; color: var(--sig-amber); cursor: pointer; font-size: 14px; text-decoration: underline; padding: 0; }
      `}</style>

      <div className={`cs-shell ${!session && page === "home" ? "cs-shell-home" : ""}`}>
        <div className="cs-topbar">
          <div
            className="cs-wordmark"
            style={{ cursor: !session ? "pointer" : "default" }}
            onClick={() => {
              if (!session) setPage("home");
            }}
          >
            CLERAS <span>SHIELD</span>
          </div>
          {session ? (
            <div style={{ textAlign: "right" }}>
              <div className="cs-clock">
                {dateStr}
                <br />
                {timeStr}
              </div>
              <button className="cs-signout" onClick={signOut}>
                SIGN OUT
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="cs-clock">
                {dateStr}
                <br />
                {timeStr}
              </div>
              <button
                className="cs-hamburger"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Menu"
              >
                <span />
                <span />
                <span />
              </button>
            </div>
          )}
        </div>

        {!session && menuOpen && (
          <div className="cs-nav-menu">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} className="cs-nav-item" onClick={() => handleNavClick(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        )}

        {!session && page === "home" && (
          <Homepage
            onGetStarted={() => {
              setAuthMode("signup");
              setPage("auth");
            }}
            onSignIn={() => {
              setAuthMode("signin");
              setPage("auth");
            }}
          />
        )}

        {!session && page === "auth" && (
          <div className="cs-body">
            {!mfaStage && (authMode === "signin" || authMode === "signup") && (
              <div className="cs-card">
                <h1 className="cs-h1">
                  {authMode === "signin" ? "Welcome back." : "Set up your account."}
                </h1>
                <p className="cs-sub">
                  Your responses are protected with industry standard security, ensuring that
                  only you have access to your personal check-in history.
                </p>

                {authError && <div className="cs-auth-error">{authError}</div>}
                {authNotice && <div className="cs-auth-notice">{authNotice}</div>}

                <form onSubmit={handleAuthSubmit}>
                  <div className="cs-field">
                    <label>EMAIL</label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="cs-field">
                    <label>PASSWORD</label>
                    <input
                      type="password"
                      required
                      minLength={12}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                    />
                    {authMode === "signup" && (
                      <div className="cs-field-hint">At least 12 characters.</div>
                    )}
                  </div>
                  {authMode === "signup" && (
                    <div className="cs-field">
                      <label>ROLE</label>
                      <select value={authRole} onChange={(e) => setAuthRole(e.target.value)} required>
                        <option value="" disabled>
                          Choose your Role
                        </option>
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button className="cs-begin-btn cs-full-width" type="submit" disabled={authLoading}>
                    {authLoading ? "WORKING…" : authMode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
                  </button>
                </form>

                {authMode === "signin" && (
                  <div className="cs-auth-toggle">
                    <button
                      onClick={() => {
                        setAuthMode("reset-request");
                        setAuthError("");
                        setAuthNotice("");
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <div className="cs-auth-toggle">
                  {authMode === "signin" ? (
                    <>
                      Need an account?{" "}
                      <button onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthNotice(""); }}>
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have one?{" "}
                      <button onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthNotice(""); }}>
                        Sign in
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {!mfaStage && authMode === "reset-request" && (
              <div className="cs-card">
                <h1 className="cs-h1">Reset your password.</h1>
                <p className="cs-sub">
                  Enter the email on your account and we'll send you a link to set a new
                  password.
                </p>

                {authError && <div className="cs-auth-error">{authError}</div>}
                {authNotice && <div className="cs-auth-notice">{authNotice}</div>}

                <form onSubmit={handleRequestReset}>
                  <div className="cs-field">
                    <label>EMAIL</label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <button className="cs-begin-btn cs-full-width" type="submit" disabled={authLoading}>
                    {authLoading ? "SENDING…" : "SEND RESET LINK"}
                  </button>
                </form>

                <div className="cs-auth-toggle">
                  <button
                    onClick={() => {
                      setAuthMode("signin");
                      setAuthError("");
                      setAuthNotice("");
                    }}
                  >
                    Back to sign in
                  </button>
                </div>
              </div>
            )}

            {!mfaStage && authMode === "reset-confirm" && (
              <div className="cs-card">
                <h1 className="cs-h1">Set a new password.</h1>
                <p className="cs-sub">Choose a new password for your account.</p>

                {authError && <div className="cs-auth-error">{authError}</div>}

                <form onSubmit={handleConfirmReset}>
                  <div className="cs-field">
                    <label>NEW PASSWORD</label>
                    <input
                      type="password"
                      required
                      minLength={12}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <div className="cs-field-hint">At least 12 characters.</div>
                  </div>
                  <div className="cs-field">
                    <label>CONFIRM NEW PASSWORD</label>
                    <input
                      type="password"
                      required
                      minLength={12}
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <button className="cs-begin-btn cs-full-width" type="submit" disabled={authLoading}>
                    {authLoading ? "WORKING…" : "SET NEW PASSWORD"}
                  </button>
                </form>
              </div>
            )}

            {mfaStage === "offer" && (
              <div className="cs-card">
                <div className="cs-eyebrow">TWO-FACTOR AUTHENTICATION</div>
                <h1 className="cs-h1">Add an extra layer of security?</h1>
                <p className="cs-sub">
                  With two-factor authentication on, signing in also requires a code from an
                  authenticator app on your phone — so a leaked password alone isn't enough
                  to get into your account.
                </p>
                {mfaError && <div className="cs-auth-error">{mfaError}</div>}
                <button className="cs-begin-btn cs-full-width" onClick={startMfaSetup} disabled={mfaLoading}>
                  {mfaLoading ? "WORKING…" : "SET UP NOW"}
                </button>
                <button className="cs-secondary-btn" onClick={skipMfaSetup} disabled={mfaLoading}>
                  Skip for now
                </button>
              </div>
            )}

            {mfaStage === "setup" && (
              <div className="cs-card">
                <div className="cs-eyebrow">TWO-FACTOR AUTHENTICATION</div>
                <h1 className="cs-h1">Scan this with an authenticator app.</h1>
                <p className="cs-sub">
                  Use Google Authenticator, Authy, 1Password, or similar. Then enter the
                  6-digit code it shows below.
                </p>
                {mfaQrSvg && (
                  <div className="cs-mfa-qr">
                    <img src={qrCodeToImageSrc(mfaQrSvg)} alt="Two-factor authentication QR code" />
                  </div>
                )}
                {mfaSecret && (
                  <div className="cs-mfa-secret">
                    Can't scan it? Enter this code manually:
                    <br />
                    <b>{mfaSecret}</b>
                  </div>
                )}
                {mfaError && <div className="cs-auth-error">{mfaError}</div>}
                <div className="cs-field">
                  <label>6-DIGIT CODE</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <button
                  className="cs-begin-btn cs-full-width"
                  onClick={submitMfaSetupCode}
                  disabled={mfaLoading || mfaCode.length !== 6}
                >
                  {mfaLoading ? "VERIFYING…" : "ENABLE"}
                </button>
                <button className="cs-secondary-btn" onClick={cancelMfa} disabled={mfaLoading}>
                  Cancel
                </button>
              </div>
            )}

            {mfaStage === "challenge" && (
              <div className="cs-card">
                <div className="cs-eyebrow">TWO-FACTOR AUTHENTICATION</div>
                <h1 className="cs-h1">Enter your verification code.</h1>
                <p className="cs-sub">
                  Open your authenticator app and enter the 6-digit code for Cleras Shield.
                </p>
                {mfaError && <div className="cs-auth-error">{mfaError}</div>}
                <div className="cs-field">
                  <label>6-DIGIT CODE</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                    autoFocus
                  />
                </div>
                <button
                  className="cs-begin-btn cs-full-width"
                  onClick={submitMfaChallengeCode}
                  disabled={mfaLoading || mfaCode.length !== 6}
                >
                  {mfaLoading ? "VERIFYING…" : "VERIFY"}
                </button>
                <button className="cs-secondary-btn" onClick={cancelMfa} disabled={mfaLoading}>
                  Use a different account
                </button>
              </div>
            )}

            <div className="cs-footer-note">
              Cleras Shield · Operational Readiness Platform · Confidential to you
            </div>
          </div>
        )}

        {session && (
          <>
            {!isQuestion && (
              <div className="cs-tabs">
                <button className={`cs-tab ${view === "checkin" ? "active" : ""}`} onClick={() => setView("checkin")}>
                  CHECK-IN
                </button>
                <button className={`cs-tab ${view === "trends" ? "active" : ""}`} onClick={() => setView("trends")}>
                  TRENDS
                </button>
                <button
                  className={`cs-tab ${view === "interventions" ? "active" : ""}`}
                  onClick={() => {
                    setView("interventions");
                    closeIntervention();
                  }}
                >
                  INTERVENTIONS
                </button>
              </div>
            )}

            {isQuestion && (
              <div className="cs-progress">
                {ALL_STEPS.map((_, i) => (
                  <div className="cs-seg" key={i}>
                    <div className={`cs-seg-fill ${i < step ? "filled" : ""}`} />
                  </div>
                ))}
              </div>
            )}

            <div className="cs-body">
              {saveError && (
                <div className="cs-incident-banner">
                  <div className="cs-incident-dot" />
                  <div className="cs-incident-text">
                    <b>SYNC ERROR</b>
                    {saveError}
                  </div>
                </div>
              )}

              {view === "checkin" && step === -1 && isCheckInLocked && (
                <div className="cs-card cs-card-compact" style={{ position: "relative" }}>
                  <div
                    className="cs-lock-badge"
                    style={{ borderColor: lockColor, color: lockColor }}
                  >
                    <span className="cs-lock-dot" style={{ background: lockColor }} />
                    {formatCountdown(lockRemainingMs)}
                  </div>
                  <div className="cs-eyebrow">CHECK-IN COMPLETE</div>
                  <h1 className="cs-h1">You're set for today.</h1>
                  <p className="cs-sub">
                    Your next check-in unlocks in the countdown above. Head to Trends to see
                    how today compares.
                  </p>
                  {lastCondition && (
                    <div className="cs-condition-badge" style={{ color: lastCondition.color }}>
                      {lastCondition.code} · {lastCheckIn.pct}
                    </div>
                  )}
                </div>
              )}

              {view === "checkin" && step === -1 && !isCheckInLocked && (
                <div className="cs-card cs-card-compact">
                  <div className="cs-eyebrow">DAILY READINESS CHECK-IN</div>
                  <h1 className="cs-h1">Sixty seconds before shift.</h1>
                  <p className="cs-sub">
                    Four quick questions about sleep, stress, critical incidents, and recovery
                    create your personal readiness signal. It's an easy way to recognize when
                    something may be shifting before it affects your health, performance, or
                    relationships. Your individual responses remain private and under your
                    control.
                  </p>
                  <button className="cs-begin-btn" onClick={() => setStep(0)}>
                    BEGIN CHECK-IN
                  </button>
                </div>
              )}

              {isQuestion && currentQ && (
                <div className="cs-card">
                  <div className="cs-eyebrow">{currentQ.label} · {step + 1} OF {totalSteps}</div>
                  <h1 className="cs-h1">{currentQ.prompt}</h1>
                  <div className="cs-options">
                    {currentQ.options.map((opt) => (
                      <button key={opt.label} className="cs-opt" onClick={() => selectOption(currentQ, opt)}>
                        <span className="cs-opt-label">{opt.label}</span>
                        <span className="cs-opt-sub">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isResult && condition && (
                <div className="cs-card">
                  <div className="cs-eyebrow">READINESS SIGNAL</div>

                  {incidentFlag && (
                    <div className="cs-incident-banner">
                      <div className="cs-incident-dot" />
                      <div className="cs-incident-text">
                        <b>RECENT CRITICAL INCIDENT</b>
                        Effects can surface after the score looks fine. Consider a peer
                        support check-in regardless of today's reading.
                      </div>
                    </div>
                  )}

                  <div className="gauge-wrap">
                    <Gauge pct={pct} color={condition.color} />
                  </div>
                  <div className="cs-readout">
                    <div className="cs-pct" style={{ color: condition.color }}>
                      {pct}
                    </div>
                    <div className="cs-pct-label">READINESS INDEX</div>
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <div className="cs-condition-badge" style={{ color: condition.color }}>
                      {condition.code}
                    </div>
                  </div>

                  <h1 className="cs-h1" style={{ textAlign: "center" }}>
                    {condition.headline}
                  </h1>
                  <p className="cs-sub" style={{ textAlign: "center" }}>
                    {condition.note}
                  </p>

                  <div className="cs-breakdown">
                    <div className="cs-breakdown-row">
                      <span>SLEEP</span>
                      <b>{values.sleep ?? 0} / 100</b>
                    </div>
                    <div className="cs-breakdown-row">
                      <span>STRESS</span>
                      <b>{values.stress ?? 0} / 100</b>
                    </div>
                    <div className="cs-breakdown-row">
                      <span>RECOVERY</span>
                      <b>{values.recovery ?? 0} / 100</b>
                    </div>
                    <div className="cs-breakdown-row">
                      <span>INCIDENT</span>
                      <b>{incidentLabel ?? "—"}</b>
                    </div>
                  </div>

                  {suggestedInterventionIds(pct, incidentFlag).length > 0 && (
                    <div className="cs-suggestion-box">
                      <div className="cs-suggestion-label">WANT A QUICK RESET?</div>
                      {suggestedInterventionIds(pct, incidentFlag).map((id) => {
                        const iv = INTERVENTIONS.find((x) => x.id === id);
                        if (!iv) return null;
                        return (
                          <button
                            key={id}
                            className="cs-suggestion-item"
                            onClick={() => {
                              setView("interventions");
                              openIntervention(id);
                            }}
                          >
                            <span>{iv.title}</span>
                            <span className="cs-suggestion-duration">{iv.duration}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button className="cs-begin-btn" onClick={finishCheckIn}>
                    LOG &amp; DONE FOR TODAY
                  </button>
                  <button className="cs-secondary-btn" onClick={resetToIntro}>
                    Retake check-in
                  </button>
                </div>
              )}

              {view === "trends" && (
                <div className="cs-card">
                  <div className="cs-eyebrow">14-DAY TREND</div>

                  {loadingHistory ? (
                    <p className="cs-sub">Loading history from Supabase…</p>
                  ) : present14.length === 0 ? (
                    <p className="cs-sub">
                      No check-ins yet. Complete today's check-in to start your trend.
                    </p>
                  ) : (
                    <>
                      <div className="cs-streak-row">
                        <div>
                          <div className="cs-streak-num">{streak}</div>
                          <div className="cs-streak-label">DAY STREAK</div>
                        </div>
                        <div className="cs-day-chips">
                          {last7.map((d) => (
                            <div
                              key={d.key}
                              className="cs-day-chip"
                              style={{ background: d.entry ? getCondition(d.entry.pct).hex : "transparent" }}
                              title={d.key}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="cs-chart-wrap">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                            <defs>
                              <linearGradient id="csFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#E8833F" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#E8833F" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#232B35" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fill: "#7E8896", fontSize: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
                              axisLine={{ stroke: "#232B35" }}
                              tickLine={false}
                              interval={1}
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={{ fill: "#7E8896", fontSize: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
                              axisLine={false}
                              tickLine={false}
                              width={26}
                            />
                            <Tooltip content={<TrendTooltip />} />
                            <Area
                              type="monotone"
                              dataKey="pct"
                              stroke="#E8833F"
                              strokeWidth={2}
                              fill="url(#csFill)"
                              dot={<TrendDot />}
                              connectNulls={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="cs-condition-dist">
                        <div className="cs-dist-chip" style={{ color: "var(--sig-green)" }}>
                          GREEN · {dist.green}
                        </div>
                        <div className="cs-dist-chip" style={{ color: "var(--sig-amber)" }}>
                          AMBER · {dist.amber}
                        </div>
                        <div className="cs-dist-chip" style={{ color: "var(--sig-red)" }}>
                          RED · {dist.red}
                        </div>
                      </div>

                      <div className="cs-stats-grid">
                        <div className="cs-stat-card">
                          <div className="cs-stat-value">{avg.sleep}</div>
                          <div className="cs-stat-label">AVG SLEEP</div>
                        </div>
                        <div className="cs-stat-card">
                          <div className="cs-stat-value">{avg.stress}</div>
                          <div className="cs-stat-label">AVG STRESS</div>
                        </div>
                        <div className="cs-stat-card">
                          <div className="cs-stat-value">{avg.recovery}</div>
                          <div className="cs-stat-label">AVG RECOVERY</div>
                        </div>
                      </div>

                      {incidentCount14 > 0 && (
                        <div className="cs-incident-banner" style={{ marginTop: 18, marginBottom: 0 }}>
                          <div className="cs-incident-dot" />
                          <div className="cs-incident-text">
                            <b>
                              {incidentCount14} CRITICAL INCIDENT{incidentCount14 > 1 ? "S" : ""} LOGGED
                            </b>
                            In the last 14 days.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {view === "interventions" && !activeInterventionId && (
                <div className="cs-card">
                  <div className="cs-eyebrow">CARE PATHWAYS</div>
                  <h1 className="cs-h1">Interventions</h1>
                  <p className="cs-sub">
                    Short, evidence-informed exercises drawn from CBT, DBT, and ACT. Nothing
                    you do here is saved — only that you did it.
                  </p>
                  {INTERVENTION_DOMAINS.map((domain) => {
                    const isOpen = !!openDomains[domain.id];
                    const items = INTERVENTIONS.filter((iv) => iv.modalities.includes(domain.id));
                    return (
                      <div key={domain.id} className="cs-domain-group">
                        <button
                          className="cs-domain-header"
                          onClick={() => toggleDomain(domain.id)}
                          aria-expanded={isOpen}
                        >
                          <div>
                            <div className="cs-domain-label">{domain.label}</div>
                            <div className="cs-domain-full">{domain.full}</div>
                          </div>
                          <span className={`cs-domain-caret ${isOpen ? "open" : ""}`}>▾</span>
                        </button>
                        {isOpen && (
                          <div className="cs-domain-body">
                            {items.map((iv) => (
                              <button
                                key={iv.id}
                                className="cs-intervention-card"
                                onClick={() => openIntervention(iv.id)}
                              >
                                <div className="cs-intervention-card-top">
                                  <span className="cs-intervention-title">{iv.title}</span>
                                  <span className="cs-intervention-duration">{iv.duration}</span>
                                </div>
                                <div className="cs-intervention-blurb">{iv.blurb}</div>
                                <div className="cs-intervention-modality">
                                  {iv.modalities.join(" / ")}
                                  {completionCounts[iv.id] ? ` · Done ${completionCounts[iv.id]}×` : ""}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {view === "interventions" && activeInterventionId && (() => {
                const iv = INTERVENTIONS.find((x) => x.id === activeInterventionId);
                if (!iv) return null;
                const isLast = interventionStepIndex + 1 >= iv.steps.length;
                return (
                  <div className="cs-card">
                    <div className="cs-eyebrow">
                      {iv.title.toUpperCase()} · {iv.modalities.join(" / ")}
                    </div>
                    {iv.type === "breathing" ? (
                      <>
                        <p className="cs-sub">{iv.steps[0]}</p>
                        <BreathingPacer onCycleComplete={(n) => setBreathingCycles(n)} />
                        <button
                          className="cs-begin-btn cs-full-width"
                          onClick={() => {
                            completeIntervention();
                            closeIntervention();
                          }}
                        >
                          DONE
                        </button>
                        <button className="cs-secondary-btn" onClick={closeIntervention}>
                          Back to list
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="cs-progress" style={{ marginBottom: 24 }}>
                          {iv.steps.map((_, i) => (
                            <div className="cs-seg" key={i}>
                              <div className={`cs-seg-fill ${i < interventionStepIndex ? "filled" : ""}`} />
                            </div>
                          ))}
                        </div>
                        <p className="cs-intervention-step-text">{iv.steps[interventionStepIndex]}</p>
                        <button
                          className="cs-begin-btn cs-full-width"
                          onClick={() => advanceIntervention(iv.steps.length)}
                        >
                          {isLast ? "DONE" : "NEXT"}
                        </button>
                        <button className="cs-secondary-btn" onClick={closeIntervention}>
                          Back to list
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="cs-footer-note">
              Cleras Shield · Operational Readiness Platform · Confidential to you
            </div>
          </>
        )}
      </div>
    </div>
  );
}
