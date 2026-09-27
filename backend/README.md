# ⚡ Smart Energy Meter — Node.js Backend

A clean, beginner-friendly backend for the Smart Energy Meter project.
Receives data from ESP32, calculates power/energy, and predicts future usage
using a from-scratch Linear Regression algorithm.

---

## 📁 Folder Structure

```
smart-energy-meter-backend/
│
├── server.js                   ← Entry point (run this)
│
├── routes/
│   └── dataRoutes.js           ← URL → function mapping
│
├── controllers/
│   └── dataController.js       ← All API logic lives here
│
├── config/
│   └── dataStore.js            ← In-memory "database"
│
├── utils/
│   ├── linearRegression.js     ← Prediction algorithm (from scratch)
│   └── simulator.js            ← Fake ESP32 data generator
│
├── package.json
└── README.md
```

---

## 🚀 How to Run

### 1. Install Node.js
Download from https://nodejs.org (choose LTS version)

### 2. Install dependencies
```bash
cd smart-energy-meter-backend
npm install
```

### 3. Start the server
```bash
node server.js
```

Or with auto-restart on file changes (development):
```bash
npm run dev
```

You should see:
```
╔══════════════════════════════════════════════╗
║  ⚡  Smart Energy Meter — Node.js Backend    ║
╠══════════════════════════════════════════════╣
║  Server : http://localhost:3000              ║
║  Mode   : Simulation ON (bulb, every 2s)    ║
╚══════════════════════════════════════════════╝
```

### 4. Open the frontend
Point your browser to the `frontend/templates/dashboard.html` file.
The frontend will call `http://localhost:3000/api/...` automatically.

---

## 📡 API Endpoints

### POST /api/data
**Purpose:** Receive a new reading from the ESP32.

**Body (JSON):**
```json
{
  "voltage": 224.5,
  "current": 0.27
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Reading saved",
  "data": {
    "id": 42,
    "voltage": 224.5,
    "current": 0.27,
    "power_w": 60.615,
    "energy_kwh": 0.0000336,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### GET /api/data
**Purpose:** Get the most recent reading (for live dashboard).

**Response:**
```json
{
  "id": 42,
  "voltage_v": 224.5,
  "current_a": 0.27,
  "power_w": 60.615,
  "energy_kwh": 0.0000336,
  "total_energy_kwh": 0.000504,
  "is_simulated": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/history
**Purpose:** Get historical readings and hourly totals.

**Optional query param:** `?minutes=60` (default) or `?minutes=120`

**Response:**
```json
{
  "readings": [
    { "id": 1, "voltage_v": 225.1, "current_a": 0.28, "power_w": 63.0, ... },
    ...
  ],
  "hourly_summary": [
    { "hour": 10, "label": "10:00", "kwh": 0.0452 },
    { "hour": 11, "label": "11:00", "kwh": 0.0381 }
  ],
  "total_energy_kwh": 0.0833,
  "count": 1800,
  "from": "2024-01-15T09:30:00.000Z",
  "to": "2024-01-15T10:30:00.000Z"
}
```

---

### GET /api/prediction
**Purpose:** Predict the next 5 energy values using Linear Regression.

**Requires:** At least 10 readings in the store.

**Response:**
```json
{
  "predicted_kwh": 0.8234,
  "trend": "stable",
  "next_predictions": [0.0000336, 0.0000338, 0.0000335, 0.0000339, 0.0000337],
  "hourly_predictions": [0.02, 0.018, ...],
  "regression": {
    "slope": 0.000000012,
    "intercept": 0.0000334,
    "data_points_used": 100
  },
  "current_avg_power_w": 62.4
}
```

---

## 🧠 How the Prediction Works (Simple Explanation)

### The Idea
We draw a **best-fit straight line** through our historical energy readings.
Then we **extend that line forward** to predict future values.

### The Math (y = mx + b)
```
y = energy value (kWh)
x = time index   (0, 1, 2, 3, ...)
m = slope        (how fast energy is changing)
b = intercept    (starting value)
```

### Example
```
Historical kWh:  [0.030, 0.031, 0.032, 0.031, 0.033]
Time index x:    [  0,     1,     2,     3,     4  ]

Regression finds: y = 0.0006x + 0.030
Predict x=5: y = 0.0006×5 + 0.030 = 0.033 kWh  ✅
```

### The Formulas
```
n   = number of data points
m   = (n·Σxy - Σx·Σy) / (n·Σx² - (Σx)²)   ← slope
b   = (Σy - m·Σx) / n                         ← intercept
```

### Why This Approach?
- ✅ **No libraries** — implemented from scratch in 40 lines
- ✅ **Beginner-friendly** — just addition and multiplication
- ✅ **Fast** — runs in microseconds
- ✅ **Explainable** — you can see exactly why each prediction was made
- ⚠️ **Simple** — assumes usage follows a straight-line trend
  (good for short-term prediction; for complex patterns, use LSTM/ARIMA)

---

## 🔌 Simulation Mode

The server auto-generates realistic bulb data every **2 seconds**:

| Parameter | Value         |
|-----------|---------------|
| Voltage   | 220 – 230 V   |
| Current   | 0.25 – 0.30 A |
| Power     | ~55 – 69 W    |

To **disable** simulation (use only real ESP32 data):
Open `server.js` and comment out `startSimulation();`

---

## 🔧 ESP32 Arduino Code (How to Send Data)

Add this to your ESP32 `.ino` file to POST sensor data:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid     = "YourWiFiName";
const char* password = "YourPassword";
const char* serverURL = "http://192.168.1.XXX:3000/api/data";
// Replace XXX with your computer's local IP address

void sendData(float voltage, float current) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<100> doc;
    doc["voltage"] = voltage;
    doc["current"] = current;

    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    Serial.println("HTTP Response: " + String(code));
    http.end();
  }
}
```

---

## 🧪 Testing with Postman

### Step 1: Install Postman
Download from https://www.postman.com/downloads/

### Step 2: Test POST /api/data

1. Open Postman → click **New Request**
2. Set method to **POST**
3. URL: `http://localhost:3000/api/data`
4. Click **Body** tab → select **raw** → choose **JSON**
5. Paste this body:
   ```json
   {
     "voltage": 225.3,
     "current": 0.28
   }
   ```
6. Click **Send**
7. ✅ You should see: `{ "status": "ok", ... }`

**Test validation (should return 400 error):**
```json
{ "voltage": 225.3 }
```
(missing `current` → server returns: `400 Missing fields`)

---

### Step 3: Test GET /api/data
1. Method: **GET**
2. URL: `http://localhost:3000/api/data`
3. Click **Send**
4. ✅ Returns the latest reading

---

### Step 4: Test GET /api/history
1. Method: **GET**
2. URL: `http://localhost:3000/api/history?minutes=30`
3. Click **Send**
4. ✅ Returns readings from the last 30 minutes

---

### Step 5: Test GET /api/prediction
1. Method: **GET**
2. URL: `http://localhost:3000/api/prediction`
3. **Wait ~20 seconds** after starting the server (needs 10+ readings)
4. Click **Send**
5. ✅ Returns predicted energy values and trend

---

### Postman Collection (Import This)

Save as `smart-meter.postman_collection.json` and import:
```json
{
  "info": { "name": "Smart Energy Meter", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  "item": [
    {
      "name": "POST - Send ESP32 Data",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": { "mode": "raw", "raw": "{\"voltage\": 225.3, \"current\": 0.28}" },
        "url": { "raw": "http://localhost:3000/api/data" }
      }
    },
    {
      "name": "GET - Latest Reading",
      "request": { "method": "GET", "url": { "raw": "http://localhost:3000/api/data" } }
    },
    {
      "name": "GET - History (60 min)",
      "request": { "method": "GET", "url": { "raw": "http://localhost:3000/api/history?minutes=60" } }
    },
    {
      "name": "GET - Prediction",
      "request": { "method": "GET", "url": { "raw": "http://localhost:3000/api/prediction" } }
    }
  ]
}
```

---

## ⚙️ Calculations Reference

| Formula          | Expression                        | Unit   |
|------------------|-----------------------------------|--------|
| Power            | `voltage × current`               | Watts  |
| Energy (interval)| `(power / 1000) × time_hours`    | kWh    |
| Energy (total)   | `Σ all interval energies`         | kWh    |
| Prediction       | `m × x_future + b`               | kWh    |

---

## 🔮 Next Steps (to make this production-ready)

1. **Add MongoDB** — replace `config/dataStore.js` with `mongoose` models
2. **Add authentication** — use `jsonwebtoken` (JWT) for login
3. **Add WebSockets** — push live data to frontend without polling (use `socket.io`)
4. **Deploy** — host on Railway, Render, or a Raspberry Pi on your local network
