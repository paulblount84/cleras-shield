import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getCondition, tierOf } from "../scoring";

function TrendDot(props) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null || payload.pct == null) return null;
  const color = getCondition(payload.pct).hex;
  const delay = `${((index || 0) % 5) * 0.25}s`;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={3.5}
        className="cs-trend-pulse-ring"
        style={{ fill: color, animationDelay: delay }}
      />
      <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#0A0D12" strokeWidth={1} />
    </g>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length || payload[0].value == null) return null;
  const p = payload[0].payload;
  const cond = getCondition(p.pct);
  return (
    <div
      style={{
        background: "#171C24",
        border: "1px solid #232B35",
        borderRadius: 3,
        padding: "8px 10px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 11,
      }}
    >
      <div style={{ color: "#7E8896", marginBottom: 4 }}>{label}</div>
      <div style={{ color: cond.hex, fontWeight: 600 }}>
        {p.pct} · {cond.code}
      </div>
    </div>
  );
}

/* ---------- Dashboard (14-day trend) ----------
   Props:
   - loadingHistory: boolean
   - present14: array of { key, entry } for days that have a check-in
   - streak: number
   - last7: array of { key, entry } for the last 7 days (used for the day chips)
   - chartData: array of { label, pct } for the area chart
   - dist: { green, amber, red } counts over the last 14 days
   - avg: { sleep, stress, recovery } averages over present14
   - incidentCount14: number of flagged incidents in the last 14 days
------------------------------------------------------------------------- */

export default function Dashboard({
  loadingHistory,
  present14,
  streak,
  last7,
  chartData,
  dist,
  avg,
  incidentCount14,
}) {
  return (
    <div className="cs-card">
      <div className="cs-eyebrow">14-DAY TREND</div>

      {loadingHistory ? (
        <p className="cs-sub">Loading history from Supabase…</p>
      ) : present14.length === 0 ? (
        <p className="cs-sub">
          No check-ins yet. Complete today's check-in to start your trend.
        </p>
      ) : (
        <>
          <div className="cs-streak-row">
            <div>
              <div className="cs-streak-num">{streak}</div>
              <div className="cs-streak-label">DAY STREAK</div>
            </div>
            <div className="cs-day-chips">
              {last7.map((d) => (
                <div
                  key={d.key}
                  className="cs-day-chip"
                  style={{ background: d.entry ? getCondition(d.entry.pct).hex : "transparent" }}
                  title={d.key}
                />
              ))}
            </div>
          </div>

          <div className="cs-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="csFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8833F" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#E8833F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#232B35" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#7E8896", fontSize: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
                  axisLine={{ stroke: "#232B35" }}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#7E8896", fontSize: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={26}
                />
                <Tooltip content={<TrendTooltip />} />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="#E8833F"
                  strokeWidth={2}
                  fill="url(#csFill)"
                  dot={<TrendDot />}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="cs-condition-dist">
            <div className="cs-dist-chip" style={{ color: "var(--sig-green)" }}>
              HIGH · {dist.green}
            </div>
            <div className="cs-dist-chip" style={{ color: "var(--sig-amber)" }}>
              MODERATE · {dist.amber}
            </div>
            <div className="cs-dist-chip" style={{ color: "var(--sig-red)" }}>
              LOW · {dist.red}
            </div>
          </div>

          <div className="cs-stats-grid">
            <div className="cs-stat-card" style={{ borderColor: tierOf(avg.sleep).color }}>
              <div className="cs-stat-value" style={{ color: tierOf(avg.sleep).color }}>
                {avg.sleep}
              </div>
              <div className="cs-stat-tier" style={{ color: tierOf(avg.sleep).color }}>
                {tierOf(avg.sleep).label}
              </div>
              <div className="cs-stat-label">AVG SLEEP</div>
            </div>
            <div className="cs-stat-card" style={{ borderColor: tierOf(avg.stress).color }}>
              <div className="cs-stat-value" style={{ color: tierOf(avg.stress).color }}>
                {100 - avg.stress}
              </div>
              <div className="cs-stat-tier" style={{ color: tierOf(avg.stress).color }}>
                {tierOf(avg.stress, true).label}
              </div>
              <div className="cs-stat-label">AVG STRESS</div>
            </div>
            <div className="cs-stat-card" style={{ borderColor: tierOf(avg.recovery).color }}>
              <div className="cs-stat-value" style={{ color: tierOf(avg.recovery).color }}>
                {avg.recovery}
              </div>
              <div className="cs-stat-tier" style={{ color: tierOf(avg.recovery).color }}>
                {tierOf(avg.recovery).label}
              </div>
              <div className="cs-stat-label">AVG RECOVERY</div>
            </div>
          </div>

          {incidentCount14 > 0 && (
            <div className="cs-incident-banner" style={{ marginTop: 18, marginBottom: 0 }}>
              <div className="cs-incident-dot" />
              <div className="cs-incident-text">
                <b>
                  {incidentCount14} CRITICAL INCIDENT{incidentCount14 > 1 ? "S" : ""} LOGGED
                </b>
                In the last 14 days.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
