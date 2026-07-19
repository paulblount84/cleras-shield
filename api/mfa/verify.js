import { withAuth, supaFetch, setSessionCookies } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { factorId, challengeId, code, pendingToken } = req.body || {};
  if (!factorId || !challengeId || !code) return res.status(400).json({ message: "Missing fields" });

  const call = (token) =>
    supaFetch(`/auth/v1/factors/${factorId}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ challenge_id: challengeId, code }),
    });

  const result = pendingToken ? await call(pendingToken) : await withAuth(req, res, call);

  if (!result.ok) return res.status(400).json({ message: "That code didn't match. Try again." });

  // This is the moment MFA is actually satisfied — cookies get set here
  // regardless of whether the call was authenticated via a pending token
  // (sign-in-time challenge) or an existing cookie (post-login setup).
  setSessionCookies(res, result.data);
  return res.status(200).json({
    status: "authenticated",
    user: { id: result.data.user.id, email: result.data.user.email },
  });
}
