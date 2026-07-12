// src/widgets/DeskTrendChart.jsx
import React, { useState } from "react";
import { tokens } from "../styles/tokens";

/**
 * Desk-wise hourly occupancy heatmap for today.
 * Raw poll points are bucketed into whole hours (e.g. 09:00, 10:00 …).
 * A cell is amber if the desk was occupied for ≥50% of that hour's polls,
 * teal otherwise. Empty hours (no data yet) are shown as a dim placeholder.
 */

// Build an array of hour-bucket objects from raw poll points
function bucketByHour(seats, points) {
  // Group points by "HH" (the hour string)
  const buckets = {}; // { "09": { "Seat 1": [0,1,1,...], ... }, ... }

  points.forEach((pt) => {
    const hour = pt.time.split(":")[0]; // "09" from "09:32"
    if (!buckets[hour]) {
      buckets[hour] = {};
      seats.forEach((s) => (buckets[hour][s] = []));
    }
    seats.forEach((s) => {
      buckets[hour][s].push(pt[s] ?? 0);
    });
  });

  // Convert to sorted array of { hour: "09:00", "Seat 1": 1|0|null, ... }
  return Object.keys(buckets)
    .sort()
    .map((h) => {
      const row = { hour: `${h}:00` };
      seats.forEach((s) => {
        const vals = buckets[h][s];
        if (!vals || vals.length === 0) {
          row[s] = null; // no data
        } else {
          const occupiedCount = vals.filter((v) => v === 1).length;
          row[s] = occupiedCount / vals.length >= 0.5 ? 1 : 0;
        }
      });
      return row;
    });
}

export default function DeskTrendChart({ seats = [], points = [] }) {
  const [tooltip, setTooltip] = useState(null); // { seat, hour, value, x, y }

  if (!points.length || !seats.length) {
    return (
      <div style={{ color: tokens.faint, fontSize: 13, paddingTop: 8 }}>
        No data yet for today — collecting live readings…
      </div>
    );
  }

  const hourly = bucketByHour(seats, points);

  // Latest known state per seat (from last raw point)
  const latest = points[points.length - 1] || {};

  return (
    <div style={{ width: "100%", position: "relative" }}>

      {/* ── Legend ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 18, marginBottom: 16, fontSize: 12, color: tokens.muted }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-block", width: 11, height: 11, borderRadius: 2,
            background: tokens.occupied,
          }} />
          Occupied ≥ 50% of hour
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-block", width: 11, height: 11, borderRadius: 2,
            background: tokens.available + "55",
            border: `1px solid ${tokens.available}66`,
          }} />
          Free
        </div>
      </div>

      {/* ── Heatmap grid ────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {seats.map((seat) => (
          <div key={seat} style={{ display: "flex", alignItems: "center", gap: 10 }}>

            {/* Seat label */}
            <div style={{
              width: 46,
              flexShrink: 0,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: tokens.muted,
              textAlign: "right",
            }}>
              {seat}
            </div>

            {/* Hour cells */}
            <div style={{ display: "flex", gap: 3, flex: 1 }}>
              {hourly.map((bucket) => {
                const val = bucket[seat];
                const isEmpty = val === null;
                const occupied = val === 1;
                const bg = isEmpty
                  ? tokens.line
                  : occupied
                  ? tokens.occupied
                  : tokens.available + "44";
                const border = isEmpty
                  ? "none"
                  : occupied
                  ? "none"
                  : `1px solid ${tokens.available}55`;

                return (
                  <div
                    key={bucket.hour}
                    onMouseEnter={(e) => {
                      setTooltip({
                        seat,
                        hour: bucket.hour,
                        value: isEmpty ? "No data" : occupied ? "Occupied" : "Free",
                        color: occupied ? tokens.occupied : tokens.available,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      flex: 1,
                      height: 32,
                      borderRadius: 4,
                      background: bg,
                      border,
                      cursor: "default",
                      transition: "filter 120ms",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.25)")}
                    onMouseOut={(e) => (e.currentTarget.style.filter = "brightness(1)")}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Hour labels on X axis */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 46, flexShrink: 0 }} />
          <div style={{ display: "flex", flex: 1, gap: 3 }}>
            {hourly.map((bucket, i) => (
              <div
                key={bucket.hour}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 9.5,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: tokens.faint,
                  overflow: "hidden",
                  // only show every other label if there are many hours
                  visibility: hourly.length > 12 && i % 2 !== 0 ? "hidden" : "visible",
                }}
              >
                {bucket.hour.replace(":00", "")}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Floating tooltip ────────────────────────────────────── */}
      {tooltip && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: tokens.panelRaised,
          border: `1px solid ${tokens.line}`,
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 12,
          pointerEvents: "none",
          zIndex: 999,
          minWidth: 140,
        }}>
          <div style={{ color: tokens.muted, fontFamily: "'JetBrains Mono', monospace", marginBottom: 5 }}>
            {tooltip.hour}
          </div>
          <div style={{ color: tokens.text, marginBottom: 3 }}>{tooltip.seat}</div>
          <div style={{
            color: tooltip.value === "No data" ? tokens.faint : tooltip.color,
            fontWeight: 600,
          }}>
            {tooltip.value}
          </div>
        </div>
      )}

      {/* ── Current status pills ─────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: 8,
        marginTop: 16,
        paddingTop: 14,
        borderTop: `1px solid ${tokens.line}`,
        flexWrap: "wrap",
      }}>
        {seats.map((seat) => {
          const occupied = latest[seat] === 1;
          return (
            <div
              key={seat}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: tokens.panelRaised,
                borderRadius: 20,
                padding: "5px 12px",
                border: `1px solid ${occupied ? tokens.occupied + "55" : tokens.available + "44"}`,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: occupied ? tokens.occupied : tokens.available,
                display: "inline-block",
                boxShadow: `0 0 5px ${occupied ? tokens.occupied : tokens.available}`,
              }} />
              <span style={{ fontSize: 12, color: tokens.text }}>{seat}</span>
              <span style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: occupied ? tokens.occupied : tokens.available,
              }}>
                {occupied ? "In use" : "Free"}
              </span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
