// src/widgets/FloorPlan.jsx
import React from "react";
import { tokens } from "../styles/tokens";

// Chair SVG icon — drawn inline, no external library needed
function ChairIcon({ color, size = 36 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 36 36"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ pointerEvents: "none" }}
    >
      {/* Seat */}
      <rect x="7" y="14" width="22" height="7" rx="2" fill={color} opacity="0.95" />
      {/* Back rest */}
      <rect x="9" y="6" width="18" height="10" rx="2.5" fill={color} opacity="0.75" />
      {/* Left leg */}
      <rect x="9"  y="21" width="3" height="9" rx="1.5" fill={color} opacity="0.7" />
      {/* Right leg */}
      <rect x="24" y="21" width="3" height="9" rx="1.5" fill={color} opacity="0.7" />
      {/* Centre support */}
      <rect x="16.5" y="21" width="3" height="6" rx="1.5" fill={color} opacity="0.6" />
      {/* Foot bar */}
      <rect x="8" y="28" width="20" height="2.5" rx="1.25" fill={color} opacity="0.5" />
    </svg>
  );
}

export default function FloorPlan({ desks, onSelect, selectedId }) {
  if (!desks || desks.length === 0) {
    return (
      <div style={{ color: tokens.faint, fontSize: 13 }}>
        No seats reported by this sensor.
      </div>
    );
  }

  return (
    // Always 2 columns × 2 rows for up to 4 desks
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 14,
    }}>
      {desks.map((d) => {
        const occupied  = d.status === "occupied";
        const color     = occupied ? tokens.occupied : tokens.available;
        const isSel     = d.id === selectedId;
        const seatNum   = d.id.match(/\d+$/)?.[0] ?? d.id;

        return (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            title={`${d.label} — ${d.status}`}
            style={{
              background: occupied ? color + "22" : color + "11",
              border: isSel
                ? `2px solid ${tokens.text}`
                : `1.5px solid ${color}${occupied ? "88" : "55"}`,
              borderRadius: 12,
              padding: "14px 12px 12px",
              cursor: "pointer",
              outline: "none",
              transition: "transform 150ms ease, background 300ms ease, border 200ms ease",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              position: "relative",
              minHeight: 110,
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            {/* Status dot top-right */}
            <span style={{
              position: "absolute", top: 8, right: 10,
              width: 8, height: 8, borderRadius: "50%",
              background: color,
              boxShadow: `0 0 6px ${color}`,
              display: "inline-block",
            }} />

            {/* Chair icon */}
            <ChairIcon color={color} size={40} />

            {/* Desk number */}
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              fontWeight: 700,
              color: tokens.text,
              letterSpacing: "0.04em",
            }}>
              Desk {seatNum}
            </div>

            {/* Status label */}
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color,
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              {occupied ? "Occupied" : "Available"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
