// src/widgets/Kpi.jsx
import React from "react";
import { tokens } from "../styles/tokens";

export default function Kpi({ label, value, sub, accent }) {
  return (
    <div
      style={{
        background: tokens.panel,
        border: `1px solid ${tokens.line}`,
        borderRadius: 10,
        padding: "18px 20px",
        flex: "1 1 160px",
        minWidth: 160,
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: tokens.muted,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: 30,
          fontWeight: 600,
          color: accent || tokens.text,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ marginTop: 8, fontSize: 12.5, color: tokens.faint }}>{sub}</div>}
    </div>
  );
}