# Desk Analytics Backend (Plain Java, no Spring)

Pure Java backend: `com.sun.net.httpserver.HttpServer` for REST, raw JDBC
(via HikariCP pool) for Postgres, `java.net.http.HttpClient` +
`ScheduledExecutorService` for polling the sensor — no Spring, no framework.

## 1. Create the database

```bash
createdb desk_analytics
```

The app creates the `occupancy_snapshot` table automatically on startup
(see `Database.initSchema()`), so no manual schema setup is needed.

## 2. Configure

Edit `src/main/resources/config.properties`:

```properties
db.url=jdbc:postgresql://localhost:5432/desk_analytics
db.user=postgres
db.password=yourpassword

sensor.api.base-url=https://flask.claircoair.com/api/v1/desktherm-realtime
sensor.ids=2c:cf:67:ff:f5:f4
sensor.poll-interval-seconds=30

server.port=8080
server.cors-origin=http://localhost:3000
```

Any property can be overridden with an environment variable instead
(e.g. `DB_PASSWORD=secret`) — useful for Docker later.

## 3. Build and run

```bash
mvn clean package
java -jar target/desk-analytics-backend.jar
```

You should see:

```
SensorPoller started — polling every 30s for sensors: 2c:cf:67:ff:f5:f4
Desk Analytics backend running on http://localhost:8080
```

## 4. Endpoints

| Endpoint | Example | Purpose |
|---|---|---|
| `GET /api/occupancy/live` | `?sensorId=2c:cf:67:ff:f5:f4` | Current snapshot + per-seat status |
| `GET /api/occupancy/trend` | `?sensorId=...&hours=24` | Occupancy rate over time, for the trend chart |
| `GET /api/occupancy/weekly` | `?sensorId=...&days=7` | Avg/peak rate grouped by day of week |

## 5. Point React at it

In `src/api/occupancyApi.js`, change `BASE_URL` to:

```js
const BASE_URL = "http://localhost:8080/api/occupancy/live";
```

and add `sensorId` as a query param the same way the sensor API expected
`Sensor` — the response shape is intentionally close to what the widgets
already expect (`rate`, `occupied`, `available`, `seats[]`).

## Notes

- Rows accumulate one-per-seat-per-poll. At 30s intervals with a handful of
  seats this is small, but for long-term production use, add a cleanup job
  or a rollup table for data older than N days.
- `mvn clean package` produces a single runnable "fat jar" (via the shade
  plugin in `pom.xml`) with all dependencies bundled — no separate
  classpath setup needed to run it.
