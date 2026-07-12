package com.mca.deskanalytics;

import com.mca.deskanalytics.db.Database;
import com.mca.deskanalytics.handler.OccupancyHandler;
import com.mca.deskanalytics.handler.PredictionHandler;
import com.mca.deskanalytics.repository.OccupancySnapshotRepository;
import com.mca.deskanalytics.service.PredictionService;
import com.mca.deskanalytics.service.SensorPoller;
import com.sun.net.httpserver.HttpServer;

import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

public class Main {

    public static void main(String[] args) throws Exception {
        AppConfig config = new AppConfig();

        // --- Database ---
        Database db = new Database(config);
        db.initSchema();
        OccupancySnapshotRepository repository = new OccupancySnapshotRepository(db);

        // --- Services ---
        PredictionService predictionService = new PredictionService(db);

        // --- Background sensor polling ---
        SensorPoller poller = new SensorPoller(config, repository);
        poller.start();

        // --- HTTP server ---
        int    port       = config.getInt("server.port");
        String corsOrigin = config.get("server.cors-origin");

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/occupancy/", new OccupancyHandler(repository, corsOrigin));
        server.createContext("/api/predict/",   new PredictionHandler(predictionService, corsOrigin));
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        System.out.println("Desk Analytics backend running on http://localhost:" + port);
        System.out.println("Endpoints:");
        System.out.println("  /api/occupancy/live?sensorId=...");
        System.out.println("  /api/occupancy/trend?sensorId=...");
        System.out.println("  /api/occupancy/weekly?sensorId=...");
        System.out.println("  /api/occupancy/desk-trend?sensorId=...");
        System.out.println("  /api/predict?sensorId=...&dayOfWeek=3&hour=14");
        System.out.println("  /api/predict/summary?sensorId=...&dayOfWeek=3");

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("Shutting down...");
            poller.stop();
            server.stop(1);
            db.close();
        }));
    }
}
