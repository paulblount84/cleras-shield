import { parseCookies, supaFetch, clearSessionCookies } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const cookies = parseCookies(req);
  const accessToken = cookies.cs_at;

  // Clear cookies first — logout succeeds from the client's perspective even
  // if the Supabase revocation call below fails for any reason.
  clearSessionCookies(res);

  if (accessToken) {
    try {
      await supaFetch("/auth/v1/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) {
      /* best-effort */
    }
  }
  return res.status(200).json({ status: "ok" });
}
