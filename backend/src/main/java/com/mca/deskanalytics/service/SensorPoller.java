package com.mca.deskanalytics.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mca.deskanalytics.AppConfig;
import com.mca.deskanalytics.model.OccupancySnapshot;
import com.mca.deskanalytics.repository.OccupancySnapshotRepository;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Polls the DeskTherm realtime endpoint on a fixed schedule using a plain
 * ScheduledExecutorService (the non-Spring equivalent of @Scheduled) and
 * writes each poll's seat rows into Postgres.
 */
public class SensorPoller {

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private final OccupancySnapshotRepository repository;
    private final String baseUrl;
    private final String[] sensorIds;
    private final int intervalSeconds;

    public SensorPoller(AppConfig config, OccupancySnapshotRepository repository) {
        this.repository = repository;
        this.baseUrl = config.get("sensor.api.base-url");
        this.sensorIds = config.getList("sensor.ids");
        this.intervalSeconds = config.getInt("sensor.poll-interval-seconds");
    }

    public void start() {
        scheduler.scheduleAtFixedRate(this::pollAllSensors, 0, intervalSeconds, TimeUnit.SECONDS);
        System.out.println("SensorPoller started — polling every " + intervalSeconds + "s for sensors: "
                + String.join(", ", sensorIds));
    }

    public void stop() {
        scheduler.shutdown();
    }

    private void pollAllSensors() {
        for (String sensorId : sensorIds) {
            try {
                pollSensor(sensorId.trim());
            } catch (Exception e) {
                // One sensor failing shouldn't stop the others from being polled
                System.err.println("[SensorPoller] Failed to poll " + sensorId + ": " + e.getMessage());
            }
        }
    }

    private void pollSensor(String sensorId) throws Exception {
        String url = baseUrl + "?Sensor=" + sensorId;
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("Sensor API returned HTTP " + response.statusCode());
        }

        JsonNode root = mapper.readTree(response.body());
        JsonNode data = root.path("data");
        if (data.isMissingNode() || !data.has("SEATS")) {
            throw new RuntimeException("Malformed sensor response (no data.SEATS)");
        }

        String sensorFromPayload = data.path("SENSOR").asText(sensorId);
        long epochSeconds = data.path("TIME").asLong(Instant.now().getEpochSecond());
        Instant recordedAt = Instant.ofEpochSecond(epochSeconds);

        List<OccupancySnapshot> rows = new ArrayList<>();
        Iterator<Map.Entry<String, JsonNode>> seats = data.path("SEATS").fields();
        while (seats.hasNext()) {
            Map.Entry<String, JsonNode> entry = seats.next();
            rows.add(new OccupancySnapshot(
                    sensorFromPayload,
                    recordedAt,
                    entry.getKey(),
                    (short) entry.getValue().asInt(0)
            ));
        }

        if (!rows.isEmpty()) {
            repository.saveAll(rows);
            System.out.println("[SensorPoller] Saved " + rows.size() + " seat rows for " + sensorFromPayload
                    + " @ " + recordedAt);
        }
    }
}
