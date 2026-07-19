import React from "react";
import { qrCodeToImageSrc } from "../api";

// Renders the MFA offer/setup/challenge card for whichever stage the
// `mfa` hook (see hooks/useMfa.js) is currently in. Renders nothing when
// there's no active MFA stage.
export default function Mfa({ mfa }) {
  const {
    mfaStage,
    mfaQrSvg,
    mfaSecret,
    mfaCode,
    mfaError,
    mfaLoading,
    setMfaCode,
    startMfaSetup,
    skipMfaSetup,
    submitMfaSetupCode,
    submitMfaChallengeCode,
    cancelMfa,
  } = mfa;

  if (mfaStage === "offer") {
    return (
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
    );
  }

  if (mfaStage === "setup") {
    return (
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
    );
  }

  if (mfaStage === "challenge") {
    return (
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
    );
  }

  return null;
}
