// ============================================================
//  server.js — Smart Energy Meter Backend
//
//  This is the ENTRY POINT of the backend.
//  Run: node server.js
//
//  What this file does:
//    1. Creates an Express web server
//    2. Adds middleware (CORS, JSON parsing)
//    3. Mounts all API routes under /api
//    4. Starts the server on port 3000
//    5. Kicks off the simulation (fake ESP32 data every 2s)
// ============================================================

const express = require("express");
const cors    = require("cors");

const dataRoutes       = require("./routes/dataRoutes");
const { startSimulation } = require("./utils/simulator");

// ── Create the Express app ────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────

// CORS: allow the frontend (running on a different port) to
// make API requests without browser security blocking it.
app.use(cors());

// JSON body parser: reads { "voltage": 224 } from POST requests
app.use(express.json());

// ── Routes ────────────────────────────────────────────────
// All routes defined in routes/dataRoutes.js are available
// under the /api prefix (e.g., /api/data, /api/history, ...)
app.use("/api", dataRoutes);

// Serve frontend HTML, CSS, JS
app.use("/static", express.static(__dirname + "/frontend/static"));
app.get("/dashboard", (req, res) => res.sendFile(__dirname + "/frontend/templates/dashboard.html"));
app.get("/auth/logout", (req, res) => res.redirect("/"));
app.get("/auth/login", (req, res) => res.sendFile(__dirname + "/frontend/templates/login.html"));

// ── Root health-check endpoint ────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "⚡ Smart Energy Meter API is running!",
    endpoints: {
      "POST /api/data":       "Send voltage & current from ESP32",
      "GET  /api/data":       "Latest reading",
      "GET  /api/history":    "Historical data (?minutes=60)",
      "GET  /api/prediction": "Linear Regression prediction",
    },
  });
});

// ── Catch-all 404 handler ─────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    tip:   "Check the list of valid endpoints at GET /",
  });
});

// ── Start the server ──────────────────────────────────────
app.listen(PORT, () => {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  ⚡  Smart Energy Meter — Node.js Backend    ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Server : http://localhost:${PORT}              ║`);
  console.log("║  Mode   : Simulation ON (bulb, every 2s)     ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("\n📡 API Endpoints:");
  console.log("  POST  http://localhost:3000/api/data");
  console.log("  GET   http://localhost:3000/api/data");
  console.log("  GET   http://localhost:3000/api/history");
  console.log("  GET   http://localhost:3000/api/prediction");
  console.log("\n📊 Dashboard-compatible endpoints:");
  console.log("  GET   http://localhost:3000/api/energy/dashboard");
  console.log("  GET   http://localhost:3000/api/analytics");
  console.log("  GET   http://localhost:3000/api/predict\n");

  // ── Start simulation ──────────────────────────────────
  // This generates a realistic bulb reading (220–230V, 0.25–0.30A)
  // every 2 seconds so the dashboard is never empty.
  //
  // To DISABLE simulation (use only real ESP32 data):
  //   Comment out the line below ↓
  startSimulation();

  console.log("✅ Simulation started. Data flowing every 2 seconds.");
  console.log("   (Simulating: 220–230V, 0.25–0.30A light bulb)\n");
});
