import React from "react";
import Gauge from "./Gauge";
import { INTERVENTIONS } from "./Interventions";
import { tierOf, suggestedInterventionIds } from "../scoring";
import { formatCountdown } from "../utils";

/* ---------- Check-in flow (only rendered when view === "checkin") ----------
   Covers four states, in order: locked (already checked in today),
   intro (not yet started), question stepper, and the result screen with
   the readiness gauge + suggested interventions.
------------------------------------------------------------------------- */

export default function CheckIn({
  step,
  setStep,
  totalSteps,
  currentQ,
  isQuestion,
  isResult,
  isCheckInLocked,
  lockColor,
  lockRemainingMs,
  lastCondition,
  lastCheckIn,
  condition,
  pct,
  values,
  incidentFlag,
  incidentLabel,
  selectOption,
  resetToIntro,
  finishCheckIn,
  onOpenSuggestedIntervention,
}) {
  return (
    <>
      {step === -1 && isCheckInLocked && (
        <div className="cs-card cs-card-compact" style={{ position: "relative" }}>
          <div className="cs-lock-badge" style={{ borderColor: lockColor, color: lockColor }}>
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

      {step === -1 && !isCheckInLocked && (
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
              <b style={{ color: tierOf(values.sleep ?? 0).color }}>
                {tierOf(values.sleep ?? 0).label}
              </b>
            </div>
            <div className="cs-breakdown-row">
              <span>STRESS</span>
              <b style={{ color: tierOf(values.stress ?? 0, true).color }}>
                {tierOf(values.stress ?? 0, true).label}
              </b>
            </div>
            <div className="cs-breakdown-row">
              <span>RECOVERY</span>
              <b style={{ color: tierOf(values.recovery ?? 0).color }}>
                {tierOf(values.recovery ?? 0).label}
              </b>
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
                    onClick={() => onOpenSuggestedIntervention(id)}
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
    </>
  );
}
