// src/widgets/PredictionWidget.jsx
import React, { useState, useEffect } from "react";
import { tokens } from "../styles/tokens";

const ML_API   = "http://localhost:5001";
const SEAT_NUMS = [1, 2, 3, 4];

const DAYS = [
  { label: "Mon", value: 0 },
  { label: "Tue", value: 1 },
  { label: "Wed", value: 2 },
  { label: "Thu", value: 3 },
  { label: "Fri", value: 4 },
  { label: "Sat", value: 5 },
  { label: "Sun", value: 6 },
];

export default function PredictionWidget() {
  const today   = new Date();
  const todayDow = today.getDay() === 0 ? 6 : today.getDay() - 1;

  const [selDay,  setSelDay]  = useState(todayDow);
  const [selHour, setSelHour] = useState(
    Math.min(18, Math.max(10, today.getHours()))
  );
  const [preds,   setPreds]   = useState([]);
  const [hours,   setHours]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const seatReqs = SEAT_NUMS.map(n => ({
      seat_num: n, hour: selHour, minute: 0, day_of_week: selDay,
    }));

    Promise.all([
      fetch(`${ML_API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: seatReqs }),
      }).then(r => r.json()),
      fetch(`${ML_API}/predict/day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day_of_week: selDay, seat_nums: SEAT_NUMS }),
      }).then(r => r.json()),
    ])
      .then(([predRes, dayRes]) => {
        setPreds(predRes.predictions || []);
        // Only show 10am–7pm in the bar chart
        setHours((dayRes.hours || []).filter(h => h.hour >= 10 && h.hour <= 19));
      })
      .catch(() => setError("ML service offline — run: python predict_service.py"))
      .finally(() => setLoading(false));
  }, [selDay, selHour]);

  const freePreds     = preds.filter(p => p.predicted === 0);
  const occupiedPreds = preds.filter(p => p.predicted === 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: tokens.panelRaised,
          border: `1px solid ${tokens.alert}`,
          borderRadius: 8, padding: "10px 14px",
          fontSize: 12.5, color: tokens.alert,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Selectors row ────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end" }}>

        {/* Day pills */}
        <div>
          <div style={labelStyle}>Select Day</div>
          <div style={{ display: "flex", gap: 6 }}>
            {DAYS.map(d => (
              <button key={d.value} onClick={() => setSelDay(d.value)} style={{
                padding: "6px 13px", borderRadius: 20, cursor: "pointer",
                border: `1px solid ${selDay === d.value ? tokens.reserved : tokens.line}`,
                background: selDay === d.value ? tokens.reserved + "33" : "transparent",
                color: selDay === d.value ? tokens.reserved : tokens.muted,
                fontWeight: selDay === d.value ? 700 : 400,
                fontSize: 12.5,
                transition: "all 150ms",
              }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hour slider 10–19 */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={labelStyle}>
            Select Time —&nbsp;
            <span style={{ color: tokens.text, fontWeight: 600 }}>
              {String(selHour).padStart(2,"0")}:00
              {selHour < 12 ? " AM" : " PM"}
            </span>
          </div>
          <input
            type="range" min={10} max={19} value={selHour}
            onChange={e => setSelHour(Number(e.target.value))}
            style={{ width: "100%", accentColor: tokens.reserved, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: tokens.faint, fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>
            <span>10:00 AM</span>
            <span>01:00 PM</span>
            <span>04:00 PM</span>
            <span>07:00 PM</span>
          </div>
        </div>
      </div>

      {/* ── Summary headline ─────────────────────────────────────────── */}
      {!loading && preds.length > 0 && (
        <div style={{
          background: tokens.panelRaised,
          borderRadius: 10, padding: "14px 18px",
          border: `1px solid ${tokens.line}`,
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: freePreds.length > 0 ? tokens.available : tokens.occupied, lineHeight: 1 }}>
              {freePreds.length}
            </span>
            <span style={{ fontSize: 14, color: tokens.muted }}>
              of {SEAT_NUMS.length} desks free
            </span>
          </div>
          <div style={{ width: 1, height: 36, background: tokens.line }} />
          <div style={{ fontSize: 13, color: tokens.muted, lineHeight: 1.6 }}>
            <strong style={{ color: tokens.text }}>{DAYS[selDay]?.label}</strong> at{" "}
            <strong style={{ color: tokens.text }}>{String(selHour).padStart(2,"0")}:00{selHour < 12 ? " AM" : " PM"}</strong>
            {freePreds.length > 0
              ? <> — Best option: <strong style={{ color: tokens.available }}>{freePreds.sort((a,b) => a.probability - b.probability)[0]?.seat_label}</strong></>
              : <> — <span style={{ color: tokens.occupied }}>All desks predicted occupied</span></>
            }
          </div>
        </div>
      )}

      {/* ── Seat cards ───────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ color: tokens.faint, fontSize: 13 }}>Predicting…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {preds.map(p => {
            const isFree   = p.predicted === 0;
            const barColor = isFree ? tokens.available : tokens.occupied;
            return (
              <div key={p.seat_num} style={{
                background: tokens.panelRaised, borderRadius: 10,
                padding: "14px 16px",
                border: `1px solid ${isFree ? tokens.available + "44" : tokens.occupied + "44"}`,
              }}>
                {/* Seat label */}
                <div style={{ fontSize: 11.5, color: tokens.muted, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                  {p.seat_label}
                </div>

                {/* Status */}
                <div style={{ fontSize: 20, fontWeight: 700, color: barColor, marginBottom: 10 }}>
                  {isFree ? "🟢 Free" : "🔴 Busy"}
                </div>

                {/* Probability bar */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: tokens.muted, marginBottom: 4 }}>
                    <span>Occupied chance</span>
                    <span style={{ color: tokens.text, fontWeight: 600 }}>{p.probability_pct}%</span>
                  </div>
                  <div style={{ background: tokens.line, borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{
                      width: `${p.probability_pct}%`, height: "100%",
                      background: barColor, borderRadius: 4,
                      transition: "width 400ms ease",
                    }} />
                  </div>
                </div>

                {/* Confidence badge */}
                <div style={{
                  display: "inline-block",
                  fontSize: 10.5, padding: "2px 8px", borderRadius: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: p.confidence === "HIGH"   ? tokens.available + "22" :
                               p.confidence === "MEDIUM" ? "#F0C04022" : tokens.faint + "22",
                  color:       p.confidence === "HIGH"   ? tokens.available :
                               p.confidence === "MEDIUM" ? "#F0C040" : tokens.faint,
                  border: `1px solid ${
                               p.confidence === "HIGH"   ? tokens.available + "44" :
                               p.confidence === "MEDIUM" ? "#F0C04044" : tokens.faint + "44"}`,
                }}>
                  {p.confidence} confidence
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Hourly pattern bar chart ──────────────────────────────────── */}
      {hours.length > 0 && (
        <div style={{ background: tokens.panelRaised, borderRadius: 10, padding: "16px 18px", border: `1px solid ${tokens.line}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            Hourly Pattern — {DAYS[selDay]?.label}
            <span style={{ fontSize: 11, fontWeight: 400, color: tokens.muted, marginLeft: 8 }}>average across all desks</span>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64 }}>
            {hours.map(h => {
              const avg      = Math.round(SEAT_NUMS.reduce((s, n) => s + (h[`Seat ${n}`] || 0), 0) / SEAT_NUMS.length);
              const isActive = h.hour === selHour;
              const color    = avg >= 70 ? tokens.occupied : avg >= 40 ? "#F0C040" : tokens.available;
              return (
                <div
                  key={h.hour}
                  onClick={() => setSelHour(h.hour)}
                  title={`${h.label}: ${avg}% avg occupied`}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
                >
                  <div style={{ fontSize: 10, color: tokens.muted, fontWeight: isActive ? 700 : 400, color: isActive ? tokens.text : tokens.faint }}>
                    {avg}%
                  </div>
                  <div style={{
                    width: "100%",
                    height: `${Math.max((avg / 100) * 44, 4)}px`,
                    background: color,
                    borderRadius: "4px 4px 0 0",
                    opacity: isActive ? 1 : 0.55,
                    border: isActive ? `2px solid ${tokens.text}` : "none",
                    boxSizing: "border-box",
                    transition: "height 300ms",
                  }} />
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {hours.map(h => (
              <div key={h.hour} style={{
                flex: 1, textAlign: "center", fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: h.hour === selHour ? tokens.text : tokens.faint,
                fontWeight: h.hour === selHour ? 700 : 400,
              }}>
                {h.hour <= 12 ? `${h.hour}am` : `${h.hour - 12}pm`}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: tokens.faint }}>
            Click a bar to jump to that hour
          </div>
        </div>
      )}

      {/* ── Footer note ──────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: tokens.faint, fontFamily: "'JetBrains Mono', monospace", borderTop: `1px solid ${tokens.line}`, paddingTop: 10 }}>
        Random Forest model · 91.5% accuracy · trained on your sensor data
      </div>

    </div>
  );
}

const labelStyle = {
  fontSize: 11,
  color: tokens.muted,
  marginBottom: 8,
  fontFamily: "'JetBrains Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
