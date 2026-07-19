import React from "react";

export default function Gauge({ pct, color }) {
  const r = 80;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - pct / 100);

  return (
    <svg viewBox="0 0 200 118" className="gauge-svg">
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke="var(--panel-border)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1), stroke 400ms" }}
      />
    </svg>
  );
}
