import { withAuth, supaFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { factorId, pendingToken } = req.body || {};
  if (!factorId) return res.status(400).json({ message: "Missing factorId" });

  const call = (token) =>
    supaFetch(`/auth/v1/factors/${factorId}/challenge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

  // pendingToken is used only for the sign-in-time MFA challenge, before any
  // cookie exists yet. Every other caller (post-login setup flow) goes
  // through the normal cookie-based path.
  const result = pendingToken ? await call(pendingToken) : await withAuth(req, res, call);

  if (!result.ok) return res.status(result.status || 400).json({ message: "Could not start verification." });
  return res.status(200).json({ id: result.data.id, expires_at: result.data.expires_at });
}
