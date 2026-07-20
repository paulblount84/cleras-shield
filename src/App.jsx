import React, { useState, useMemo, useEffect } from "react";
import Homepage from "./components/Homepage";
import Auth from "./components/Auth";
import CheckIn from "./components/CheckIn";
import Dashboard from "./components/Dashboard";
import Interventions from "./components/Interventions";
import useMfa from "./hooks/useMfa";
import {
  getSession,
  signUpRequest,
  signInRequest,
  logoutRequest,
  requestPasswordReset,
  confirmPasswordReset,
  fetchCheckIns,
  submitCheckIn,
  fetchInterventionCompletions,
  logInterventionCompletion,
} from "./api";
import { WEIGHTS, ALL_STEPS, getCondition } from "./scoring";
import { dateKey, shortLabel, LOCK_MS, lockProgressColor } from "./utils";
import { CS_STYLES } from "./styles";

const NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "why-it-matters", label: "Why It Matters" },
  { id: "how-it-works", label: "How It Works" },
  { id: "privacy-security", label: "Privacy & Security" },
  { id: "who-its-for", label: "Who It's For" },
  { id: "signin", label: "Sign In" },
];

export default function CleraShieldCheckIn() {
  const [session, setSession] = useState(null); // { userId, email } — no tokens ever live here
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
  // the emailed reset link. This is the one unavoidable case where a raw
  // token briefly exists in client memory — Supabase delivers it via a URL
  // fragment, which by the HTTP spec never reaches any server — but it's
  // held only in this state, never in storage, and only until it's handed
  // to /api/auth/reset-confirm, which is where cookie-based auth takes over.
  const [recoveryAccessToken, setRecoveryAccessToken] = useState(null);
  const [recoveryRefreshToken, setRecoveryRefreshToken] = useState(null);
  const [recoveryExpiresIn, setRecoveryExpiresIn] = useState(3600);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const mfa = useMfa({
    onFinalize: (user) => setSession({ userId: user.id, email: user.email }),
  });

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

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setLockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Bootstrap: ask the server whether the httpOnly cookie represents a valid
  // session. This is what makes "refresh keeps you signed in" work now —
  // there's nothing client-side to restore, the cookie already did its job
  // and the server tells us who it belongs to.
  useEffect(() => {
    (async () => {
      try {
        const data = await getSession();
        if (data.authenticated) {
          setSession({ userId: data.user.id, email: data.user.email });
        }
      } catch (e) {
        /* not authenticated — stay on the homepage */
      }
    })();
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

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoadingHistory(true);
      try {
        const from = new Date();
        from.setDate(from.getDate() - 13);
        const rows = await fetchCheckIns(dateKey(from));
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
        const rows = await fetchInterventionCompletions();
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

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    try {
      let data;
      if (authMode === "signup") {
        data = await signUpRequest(authEmail, authPassword, authRole);
        if (data.status === "confirmation_required") {
          setAuthNotice("Account created. Check your email to confirm it, then sign in.");
          setAuthMode("signin");
          setAuthLoading(false);
          return;
        }
      } else {
        data = await signInRequest(authEmail, authPassword);
      }
      mfa.handlePostPrimaryAuth(data);
    } catch (err) {
      setAuthError(err.message || "Something went wrong. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRequestReset(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    await requestPasswordReset(authEmail);
    // Same message regardless of outcome — matches Supabase's own
    // anti-enumeration behavior on this endpoint.
    setAuthNotice("If that email has an account, a reset link is on its way. Check your inbox.");
    setAuthLoading(false);
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
      const data = await confirmPasswordReset({
        accessToken: recoveryAccessToken,
        refreshToken: recoveryRefreshToken,
        expiresIn: recoveryExpiresIn,
        newPassword,
      });
      setNewPassword("");
      setNewPasswordConfirm("");
      setRecoveryAccessToken(null);
      setRecoveryRefreshToken(null);
      mfa.handlePostPrimaryAuth(data);
    } catch (err) {
      setAuthError(err.message || "That reset link has expired or was already used. Request a new one.");
    } finally {
      setAuthLoading(false);
    }
  }

  function signOut() {
    logoutRequest();
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
    setCompletionCounts({});
    closeIntervention();
    mfa.resetMfaState();
  }

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
      const saved = await submitCheckIn({
        sleepScore: values.sleep ?? 0,
        stressScore: values.stress ?? 0,
        recoveryScore: values.recovery ?? 0,
        incidentLabel: incidentLabel ?? "None",
        checkDate: dateKey(new Date()),
      });
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

  function advanceIntervention(totalIvSteps) {
    if (interventionStepIndex + 1 >= totalIvSteps) {
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
        await logInterventionCompletion(id);
      } catch (e) {
        /* non-critical, completion still shown locally */
      }
    }
  }

  function openSuggestedIntervention(id) {
    setView("interventions");
    openIntervention(id);
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
      <style>{CS_STYLES}</style>

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
          <Auth
            mfa={mfa}
            authMode={authMode}
            setAuthMode={setAuthMode}
            authEmail={authEmail}
            setAuthEmail={setAuthEmail}
            authPassword={authPassword}
            setAuthPassword={setAuthPassword}
            authRole={authRole}
            setAuthRole={setAuthRole}
            authError={authError}
            setAuthError={setAuthError}
            authNotice={authNotice}
            setAuthNotice={setAuthNotice}
            authLoading={authLoading}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            newPasswordConfirm={newPasswordConfirm}
            setNewPasswordConfirm={setNewPasswordConfirm}
            handleAuthSubmit={handleAuthSubmit}
            handleRequestReset={handleRequestReset}
            handleConfirmReset={handleConfirmReset}
          />
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

              {view === "checkin" && (
                <CheckIn
                  step={step}
                  setStep={setStep}
                  totalSteps={totalSteps}
                  currentQ={currentQ}
                  isQuestion={isQuestion}
                  isResult={isResult}
                  isCheckInLocked={isCheckInLocked}
                  lockColor={lockColor}
                  lockRemainingMs={lockRemainingMs}
                  lastCondition={lastCondition}
                  lastCheckIn={lastCheckIn}
                  condition={condition}
                  pct={pct}
                  values={values}
                  incidentFlag={incidentFlag}
                  incidentLabel={incidentLabel}
                  selectOption={selectOption}
                  resetToIntro={resetToIntro}
                  finishCheckIn={finishCheckIn}
                  onOpenSuggestedIntervention={openSuggestedIntervention}
                />
              )}

              {view === "trends" && (
                <Dashboard
                  loadingHistory={loadingHistory}
                  present14={present14}
                  streak={streak}
                  last7={last7}
                  chartData={chartData}
                  dist={dist}
                  avg={avg}
                  incidentCount14={incidentCount14}
                />
              )}

              {view === "interventions" && (
                <Interventions
                  completionCounts={completionCounts}
                  openDomains={openDomains}
                  toggleDomain={toggleDomain}
                  activeInterventionId={activeInterventionId}
                  interventionStepIndex={interventionStepIndex}
                  openIntervention={openIntervention}
                  closeIntervention={closeIntervention}
                  advanceIntervention={advanceIntervention}
                  completeIntervention={completeIntervention}
                  setBreathingCycles={setBreathingCycles}
                />
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
