/* ---------- Scoring model ---------- */

export const WEIGHTS = { sleep: 0.4, stress: 0.3, recovery: 0.3 };

export const QUESTIONS = [
  {
    key: "sleep",
    label: "SLEEP",
    prompt: "How much sleep did you get last night?",
    options: [
      { label: "Under 4h", sub: "Barely any rest", value: 20 },
      { label: "4–5h", sub: "Short", value: 45 },
      { label: "6–7h", sub: "Reasonable", value: 75 },
      { label: "8h+", sub: "Full night", value: 100 },
    ],
  },
  {
    key: "stress",
    label: "STRESS",
    prompt: "How would you rate your stress level right now?",
    options: [
      { label: "Overwhelming", sub: "Hard to manage", value: 15 },
      { label: "High", sub: "Noticeable strain", value: 40 },
      { label: "Manageable", sub: "Under control", value: 70 },
      { label: "Low", sub: "Steady", value: 100 },
    ],
  },
  {
    key: "recovery",
    label: "RECOVERY",
    prompt: "How recovered do you feel going into today?",
    options: [
      { label: "Depleted", sub: "Running on empty", value: 15 },
      { label: "Low", sub: "Still catching up", value: 40 },
      { label: "Moderate", sub: "Mostly recharged", value: 70 },
      { label: "Fully recovered", sub: "Ready to go", value: 100 },
    ],
  },
];

export const INCIDENT_QUESTION = {
  key: "incident",
  label: "INCIDENT",
  prompt: "Any critical incident exposure on your last shift?",
  options: [
    { label: "Critical incident", sub: "High-severity call", flag: true },
    { label: "Minor call", sub: "Routine stress", flag: false },
    { label: "None", sub: "No exposure", flag: false },
  ],
};

export const ALL_STEPS = [QUESTIONS[0], QUESTIONS[1], INCIDENT_QUESTION, QUESTIONS[2]];

// Tiers a raw 0-100 score using the same thresholds as readiness. For stress,
// pass invertLabel=true: the underlying score is stored "inverted" (100 =
// calm, 15 = overwhelming) to feed the weighted formula correctly, but the
// displayed number is un-inverted (100 - score) so a bigger number reads as
// "more stressed" — invertLabel keeps the HIGH/LOW word matching that.
export function tierOf(raw, invertLabel) {
  if (raw >= 75) return { color: "var(--sig-green)", label: invertLabel ? "LOW" : "HIGH" };
  if (raw >= 45) return { color: "var(--sig-amber)", label: "MODERATE" };
  return { color: "var(--sig-red)", label: invertLabel ? "HIGH" : "LOW" };
}

export function getCondition(pct) {
  if (pct >= 75)
    return {
      code: "HIGH READINESS",
      dbValue: "green",
      color: "var(--sig-green)",
      hex: "#3FB871",
      headline: "Ready for duty.",
      note: "Your indicators are steady. Standard vigilance.",
    };
  if (pct >= 45)
    return {
      code: "MODERATE READINESS",
      dbValue: "amber",
      color: "var(--sig-amber)",
      hex: "#E8833F",
      headline: "Elevated load.",
      note: "Recovery is lagging. Pace yourself and check in with a peer if it persists.",
    };
  return {
    code: "LOW READINESS",
    dbValue: "red",
    color: "var(--sig-red)",
    hex: "#D6484A",
    headline: "Readiness compromised.",
    note: "Multiple factors are stacked against you today. Talk to your supervisor or peer support before shift.",
  };
}

export function suggestedInterventionIds(pct, incidentFlag) {
  if (incidentFlag) return ["tipp", "radical-acceptance"];
  if (pct < 45) return ["paced-breathing", "quick-thought-check"];
  if (pct < 75) return ["stop-skill", "values-checkin"];
  return [];
}

export const ROLE_OPTIONS = [
  "Police Officer",
  "Sheriff Deputy",
  "Public Safety Dispatcher",
  "Custody Officer",
  "Public Service Officer",
  "Community Service Officer",
  "Police Cadet",
];
