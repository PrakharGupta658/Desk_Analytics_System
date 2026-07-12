package com.mca.deskanalytics;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Loads settings from src/main/resources/config.properties (bundled into the jar)
 * with optional environment-variable overrides — handy for Docker later.
 */
public class AppConfig {

    private final Properties props = new Properties();

    public AppConfig() {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("config.properties")) {
            if (in == null) {
                throw new RuntimeException("config.properties not found on classpath");
            }
            props.load(in);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load config.properties", e);
        }
    }

    public String get(String key) {
        String envOverride = System.getenv(key.toUpperCase().replace('.', '_'));
        return envOverride != null ? envOverride : props.getProperty(key);
    }

    public int getInt(String key) {
        return Integer.parseInt(get(key));
    }

    public String[] getList(String key) {
        return get(key).split(",");
    }
}
