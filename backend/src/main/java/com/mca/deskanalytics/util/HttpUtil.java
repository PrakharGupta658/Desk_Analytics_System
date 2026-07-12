package com.mca.deskanalytics.util;

import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class HttpUtil {

    private HttpUtil() {}

    /** Parses "?a=1&b=2" into a simple map. Returns an empty map if there's no query string. */
    public static Map<String, String> parseQuery(HttpExchange exchange) {
        Map<String, String> params = new HashMap<>();
        String query = exchange.getRequestURI().getQuery();
        if (query == null || query.isBlank()) return params;

        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            params.put(key, value);
        }
        return params;
    }

    /** Serializes `body` to JSON and writes it with the given status code, including CORS headers. */
    public static void sendJson(HttpExchange exchange, int statusCode, Object body, String corsOrigin) throws IOException {
        byte[] bytes = JsonUtil.MAPPER.writeValueAsBytes(body);

        exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", corsOrigin);
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    public static void sendError(HttpExchange exchange, int statusCode, String message, String corsOrigin) throws IOException {
        sendJson(exchange, statusCode, Map.of("error", message), corsOrigin);
    }

    /** Handles a CORS preflight OPTIONS request. Returns true if it handled the exchange (caller should stop). */
    public static boolean handlePreflight(HttpExchange exchange, String corsOrigin) throws IOException {
        if (!"OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) return false;
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", corsOrigin);
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
        return true;
    }
}
