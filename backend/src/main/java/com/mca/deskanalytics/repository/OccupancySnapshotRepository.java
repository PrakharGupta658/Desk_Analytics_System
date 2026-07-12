package com.mca.deskanalytics.repository;

import com.mca.deskanalytics.db.Database;
import com.mca.deskanalytics.model.OccupancySnapshot;

import java.sql.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Hand-written JDBC data access — no JPA/Hibernate.
 *
 * Key fix: saveAll() uses INSERT ... ON CONFLICT DO NOTHING against the
 * unique constraint (sensor_id, recorded_at, seat_id). This means if the
 * sensor's TIME field hasn't advanced since the last poll (no new events),
 * re-inserting the same rows is a silent no-op instead of creating
 * duplicates that bloat the "latest snapshot" result.
 */
public class OccupancySnapshotRepository {

    private final Database db;

    public OccupancySnapshotRepository(Database db) {
        this.db = db;
    }

    /**
     * Bulk-insert one poll's seat rows.
     * ON CONFLICT DO NOTHING means identical (sensor_id, recorded_at, seat_id)
     * triples from repeated polls of the same sensor timestamp are discarded.
     */
    public void saveAll(List<OccupancySnapshot> rows) {
        String sql =
            "INSERT INTO occupancy_snapshot (sensor_id, recorded_at, seat_id, status) " +
            "VALUES (?, ?, ?, ?) " +
            "ON CONFLICT ON CONSTRAINT uq_occupancy_sensor_time_seat DO NOTHING";

        try (Connection conn = db.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            for (OccupancySnapshot row : rows) {
                ps.setString(1, row.getSensorId());
                ps.setTimestamp(2, Timestamp.from(row.getRecordedAt()));
                ps.setString(3, row.getSeatId());
                ps.setShort(4, row.getStatus());
                ps.addBatch();
            }
            ps.executeBatch();

        } catch (SQLException e) {
            throw new RuntimeException("Failed to save occupancy rows", e);
        }
    }

    /**
     * All seat rows from the single most-recent poll for a given sensor.
     * Because of the unique constraint + ON CONFLICT DO NOTHING, this always
     * returns exactly N rows (one per seat) regardless of how many times
     * the same timestamp has been polled.
     */
    public List<OccupancySnapshot> findLatestBySensor(String sensorId) {
        String sql =
            "SELECT sensor_id, recorded_at, seat_id, status " +
            "FROM occupancy_snapshot " +
            "WHERE sensor_id = ? " +
            "  AND recorded_at = (" +
            "    SELECT MAX(recorded_at) FROM occupancy_snapshot WHERE sensor_id = ?" +
            "  )";

        try (Connection conn = db.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, sensorId);
            ps.setString(2, sensorId);
            try (ResultSet rs = ps.executeQuery()) {
                return mapRows(rs);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query latest snapshot", e);
        }
    }

    /** All seat rows for a sensor within a time window, ordered chronologically. */
    public List<OccupancySnapshot> findBySensorAndRange(String sensorId, Instant from, Instant to) {
        String sql =
            "SELECT sensor_id, recorded_at, seat_id, status " +
            "FROM occupancy_snapshot " +
            "WHERE sensor_id = ? AND recorded_at BETWEEN ? AND ? " +
            "ORDER BY recorded_at ASC";

        try (Connection conn = db.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, sensorId);
            ps.setTimestamp(2, Timestamp.from(from));
            ps.setTimestamp(3, Timestamp.from(to));
            try (ResultSet rs = ps.executeQuery()) {
                return mapRows(rs);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query range", e);
        }
    }

    private List<OccupancySnapshot> mapRows(ResultSet rs) throws SQLException {
        List<OccupancySnapshot> out = new ArrayList<>();
        while (rs.next()) {
            out.add(new OccupancySnapshot(
                    rs.getString("sensor_id"),
                    rs.getTimestamp("recorded_at").toInstant(),
                    rs.getString("seat_id"),
                    rs.getShort("status")
            ));
        }
        return out;
    }
}
