import { supaFetch } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { email } = req.body || {};
  if (email) {
    try {
      await supaFetch("/auth/v1/recover", { method: "POST", body: JSON.stringify({ email }) });
    } catch (e) {
      /* fall through to the same response either way */
    }
  }
  return res.status(200).json({ status: "ok" });
}
