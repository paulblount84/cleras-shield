import { supaFetch, setSessionCookies } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "Email and password required" });

  const result = await supaFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!result.ok) {
    return res.status(401).json({ message: "Unable to sign in with those credentials." });
  }

  const { access_token, user } = result.data;

  const userResult = await supaFetch("/auth/v1/user", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const factors = (userResult.ok && userResult.data.factors) || [];
  const verifiedTotp = factors.find((f) => f.factor_type === "totp" && f.status === "verified");

  if (verifiedTotp) {
    return res.status(200).json({ status: "mfa_required", factorId: verifiedTotp.id, pendingToken: access_token });
  }

  setSessionCookies(res, result.data);
  return res.status(200).json({
    status: "authenticated",
    user: { id: user.id, email: user.email },
  });
}
