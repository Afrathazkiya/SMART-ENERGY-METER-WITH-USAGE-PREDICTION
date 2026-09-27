// ============================================================
//  controllers/dataController.js
//
//  This file contains the LOGIC for each API endpoint.
//  Routes (in routes/) just call these functions.
//  Keeping logic here makes the code cleaner and easier to test.
// ============================================================

const {
  addReading,
  getLatestReading,
  getReadingsSince,
  getAllReadings,
  getTotalEnergy,
  store,
} = require("../config/dataStore");

const { predictNextValues, linearRegression, getTrend } = require("../utils/linearRegression");

// ============================================================
//  POST /api/data
//
//  Receives a reading from the ESP32.
//  ESP32 sends: { "voltage": 224.5, "current": 0.27 }
//  We calculate power and energy, then store it.
// ============================================================
function receiveData(req, res) {
  const { voltage, current } = req.body;

  // ── Validation ───────────────────────────────────────────
  // Make sure voltage and current are present and are numbers
  if (voltage === undefined || current === undefined) {
    return res.status(400).json({
      error: "Missing fields. Please send: { voltage, current }",
    });
  }

  const v = parseFloat(voltage);
  const c = parseFloat(current);

  if (isNaN(v) || isNaN(c)) {
    return res.status(400).json({
      error: "voltage and current must be valid numbers",
    });
  }

  if (v <= 0 || c < 0) {
    return res.status(400).json({
      error: "voltage must be > 0, current must be >= 0",
    });
  }

  // ── Save the reading ─────────────────────────────────────
  // addReading() handles the Power and Energy calculations
  const reading = addReading(v, c, false); // false = real ESP32 data

  // ── Respond to ESP32 ─────────────────────────────────────
  return res.status(201).json({
    status: "ok",
    message: "Reading saved",
    data: {
      id: reading.id,
      voltage: reading.voltage,
      current: reading.current,
      power_w: reading.power,         // Power in Watts
      energy_kwh: reading.energy_kwh, // Energy this interval in kWh
      timestamp: reading.timestamp,
    },
  });
}

// ============================================================
//  GET /api/data
//
//  Returns the single most recent reading.
//  Used by the dashboard's "Live" stat cards.
// ============================================================
function getLatestData(req, res) {
  const reading = getLatestReading();

  if (!reading) {
    return res.status(404).json({
      error: "No data yet. Waiting for ESP32 or simulation to start.",
    });
  }

  return res.json({
    id: reading.id,
    voltage_v: reading.voltage,
    current_a: reading.current,
    power_w: reading.power,
    energy_kwh: reading.energy_kwh,
    total_energy_kwh: parseFloat(getTotalEnergy().toFixed(6)),
    is_simulated: reading.is_simulated,
    timestamp: reading.timestamp,
  });
}

// ============================================================
//  GET /api/history
//
//  Returns historical readings (default: last 60 minutes).
//  Optional query param: ?minutes=30  or  ?minutes=120
//
//  Also returns hourly aggregates (total kWh per hour)
//  which the Analytics chart uses.
// ============================================================
function getHistory(req, res) {
  // How many minutes back to fetch (default = 60)
  const minutes = parseInt(req.query.minutes) || 60;

  const since = new Date(Date.now() - minutes * 60 * 1000);
  const readings = getReadingsSince(since);

  if (readings.length === 0) {
    return res.json({
      message: "No readings in this time range yet.",
      readings: [],
      hourly_summary: [],
      total_energy_kwh: 0,
      count: 0,
    });
  }

  // ── Build hourly summary ─────────────────────────────────
  // Group readings by hour → sum up kWh for each hour
  // This powers the "hourly chart" in the analytics page.
  const hourlyMap = {}; // { "14": 0.045, "15": 0.062, ... }

  for (const r of readings) {
    const hourKey = r.timestamp.getHours().toString();
    if (!hourlyMap[hourKey]) hourlyMap[hourKey] = 0;
    hourlyMap[hourKey] += r.energy_kwh;
  }

  // Convert map to sorted array: [{ hour: 14, kwh: 0.045 }, ...]
  const hourly_summary = Object.entries(hourlyMap)
    .map(([hour, kwh]) => ({
      hour: parseInt(hour),
      label: `${hour}:00`,
      kwh: parseFloat(kwh.toFixed(5)),
    }))
    .sort((a, b) => a.hour - b.hour);

  // Total energy in this time window
  const total_energy_kwh = parseFloat(
    readings.reduce((sum, r) => sum + r.energy_kwh, 0).toFixed(6)
  );

  // Return last 500 raw readings max (prevents huge JSON responses)
  const recentReadings = readings.slice(-500).map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    voltage_v: r.voltage,
    current_a: r.current,
    power_w: r.power,
    energy_kwh: r.energy_kwh,
  }));

  return res.json({
    readings: recentReadings,
    hourly_summary,
    total_energy_kwh,
    count: readings.length,
    from: since,
    to: new Date(),
  });
}

// ============================================================
//  GET /api/prediction
//
//  Predicts the NEXT 5 energy values using Linear Regression.
//
//  HOW IT WORKS (simple explanation):
//  ────────────────────────────────────
//  1. Take the last N readings' energy values (kWh per interval)
//  2. Use them as historical data: x=[0,1,2,...N], y=[kWh values]
//  3. Fit a straight line through them (y = m*x + b)
//  4. Extend that line forward → predict x=N, N+1, N+2...
//
//  This tells us: "if usage continues at its current trend,
//  the next few intervals will use this much energy."
// ============================================================
function getPrediction(req, res) {
  const allReadings = getAllReadings();

  // We need at least 10 readings to make a meaningful prediction
  if (allReadings.length < 10) {
    return res.status(404).json({
      error: `Not enough data yet. Need at least 10 readings, have ${allReadings.length}.`,
      tip: "Wait for the simulator to collect more data (about 20 seconds).",
    });
  }

  // ── Step 1: Extract energy values ────────────────────────
  // Use the last 100 readings for regression
  // (too many points slow things down; 100 is plenty)
  const recentReadings = allReadings.slice(-100);
  const energyValues = recentReadings.map((r) => r.energy_kwh);

  // ── Step 2: Run Linear Regression ────────────────────────
  const xValues = energyValues.map((_, i) => i);
  const { m: slope, b: intercept } = linearRegression(xValues, energyValues);

  // ── Step 3: Predict next 5 values ────────────────────────
  const nextPredictions = predictNextValues(energyValues, 5);

  // ── Step 4: Extrapolate 24 hourly buckets ────────────────
  // For the prediction chart (which shows 24-hour forecast):
  // We scale up interval-level predictions to hourly estimates.
  //
  // Intervals per hour = 3600 seconds / 2 seconds = 1800
  // So 1 hour ≈ 1800 readings × avg energy per reading
  const avgEnergyPerReading =
    energyValues.reduce((a, b) => a + b, 0) / energyValues.length;

  const intervalsPerHour = 3600 / 2; // 1800 intervals per hour

  // Generate 24 hourly predictions with slight variation
  // to make the chart look realistic (not a flat line)
  const hourlyPredictions = [];
  for (let h = 0; h < 24; h++) {
    // Apply the regression trend across future hours
    const trendFactor = 1 + slope * h * 0.01;
    // Add realistic time-of-day pattern (higher at peak hours)
    const timeOfDayFactor = getTimeOfDayFactor(h);
    const hourlyKwh =
      avgEnergyPerReading * intervalsPerHour * trendFactor * timeOfDayFactor;

    hourlyPredictions.push(
      Math.max(0, parseFloat(hourlyKwh.toFixed(5)))
    );
  }

  const predictedTotalKwh = hourlyPredictions.reduce((a, b) => a + b, 0);

  // ── Step 5: Stats for the response ───────────────────────
  const currentAvgPower =
    recentReadings.reduce((sum, r) => sum + r.power, 0) / recentReadings.length;

  return res.json({
    // Summary shown in "Prediction" stat card
    predicted_kwh: parseFloat(predictedTotalKwh.toFixed(4)),
    trend: getTrend(slope),
    trend_slope: parseFloat(slope.toFixed(8)),

    // Next 5 interval-level predictions (raw regression output)
    next_predictions: nextPredictions,

    // 24-hour hourly forecast array (used by prediction line chart)
    hourly_predictions: hourlyPredictions,

    // Regression line parameters (useful for debugging)
    regression: {
      slope: parseFloat(slope.toFixed(8)),
      intercept: parseFloat(intercept.toFixed(8)),
      data_points_used: recentReadings.length,
    },

    // Current stats
    current_avg_power_w: parseFloat(currentAvgPower.toFixed(2)),
    total_energy_so_far_kwh: parseFloat(getTotalEnergy().toFixed(6)),

    generated_at: new Date(),
  });
}

// ============================================================
//  GET /api/energy/dashboard  (compatibility route)
//
//  The existing frontend calls /api/energy/dashboard for
//  the dashboard stat cards. We replicate that response shape
//  here so the frontend works without modification.
// ============================================================
function getDashboardSummary(req, res) {
  const latest = getLatestReading();
  const now = new Date();

  // Today's readings
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayReadings = getReadingsSince(todayStart);

  const today_kwh = todayReadings.reduce((s, r) => s + r.energy_kwh, 0);

  // Yesterday's readings (for comparison)
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayReadings = getReadingsSince(yesterdayStart).filter(
    (r) => r.timestamp < todayStart
  );
  const yesterday_kwh = yesterdayReadings.reduce((s, r) => s + r.energy_kwh, 0);

  // % change vs yesterday
  let change_pct = 0;
  if (yesterday_kwh > 0) {
    change_pct = parseFloat(
      (((today_kwh - yesterday_kwh) / yesterday_kwh) * 100).toFixed(1)
    );
  }

  // Hourly breakdown for today (for the hourly chart)
  const hourlyMap = {};
  for (const r of todayReadings) {
    const h = r.timestamp.getHours();
    hourlyMap[h] = (hourlyMap[h] || 0) + r.energy_kwh;
  }
  const hourly_today = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    kwh: parseFloat((hourlyMap[h] || 0).toFixed(5)),
  }));

  // Weekly trend (last 7 days) for the weekly bar chart
  const weekly_trend = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayReadings = store.readings.filter(
      (r) => r.timestamp >= dayStart && r.timestamp < dayEnd
    );
    const kwh = dayReadings.reduce((s, r) => s + r.energy_kwh, 0);

    weekly_trend.push({
      date: dayStart.toLocaleDateString("en-IN", { weekday: "short" }),
      date_full: dayStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      kwh: parseFloat(kwh.toFixed(4)),
    });
  }

  // Alert level based on current power
  const currentPower = latest ? latest.power : 0;
  const POWER_THRESHOLD = 100; // Watts — adjust as needed
  let alert_level = "normal";
  if (currentPower >= POWER_THRESHOLD) alert_level = "high";
  else if (currentPower >= POWER_THRESHOLD * 0.8) alert_level = "medium";

  return res.json({
    current_power_w: latest ? parseFloat(latest.power.toFixed(2)) : 0,
    current_voltage_v: latest ? parseFloat(latest.voltage.toFixed(1)) : 0,
    current_current_a: latest ? parseFloat(latest.current.toFixed(3)) : 0,
    today_kwh: parseFloat(today_kwh.toFixed(4)),
    alert_level,
    power_threshold_w: POWER_THRESHOLD,
    change_vs_yesterday_pct: change_pct,
    weekly_trend,
    hourly_today,
    unread_alerts: 0,
    last_updated: now.toISOString(),
    // Note: billing fields removed as requested
  });
}

// ============================================================
//  GET /api/analytics  (compatibility route)
//
//  Returns weekly analytics data for the Analytics page charts.
// ============================================================
function getAnalytics(req, res) {
  const now = new Date();
  const days_data = [];
  let weekly_total = 0;

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayReadings = store.readings.filter(
      (r) => r.timestamp >= dayStart && r.timestamp < dayEnd
    );

    const actual_kwh = dayReadings.reduce((s, r) => s + r.energy_kwh, 0);
    weekly_total += actual_kwh;

    // Peak hour
    const hourlyMap = {};
    for (const r of dayReadings) {
      const h = r.timestamp.getHours();
      hourlyMap[h] = (hourlyMap[h] || 0) + r.energy_kwh;
    }
    const peak_hour =
      Object.keys(hourlyMap).length > 0
        ? parseInt(Object.entries(hourlyMap).sort((a, b) => b[1] - a[1])[0][0])
        : null;

    // Simple predicted value (linear regression on preceding days)
    const precedingKwh = days_data.map((d) => d.actual_kwh);
    let predicted_kwh = null;
    if (precedingKwh.length >= 2) {
      const preds = predictNextValues(precedingKwh, 1);
      predicted_kwh = preds[0] ? parseFloat(preds[0].toFixed(4)) : null;
    }

    days_data.push({
      date: dayStart.toLocaleDateString("en-IN", { weekday: "short" }),
      date_full: dayStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      actual_kwh: parseFloat(actual_kwh.toFixed(4)),
      predicted_kwh,
      peak_hour,
    });
  }

  const kwh_values = days_data.map((d) => d.actual_kwh);
  const avg_daily_kwh =
    kwh_values.reduce((a, b) => a + b, 0) / kwh_values.length;
  const peak_day =
    days_data.length > 0
      ? days_data.reduce((max, d) => (d.actual_kwh > max.actual_kwh ? d : max))
      : null;

  return res.json({
    days: days_data,
    weekly_total_kwh: parseFloat(weekly_total.toFixed(4)),
    avg_daily_kwh: parseFloat(avg_daily_kwh.toFixed(4)),
    peak_day,
  });
}

// ============================================================
//  GET /api/predict  (compatibility route for predictions page)
// ============================================================
function getPredictionCompat(req, res) {
  // Reuse the main prediction logic but format for the frontend
  const allReadings = getAllReadings();

  if (allReadings.length < 10) {
    return res.status(404).json({
      error: "Not enough data to predict. Collect at least 24 hours of readings.",
    });
  }

  const recentReadings = allReadings.slice(-100);
  const energyValues = recentReadings.map((r) => r.energy_kwh);
  const xValues = energyValues.map((_, i) => i);
  const { m: slope } = linearRegression(xValues, energyValues);

  const avgEnergyPerReading =
    energyValues.reduce((a, b) => a + b, 0) / energyValues.length;
  const intervalsPerHour = 3600 / 2;

  const hourlyPredictions = [];
  for (let h = 0; h < 24; h++) {
    const trendFactor = 1 + slope * h * 0.01;
    const timeOfDayFactor = getTimeOfDayFactor(h);
    const hourlyKwh =
      avgEnergyPerReading * intervalsPerHour * trendFactor * timeOfDayFactor;
    hourlyPredictions.push(Math.max(0, parseFloat(hourlyKwh.toFixed(5))));
  }

  const predictedTotalKwh = hourlyPredictions.reduce((a, b) => a + b, 0);

  return res.json({
    predicted_kwh: parseFloat(predictedTotalKwh.toFixed(4)),
    hourly_predictions: hourlyPredictions,
    trend: getTrend(slope),
  });
}

// ============================================================
//  GET /api/predict/accuracy
// ============================================================
function getPredictionAccuracy(req, res) {
  // We don't have multi-day history in demo mode yet,
  // so return empty accuracy (frontend shows "no data" state)
  return res.json({ accuracy: [] });
}

// ============================================================
//  Helper: getTimeOfDayFactor
//
//  Returns a multiplier (0.5 – 1.3) based on the hour of day.
//  This makes predictions look realistic — higher usage during
//  morning and evening peak hours, lower at night.
// ============================================================
function getTimeOfDayFactor(hour) {
  // Night: 0–5  → low usage (0.5×)
  if (hour >= 0 && hour <= 5)  return 0.5;
  // Morning peak: 6–9 → high (1.2×)
  if (hour >= 6 && hour <= 9)  return 1.2;
  // Daytime: 10–16 → medium (0.8×)
  if (hour >= 10 && hour <= 16) return 0.8;
  // Evening peak: 17–22 → highest (1.3×)
  if (hour >= 17 && hour <= 22) return 1.3;
  // Late night: 23 → low (0.6×)
  return 0.6;
}

module.exports = {
  receiveData,
  getLatestData,
  getHistory,
  getPrediction,
  getDashboardSummary,
  getAnalytics,
  getPredictionCompat,
  getPredictionAccuracy,
};
