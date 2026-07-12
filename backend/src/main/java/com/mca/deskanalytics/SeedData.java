package com.mca.deskanalytics;

import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.Random;

/**
 * Run this ONCE to seed 7 days of fake occupancy data so the
 * /trend and /weekly widgets have something to display immediately.
 *
 * Usage:
 *   1.  mvn compile
 *   2.  mvn exec:java -Dexec.mainClass="com.mca.deskanalytics.SeedData"
 *
 * Safe to re-run — uses ON CONFLICT DO UPDATE so no duplicates are created.
 */
public class SeedData {

    static final String DB_URL      = "jdbc:postgresql://localhost:5432/desk_analytics";
    static final String DB_USER     = "postgres";
    static final String DB_PASSWORD = "yourpassword";  // <- change this

    static final String   SENSOR_ID = "2c:cf:67:ff:f5:f4";
    static final String[] SEAT_IDS  = {
        "Ground_Floor_Workstation_Seat_1",
        "Ground_Floor_Workstation_Seat_2",
        "Ground_Floor_Workstation_Seat_3",
        "Ground_Floor_Workstation_Seat_4"
    };
    static final int POLL_INTERVAL_MIN = 15;

    static final Random RNG = new Random(42);

    public static void main(String[] args) throws Exception {
        System.out.println("Connecting to " + DB_URL + " ...");

        try (Connection conn = DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD)) {

            // Note: no text blocks — plain string concatenation for Java 11 compatibility
            String upsert =
                "INSERT INTO occupancy_snapshot (sensor_id, recorded_at, seat_id, status) " +
                "VALUES (?, ?, ?, ?) " +
                "ON CONFLICT ON CONSTRAINT uq_occupancy_sensor_time_seat " +
                "DO UPDATE SET status = EXCLUDED.status";

            PreparedStatement ps = conn.prepareStatement(upsert);

            Instant end   = Instant.now();
            Instant start = end.minus(7, ChronoUnit.DAYS);

            int totalPolls = 0;
            int totalRows  = 0;

            Instant cursor = start;
            while (cursor.isBefore(end)) {

                double prob = occupancyProbabilityAt(cursor);

                for (String seatId : SEAT_IDS) {
                    short status = RNG.nextDouble() < prob ? (short) 1 : (short) 0;
                    ps.setString(1, SENSOR_ID);
                    ps.setTimestamp(2, Timestamp.from(cursor));
                    ps.setString(3, seatId);
                    ps.setShort(4, status);
                    ps.addBatch();
                    totalRows++;
                }

                totalPolls++;
                cursor = cursor.plus(POLL_INTERVAL_MIN, ChronoUnit.MINUTES);

                if (totalPolls % 200 == 0) {
                    ps.executeBatch();
                    System.out.println("  Inserted up to " + cursor + " (" + totalRows + " rows so far)");
                }
            }

            ps.executeBatch();
            System.out.println("Done — inserted " + totalRows + " rows across " + totalPolls + " fake polls.");
        }
    }

    static double occupancyProbabilityAt(Instant instant) {
        ZonedDateTime zdt = instant.atZone(ZoneId.of("Asia/Kolkata"));
        int hour        = zdt.getHour();
        int minute      = zdt.getMinute();
        double fracHour = hour + minute / 60.0;
        DayOfWeek day   = zdt.getDayOfWeek();
        boolean isWeekend = (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY);

        double p;
        if      (fracHour < 8)   p = 0.05;
        else if (fracHour < 10)  p = lerp(0.05, 0.70, (fracHour - 8) / 2.0);
        else if (fracHour < 12)  p = 0.75 + RNG.nextDouble() * 0.10;
        else if (fracHour < 13)  p = lerp(0.75, 0.40, fracHour - 12);
        else if (fracHour < 17)  p = 0.80 + RNG.nextDouble() * 0.10;
        else if (fracHour < 19)  p = lerp(0.80, 0.10, (fracHour - 17) / 2.0);
        else                     p = 0.05;

        if (isWeekend) p *= 0.15;

        p += (RNG.nextDouble() - 0.5) * 0.08;
        return Math.max(0, Math.min(1, p));
    }

    static double lerp(double a, double b, double t) {
        return a + (b - a) * Math.max(0, Math.min(1, t));
    }
}
