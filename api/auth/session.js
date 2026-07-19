import { withAuth, supaFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  const result = await withAuth(req, res, (token) =>
    supaFetch("/auth/v1/user", { headers: { Authorization: `Bearer ${token}` } })
  );

  if (!result.ok) return res.status(200).json({ authenticated: false });

  return res.status(200).json({
    authenticated: true,
    user: { id: result.data.id, email: result.data.email },
    factors: result.data.factors || [],
  });
}
