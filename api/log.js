import { withAuth, supaFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { interventionId } = req.body || {};
  if (!interventionId) return res.status(400).json({ message: "Missing interventionId" });

  const result = await withAuth(req, res, (token) =>
    supaFetch("/rest/v1/rpc/log_intervention_completion", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_intervention_id: interventionId }),
    })
  );

  if (!result.ok) return res.status(result.status || 400).json({ message: "Failed to log completion" });
  return res.status(200).json({ status: "ok" });
}
