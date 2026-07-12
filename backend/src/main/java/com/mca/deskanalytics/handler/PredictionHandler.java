package com.mca.deskanalytics.handler;

import com.mca.deskanalytics.service.PredictionService;
import com.mca.deskanalytics.service.PredictionService.SeatPrediction;
import com.mca.deskanalytics.service.PredictionService.HourSummary;
import com.mca.deskanalytics.util.HttpUtil;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Handles:
 *   GET /api/predict?sensorId=...&dayOfWeek=3&hour=14
 *   GET /api/predict/summary?sensorId=...&dayOfWeek=3
 */
public class PredictionHandler implements HttpHandler {

    private final PredictionService predictionService;
    private final String corsOrigin;

    public PredictionHandler(PredictionService predictionService, String corsOrigin) {
        this.predictionService = predictionService;
        this.corsOrigin = corsOrigin;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (HttpUtil.handlePreflight(exchange, corsOrigin)) return;

        String path   = exchange.getRequestURI().getPath();
        Map<String, String> params = HttpUtil.parseQuery(exchange);

        try {
            if (path.endsWith("/summary")) {
                handleSummary(exchange, params);
            } else {
                handlePredict(exchange, params);
            }
        } catch (IllegalArgumentException e) {
            HttpUtil.sendError(exchange, 400, e.getMessage(), corsOrigin);
        } catch (Exception e) {
            e.printStackTrace();
            HttpUtil.sendError(exchange, 500, "Prediction error: " + e.getMessage(), corsOrigin);
        }
    }

    /**
     * GET /api/predict?sensorId=...&dayOfWeek=3&hour=14
     *
     * dayOfWeek: 1=Mon, 2=Tue, ... 7=Sun
     * hour: 0-23
     *
     * Response:
     * {
     *   "dayOfWeek": 3,
     *   "dayName": "Wednesday",
     *   "hour": 14,
     *   "predictions": [
     *     { "seat": "Seat 1", "occupancyRate": 0.75, "predicted": 1,
     *       "confidence": "HIGH", "sampleSize": 20 }
     *   ],
     *   "overallRate": 0.62,
     *   "suggestion": "Expect 75% occupancy. Seat 2 is historically your best bet."
     * }
     */
    private void handlePredict(HttpExchange exchange, Map<String, String> params) throws IOException {
        String sensorId  = requireParam(params, "sensorId");
        int    dayOfWeek = Integer.parseInt(requireParam(params, "dayOfWeek")); // 1-7
        int    hour      = Integer.parseInt(requireParam(params, "hour"));      // 0-23

        List<SeatPrediction> predictions = predictionService.predict(sensorId, dayOfWeek, hour);

        double overallRate = predictions.isEmpty() ? 0 :
                predictions.stream().mapToDouble(p -> p.occupancyRate).average().orElse(0);

        String dayName = DayOfWeek.of(dayOfWeek)
                .getDisplayName(TextStyle.FULL, Locale.ENGLISH);

        // Find the best (least likely occupied) seat
        String suggestion = buildSuggestion(predictions, overallRate, dayName, hour);

        // Serialize predictions
        List<Map<String, Object>> predsJson = predictions.stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("seat",          p.seat);
            m.put("occupancyRate", Math.round(p.occupancyRate * 100));  // as %
            m.put("predicted",     p.predicted);
            m.put("confidence",    p.confidence);
            m.put("sampleSize",    p.sampleSize);
            return m;
        }).collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("dayOfWeek",   dayOfWeek);
        body.put("dayName",     dayName);
        body.put("hour",        hour);
        body.put("overallRate", Math.round(overallRate * 100));
        body.put("predictions", predsJson);
        body.put("suggestion",  suggestion);

        HttpUtil.sendJson(exchange, 200, body, corsOrigin);
    }

    /**
     * GET /api/predict/summary?sensorId=...&dayOfWeek=3
     *
     * Returns hour-by-hour occupancy rates for the whole day —
     * used to draw the "busy hours" bar chart in the prediction widget.
     */
    private void handleSummary(HttpExchange exchange, Map<String, String> params) throws IOException {
        String sensorId  = requireParam(params, "sensorId");
        int    dayOfWeek = Integer.parseInt(requireParam(params, "dayOfWeek"));

        List<HourSummary> hours = predictionService.bestHours(sensorId, dayOfWeek);

        String dayName = DayOfWeek.of(dayOfWeek)
                .getDisplayName(TextStyle.FULL, Locale.ENGLISH);

        List<Map<String, Object>> hoursJson = hours.stream().map(h -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("hour",          h.hour);
            m.put("label",         String.format("%02d:00", h.hour));
            m.put("occupancyRate", Math.round(h.occupancyRate * 100));
            m.put("sampleSize",    h.sampleSize);
            return m;
        }).collect(Collectors.toList());

        // Best hours = lowest occupancy with enough samples
        List<String> bestHours = hours.stream()
                .filter(h -> h.sampleSize >= 3)
                .sorted(Comparator.comparingDouble(h -> h.occupancyRate))
                .limit(3)
                .map(h -> String.format("%02d:00", h.hour))
                .collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("dayOfWeek", dayOfWeek);
        body.put("dayName",   dayName);
        body.put("hours",     hoursJson);
        body.put("bestHours", bestHours);

        HttpUtil.sendJson(exchange, 200, body, corsOrigin);
    }

    private String buildSuggestion(List<SeatPrediction> preds, double overallRate,
                                    String dayName, int hour) {
        if (preds.isEmpty()) {
            return "No historical data for this time slot yet. Check back after a few more days of readings.";
        }

        long noDataCount = preds.stream().filter(p -> p.sampleSize == 0).count();
        if (noDataCount == preds.size()) {
            return "No data available for " + dayName + " at " + hour + ":00. More readings needed.";
        }

        Optional<SeatPrediction> bestSeat = preds.stream()
                .filter(p -> p.sampleSize > 0)
                .min(Comparator.comparingDouble(p -> p.occupancyRate));

        String rateLabel = overallRate >= 0.75 ? "High" : overallRate >= 0.4 ? "Moderate" : "Low";

        StringBuilder sb = new StringBuilder();
        sb.append(rateLabel).append(" occupancy expected on ")
          .append(dayName).append(" at ").append(String.format("%02d:00", hour)).append(". ");

        bestSeat.ifPresent(s -> {
            if (s.occupancyRate < 0.5) {
                sb.append(s.seat)
                  .append(" is your best bet — free ")
                  .append(Math.round((1 - s.occupancyRate) * 100))
                  .append("% of the time historically.");
            } else {
                sb.append("All seats tend to be occupied at this hour — consider arriving earlier.");
            }
        });

        return sb.toString();
    }

    private String requireParam(Map<String, String> params, String name) {
        String v = params.get(name);
        if (v == null || v.isBlank())
            throw new IllegalArgumentException("Missing required param: " + name);
        return v;
    }
}
