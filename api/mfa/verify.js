import { withAuth, supaFetch, setSessionCookies } from "../_lib/supabase.js";

// Challenge creation and verification now happen together, inside this one
// function invocation, so both Supabase calls share the same outbound IP.
// Doing them as two separate round-trips from the browser (create challenge,
// then later verify) let Vercel route them through different serverless
// instances with different IPs, which Supabase's MFA anti-phishing check
// correctly rejects as "Challenge and verify IP addresses mismatch."
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { factorId, code, pendingToken } = req.body || {};
  if (!factorId || !code) return res.status(400).json({ message: "Missing fields" });

  const run = async (token) => {
    const challenge = await supaFetch(`/auth/v1/factors/${factorId}/challenge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!challenge.ok) return challenge;
    return supaFetch(`/auth/v1/factors/${factorId}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ challenge_id: challenge.data.id, code }),
    });
  };

  const result = pendingToken ? await run(pendingToken) : await withAuth(req, res, run);

  if (!result.ok) return res.status(400).json({ message: "That code didn't match. Try again." });

  setSessionCookies(res, result.data);
  return res.status(200).json({
    status: "authenticated",
    user: { id: result.data.user.id, email: result.data.user.email },
  });
}
