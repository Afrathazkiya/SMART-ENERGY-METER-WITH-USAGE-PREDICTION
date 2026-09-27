// ============================================================
//  config/dataStore.js
//
//  This is our "database" for demo purposes.
//  All data lives in this JavaScript object in memory.
//  It resets every time the server restarts (that's fine for demo).
//
//  Think of it like a simplified version of MongoDB / SQL tables.
// ============================================================

const store = {
  // -----------------------------------------------------------
  //  readings[] — every voltage/current sample ever received
  //  Each object looks like:
  //  {
  //    id: 1,
  //    timestamp: Date object,
  //    voltage: 224.5,      ← volts (from ESP32 or simulator)
  //    current: 0.27,       ← amps
  //    power: 60.6,         ← watts  = voltage × current
  //    energy_kwh: 0.0000336, ← kWh accumulated this interval
  //    is_simulated: true
  //  }
  // -----------------------------------------------------------
  readings: [],

  // -----------------------------------------------------------
  //  nextId — auto-incrementing ID for each new reading
  // -----------------------------------------------------------
  nextId: 1,

  // -----------------------------------------------------------
  //  totalEnergyKwh — running total kWh since server start
  //  We update this on every POST so we don't have to sum
  //  the entire array every time.
  // -----------------------------------------------------------
  totalEnergyKwh: 0,

  // -----------------------------------------------------------
  //  lastTimestamp — when the last reading arrived
  //  Used to calculate time delta for energy accumulation.
  // -----------------------------------------------------------
  lastTimestamp: null,
};

// How many readings to keep in memory (prevents RAM growing forever)
// At 1 reading/2 seconds → 7200 readings = 4 hours of data
const MAX_READINGS = 7200;

/**
 * addReading — saves a new data point into the store
 *
 * @param {number} voltage  - in Volts
 * @param {number} current  - in Amps
 * @param {boolean} isSimulated - true if auto-generated, false if from real ESP32
 * @returns {object} the saved reading
 */
function addReading(voltage, current, isSimulated = false) {
  const now = new Date();

  // ── Step 1: Calculate Power ──────────────────────────────
  // Power (Watts) = Voltage × Current
  // e.g. 224V × 0.27A = 60.48W
  const power = parseFloat((voltage * current).toFixed(4));

  // ── Step 2: Calculate Energy for this interval ──────────
  // Energy (kWh) = Power (W) × Time (hours) / 1000
  //
  // We need the time gap since the LAST reading.
  // If this is the very first reading, assume 2-second gap.
  let deltaHours = 2 / 3600; // default: 2 seconds in hours
  if (store.lastTimestamp) {
    const deltaMs = now - store.lastTimestamp; // milliseconds
    deltaHours = deltaMs / 1000 / 3600;        // convert to hours
  }

  const energy_kwh = parseFloat(((power / 1000) * deltaHours).toFixed(8));

  // ── Step 3: Build the reading object ────────────────────
  const reading = {
    id: store.nextId++,
    timestamp: now,
    voltage: parseFloat(voltage.toFixed(2)),
    current: parseFloat(current.toFixed(4)),
    power,
    energy_kwh,
    is_simulated: isSimulated,
  };

  // ── Step 4: Append to store ──────────────────────────────
  store.readings.push(reading);
  store.totalEnergyKwh += energy_kwh;
  store.lastTimestamp = now;

  // ── Step 5: Trim old readings to save memory ─────────────
  if (store.readings.length > MAX_READINGS) {
    store.readings.shift(); // remove the oldest reading
  }

  return reading;
}

/**
 * getLatestReading — returns the most recent reading, or null
 */
function getLatestReading() {
  if (store.readings.length === 0) return null;
  return store.readings[store.readings.length - 1];
}

/**
 * getReadingsSince — returns all readings after a given Date
 *
 * @param {Date} sinceDate
 * @returns {Array}
 */
function getReadingsSince(sinceDate) {
  return store.readings.filter((r) => r.timestamp >= sinceDate);
}

/**
 * getAllReadings — returns a copy of all stored readings
 */
function getAllReadings() {
  return [...store.readings];
}

/**
 * getTotalEnergy — returns the accumulated kWh since server start
 */
function getTotalEnergy() {
  return store.totalEnergyKwh;
}

module.exports = {
  addReading,
  getLatestReading,
  getReadingsSince,
  getAllReadings,
  getTotalEnergy,
  store, // exported for inspection/debugging
};
