vimport React, { useState, useMemo, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/* ---------- Supabase (REST, no SDK — nothing persisted to browser storage) ----------
   Session lives only in React state for the life of this session. There is no
   localStorage/sessionStorage/window.storage anywhere in this file — closing or
   reloading the artifact requires signing in again. Every read/write of check-in
   data goes straight to Supabase and is scoped by Postgres RLS to auth.uid(),
   so this file never holds another officer's data and never caches anything
   outside of the current browser tab's memory.
------------------------------------------------------------------------------- */

const SUPABASE_URL = "https://rayuaqfwcxzqwekbrpbs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uFpL72MpnDQGNJtXVYrP5A_oRUodxp7";

async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.error || "Authentication failed");
  }
  return data;
}

function signUpRequest(email, password, role) {
  return authRequest("signup", { email, password, data: { role } });
}

function signInRequest(email, password) {
  return authRequest("token?grant_type=password", { email, password });
}

async function fetchCheckIns(accessToken, userId, fromDate) {
  const url = `${SUPABASE_URL}/rest/v1/check_ins?select=*&user_id=eq.${userId}&check_date=gte.${fromDate}&order=check_date.asc`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to load check-ins");
  return res.json();
}

async function upsertCheckIn(accessToken, entry) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/check_ins?on_conflict=user_id,check_date`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([entry]),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to save check-in");
  return data;
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

function getCondition(pct) {
  if (pct >= 75)
    return {
      code: "COND. GREEN",
      dbValue: "green",
      color: "var(--sig-green)",
      hex: "#3FB871",
      headline: "Ready for duty.",
      note: "Your indicators are steady. Standard vigilance.",
    };
  if (pct >= 45)
    return {
      code: "COND. AMBER",
      dbValue: "amber",
      color: "var(--sig-amber)",
      hex: "#E8833F",
      headline: "Elevated load.",
      note: "Recovery is lagging. Pace yourself and check in with a peer if it persists.",
    };
  return {
    code: "COND. RED",
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

/* ---------- Trend chart bits ---------- */

function TrendDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || payload.pct == null) return null;
  const color = getCondition(payload.pct).hex;
  return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#0A0D12" strokeWidth={1} />;
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
        fontFamily: "'IBM Plex Mono', monospace",
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
  const [session, setSession] = useState(null); // { accessToken, userId, email } — memory only
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRole, setAuthRole] = useState("");
  const [page, setPage] = useState("home"); // 'home' | 'auth' — only relevant when signed out
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingScroll, setPendingScroll] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

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

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setLockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoadingHistory(true);
      try {
        const from = new Date();
        from.setDate(from.getDate() - 13);
        const rows = await fetchCheckIns(session.accessToken, session.userId, dateKey(from));
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

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const data = await signUpRequest(authEmail, authPassword, authRole);
        if (data.access_token && data.user) {
          setSession({ accessToken: data.access_token, userId: data.user.id, email: data.user.email });
        } else {
          setAuthNotice("Account created. Check your email to confirm it, then sign in.");
          setAuthMode("signin");
        }
      } else {
        const data = await signInRequest(authEmail, authPassword);
        setSession({ accessToken: data.access_token, userId: data.user.id, email: data.user.email });
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function signOut() {
    setSession(null);
    setHistory({});
    setView("checkin");
    setPage("home");
    resetToIntro();
    setAuthEmail("");
    setAuthPassword("");
    setAuthNotice("");
    setAuthError("");
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
    const key = dateKey(new Date());
    const cond = getCondition(pct);
    const row = {
      user_id: session.userId,
      check_date: key,
      sleep_score: values.sleep ?? 0,
      stress_score: values.stress ?? 0,
      recovery_score: values.recovery ?? 0,
      readiness_index: pct,
      condition: cond.dbValue,
      incident_flag: incidentFlag,
      incident_label: incidentLabel,
    };
    setSaveError("");
    try {
      const saved = await upsertCheckIn(session.accessToken, row);
      const createdAt = saved && saved[0] && saved[0].created_at ? saved[0].created_at : new Date().toISOString();
      setHistory((prev) => ({
        ...prev,
        [key]: {
          date: key,
          pct,
          sleep: row.sleep_score,
          stress: row.stress_score,
          recovery: row.recovery_score,
          incidentFlag,
          createdAt,
        },
      }));
      resetToIntro();
      setView("trends");
    } catch (e) {
      setSaveError("Could not save to Supabase. Your check-in was not logged — try again.");
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
      const code = getCondition(d.entry.pct).code;
      if (code.includes("GREEN")) acc.green++;
      else if (code.includes("AMBER")) acc.amber++;
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
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
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
        .cs-wordmark { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 17px; letter-spacing: 0.14em; color: var(--text-primary); }
        .cs-wordmark span { color: var(--sig-amber); }
        .cs-clock { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; color: var(--text-muted); letter-spacing: 0.03em; text-align: right; }
        .cs-signout {
          font-family: 'IBM Plex Mono', monospace;
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
        .cs-tab { flex: 1; text-align: center; padding: 10px; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; letter-spacing: 0.1em; border: 1px solid var(--panel-border); border-radius: 3px; background: transparent; color: var(--text-muted); cursor: pointer; }
        .cs-tab.active { border-color: var(--sig-amber); color: var(--text-primary); background: #171C24; }
        .cs-progress { display: flex; gap: 6px; margin-bottom: 28px; }
        .cs-seg { flex: 1; height: 4px; border-radius: 2px; background: var(--panel-border); overflow: hidden; }
        .cs-seg-fill { height: 100%; width: 0%; background: var(--sig-amber); transition: width 300ms ease; }
        .cs-seg-fill.filled { width: 100%; }
        .cs-body { flex: 1; display: flex; flex-direction: column; }
        .cs-card { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 4px; padding: 28px 24px; flex: 1; display: flex; flex-direction: column; }
        .cs-card-compact { flex: 0 0 auto; }
        .cs-card-compact .cs-begin-btn { margin-top: 10px; }
        .cs-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; letter-spacing: 0.18em; color: var(--sig-amber); margin-bottom: 14px; }
        .cs-h1 { font-family: 'Oswald', sans-serif; font-weight: 500; font-size: 29px; line-height: 1.25; margin: 0 0 8px 0; color: var(--text-primary); }
        .cs-sub { color: var(--text-muted); font-size: 15.5px; line-height: 1.5; margin: 0 0 28px 0; }
        .cs-options { display: flex; flex-direction: column; gap: 10px; }
        .cs-opt { text-align: left; background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 16px 18px; color: var(--text-primary); font-family: 'Inter', sans-serif; cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: border-color 150ms, background 150ms, transform 100ms; }
        .cs-opt:hover { border-color: var(--sig-amber); background: #1C222C; }
        .cs-opt:active { transform: scale(0.99); }
        .cs-opt-label { font-size: 17px; font-weight: 600; }
        .cs-opt-sub { font-size: 14px; color: var(--text-muted); }
        .cs-begin-btn { margin-top: auto; background: var(--sig-amber); color: #14100A; border: none; border-radius: 3px; padding: 16px; font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 15.5px; letter-spacing: 0.08em; cursor: pointer; }
        .cs-begin-btn:hover { filter: brightness(1.05); }
        .cs-begin-btn:disabled { opacity: 0.6; cursor: default; }
        .cs-secondary-btn { margin-top: 12px; background: transparent; color: var(--text-muted); border: 1px solid var(--panel-border); border-radius: 3px; padding: 14px; font-family: 'Inter', sans-serif; font-size: 14.5px; cursor: pointer; }
        .cs-secondary-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
        .gauge-wrap { display: flex; justify-content: center; margin: 6px 0 4px 0; }
        .gauge-svg { width: 100%; max-width: 280px; }
        .cs-readout { text-align: center; margin-top: -46px; margin-bottom: 18px; }
        .cs-pct { font-family: 'IBM Plex Mono', monospace; font-size: 38px; font-weight: 600; line-height: 1; }
        .cs-pct-label { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--text-muted); letter-spacing: 0.14em; margin-top: 4px; }
        .cs-condition-badge { font-family: 'IBM Plex Mono', monospace; font-size: 13.5px; letter-spacing: 0.12em; padding: 6px 12px; border-radius: 2px; display: inline-block; margin-bottom: 16px; border: 1px solid currentColor; }
        .cs-incident-banner { display: flex; align-items: center; gap: 10px; background: rgba(214, 72, 74, 0.1); border: 1px solid var(--sig-red); border-radius: 3px; padding: 12px 14px; margin-bottom: 20px; }
        .cs-incident-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sig-red); flex-shrink: 0; }
        .cs-incident-text { font-size: 14px; line-height: 1.4; }
        .cs-incident-text b { display: block; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; letter-spacing: 0.08em; color: var(--sig-red); margin-bottom: 2px; }
        .cs-breakdown { display: flex; flex-direction: column; gap: 8px; margin: 18px 0; padding-top: 18px; border-top: 1px solid var(--panel-border); }
        .cs-breakdown-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--text-muted); font-family: 'IBM Plex Mono', monospace; }
        .cs-breakdown-row b { color: var(--text-primary); font-weight: 500; }
        .cs-footer-note { font-size: 12.5px; color: var(--text-muted); text-align: center; margin-top: 18px; line-height: 1.5; }
        .cs-streak-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
        .cs-streak-num { font-family: 'IBM Plex Mono', monospace; font-size: 31.5px; font-weight: 600; color: var(--sig-amber); line-height: 1; }
        .cs-streak-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.1em; font-family: 'IBM Plex Mono', monospace; margin-top: 4px; }
        .cs-day-chips { display: flex; gap: 6px; }
        .cs-day-chip { width: 24px; height: 24px; border-radius: 3px; border: 1px solid var(--panel-border); }
        .cs-chart-wrap { height: 170px; margin: 4px -6px 22px -6px; }
        .cs-condition-dist { display: flex; gap: 8px; margin-bottom: 16px; }
        .cs-dist-chip { flex: 1; text-align: center; padding: 10px 4px; border-radius: 3px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.04em; border: 1px solid currentColor; }
        .cs-stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .cs-stat-card { background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 12px 6px; text-align: center; }
        .cs-stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; }
        .cs-stat-label { font-size: 10.5px; color: var(--text-muted); letter-spacing: 0.06em; margin-top: 4px; font-family: 'IBM Plex Mono', monospace; }
        .cs-lock-badge {
          position: absolute;
          top: 18px;
          right: 18px;
          display: flex;
          align-items: center;
          gap: 7px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13.5px;
          padding: 6px 11px;
          border-radius: 20px;
          border: 1px solid currentColor;
          background: #171C24;
          transition: color 1s linear, border-color 1s linear;
        }
        .cs-lock-dot { width: 8px; height: 8px; border-radius: 50%; transition: background 1s linear; }
        .cs-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .cs-field label { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; color: var(--text-muted); }
        .cs-field input, .cs-field select { background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 12px 14px; color: var(--text-primary); font-family: 'Inter', sans-serif; font-size: 15.5px; }
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
          font-family: 'IBM Plex Mono', monospace;
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
          font-family: 'Oswald', sans-serif;
          font-weight: 500;
          font-size: 32px;
          line-height: 1.2;
          margin: 0 0 16px 0;
          color: var(--text-primary);
        }
        .cs-home-h2 {
          font-family: 'Oswald', sans-serif;
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
          font-family: 'Oswald', sans-serif;
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
          font-family: 'Oswald', sans-serif;
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
        .cs-auth-error { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--sig-red); margin-bottom: 14px; line-height: 1.5; }
        .cs-auth-notice { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--sig-green); margin-bottom: 14px; line-height: 1.5; }
        .cs-auth-toggle { text-align: center; margin-top: 14px; font-size: 14px; color: var(--text-muted); }
        .cs-auth-toggle button { background: none; border: none; color: var(--sig-amber); cursor: pointer; font-size: 14px; text-decoration: underline; padding: 0; }
      `}</style>

      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
      />

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
                    minLength={6}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                  />
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
                              tick={{ fill: "#7E8896", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                              axisLine={{ stroke: "#232B35" }}
                              tickLine={false}
                              interval={1}
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={{ fill: "#7E8896", fontSize: 10, fontFamily: "IBM Plex Mono" }}
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
