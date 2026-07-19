import { useState } from "react";
import { enrollTotpFactor, unenrollFactor, verifyMfaChallenge, logoutRequest } from "../api";

// MFA step-up hook. `mfaPendingToken` is only ever populated for the
// sign-in-time "account already has 2FA" case, where the server
// deliberately withholds cookies until the challenge is verified — it's
// held only in memory and discarded the moment MFA resolves or is
// cancelled. For the "just signed up / never enrolled" offer-and-setup
// path, cookies already exist (there's no factor to gate on yet), so those
// calls are plain cookie-authenticated requests.
//
// `onFinalize(user)` is called once MFA resolves (or is skipped) so the
// caller can establish the app session; this hook only owns MFA-local state.
export default function useMfa({ onFinalize }) {
  const [mfaStage, setMfaStage] = useState(null); // null | 'offer' | 'setup' | 'challenge'
  const [pendingUser, setPendingUser] = useState(null);
  const [mfaPendingToken, setMfaPendingToken] = useState(null);
  const [mfaFactorId, setMfaFactorId] = useState(null);
  const [mfaChallengeId, setMfaChallengeId] = useState(null);
  const [mfaQrSvg, setMfaQrSvg] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  function resetMfaState() {
    setMfaStage(null);
    setPendingUser(null);
    setMfaPendingToken(null);
    setMfaFactorId(null);
    setMfaChallengeId(null);
    setMfaQrSvg("");
    setMfaSecret("");
    setMfaCode("");
    setMfaError("");
    setMfaLoading(false);
  }

  // Called right after sign-in/sign-up/reset-confirm resolves against the server.
  function handlePostPrimaryAuth(data) {
    if (data.status === "mfa_required") {
      setMfaPendingToken(data.pendingToken);
      setMfaFactorId(data.factorId);
      setMfaStage("challenge");
      return;
    }
    // status === 'authenticated': cookies are already live. The server only
    // takes this branch when there's no verified factor, so this is always
    // either a brand-new account or one that never enrolled — offer setup.
    setPendingUser(data.user);
    setMfaStage("offer");
  }

  function cancelMfa() {
    if (mfaStage === "setup" && mfaFactorId) {
      unenrollFactor(mfaFactorId);
    }
    if (mfaStage === "offer" || mfaStage === "setup") {
      // A cookie session already exists for this path (there was no factor
      // to gate on) — cancelling means aborting the whole sign-in, not just
      // the MFA prompt, so fully sign out.
      logoutRequest();
    }
    // 'challenge' stage: no cookie was ever set for the pending token —
    // nothing to revoke, it just expires unused within the hour.
    resetMfaState();
  }

  function skipMfaSetup() {
    if (pendingUser) {
      onFinalize(pendingUser);
      resetMfaState();
    }
  }

  async function startMfaSetup() {
    setMfaError("");
    setMfaLoading(true);
    try {
      const enrolled = await enrollTotpFactor();
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
      const verified = await verifyMfaChallenge(mfaFactorId, mfaCode);
      onFinalize(verified.user);
      resetMfaState();
    } catch (e) {
      setMfaError(e.message || "That code didn't match. Try again.");
      setMfaLoading(false);
    }
  }

  async function submitMfaChallengeCode() {
    setMfaError("");
    setMfaLoading(true);
    try {
      const verified = await verifyMfaChallenge(mfaFactorId, mfaCode, mfaPendingToken);
      onFinalize(verified.user);
      resetMfaState();
    } catch (e) {
      setMfaError(e.message || "That code didn't match. Try again.");
      setMfaCode("");
      setMfaLoading(false);
    }
  }

  return {
    mfaStage,
    pendingUser,
    mfaPendingToken,
    mfaFactorId,
    mfaChallengeId,
    mfaQrSvg,
    mfaSecret,
    mfaCode,
    mfaError,
    mfaLoading,
    setMfaCode,
    resetMfaState,
    handlePostPrimaryAuth,
    cancelMfa,
    skipMfaSetup,
    startMfaSetup,
    submitMfaSetupCode,
    submitMfaChallengeCode,
  };
}
