import { withAuth, supaFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { factorId } = req.body || {};
  if (!factorId) return res.status(400).json({ message: "Missing factorId" });

  await withAuth(req, res, (token) =>
    supaFetch(`/auth/v1/factors/${factorId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
  );
  return res.status(200).json({ status: "ok" });
}
