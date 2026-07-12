// src/widgets/InsightCard.jsx
import React from "react";
import { tokens } from "../styles/tokens";

export default function InsightCard({ tone, text }) {
  const toneColor =
    tone === "save" ? tokens.available : tone === "watch" ? tokens.occupied : tokens.reserved;
  const toneLabel =
    tone === "save" ? "Cost opportunity" : tone === "watch" ? "Capacity risk" : "Policy win";

  return (
    <div
      style={{
        borderLeft: `3px solid ${toneColor}`,
        background: tokens.panelRaised,
        borderRadius: "0 8px 8px 0",
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: toneColor,
          marginBottom: 6,
        }}
      >
        {toneLabel}
      </div>
      <div style={{ fontSize: 13.5, color: tokens.text, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}