import { withAuth, supaFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const result = await withAuth(req, res, (token) =>
    supaFetch("/auth/v1/factors", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ factor_type: "totp" }),
    })
  );

  if (!result.ok) return res.status(result.status || 400).json({ message: "if (!result.ok) return res.status(result.status || 400).json({ message: "Could not start two-factor setup.", debug: result.data });
" });
  return res.status(200).json({ id: result.data.id, totp: result.data.totp });
}
