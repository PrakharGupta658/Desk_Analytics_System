// src/widgets/Legend.jsx
import React from "react";
import { tokens } from "../styles/tokens";

export default function Legend() {
  const items = [
    { label: "Occupied", color: tokens.occupied },
    { label: "Available", color: tokens.available },
  ];
  return (
    <div style={{ display: "flex", gap: 18, fontSize: 12.5, color: tokens.muted }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: it.color,
              display: "inline-block",
            }}
          />
          {it.label}
        </div>
      ))}
    </div>
  );
}