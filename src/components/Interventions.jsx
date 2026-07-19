import React, { useState, useEffect } from "react";

/* ---------- Interventions library ---------- */

export const INTERVENTIONS = [
  {
    id: "paced-breathing",
    modalities: ["CBT", "DBT"],
    title: "Paced Breathing",
    duration: "~1 min",
    blurb: "Slow your exhale to bring your heart rate down.",
    type: "breathing",
    steps: [
      "A slower exhale than inhale signals safety to your nervous system. Follow the circle: breathe in as it expands, out as it contracts.",
    ],
  },
  {
    id: "tipp",
    modalities: ["DBT"],
    title: "TIPP",
    duration: "~3 min",
    blurb: "For genuinely acute distress, right after a hard call.",
    type: "steps",
    steps: [
      "T — Temperature. Splash cold water on your face, or hold something cold. This triggers a reflex that drops your heart rate fast.",
      "I — Intense Exercise. If you can, do 30-60 seconds of something physical — push-ups, running in place. Burn off the surge.",
      "P — Paced Breathing. Slow your exhale so it's longer than your inhale. A few rounds is enough.",
      "P — Paired Muscle Relaxation. Tense one muscle group hard for 5 seconds, then release. Work through your body, one group at a time.",
    ],
  },
  {
    id: "grounding-54321",
    modalities: ["DBT", "ACT"],
    title: "5-4-3-2-1 Grounding",
    duration: "~2 min",
    blurb: "Interrupt a spiral and land back in the present.",
    type: "steps",
    steps: [
      "Name 5 things you can see around you right now.",
      "Name 4 things you can physically feel — the ground, your clothes, the air.",
      "Name 3 things you can hear.",
      "Name 2 things you can smell.",
      "Name 1 thing you can taste, or one thing you appreciate about yourself right now.",
    ],
  },
  {
    id: "stop-skill",
    modalities: ["DBT"],
    title: "STOP Skill",
    duration: "~1 min",
    blurb: "For when you're about to react and shouldn't.",
    type: "steps",
    steps: [
      "S — Stop. Don't react. Just pause exactly where you are.",
      "T — Take a step back. Take a breath. Create space, physically or mentally, before you respond.",
      "O — Observe. What's happening, inside and around you, right now? Just notice — don't judge it.",
      "P — Proceed mindfully. Ask: what response actually fits this moment, and who I want to be?",
    ],
  },
  {
    id: "quick-thought-check",
    modalities: ["CBT"],
    title: "Quick Thought Check",
    duration: "~2 min",
    blurb: "A condensed thought record for a shift, not a therapy session.",
    type: "steps",
    steps: [
      "What's the thought that's stuck with you right now?",
      "What's the evidence this thought is completely true? What's the evidence against it?",
      "If a partner or colleague had this exact thought after this exact shift, what would you tell them?",
      "What's a more balanced way to see it?",
    ],
  },
  {
    id: "spot-the-distortion",
    modalities: ["CBT"],
    title: "Spot The Distortion",
    duration: "~1 min",
    blurb: "A quick reference for recognizing unhelpful thinking patterns.",
    type: "steps",
    steps: [
      "All-or-Nothing: \"I completely botched that call.\" More accurate: \"That part didn't go how I wanted.\"",
      "Catastrophizing: \"This is going to end my career.\" More accurate: \"This was a bad moment, not a verdict.\"",
      "Mind Reading: \"My sergeant thinks I'm weak for asking for help.\" More accurate: \"I don't actually know what they think.\"",
      "Should Statements: \"I should never feel rattled by this job.\" More accurate: \"It makes sense that this affected me.\"",
      "Discounting the Positive: \"Anyone would've made that same good call.\" More accurate: \"That was a good call, and I made it.\"",
    ],
  },
  {
    id: "name-it",
    modalities: ["ACT"],
    title: "Name It",
    duration: "~1 min",
    blurb: "Create distance from a thought that's stuck.",
    type: "steps",
    steps: [
      "Notice the thought that's bothering you.",
      "Now say it to yourself starting with \"I'm having the thought that...\" — for example, \"I'm having the thought that I failed.\"",
      "Notice: the thought is something your mind is doing, not a fact about you. You can hold it loosely instead of fusing with it.",
    ],
  },
  {
    id: "radical-acceptance",
    modalities: ["DBT"],
    title: "Radical Acceptance",
    duration: "~2 min",
    blurb: "For something that already happened and can't be changed.",
    type: "steps",
    steps: [
      "Something happened that you wish hadn't. Acceptance doesn't mean you're okay with it — it means you stop fighting the fact that it happened.",
      "Say to yourself: \"This happened. Fighting that fact only adds more pain on top of what's already there.\"",
      "Ask: what's one thing within my control right now, given that this is reality?",
    ],
  },
  {
    id: "values-checkin",
    modalities: ["ACT"],
    title: "Values Check-In",
    duration: "~2 min",
    blurb: "For a low-motivation day — reconnect with what matters.",
    type: "steps",
    steps: [
      "Zoom out for a second. What matters to you in how you show up at this job — not what you're supposed to say, what actually matters to you?",
      "Given today, what's one small action in the next hour that fits that?",
      "That's it. Small and doable beats big and abandoned.",
    ],
  },
];

export const INTERVENTION_DOMAINS = [
  { id: "CBT", label: "CBT", full: "Cognitive Behavioral Therapy" },
  { id: "DBT", label: "DBT", full: "Dialectical Behavior Therapy" },
  { id: "ACT", label: "ACT", full: "Acceptance & Commitment Therapy" },
];

/* ---------- Breathing pacer ---------- */

export function BreathingPacer({ onCycleComplete }) {
  const [phase, setPhase] = useState("inhale"); // 'inhale' | 'hold' | 'exhale'
  const [cycles, setCycles] = useState(0);
  const PHASE_MS = { inhale: 4000, hold: 1000, exhale: 6000 };

  useEffect(() => {
    const t = setTimeout(() => {
      if (phase === "inhale") setPhase("hold");
      else if (phase === "hold") setPhase("exhale");
      else {
        setPhase("inhale");
        setCycles((c) => {
          const next = c + 1;
          if (onCycleComplete) onCycleComplete(next);
          return next;
        });
      }
    }, PHASE_MS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  const scale = phase === "inhale" ? 1 : phase === "hold" ? 1 : 0.55;
  const label = phase === "inhale" ? "IN" : phase === "hold" ? "HOLD" : "OUT";
  const duration = phase === "inhale" ? 4000 : phase === "hold" ? 200 : 6000;

  return (
    <div className="cs-breathe-wrap">
      <div
        className="cs-breathe-circle"
        style={{ transform: `scale(${scale})`, transitionDuration: `${duration}ms` }}
      >
        <span>{label}</span>
      </div>
      <div className="cs-breathe-cycles">{cycles} cycles</div>
    </div>
  );
}

/* ---------- Interventions view (library list + active player) ----------
   Props:
   - completionCounts: { [interventionId]: number }
   - openDomains: { [domainId]: boolean }
   - toggleDomain(domainId)
   - activeInterventionId: string | null
   - interventionStepIndex: number
   - openIntervention(id)
   - closeIntervention()
   - advanceIntervention(totalSteps)
   - completeIntervention(): marks the active intervention done (called by the
     breathing pacer's own DONE button, since it has no step index to advance)
   - setBreathingCycles(n): forwarded to the pacer's onCycleComplete
------------------------------------------------------------------------- */

export default function Interventions({
  completionCounts,
  openDomains,
  toggleDomain,
  activeInterventionId,
  interventionStepIndex,
  openIntervention,
  closeIntervention,
  advanceIntervention,
  completeIntervention,
  setBreathingCycles,
}) {
  if (!activeInterventionId) {
    return (
      <div className="cs-card">
        <div className="cs-eyebrow">CARE PATHWAYS</div>
        <h1 className="cs-h1">Interventions</h1>
        <p className="cs-sub">
          Short, evidence-informed exercises drawn from CBT, DBT, and ACT. Nothing
          you do here is saved — only that you did it.
        </p>
        {INTERVENTION_DOMAINS.map((domain) => {
          const isOpen = !!openDomains[domain.id];
          const items = INTERVENTIONS.filter((iv) => iv.modalities.includes(domain.id));
          return (
            <div key={domain.id} className="cs-domain-group">
              <button
                className="cs-domain-header"
                onClick={() => toggleDomain(domain.id)}
                aria-expanded={isOpen}
              >
                <div>
                  <div className="cs-domain-label">{domain.label}</div>
                  <div className="cs-domain-full">{domain.full}</div>
                </div>
                <span className={`cs-domain-caret ${isOpen ? "open" : ""}`}>▾</span>
              </button>
              {isOpen && (
                <div className="cs-domain-body">
                  {items.map((iv) => (
                    <button
                      key={iv.id}
                      className="cs-intervention-card"
                      onClick={() => openIntervention(iv.id)}
                    >
                      <div className="cs-intervention-card-top">
                        <span className="cs-intervention-title">{iv.title}</span>
                        <span className="cs-intervention-duration">{iv.duration}</span>
                      </div>
                      <div className="cs-intervention-blurb">{iv.blurb}</div>
                      <div className="cs-intervention-modality">
                        {iv.modalities.join(" / ")}
                        {completionCounts[iv.id] ? ` · Done ${completionCounts[iv.id]}×` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const iv = INTERVENTIONS.find((x) => x.id === activeInterventionId);
  if (!iv) return null;
  const isLast = interventionStepIndex + 1 >= iv.steps.length;

  return (
    <div className="cs-card">
      <div className="cs-eyebrow">
        {iv.title.toUpperCase()} · {iv.modalities.join(" / ")}
      </div>
      {iv.type === "breathing" ? (
        <>
          <p className="cs-sub">{iv.steps[0]}</p>
          <BreathingPacer onCycleComplete={(n) => setBreathingCycles(n)} />
          <button
            className="cs-begin-btn cs-full-width"
            onClick={() => {
              completeIntervention();
              closeIntervention();
            }}
          >
            DONE
          </button>
          <button className="cs-secondary-btn" onClick={closeIntervention}>
            Back to list
          </button>
        </>
      ) : (
        <>
          <div className="cs-progress" style={{ marginBottom: 24 }}>
            {iv.steps.map((_, i) => (
              <div className="cs-seg" key={i}>
                <div className={`cs-seg-fill ${i < interventionStepIndex ? "filled" : ""}`} />
              </div>
            ))}
          </div>
          <p className="cs-intervention-step-text">{iv.steps[interventionStepIndex]}</p>
          <button
            className="cs-begin-btn cs-full-width"
            onClick={() => advanceIntervention(iv.steps.length)}
          >
            {isLast ? "DONE" : "NEXT"}
          </button>
          <button className="cs-secondary-btn" onClick={closeIntervention}>
            Back to list
          </button>
        </>
      )}
    </div>
  );
}
