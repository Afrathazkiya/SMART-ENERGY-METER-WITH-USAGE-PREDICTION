/*
 * Smart Energy Meter - ESP32 Firmware
 * =====================================
 * Hardware: ESP32 Dev Board
 * Sensors:  ZMPT101B (voltage) + ACS712 (current)
 *           OR simulated values for demo
 *
 * Wiring:
 *   ZMPT101B  → GPIO 34 (ADC1_CH6) - Voltage sensor
 *   ACS712    → GPIO 35 (ADC1_CH7) - Current sensor
 *   LED       → GPIO 2             - Built-in status LED
 *
 * Libraries required (install via Arduino Library Manager):
 *   - WiFi (built-in ESP32)
 *   - HTTPClient (built-in ESP32)
 *   - ArduinoJson by Benoit Blanchon (v6.x)
 *
 * Usage:
 *   1. Set WIFI_SSID and WIFI_PASS below
 *   2. Set SERVER_IP to your PC's local IP (run `ipconfig` on Windows)
 *   3. Set SIMULATE_DATA to false when real sensors are connected
 *   4. Flash to ESP32 via Arduino IDE
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <math.h>

// ========== CONFIGURATION ==========
const char* WIFI_SSID     = "YOUR_WIFI_SSID";     // <-- Change this
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";  // <-- Change this
const char* SERVER_IP     = "192.168.1.xxx";       // <-- Your PC's local IP
const int   SERVER_PORT   = 5000;
const char* DEVICE_ID     = "esp32_01";
const int   USER_ID       = 1;                     // Flask user ID
const int   SEND_INTERVAL = 5000;                  // ms between readings

// Set to false when real sensors are connected
const bool SIMULATE_DATA  = true;

// ========== PIN DEFINITIONS ==========
const int VOLTAGE_PIN  = 34;   // ZMPT101B analog output
const int CURRENT_PIN  = 35;   // ACS712 analog output
const int LED_PIN      = 2;    // Built-in LED

// ========== SENSOR CALIBRATION ==========
// Adjust these values based on your sensor calibration
const float VOLTAGE_CALIBRATION = 234.5;   // Scale factor for ZMPT101B
const float CURRENT_CALIBRATION = 0.0185;  // ACS712 30A: 66mV/A; 20A: 100mV/A; 5A: 185mV/A
const float CURRENT_OFFSET      = 2048.0;  // ADC midpoint (12-bit = 4096/2)
const int   SAMPLES             = 1000;    // Samples for RMS calculation

// ========== GLOBALS ==========
unsigned long lastSendTime = 0;
float simPower = 400.0;  // Starting simulated power


// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n[SmartMeter] ESP32 Energy Monitor starting...");
  Serial.printf("[SmartMeter] Device ID: %s\n", DEVICE_ID);
  Serial.printf("[SmartMeter] Simulate data: %s\n", SIMULATE_DATA ? "YES" : "NO");

  connectWiFi();
}


// ========== MAIN LOOP ==========
void loop() {
  // Reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Disconnected. Reconnecting...");
    connectWiFi();
  }

  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;

    float voltage, current, power, pf;

    if (SIMULATE_DATA) {
      readSimulated(voltage, current, power, pf);
    } else {
      readSensors(voltage, current, power, pf);
    }

    Serial.printf("[Reading] V=%.1fV  I=%.3fA  P=%.1fW  PF=%.2f\n",
                  voltage, current, power, pf);

    bool sent = sendToServer(voltage, current, power, pf);

    // Blink LED: fast = success, slow = fail
    blinkLED(sent ? 2 : 5, sent ? 80 : 300);
  }
}


// ========== WIFI ==========
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(LED_PIN, HIGH);
  } else {
    Serial.println("\n[WiFi] FAILED. Will retry in loop.");
    digitalWrite(LED_PIN, LOW);
  }
}


// ========== REAL SENSOR READING ==========
void readSensors(float &voltage, float &current, float &power, float &pf) {
  /*
   * RMS calculation for AC signals:
   * 1. Sample the ADC many times
   * 2. Calculate mean (DC offset)
   * 3. Subtract mean from each sample
   * 4. Square, sum, divide by N, take sqrt
   */

  // --- Voltage RMS ---
  double sumV = 0, sumV2 = 0;
  for (int i = 0; i < SAMPLES; i++) {
    int raw = analogRead(VOLTAGE_PIN);
    sumV += raw;
    sumV2 += (double)raw * raw;
    delayMicroseconds(50);
  }
  double meanV = sumV / SAMPLES;
  double rmsV_raw = sqrt(sumV2 / SAMPLES - meanV * meanV);
  voltage = rmsV_raw * (VOLTAGE_CALIBRATION / 4096.0) * 3.3;

  // --- Current RMS ---
  double sumI = 0, sumI2 = 0;
  for (int i = 0; i < SAMPLES; i++) {
    int raw = analogRead(CURRENT_PIN);
    sumI += raw;
    sumI2 += (double)raw * raw;
    delayMicroseconds(50);
  }
  double meanI = sumI / SAMPLES;
  double rmsI_raw = sqrt(sumI2 / SAMPLES - meanI * meanI);
  current = rmsI_raw * CURRENT_CALIBRATION;

  // --- Power & PF ---
  power = voltage * current;
  pf = 0.95;  // Assume PF; improve with phase measurement

  // Sanity clamp
  if (voltage < 180 || voltage > 260) voltage = 220.0;
  if (current < 0) current = 0;
  if (power < 0) power = 0;
}


// ========== SIMULATED DATA ==========
void readSimulated(float &voltage, float &current, float &power, float &pf) {
  /*
   * Realistic residential simulation:
   * - Follows time-of-day pattern
   * - Adds Gaussian-like noise
   * - Occasionally simulates spikes
   */
  int hour = (millis() / 3600000) % 24;  // Simulated hour from uptime

  // Time-of-day base load profile (Watts)
  float profile[] = {
    80,  60,  50,  50,  60, 100,    // 12am - 5am
   200, 450, 550, 400, 350, 380,    // 6am - 11am
   420, 400, 380, 360, 400, 550,    // 12pm - 5pm
   800, 950, 850, 700, 500, 250     // 6pm - 11pm
  };

  float base = profile[hour];
  // Add random ±10% noise
  float noise = base * 0.1 * ((float)random(-100, 100) / 100.0);
  simPower = base + noise;

  // 5% chance of a spike each reading
  if (random(100) < 5) {
    simPower *= 1.0 + (float)random(30, 80) / 100.0;
  }

  simPower = max(30.0f, simPower);

  voltage = 220.0 + (float)random(-30, 30) / 10.0;
  current = simPower / voltage;
  power   = simPower;
  pf      = 0.92 + (float)random(0, 6) / 100.0;
}


// ========== SEND TO SERVER ==========
bool sendToServer(float voltage, float current, float power, float pf) {
  if (WiFi.status() != WL_CONNECTED) return false;

  String url = "http://" + String(SERVER_IP) + ":" + SERVER_PORT + "/api/energy/live";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(4000);  // 4s timeout

  // Build JSON payload
  StaticJsonDocument<256> doc;
  doc["device_id"]    = DEVICE_ID;
  doc["user_id"]      = USER_ID;
  doc["voltage"]      = roundf(voltage * 10) / 10.0;
  doc["current"]      = roundf(current * 1000) / 1000.0;
  doc["power"]        = roundf(power * 10) / 10.0;
  doc["power_factor"] = roundf(pf * 100) / 100.0;
  doc["is_simulated"] = SIMULATE_DATA;

  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  http.end();

  if (httpCode == 201) {
    Serial.printf("[HTTP] Sent OK → %d\n", httpCode);
    return true;
  } else {
    Serial.printf("[HTTP] Failed → %d\n", httpCode);
    return false;
  }
}


// ========== LED BLINK ==========
void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
  }
}
