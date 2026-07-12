package com.mca.deskanalytics.service;

import com.mca.deskanalytics.db.Database;

import java.sql.*;
import java.time.DayOfWeek;
import java.util.*;

/**
 * Statistical occupancy predictor.
 *
 * For a given (dayOfWeek, hour), queries all historical rows that match
 * and computes the occupancy rate per seat. No external ML library needed —
 * the pattern emerges naturally from accumulated sensor history.
 *
 * Accuracy improves automatically as more days of data are collected.
 * With 2 days of data, confidence will be LOW; after 2-3 weeks it becomes
 * HIGH enough to be genuinely useful.
 */
public class PredictionService {

    private final Database db;

    public PredictionService(Database db) {
        this.db = db;
    }

    /**
     * Predict occupancy for every seat for a specific day-of-week + hour.
     *
     * @param sensorId   the sensor to query history for
     * @param dayOfWeek  1=Monday … 7=Sunday (ISO standard)
     * @param hour       0-23
     */
    public List<SeatPrediction> predict(String sensorId, int dayOfWeek, int hour) {
        // PostgreSQL EXTRACT(DOW ...) returns 0=Sun … 6=Sat
        // ISO dayOfWeek: 1=Mon … 7=Sun  →  ISO % 7 = pg DOW
        int pgDow = dayOfWeek % 7; // 1→1, 7→0

        String sql =
            "SELECT seat_id, " +
            "       COUNT(*) AS total, " +
            "       SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS occupied " +
            "FROM occupancy_snapshot " +
            "WHERE sensor_id = ? " +
            "  AND EXTRACT(DOW  FROM recorded_at AT TIME ZONE 'Asia/Kolkata') = ? " +
            "  AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE 'Asia/Kolkata') = ? " +
            "GROUP BY seat_id " +
            "ORDER BY seat_id";

        List<SeatPrediction> results = new ArrayList<>();

        try (Connection conn = db.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setString(1, sensorId);
            ps.setInt(2, pgDow);
            ps.setInt(3, hour);

            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String seatId   = rs.getString("seat_id");
                    int    total    = rs.getInt("total");
                    int    occupied = rs.getInt("occupied");

                    double rate = total == 0 ? 0.0 : (double) occupied / total;
                    int    predicted = rate >= 0.5 ? 1 : 0;
                    String confidence = total >= 10 ? "HIGH" : total >= 4 ? "MEDIUM" : "LOW";

                    results.add(new SeatPrediction(
                            shortLabel(seatId), rate, predicted, confidence, total
                    ));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Prediction query failed", e);
        }

        return results;
    }

    /**
     * Returns the best hours (lowest avg occupancy) for a given day.
     * Useful for the "when should I come in?" suggestion.
     */
    public List<HourSummary> bestHours(String sensorId, int dayOfWeek) {
        int pgDow = dayOfWeek % 7;

        String sql =
            "SELECT EXTRACT(HOUR FROM recorded_at AT TIME ZONE 'Asia/Kolkata') AS hr, " +
            "       COUNT(*) AS total, " +
            "       SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS occupied " +
            "FROM occupancy_snapshot " +
            "WHERE sensor_id = ? " +
            "  AND EXTRACT(DOW FROM recorded_at AT TIME ZONE 'Asia/Kolkata') = ? " +
            "GROUP BY hr " +
            "ORDER BY hr";

        List<HourSummary> summaries = new ArrayList<>();
        try (Connection conn = db.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setString(1, sensorId);
            ps.setInt(2, pgDow);

            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int    hr    = rs.getInt("hr");
                    int    total = rs.getInt("total");
                    int    occ   = rs.getInt("occupied");
                    double rate  = total == 0 ? 0 : (double) occ / total;
                    summaries.add(new HourSummary(hr, rate, total));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Best hours query failed", e);
        }
        return summaries;
    }

    private String shortLabel(String seatId) {
        String[] parts = seatId.split("_");
        if (parts.length >= 2) {
            String last  = parts[parts.length - 1];
            String title = parts[parts.length - 2];
            try { Integer.parseInt(last); return title + " " + last; }
            catch (NumberFormatException ignored) {}
        }
        return seatId.replace("_", " ");
    }

    // ── Value objects ─────────────────────────────────────────────────────

    public static class SeatPrediction {
        public final String  seat;
        public final double  occupancyRate;   // 0.0 – 1.0
        public final int     predicted;       // 0 = free, 1 = occupied
        public final String  confidence;      // LOW / MEDIUM / HIGH
        public final int     sampleSize;      // how many historical polls matched

        public SeatPrediction(String seat, double occupancyRate,
                              int predicted, String confidence, int sampleSize) {
            this.seat          = seat;
            this.occupancyRate = occupancyRate;
            this.predicted     = predicted;
            this.confidence    = confidence;
            this.sampleSize    = sampleSize;
        }
    }

    public static class HourSummary {
        public final int    hour;
        public final double occupancyRate;
        public final int    sampleSize;

        public HourSummary(int hour, double occupancyRate, int sampleSize) {
            this.hour          = hour;
            this.occupancyRate = occupancyRate;
            this.sampleSize    = sampleSize;
        }
    }
}
