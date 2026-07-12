package com.mca.deskanalytics.handler;

import com.mca.deskanalytics.model.OccupancySnapshot;
import com.mca.deskanalytics.repository.OccupancySnapshotRepository;
import com.mca.deskanalytics.util.HttpUtil;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.time.*;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

public class OccupancyHandler implements HttpHandler {

    private final OccupancySnapshotRepository repository;
    private final String corsOrigin;

    public OccupancyHandler(OccupancySnapshotRepository repository, String corsOrigin) {
        this.repository = repository;
        this.corsOrigin = corsOrigin;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (HttpUtil.handlePreflight(exchange, corsOrigin)) return;

        String path = exchange.getRequestURI().getPath();
        Map<String, String> params = HttpUtil.parseQuery(exchange);

        try {
            if (path.endsWith("/live")) {
                handleLive(exchange, params);
            } else if (path.endsWith("/trend")) {
                handleTrend(exchange, params);
            } else if (path.endsWith("/weekly")) {
                handleWeekly(exchange, params);
            } else if (path.endsWith("/desk-trend")) {
                handleDeskTrend(exchange, params);
            } else {
                HttpUtil.sendError(exchange, 404, "Unknown endpoint: " + path, corsOrigin);
            }
        } catch (IllegalArgumentException e) {
            HttpUtil.sendError(exchange, 400, e.getMessage(), corsOrigin);
        } catch (Exception e) {
            e.printStackTrace();
            HttpUtil.sendError(exchange, 500, "Internal error: " + e.getMessage(), corsOrigin);
        }
    }

    // GET /api/occupancy/live?sensorId=...
    private void handleLive(HttpExchange exchange, Map<String, String> params) throws IOException {
        String sensorId = requireParam(params, "sensorId");
        List<OccupancySnapshot> latest = repository.findLatestBySensor(sensorId);

        long occupied = latest.stream().filter(s -> s.getStatus() == 1).count();
        int total = latest.size();
        int rate = total == 0 ? 0 : (int) Math.round((occupied * 100.0) / total);

        List<Map<String, Object>> seats = latest.stream()
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("seatId", s.getSeatId());
                    m.put("status", s.getStatus());
                    m.put("label", prettify(s.getSeatId()));
                    return m;
                })
                .collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sensorId", sensorId);
        body.put("timestamp", latest.isEmpty() ? null : latest.get(0).getRecordedAt());
        body.put("total", total);
        body.put("occupied", occupied);
        body.put("available", total - occupied);
        body.put("rate", rate);
        body.put("seats", seats);

        HttpUtil.sendJson(exchange, 200, body, corsOrigin);
    }

    // GET /api/occupancy/trend?sensorId=...&hours=24
    private void handleTrend(HttpExchange exchange, Map<String, String> params) throws IOException {
        String sensorId = requireParam(params, "sensorId");
        int hours = params.containsKey("hours") ? Integer.parseInt(params.get("hours")) : 24;

        Instant to   = Instant.now();
        Instant from = to.minus(hours, ChronoUnit.HOURS);

        List<OccupancySnapshot> rows = repository.findBySensorAndRange(sensorId, from, to);

        Map<Instant, List<OccupancySnapshot>> grouped = rows.stream()
                .collect(Collectors.groupingBy(
                        OccupancySnapshot::getRecordedAt,
                        LinkedHashMap::new,
                        Collectors.toList()));

        List<Map<String, Object>> points = grouped.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> {
                    long occ   = e.getValue().stream().filter(s -> s.getStatus() == 1).count();
                    int  total = e.getValue().size();
                    int  rate  = total == 0 ? 0 : (int) Math.round((occ * 100.0) / total);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("time", e.getKey());
                    m.put("occupancy", rate);
                    return m;
                })
                .collect(Collectors.toList());

        HttpUtil.sendJson(exchange, 200, points, corsOrigin);
    }

    /**
     * GET /api/occupancy/weekly?sensorId=...&from=2026-06-23T00:00:00Z&to=2026-06-28T23:59:59Z
     *
     * Returns Mon–Sat utilization for the given date range.
     * Response: [{ day, date, rate, peak }, ...]  ordered Mon→Sat
     */
    private void handleWeekly(HttpExchange exchange, Map<String, String> params) throws IOException {
        String sensorId = requireParam(params, "sensorId");

        ZoneId ist = ZoneId.of("Asia/Kolkata");

        Instant from, to;
        if (params.containsKey("from") && params.containsKey("to")) {
            from = Instant.parse(params.get("from"));
            to   = Instant.parse(params.get("to"));
        } else {
            // Default: current week Mon–today
            LocalDate today  = LocalDate.now(ist);
            LocalDate monday = today.with(java.time.DayOfWeek.MONDAY);
            from = monday.atStartOfDay(ist).toInstant();
            to   = Instant.now();
        }

        // Cap "to" at now so future days don't appear as empty
        if (to.isAfter(Instant.now())) to = Instant.now();

        List<OccupancySnapshot> rows = repository.findBySensorAndRange(sensorId, from, to);

        // Group by ISO day-of-week (1=Mon … 6=Sat), preserve order
        Map<Integer, List<OccupancySnapshot>> byDow = new TreeMap<>();
        for (OccupancySnapshot s : rows) {
            int dow = s.getRecordedAt().atZone(ist).getDayOfWeek().getValue();
            byDow.computeIfAbsent(dow, k -> new ArrayList<>()).add(s);
        }

        String[] DAY_NAMES = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
        LocalDate startDate = from.atZone(ist).toLocalDate();

        List<Map<String, Object>> result = new ArrayList<>();
        for (int dow = 1; dow <= 6; dow++) {
            LocalDate date    = startDate.with(java.time.DayOfWeek.of(dow));
            List<OccupancySnapshot> dayRows = byDow.getOrDefault(dow, Collections.emptyList());

            Map<Instant, List<OccupancySnapshot>> polls = dayRows.stream()
                    .collect(Collectors.groupingBy(OccupancySnapshot::getRecordedAt));

            List<Integer> rates = polls.values().stream()
                    .map(pr -> {
                        long occ = pr.stream().filter(s -> s.getStatus() == 1).count();
                        return pr.isEmpty() ? 0 : (int) Math.round((occ * 100.0) / pr.size());
                    })
                    .collect(Collectors.toList());

            int avgRate  = rates.isEmpty() ? 0 : (int) Math.round(rates.stream().mapToInt(Integer::intValue).average().orElse(0));
            int peakRate = rates.isEmpty() ? 0 : rates.stream().mapToInt(Integer::intValue).max().orElse(0);

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("day",  DAY_NAMES[dow - 1]);
            m.put("date", date.toString());
            m.put("rate",  avgRate);
            m.put("peak",  peakRate);
            result.add(m);
        }

        HttpUtil.sendJson(exchange, 200, result, corsOrigin);
    }

    /**
     * GET /api/occupancy/desk-trend?sensorId=...
     *
     * Returns per-desk occupancy status for today (since midnight IST),
     * one object per poll timestamp, with each seat as a keyed field.
     *
     * Response shape:
     * [
     *   { "time": "09:00", "Seat 1": 1, "Seat 2": 0, "Seat 3": 1, "Seat 4": 0 },
     *   { "time": "09:30", ... },
     *   ...
     * ]
     *
     * The React chart maps over the keys dynamically so it works for any
     * number of seats without hardcoding seat names.
     */
    private void handleDeskTrend(HttpExchange exchange, Map<String, String> params) throws IOException {
        String sensorId = requireParam(params, "sensorId");

        // Window: from midnight today (IST) to now
        ZoneId ist       = ZoneId.of("Asia/Kolkata");
        Instant midnight = LocalDate.now(ist).atStartOfDay(ist).toInstant();
        Instant now      = Instant.now();

        List<OccupancySnapshot> rows = repository.findBySensorAndRange(sensorId, midnight, now);

        // Collect all unique seat short-labels (e.g. "Seat 1") preserving order
        List<String> seatLabels = rows.stream()
                .map(s -> shortLabel(s.getSeatId()))
                .distinct()
                .sorted()
                .collect(Collectors.toList());

        // Group by poll timestamp
        Map<Instant, List<OccupancySnapshot>> byTime = rows.stream()
                .collect(Collectors.groupingBy(
                        OccupancySnapshot::getRecordedAt,
                        TreeMap::new,         // sorted by time automatically
                        Collectors.toList()));

        List<Map<String, Object>> points = new ArrayList<>();
        for (Map.Entry<Instant, List<OccupancySnapshot>> entry : byTime.entrySet()) {
            Map<String, Object> point = new LinkedHashMap<>();

            // Format time as HH:mm in IST
            String timeLabel = entry.getKey()
                    .atZone(ist)
                    .toLocalTime()
                    .toString()
                    .substring(0, 5); // "HH:mm"
            point.put("time", timeLabel);

            // Default all seats to 0 so gaps show as unoccupied
            for (String label : seatLabels) {
                point.put(label, 0);
            }

            // Fill in actual statuses from this poll
            for (OccupancySnapshot snap : entry.getValue()) {
                point.put(shortLabel(snap.getSeatId()), (int) snap.getStatus());
            }

            points.add(point);
        }

        // Also return seat labels so the frontend knows which keys to draw lines for
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("seats", seatLabels);
        response.put("points", points);

        HttpUtil.sendJson(exchange, 200, response, corsOrigin);
    }

    // "Ground_Floor_Workstation_Seat_3" → "Seat 3"
    private String shortLabel(String seatId) {
        String[] parts = seatId.split("_");
        if (parts.length >= 2) {
            String last  = parts[parts.length - 1]; // "3"
            String title = parts[parts.length - 2]; // "Seat"
            try {
                Integer.parseInt(last);
                return title + " " + last;
            } catch (NumberFormatException ignored) {}
        }
        return seatId.replace("_", " ");
    }

    private String prettify(String seatKey) {
        return seatKey.replace('_', ' ');
    }

    private String requireParam(Map<String, String> params, String name) {
        String value = params.get(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required query param: " + name);
        }
        return value;
    }
}
