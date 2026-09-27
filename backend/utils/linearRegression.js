// ============================================================
//  utils/linearRegression.js
//
//  Simple Linear Regression — from scratch, no libraries!
//
//  WHAT IS LINEAR REGRESSION?
//  ──────────────────────────
//  It finds the "best fit line" through a set of data points.
//  The line equation is:  y = m*x + b
//    • x = time index (0, 1, 2, 3, ...)
//    • y = energy consumed (kWh)
//    • m = slope (how fast energy changes over time)
//    • b = intercept (starting value)
//
//  EXAMPLE:
//  ────────
//  If we measured kWh over 5 intervals:
//    x: [0, 1, 2,  3,  4 ]
//    y: [1, 2, 2.5, 3, 4.2]
//
//  Regression finds: y = 0.78*x + 0.88
//  To predict x=5 (next interval): y = 0.78*5 + 0.88 = 4.78 kWh
//
//  FORMULA (Least Squares Method):
//  ────────────────────────────────
//    n   = number of data points
//    Σx  = sum of all x values
//    Σy  = sum of all y values
//    Σxy = sum of (x * y) for each pair
//    Σx² = sum of (x * x) for each pair
//
//    m = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
//    b = (Σy - m*Σx) / n
// ============================================================

/**
 * linearRegression — calculates slope (m) and intercept (b)
 *
 * @param {number[]} xValues - array of x values (e.g. [0, 1, 2, 3])
 * @param {number[]} yValues - array of y values (e.g. [1.0, 1.5, 2.0, 2.3])
 * @returns {{ m: number, b: number }} slope and intercept
 */
function linearRegression(xValues, yValues) {
  const n = xValues.length;

  if (n < 2) {
    // Can't draw a line through fewer than 2 points
    return { m: 0, b: yValues[0] || 0 };
  }

  // Calculate all the sums we need
  let sumX = 0;   // Σx
  let sumY = 0;   // Σy
  let sumXY = 0;  // Σ(x*y)
  let sumX2 = 0;  // Σ(x²)

  for (let i = 0; i < n; i++) {
    sumX  += xValues[i];
    sumY  += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumX2 += xValues[i] * xValues[i];
  }

  // Apply the least-squares formulas
  const denominator = n * sumX2 - sumX * sumX;

  if (denominator === 0) {
    // All x values are the same — can't compute slope
    return { m: 0, b: sumY / n };
  }

  const m = (n * sumXY - sumX * sumY) / denominator;  // slope
  const b = (sumY - m * sumX) / n;                     // intercept

  return { m, b };
}

/**
 * predictNextValues — predicts future energy values using regression
 *
 * @param {number[]} historicalKwh - array of past kWh values (in order)
 * @param {number} stepsAhead      - how many future values to predict
 * @returns {number[]}             - array of predicted kWh values
 */
function predictNextValues(historicalKwh, stepsAhead = 5) {
  const n = historicalKwh.length;

  if (n === 0) return [];

  // x = [0, 1, 2, ..., n-1]
  const xValues = historicalKwh.map((_, i) => i);
  const yValues = historicalKwh;

  const { m, b } = linearRegression(xValues, yValues);

  // Predict future steps: x = n, n+1, n+2, ...
  const predictions = [];
  for (let step = 1; step <= stepsAhead; step++) {
    const xFuture = n - 1 + step;
    const predicted = m * xFuture + b;

    // Energy can't be negative — clamp to 0 minimum
    predictions.push(Math.max(0, parseFloat(predicted.toFixed(6))));
  }

  return predictions;
}

/**
 * getTrend — returns a human-readable trend description
 *
 * @param {number} slope (m from regression)
 * @returns {string}
 */
function getTrend(slope) {
  if (slope > 0.001)  return "increasing";
  if (slope < -0.001) return "decreasing";
  return "stable";
}

module.exports = { linearRegression, predictNextValues, getTrend };
