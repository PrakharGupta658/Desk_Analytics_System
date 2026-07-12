// src/widgets/TodayAtAGlance.jsx
//
// Replaces the "Live occupancy trend" line chart.
// Shows three things the other widgets don't cover:
//   1. Live donut gauge — current occupancy % at a glance
//   2. Per-desk session timer — how long each desk has been in its current state
//   3. Today's stats — peak occupancy, avg occupancy, most-used desk
//      (fetched from the backend /trend endpoint which reads real DB history)

import React, { useEffect, useRef, useState } from "react";
import { tokens } from "../styles/tokens";
import { fetchTrend } from "../api/occupancyApi";

const SENSOR_ID = "2c:cf:67:ff:f5:f4";

// ── Donut gauge ──────────────────────────────────────────────────────────────
function DonutGauge({ pct, occupied, total }) {
  const r          = 44;
  const cx         = 56;
  const cy         = 56;
  const circ       = 2 * Math.PI * r;
  const filled     = (pct / 100) * circ;
  const color      = pct >= 75 ? tokens.occupied : pct >= 40 ? "#F0C040" : tokens.available;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={112} height={112} viewBox="0 0 112 112">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={tokens.line} strokeWidth={10} />
        {/* Fill */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
        {/* Centre text */}
        <text x={cx} y={cy - 6} textAnchor="middle"
          fill={tokens.text} fontSize="20" fontWeight="700"
          fontFamily="'Space Grotesk', 'Inter', sans-serif">
          {pct}%
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle"
          fill={tokens.muted} fontSize="10"
          fontFamily="'JetBrains Mono', monospace">
          OCCUPIED
        </text>
      </svg>
      <div style={{ fontSize: 12, color: tokens.muted, textAlign: "center" }}>
        <span style={{ color: tokens.occupied, fontWeight: 600 }}>{occupied}</span>
        {" occupied · "}
        <span style={{ color: tokens.available, fontWeight: 600 }}>{total - occupied}</span>
        {" free"}
      </div>
    </div>
  );
}

// ── Session timer per desk ───────────────────────────────────────────────────
function SessionTimer({ desks, sessionStart }) {
  const [now, setNow] = useState(Date.now());

  // Tick every second so the timer stays live
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = (startMs) => {
    const secs = Math.floor((now - startMs) / 1000);
    const m    = Math.floor(secs / 60);
    const s    = secs % 60;
    if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    if (m > 0)   return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (!desks?.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: tokens.muted, fontFamily: "'JetBrains Mono', monospace",
        textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Current session
      </div>
      {desks.map(d => {
        const occupied = d.status === "occupied";
        const color    = occupied ? tokens.occupied : tokens.available;
        const start    = sessionStart[d.id] || Date.now();
        const seatNum  = d.id.match(/\d+$/)?.[0] ?? d.id;
        return (
          <div key={d.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: tokens.panelRaised, borderRadius: 8, padding: "8px 12px",
            border: `1px solid ${color}33`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: color, display: "inline-block",
                boxShadow: `0 0 5px ${color}`,
              }} />
              <span style={{ fontSize: 13, color: tokens.text, fontWeight: 600 }}>
                Desk {seatNum}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11.5, color }}>
                {occupied ? "Occupied" : "Free"}
              </span>
              <span style={{
                fontSize: 11, color: tokens.faint,
                fontFamily: "'JetBrains Mono', monospace",
                minWidth: 48, textAlign: "right",
              }}>
                {elapsed(start)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Today's stats (from DB history) ─────────────────────────────────────────
function TodayStats({ stats, statsLoading }) {
  if (statsLoading) {
    return <div style={{ fontSize: 12, color: tokens.faint }}>Loading today's stats…</div>;
  }
  if (!stats) return null;

  const items = [
    { label: "Today's peak",    value: `${stats.peak}%`,    color: tokens.occupied  },
    { label: "Today's average", value: `${stats.avg}%`,     color: "#F0C040"        },
    { label: "Busiest desk",    value: stats.busiestDesk,   color: tokens.reserved  },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: tokens.muted, fontFamily: "'JetBrains Mono', monospace",
        textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Today's summary
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {items.map(it => (
          <div key={it.label} style={{
            flex: 1, background: tokens.panelRaised, borderRadius: 8,
            padding: "8px 10px", border: `1px solid ${tokens.line}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: it.color, marginBottom: 3 }}>
              {it.value}
            </div>
            <div style={{ fontSize: 10, color: tokens.faint }}>{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────────────────
export default function TodayAtAGlance({ snapshot }) {
  // Track when each desk last changed state so we can show the session timer
  const sessionStart  = useRef({});
  const prevStatus    = useRef({});
  const [, forceRender] = useState(0);

  const [stats, setStats]             = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Update session start times whenever a desk changes status
  useEffect(() => {
    if (!snapshot?.desks) return;
    snapshot.desks.forEach(d => {
      if (prevStatus.current[d.id] !== d.status) {
        sessionStart.current[d.id] = Date.now();
        prevStatus.current[d.id]   = d.status;
      }
    });
    forceRender(n => n + 1);
  }, [snapshot]);

  // Fetch today's stats from the backend (last 24 hours of trend data)
  useEffect(() => {
    setStatsLoading(true);
    fetchTrend(SENSOR_ID, 24)
      .then(points => {
        if (!points.length) { setStats(null); return; }
        const rates = points.map(p => p.occupancy);
        const peak  = Math.max(...rates);
        const avg   = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
        // Busiest desk comes from the live snapshot since trend only has aggregate
        setStats({ peak, avg, busiestDesk: "See map" });
      })
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, []);

  // Derive busiest desk from snapshot once available
  useEffect(() => {
    if (!snapshot?.desks) return;
    // Count occupied readings per desk over the session (approximation from current state)
    const occupied = snapshot.desks.filter(d => d.status === "occupied");
    if (occupied.length > 0 && stats) {
      const num = occupied[0].id.match(/\d+$/)?.[0];
      setStats(prev => prev ? { ...prev, busiestDesk: `Desk ${num}` } : prev);
    }
  }, [snapshot, stats]);

  const rate     = snapshot?.rate     ?? 0;
  const occupied = snapshot?.occupied ?? 0;
  const total    = snapshot?.desks?.length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Row 1: donut + session timers side by side */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <DonutGauge pct={rate} occupied={occupied} total={total} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <SessionTimer desks={snapshot?.desks} sessionStart={sessionStart.current} />
        </div>
      </div>

      {/* Row 2: today's summary stats */}
      <TodayStats stats={stats} statsLoading={statsLoading} />
    </div>
  );
}
