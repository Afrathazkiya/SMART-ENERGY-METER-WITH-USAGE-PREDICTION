// ============================================================
//  routes/dataRoutes.js
//
//  This file defines ALL the API routes.
//  Think of this as a "URL map" — it says:
//    "When someone visits THIS URL, run THAT function."
//
//  The actual logic lives in controllers/dataController.js.
// ============================================================

const express = require("express");
const router = express.Router();

const {
  receiveData,
  getLatestData,
  getHistory,
  getPrediction,
  getDashboardSummary,
  getAnalytics,
  getPredictionCompat,
  getPredictionAccuracy,
} = require("../controllers/dataController");

// ── Your Required APIs ────────────────────────────────────────────

/**
 * POST /api/data
 * ESP32 sends: { "voltage": 224.5, "current": 0.27 }
 * Server calculates power and energy, stores the reading.
 */
router.post("/data", receiveData);

/**
 * GET /api/data
 * Returns the latest single reading.
 */
router.get("/data", getLatestData);

/**
 * GET /api/history
 * Returns historical readings.
 * Optional: ?minutes=60 (default) or ?minutes=120
 */
router.get("/history", getHistory);

/**
 * GET /api/prediction
 * Returns next-value predictions using Linear Regression.
 */
router.get("/prediction", getPrediction);

// ── Frontend Compatibility Routes ────────────────────────────────
// These routes match what the existing dashboard.js frontend calls.
// They let your old frontend work with this new Node.js backend.

/**
 * GET /api/energy/dashboard
 * Full dashboard summary: live values, weekly trend, hourly chart data.
 */
router.get("/energy/dashboard", getDashboardSummary);

/**
 * GET /api/analytics
 * Weekly analytics: 7-day breakdown, averages, peak day.
 */
router.get("/analytics", getAnalytics);

/**
 * GET /api/predict
 * Prediction for the Predictions page (hourly 24-hour forecast).
 */
router.get("/predict", getPredictionCompat);

/**
 * GET /api/predict/accuracy
 * Accuracy chart data (returns empty in demo mode).
 */
router.get("/predict/accuracy", getPredictionAccuracy);

// ── Auth stub routes (so frontend login redirects don't 404) ─────

/**
 * GET /api/alerts/
 * Returns empty alerts list (alerts feature not in scope).
 */
router.get("/alerts/", (req, res) => {
  res.json({ alerts: [], total: 0 });
});

/**
 * POST /api/alerts/:id/read  — stub
 */
router.post("/alerts/:id/read", (req, res) => {
  res.json({ success: true });
});

/**
 * POST /api/alerts/mark-all-read  — stub
 */
router.post("/alerts/mark-all-read", (req, res) => {
  res.json({ success: true });
});

/**
 * GET /api/energy/settings — returns default settings
 */
router.get("/energy/settings", (req, res) => {
  res.json({
    power_threshold_w: 100,
    daily_limit_kwh: 2.0,
    esp32_ip: "192.168.1.105",
    poll_interval_sec: 5,
    email_alerts: false,
    alert_email: "",
  });
});

/**
 * POST /api/energy/settings — accepts but doesn't persist (demo)
 */
router.post("/energy/settings", (req, res) => {
  res.json({ success: true, settings: req.body });
});

module.exports = router;
