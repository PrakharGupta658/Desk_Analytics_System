// src/api/occupancyApi.js
//
// Talks to YOUR Java backend now — not the sensor directly. The backend
// (Main.java + OccupancyHandler) polls the sensor server-side, stores
// history in Postgres, and exposes these three endpoints.
//
// Backend response shape for /live:
// {
//   "sensorId": "2c:cf:67:ff:f5:f4",
//   "timestamp": "2026-06-20T10:15:30Z",
//   "total": 4,
//   "occupied": 3,
//   "available": 1,
//   "rate": 75,
//   "seats": [{ "seatId": "Ground_Floor_Workstation_Seat_1", "status": 0, "label": "..." }, ...]
// }


const BASE_URL = "http://13.62.42.254:8080/api/occupancy";

/**
 * Fetch the current snapshot for a given sensor.
 * @param {string} sensorId e.g. "2c:cf:67:ff:f5:f4"
 */
export async function fetchRealtimeOccupancy(sensorId) {
  const url = `${BASE_URL}/live?sensorId=${encodeURIComponent(sensorId)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(body?.error || `Occupancy API request failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return normalizeLive(json);
}

/**
 * Fetch the occupancy trend (rate over time) for the last N hours.
 * @param {string} sensorId
 * @param {number} hours
 */
export async function fetchTrend(sensorId, hours = 24) {
  const url = `${BASE_URL}/trend?sensorId=${encodeURIComponent(sensorId)}&hours=${hours}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(body?.error || `Trend API request failed: ${res.status} ${res.statusText}`);
  }

  const points = await res.json();
  return points.map((p) => ({
    time: new Date(p.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    occupancy: p.occupancy,
  }));
}

/**
 * Fetch weekly utilization rollup (avg + peak rate per day).
 * @param {string} sensorId
 * @param {number} weekOffset  0 = current week, 1 = last week, 2 = two weeks ago …
 */
export async function fetchWeekly(sensorId, weekOffset = 0) {
  const url = `${BASE_URL}/weekly?sensorId=${encodeURIComponent(sensorId)}&weekOffset=${weekOffset}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(body?.error || `Weekly API request failed: ${res.status} ${res.statusText}`);
  }

  return res.json(); // [{ day, date, rate, peak }, ...]
}

/** Converts the backend's /live response into the shape the widgets expect. */
function normalizeLive(raw) {
  const desks = (raw.seats || []).map((s) => ({
    id: s.seatId,
    label: s.label || prettifySeatName(s.seatId),
    status: s.status === 1 ? "occupied" : "available",
  }));

  return {
    sensorId: raw.sensorId,
    timestamp: raw.timestamp ? new Date(raw.timestamp) : new Date(),
    desks,
    occupied: raw.occupied,
    available: raw.available,
    rate: raw.rate,
  };
}

function prettifySeatName(key) {
  const seatMatch = key.match(/Seat_(\d+)$/i);
  const seatNumber = seatMatch ? seatMatch[1] : null;
  const floor = key.replace(/_Workstation_Seat_\d+$/i, "").replace(/_/g, " ");
  return seatNumber ? `${floor} · Seat ${seatNumber}` : key.replace(/_/g, " ");
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch (e) {
    return null;
  }
}

/**
 * Fetch per-desk occupancy timeline for today (since midnight IST).
 * Returns { seats: string[], points: object[] }
 * @param {string} sensorId
 */
export async function fetchDeskTrend(sensorId) {
  const url = `${BASE_URL}/desk-trend?sensorId=${encodeURIComponent(sensorId)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(body?.error || `Desk trend API failed: ${res.status} ${res.statusText}`);
  }

  return res.json(); // { seats: [...], points: [...] }
}

// ── Prediction API ───────────────────────────────────────────────────────────

/**
 * Predict occupancy for a specific day + hour.
 * dayOfWeek: 1=Mon … 7=Sun, hour: 0-23
 */
export async function fetchPrediction(sensorId, dayOfWeek, hour) {
  const url = `${BASE_URL.replace('/occupancy', '')}/predict?sensorId=${encodeURIComponent(sensorId)}&dayOfWeek=${dayOfWeek}&hour=${hour}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Prediction failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch hourly occupancy summary for a whole day (for the busy-hours chart).
 */
export async function fetchDaySummary(sensorId, dayOfWeek) {
  const url = `${BASE_URL.replace('/occupancy', '')}/predict/summary?sensorId=${encodeURIComponent(sensorId)}&dayOfWeek=${dayOfWeek}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Day summary failed: ${res.status}`);
  return res.json();
}
