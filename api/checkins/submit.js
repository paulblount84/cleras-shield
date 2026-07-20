import { withAuth, supaFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { sleepScore, stressScore, recoveryScore, incidentLabel, checkDate } = req.body || {};

  const result = await withAuth(req, res, (token) =>
    supaFetch("/rest/v1/rpc/submit_check_in", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        p_sleep_score: sleepScore,
        p_stress_score: stressScore,
        p_recovery_score: recoveryScore,
        p_incident_label: incidentLabel,
        p_check_date: checkDate,
      }),
    })
  );

  if (!result.ok) {
    const raw = (result.data && (result.data.message || result.data.hint)) || "";
    if (raw.includes("24 hours")) {
      return res.status(409).json({ message: "You can check in again 24 hours after your last check-in." });
    }
    return res.status(result.status || 400).json({ message: "Could not save your check-in. Please try again." });
  }

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return res.status(200).json(row);
}
