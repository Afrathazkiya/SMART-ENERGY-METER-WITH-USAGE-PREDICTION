// ============================================================
//  utils/simulator.js
//
//  Simulation Mode — Fake ESP32 Data Generator
//
//  Generates realistic readings for a standard light bulb:
//    • Voltage: 220 – 230V  (AC mains fluctuation)
//    • Current: 0.25 – 0.30A (typical incandescent bulb)
//    • Power:   ~55 – 69W
//
//  Runs on a 2-second timer. To disable, just don't call
//  startSimulation() in server.js.
// ============================================================

const { addReading } = require("../config/dataStore");

/**
 * randomBetween — returns a random float between min and max
 * This simulates natural fluctuation in real sensor readings.
 */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * generateBulbReading — creates one simulated sensor sample
 *
 * Mimics what an ACS712 current sensor + ZMPT101B voltage
 * sensor would send from an ESP32 monitoring a light bulb.
 */
function generateBulbReading() {
  // Simulate mains voltage with small fluctuation (220–230V)
  const voltage = randomBetween(220.0, 230.0);

  // Simulate bulb current with small noise (0.25–0.30A)
  // A 60W bulb at 220V draws about 0.27A
  const current = randomBetween(0.25, 0.30);

  // Save to the in-memory store (is_simulated = true)
  const reading = addReading(voltage, current, true);

  return reading;
}

/**
 * startSimulation — begins auto-generating data every 2 seconds
 *
 * Called once from server.js on startup.
 * Each tick adds one reading to the data store.
 */
function startSimulation() {
  // Generate the first reading immediately so the dashboard
  // isn't empty on first load
  generateBulbReading();

  // Then continue every 2 seconds
  setInterval(() => {
    const r = generateBulbReading();

    // Log to console every 10 readings to avoid spam
    if (r.id % 10 === 0) {
      console.log(
        `[Sim] #${r.id} | ` +
        `${r.voltage.toFixed(1)}V | ` +
        `${r.current.toFixed(3)}A | ` +
        `${r.power.toFixed(2)}W`
      );
    }
  }, 2000); // 2000ms = 2 seconds
}

module.exports = { startSimulation, generateBulbReading };
