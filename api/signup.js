import { supaFetch, setSessionCookies, mapSignupError } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "Email and password required" });
  if (password.length < 12) return res.status(400).json({ message: "Password must be at least 12 characters." });

  const result = await supaFetch("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, data: { role } }),
  });

  if (!result.ok) {
    const raw = result.data.error_description || result.data.msg || result.data.error;
    return res.status(400).json({ message: mapSignupError(raw) });
  }

  if (result.data.access_token && result.data.user) {
    setSessionCookies(res, result.data);
    return res.status(200).json({
      status: "authenticated",
      user: { id: result.data.user.id, email: result.data.user.email },
    });
  }

  return res.status(200).json({ status: "confirmation_required" });
}
