import React from "react";
import Mfa from "./Mfa";
import { ROLE_OPTIONS } from "../scoring";

/* ---------- Auth (signed-out) screens ----------
   Covers sign in, sign up, forgot-password, and reset-confirm, plus renders
   the MFA card (via <Mfa mfa={mfa} />) when a step-up challenge is active.
   All state is owned by App.jsx and passed down as props — this component
   is purely the form markup + submit wiring.
------------------------------------------------------------------------- */

export default function Auth({
  mfa,
  authMode,
  setAuthMode,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authRole,
  setAuthRole,
  authError,
  setAuthError,
  authNotice,
  setAuthNotice,
  authLoading,
  newPassword,
  setNewPassword,
  newPasswordConfirm,
  setNewPasswordConfirm,
  handleAuthSubmit,
  handleRequestReset,
  handleConfirmReset,
}) {
  return (
    <div className="cs-body">
      {!mfa.mfaStage && (authMode === "signin" || authMode === "signup") && (
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

      {!mfa.mfaStage && authMode === "reset-request" && (
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

      {!mfa.mfaStage && authMode === "reset-confirm" && (
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

      <Mfa mfa={mfa} />

      <div className="cs-footer-note">
        Cleras Shield · Operational Readiness Platform · Confidential to you
      </div>
    </div>
  );
}
