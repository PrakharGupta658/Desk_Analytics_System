// src/widgets/TrendChart.jsx
import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { tokens } from "../styles/tokens";

/**
 * data: [{ time: "14:32", occupancy: 62 }, ...]
 * This is built client-side from successive polls (see useOccupancyData),
 * since the sensor only reports the current snapshot, not history.
 */
export default function TrendChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ color: tokens.faint, fontSize: 13 }}>Collecting live readings…</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tokens.occupied} stopOpacity={0.5} />
            <stop offset="100%" stopColor={tokens.occupied} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={tokens.line} vertical={false} />
        <XAxis dataKey="time" stroke={tokens.faint} fontSize={11} tickLine={false} axisLine={{ stroke: tokens.line }} />
        <YAxis stroke={tokens.faint} fontSize={11} tickLine={false} axisLine={false} width={30} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ background: tokens.panelRaised, border: `1px solid ${tokens.line}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: tokens.muted }}
        />
        <Area type="monotone" dataKey="occupancy" stroke={tokens.occupied} fill="url(#occGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}