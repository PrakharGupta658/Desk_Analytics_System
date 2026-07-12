package com.mca.deskanalytics.model;

import java.time.Instant;

public class OccupancySnapshot {

    private Long id;
    private String sensorId;
    private Instant recordedAt;
    private String seatId;
    private short status; // 0 = available, 1 = occupied

    public OccupancySnapshot() {}

    public OccupancySnapshot(String sensorId, Instant recordedAt, String seatId, short status) {
        this.sensorId = sensorId;
        this.recordedAt = recordedAt;
        this.seatId = seatId;
        this.status = status;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSensorId() { return sensorId; }
    public void setSensorId(String sensorId) { this.sensorId = sensorId; }

    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }

    public String getSeatId() { return seatId; }
    public void setSeatId(String seatId) { this.seatId = seatId; }

    public short getStatus() { return status; }
    public void setStatus(short status) { this.status = status; }
}
