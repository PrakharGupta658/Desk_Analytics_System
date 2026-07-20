// src/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { tokens } from "./styles/tokens";
import { useOccupancyData } from "./hooks/useOccupancyData";
import { fetchDeskTrend } from "./api/occupancyApi";

import Kpi from "./widgets/Kpi";
import Legend from "./widgets/Legend";
import FloorPlan from "./widgets/FloorPlan";
import TodayAtAGlance from "./widgets/TodayAtAGlance";
import UtilizationChart from "./widgets/UtilizationChart";
import DeskTrendChart from "./widgets/DeskTrendChart";
import PredictionWidget from "./widgets/PredictionWidget";

const SENSOR_ID = "2c:cf:67:ff:f5:f4";

export default function Dashboard() {
  const { snapshot, error, loading } = useOccupancyData(SENSOR_ID, 5000);
  const [selected, setSelected]  = useState(null);
  const [deskTrend, setDeskTrend] = useState({ seats: [], points: [] });

  useEffect(() => {
    const load = () => fetchDeskTrend(SENSOR_ID).then(setDeskTrend).catch(console.error);
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    if (!snapshot) return { occupied: 0, available: 0, rate: 0, total: 0 };
    return { occupied: snapshot.occupied, available: snapshot.available, rate: snapshot.rate, total: snapshot.desks.length };
  }, [snapshot]);

  return (
    <div style={{ minHeight: "100vh", background: tokens.ink, color: tokens.text, fontFamily: "'Inter', -apple-system, sans-serif", padding: "28px 32px 60px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: tokens.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
            Sensor {SENSOR_ID}
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: 26, fontWeight: 600, margin: 0 }}>
            Desk Occupancy &amp; Analytics
          </h1>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: tokens.faint }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: error ? tokens.alert : tokens.available, display: "inline-block", boxShadow: `0 0 6px ${error ? tokens.alert : tokens.available}` }} />
            {error ? "Sensor feed error" : "Live sensor feed"}
          </div>
          <div>{snapshot ? `Updated ${snapshot.timestamp.toLocaleTimeString()}` : loading ? "Connecting…" : "—"}</div>
        </div>
      </div>

      {error && (
        <div style={{ background: tokens.panelRaised, border: `1px solid ${tokens.alert}`, color: tokens.alert, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 20 }}>
          Couldn't reach the occupancy sensor: {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, marginBottom: 26, flexWrap: "wrap" }}>
        <Kpi label="Occupancy rate"  value={`${stats.rate}%`}    sub={`${stats.occupied} of ${stats.total} seats in use`} accent={tokens.occupied} />
        <Kpi label="Available now"   value={stats.available}      sub="Open seats on this sensor"                          accent={tokens.available} />
        <Kpi label="Occupied"        value={stats.occupied}       sub="Currently in use"                                   accent={tokens.occupied} />
        <Kpi label="Total tracked"   value={stats.total}          sub="Seats reported by this sensor" />
      </div>

      {/* Top grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18, marginBottom: 18 }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={cardTitle}>Live seat map</div>
            <Legend />
          </div>
          <FloorPlan desks={snapshot?.desks || []} onSelect={setSelected} selectedId={selected?.id} />
          <div style={cardFootnote}>{selected ? `${selected.label} — ${selected.status}` : "Select a desk to inspect status"}</div>
        </div>
        <div style={card}>
          <div style={cardTitle}>Today at a Glance</div>
          <TodayAtAGlance snapshot={snapshot} />
        </div>
      </div>

      {/* Middle grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        <div style={card}>
          <UtilizationChart />
        </div>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <div style={cardTitle}>Desk-wise status today</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: tokens.faint }}>Since midnight IST · updates every 60s</div>
          </div>
          <DeskTrendChart seats={deskTrend.seats} points={deskTrend.points} />
        </div>
      </div>

      {/* Prediction + AI — full width */}
      <div style={{ ...card, minHeight: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <div style={{ ...cardTitle, fontSize: 15 }}>Occupancy Prediction &amp; AI Assistant</div>
          <div style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", color: tokens.faint }}>
            Historical pattern model · Claude AI chat
          </div>
        </div>
        <PredictionWidget />
      </div>

    </div>
  );
}

const card = { background: tokens.panel, border: `1px solid ${tokens.line}`, borderRadius: 12, padding: 20 };
const cardTitle = { fontSize: 13.5, fontWeight: 600, marginBottom: 16 };
const cardFootnote = { marginTop: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: tokens.muted, minHeight: 18 };
