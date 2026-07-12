// src/hooks/useOccupancyData.js
import { useEffect, useRef, useState, useCallback } from "react";
import { fetchRealtimeOccupancy } from "../api/occupancyApi";

const MAX_TREND_POINTS = 40; // keep the in-memory trend chart from growing forever

/**
 * Polls the realtime occupancy endpoint and keeps:
 *  - the latest snapshot (desks, counts, rate)
 *  - a rolling trend buffer for the "today" chart, built client-side
 *    since the sensor API only exposes the current state, not history.
 *
 * @param {string} sensorId
 * @param {number} intervalMs how often to poll (default 5s)
 */
export function useOccupancyData(sensorId, intervalMs = 5000) {
  const [snapshot, setSnapshot] = useState(null);
  const [trend, setTrend] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const data = await fetchRealtimeOccupancy(sensorId);
      setSnapshot(data);
      setError(null);
      setTrend((prev) => {
        const point = {
          time: data.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          occupancy: data.rate,
        };
        const next = [...prev, point];
        return next.length > MAX_TREND_POINTS ? next.slice(next.length - MAX_TREND_POINTS) : next;
      });
    } catch (err) {
      setError(err.message || "Failed to fetch occupancy data");
    } finally {
      setLoading(false);
    }
  }, [sensorId]);

  useEffect(() => {
    poll(); // fetch immediately on mount / sensor change
    timerRef.current = setInterval(poll, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [poll, intervalMs]);

  return { snapshot, trend, error, loading, refresh: poll };
}