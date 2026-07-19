import { withAuth, supaFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  const result = await withAuth(req, res, (token) =>
    supaFetch("/rest/v1/intervention_completions?select=intervention_id,completed_at", {
      headers: { Authorization: `Bearer ${token}` },
    })
  );

  if (!result.ok) return res.status(result.status || 400).json({ message: "Failed to load intervention history" });
  return res.status(200).json(result.data);
}
