import { supaFetch, setSessionCookies } from "../_lib/supabase.js";

// Note on the one unavoidable exposure in this whole architecture: Supabase
// delivers the password-recovery token via a URL hash fragment, which never
// reaches any server (fragments are client-only by the HTTP spec) — so the
// browser necessarily holds this token briefly before it can hand it to us.
// This endpoint is where that ends: once the new password is set, the
// response cookies become the session going forward, and the raw recovery
// token is never touched again.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { accessToken, refreshToken, expiresIn, newPassword } = req.body || {};
  if (!accessToken || !newPassword) return res.status(400).json({ message: "Missing fields" });
  if (newPassword.length < 12) return res.status(400).json({ message: "Password must be at least 12 characters." });

  const result = await supaFetch("/auth/v1/user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password: newPassword }),
  });

  if (!result.ok) {
    return res
      .status(400)
      .json({ message: "That reset link has expired or was already used. Request a new one." });
  }

  setSessionCookies(res, {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn || 3600,
  });

  return res.status(200).json({
    status: "authenticated",
    user: { id: result.data.id, email: result.data.email },
  });
}
