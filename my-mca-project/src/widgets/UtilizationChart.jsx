// src/widgets/UtilizationChart.jsx
import React, { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { tokens } from "../styles/tokens";
import { fetchWeekly } from "../api/occupancyApi";

const SENSOR_ID = "2c:cf:67:ff:f5:f4";

const fmt = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * Returns all calendar weeks of the given month as objects:
 * { label, weekNum, from: Date (Mon), to: Date (Sun) }
 *
 * Week 1 = Mon of first week that has days in the month → Sat of that week
 * Week 2 = next Mon → Sat, etc.
 * Days clamped to the month boundary (first week may start before the 1st
 * if the 1st is mid-week, but we always start from Mon).
 */
function getMonthWeeks(year, month) { // month: 0-indexed
  const weeks = [];

  // Find the Monday on or before the 1st of the month
  const firstDay = new Date(year, month, 1);
  const dowFirst = firstDay.getDay() === 0 ? 7 : firstDay.getDay(); // 1=Mon
  const monday   = new Date(year, month, 1 - (dowFirst - 1));       // may be in prev month

  let weekNum = 1;
  let cursor  = new Date(monday);

  while (true) {
    const weekStart = new Date(cursor);
    const weekEnd   = new Date(cursor);
    weekEnd.setDate(cursor.getDate() + 5); // Saturday (Mon+5)

    // Stop once weekStart is past the last day of the month
    if (weekStart.getMonth() > month || weekStart.getFullYear() > year) break;

    // Clamp display range to the month
    const displayFrom = new Date(Math.max(weekStart, new Date(year, month, 1)));
    const displayTo   = new Date(Math.min(weekEnd,   new Date(year, month + 1, 0)));

    weeks.push({
      label:   `Week ${weekNum}  (${fmt(displayFrom)} – ${fmt(displayTo)})`,
      weekNum,
      from:    weekStart,   // true Monday (may be prev month) — used for DB query
      to:      weekEnd,     // true Saturday
    });

    cursor.setDate(cursor.getDate() + 7);
    weekNum++;
    if (weekNum > 5) break; // months have at most 5 weeks
  }

  return weeks;
}

/**
 * Build dropdown: "Current Week" + all weeks of the current month.
 * Each option carries { label, from, to } for the API call.
 */
function buildWeekOptions() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();

  const monthName = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const weeks     = getMonthWeeks(year, month);

  // Identify which calendar week "today" falls in
  const todayDow   = now.getDay() === 0 ? 7 : now.getDay();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - (todayDow - 1));
  thisMonday.setHours(0, 0, 0, 0);

  const options = [
    {
      label:    "Current Week",
      from:     thisMonday,
      to:       new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 5),
      isCurrent: true,
    },
    ...weeks,
  ];

  return { options, monthName };
}

const { options: WEEK_OPTIONS, monthName: MONTH_NAME } = buildWeekOptions();

// Custom tooltip
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: tokens.panelRaised,
      border: `1px solid ${tokens.line}`,
      borderRadius: 8, padding: "10px 14px", fontSize: 12,
    }}>
      <div style={{ color: tokens.muted, marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ color: p.fill }}>{p.dataKey === "rate" ? "Avg occupancy" : "Peak occupancy"}</span>
          <span style={{ color: tokens.text, fontWeight: 600 }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

export default function UtilizationChart() {
  const [selectedIdx, setSelectedIdx] = useState(0);   // index into WEEK_OPTIONS
  const [data, setData]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  useEffect(() => {
    const opt = WEEK_OPTIONS[selectedIdx];
    if (!opt) return;
    setLoading(true);
    setError(null);

    // Convert Mon–Sat dates to ISO strings for the API
    const fromISO = opt.from.toISOString();
    const toISO   = opt.to.toISOString();

    fetch(`http://localhost:8080/api/occupancy/weekly?sensorId=${encodeURIComponent(SENSOR_ID)}&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setError("Could not load weekly data"))
      .finally(() => setLoading(false));
  }, [selectedIdx]);

  const hasData = data.some(d => d.rate > 0 || d.peak > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Dropdown ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Weekly utilization vs. peak</div>
          <div style={{ fontSize: 11, color: tokens.muted, marginTop: 2 }}>{MONTH_NAME}</div>
        </div>
        <select
          value={selectedIdx}
          onChange={e => setSelectedIdx(Number(e.target.value))}
          style={{
            background: tokens.panelRaised,
            border: `1px solid ${tokens.line}`,
            borderRadius: 7, color: tokens.text,
            fontSize: 12.5, padding: "5px 10px",
            cursor: "pointer", outline: "none",
          }}
        >
          {WEEK_OPTIONS.map((opt, i) => (
            <option key={i} value={i}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── Chart ──────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ color: tokens.faint, fontSize: 13 }}>Loading…</div>
      ) : error ? (
        <div style={{ color: tokens.alert, fontSize: 13 }}>{error}</div>
      ) : !hasData ? (
        <div style={{ color: tokens.faint, fontSize: 13 }}>
          No data recorded for this week yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barGap={3}>
            <CartesianGrid stroke={tokens.line} vertical={false} />
            <XAxis
              dataKey="day"
              stroke={tokens.faint} fontSize={11}
              tickLine={false} axisLine={{ stroke: tokens.line }}
            />
            <YAxis
              stroke={tokens.faint} fontSize={11}
              tickLine={false} axisLine={false}
              width={30} domain={[0, 100]}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={v => v === "rate" ? "Avg occupancy" : "Peak occupancy"}
            />
            <Bar dataKey="rate" fill={tokens.available} radius={[4,4,0,0]} barSize={20} />
            <Bar dataKey="peak" fill={tokens.reserved}  radius={[4,4,0,0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
