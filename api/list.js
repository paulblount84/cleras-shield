import { withAuth, supaFetch } from "../_lib/supabase.js";

const CHECK_IN_COLUMNS =
  "check_date,readiness_index,condition,sleep_score,stress_score,recovery_score,incident_flag,incident_label,created_at";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });
  const from = req.query.from;
  if (!from) return res.status(400).json({ message: "Missing from" });

  const result = await withAuth(req, res, (token) =>
    supaFetch(`/rest/v1/check_ins?select=${CHECK_IN_COLUMNS}&check_date=gte.${from}&order=check_date.asc`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  );

  if (!result.ok) return res.status(result.status || 400).json({ message: "Failed to load check-ins" });
  return res.status(200).json(result.data);
}
