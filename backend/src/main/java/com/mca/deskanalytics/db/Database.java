package com.mca.deskanalytics.db;

import com.mca.deskanalytics.AppConfig;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Thin wrapper around a HikariCP connection pool.
 */
public class Database {

    private final HikariDataSource dataSource;

    public Database(AppConfig config) {
        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setJdbcUrl(config.get("db.url"));
        hikariConfig.setUsername(config.get("db.user"));
        hikariConfig.setPassword(config.get("db.password"));
        hikariConfig.setMaximumPoolSize(10);
        hikariConfig.setPoolName("desk-analytics-pool");
        this.dataSource = new HikariDataSource(hikariConfig);
    }

    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }

    public DataSource getDataSource() {
        return dataSource;
    }

    public void close() {
        dataSource.close();
    }

    /**
     * Creates the schema on first startup. Each statement runs individually
     * so a multi-statement parse error can't silently skip the constraint.
     * Safe to call every startup — all statements are idempotent.
     */
    public void initSchema() {
        String[] statements = {
            // 1. Core table
            "CREATE TABLE IF NOT EXISTS occupancy_snapshot (" +
            "  id          BIGSERIAL PRIMARY KEY," +
            "  sensor_id   VARCHAR(64)  NOT NULL," +
            "  recorded_at TIMESTAMPTZ  NOT NULL," +
            "  seat_id     VARCHAR(128) NOT NULL," +
            "  status      SMALLINT     NOT NULL" +
            ")",

            // 2. Indexes
            "CREATE INDEX IF NOT EXISTS idx_occupancy_sensor_time " +
            "ON occupancy_snapshot (sensor_id, recorded_at)",

            "CREATE INDEX IF NOT EXISTS idx_occupancy_seat_time " +
            "ON occupancy_snapshot (seat_id, recorded_at)",

            // 3. Unique constraint — the key fix.
            //    When the sensor's TIME field doesn't change between polls
            //    (no new events), re-inserting the same (sensor, time, seat)
            //    triple is silently ignored via ON CONFLICT DO NOTHING in
            //    OccupancySnapshotRepository.saveAll(). Without this
            //    constraint, duplicate rows accumulate and the "latest
            //    snapshot" query returns 4 * <number-of-polls> rows instead of 4.
            "DO $$ BEGIN " +
            "  IF NOT EXISTS (" +
            "    SELECT 1 FROM pg_constraint WHERE conname = 'uq_occupancy_sensor_time_seat'" +
            "  ) THEN " +
            "    ALTER TABLE occupancy_snapshot " +
            "      ADD CONSTRAINT uq_occupancy_sensor_time_seat " +
            "      UNIQUE (sensor_id, recorded_at, seat_id);" +
            "  END IF; " +
            "END $$"
        };

        try (Connection conn = getConnection()) {
            for (String sql : statements) {
                try (Statement stmt = conn.createStatement()) {
                    stmt.execute(sql);
                }
            }
            System.out.println("[Database] Schema initialized.");
        } catch (SQLException e) {
            throw new RuntimeException("Failed to initialize schema", e);
        }
    }
}
