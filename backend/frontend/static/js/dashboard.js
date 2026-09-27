/**
 * Smart Energy Meter - Dashboard JavaScript
 * Handles: navigation, live polling, charts, alerts, settings, predictions
 */

'use strict';

// ========== STATE ==========
const state = {
  currentPage: 'dashboard',
  pollInterval: null,
  charts: {},
  settings: {},
  alertFilter: 'all'
};

// ========== NAVIGATION ==========
function navigate(page, el) {
  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  // Show page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  state.currentPage = page;

  // Load data for the page
  if (page === 'analytics') loadAnalytics();
  if (page === 'predictions') loadPredictions();
  if (page === 'alerts') loadAlerts();
  if (page === 'settings') loadSettings();
}

// ========== CLOCK ==========
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN');
}

setInterval(updateClock, 1000);
updateClock();

// ========== LIVE DASHBOARD POLLING ==========
async function fetchDashboard() {
  try {
    const res = await fetch('/api/energy/dashboard');
    if (!res.ok) return;
    const data = await res.json();
    updateDashboardUI(data);
  } catch (e) {
    console.warn('[Dashboard] Fetch error:', e);
  }
}

function updateDashboardUI(data) {
  // Stat cards
  setText('currentPower', data.current_power_w + ' W');
  setText('currentVoltage', data.current_voltage_v + ' V');
  setText('currentAmps', data.current_current_a + ' A');
  setText('todayKwh', data.today_kwh + ' kWh');
  setText('todayCost', '₹' + data.estimated_cost_inr);
  setText('tariffInfo', '₹' + data.tariff_per_kwh + ' / kWh (TSECPDCL)');

  const changeEl = document.getElementById('todayChange');
  if (changeEl) {
    const pct = data.change_vs_yesterday_pct;
    const sign = pct >= 0 ? '+' : '';
    changeEl.innerHTML = `<span class="${pct > 0 ? 'up' : 'down'}">${sign}${pct}% vs yesterday</span>`;
  }

  // Alert level
  const level = data.alert_level;
  setText('alertLevel', level.toUpperCase());
  setText('thresholdInfo', 'Threshold: ' + data.power_threshold_w + ' W');

  const alertBadge = document.getElementById('alertLevelBadge');
  if (alertBadge) {
    alertBadge.textContent = level.charAt(0).toUpperCase() + level.slice(1);
    alertBadge.className = 'badge badge-' + level;
  }

  // Unread alert badge in sidebar
  const navBadge = document.getElementById('alertBadge');
  if (navBadge) {
    if (data.unread_alerts > 0) {
      navBadge.textContent = data.unread_alerts;
      navBadge.style.display = 'inline';
    } else {
      navBadge.style.display = 'none';
    }
  }

  // Update weekly chart
  if (data.weekly_trend && state.charts.weekly) {
    state.charts.weekly.data.labels = data.weekly_trend.map(d => d.date);
    state.charts.weekly.data.datasets[0].data = data.weekly_trend.map(d => d.kwh);
    state.charts.weekly.data.datasets[0].backgroundColor = data.weekly_trend.map(d =>
      d.kwh > 5 ? 'rgba(239,68,68,0.75)' : d.kwh > 3.5 ? 'rgba(245,158,11,0.75)' : 'rgba(34,197,94,0.75)'
    );
    state.charts.weekly.update('none');
  }

  // Update hourly chart
  if (data.hourly_today && state.charts.hourly) {
    const hourly = data.hourly_today.filter(h => h.kwh > 0);
    state.charts.hourly.data.labels = hourly.map(h => h.hour + ':00');
    state.charts.hourly.data.datasets[0].data = hourly.map(h => h.kwh);
    state.charts.hourly.update('none');
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ========== CHART DEFAULTS ==========
function chartDefaults(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: { legend: { display: false }, tooltip: { ...tooltipStyle() } },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#7d8590', font: { size: 11, family: "'DM Sans', sans-serif" } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#7d8590', font: { size: 11, family: "'DM Sans', sans-serif" } }
      }
    },
    ...overrides
  };
}

function tooltipStyle() {
  return {
    backgroundColor: '#1c2128',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    titleColor: '#e6edf3',
    bodyColor: '#7d8590',
    padding: 10,
    cornerRadius: 8
  };
}

// ========== INIT CHARTS ==========
function initDashboardCharts() {
  // Weekly bar chart
  const weeklyCtx = document.getElementById('weeklyChart');
  if (weeklyCtx && !state.charts.weekly) {
    state.charts.weekly = new Chart(weeklyCtx, {
      type: 'bar',
      data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
          data: [0,0,0,0,0,0,0],
          backgroundColor: 'rgba(34,197,94,0.75)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: chartDefaults()
    });
  }

  // Hourly line chart
  const hourlyCtx = document.getElementById('hourlyChart');
  if (hourlyCtx && !state.charts.hourly) {
    state.charts.hourly = new Chart(hourlyCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.07)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#22c55e',
          borderWidth: 2
        }]
      },
      options: chartDefaults()
    });
  }

  // Pie chart
  const pieCtx = document.getElementById('pieChart');
  if (pieCtx && !state.charts.pie) {
    state.charts.pie = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: ['Lighting', 'AC', 'Appliances'],
        datasets: [{
          data: [28, 45, 27],
          backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltipStyle() }
        }
      }
    });
  }
}

// ========== ANALYTICS ==========
async function loadAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    if (!res.ok) return;
    const data = await res.json();

    setText('weeklyTotal', data.weekly_total_kwh + ' kWh');
    setText('dailyAvg', data.avg_daily_kwh + ' kWh');
    setText('weeklyCost', '₹' + data.weekly_cost);
    setText('peakDay', data.peak_day ? data.peak_day.date : '—');

    const labels = data.days.map(d => d.date);
    const actualData = data.days.map(d => d.actual_kwh);
    const predictedData = data.days.map(d => d.predicted_kwh);

    // Analytics chart
    const aCtx = document.getElementById('analyticsChart');
    if (aCtx) {
      if (state.charts.analytics) state.charts.analytics.destroy();
      state.charts.analytics = new Chart(aCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Actual',
              data: actualData,
              backgroundColor: 'rgba(59,130,246,0.75)',
              borderRadius: 4
            },
            {
              label: 'Predicted',
              data: predictedData,
              backgroundColor: 'rgba(245,158,11,0.4)',
              borderRadius: 4
            }
          ]
        },
        options: chartDefaults({
          plugins: {
            legend: {
              display: true,
              labels: { color: '#7d8590', font: { size: 11 }, boxWidth: 10, boxHeight: 10 }
            },
            tooltip: tooltipStyle()
          }
        })
      });
    }

    // Table
    const tbody = document.querySelector('#analyticsTable tbody');
    if (tbody) {
      tbody.innerHTML = data.days.map(d => `
        <tr>
          <td>${d.date_full}</td>
          <td>${d.actual_kwh}</td>
          <td>${d.predicted_kwh !== null ? d.predicted_kwh : '—'}</td>
          <td>₹${d.cost}</td>
          <td>${d.peak_hour !== null ? d.peak_hour + ':00' : '—'}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.warn('[Analytics]', e);
  }
}

// ========== PREDICTIONS ==========
async function loadPredictions() {
  try {
    const res = await fetch('/api/predict');
    if (!res.ok) {
      const err = await res.json();
      document.getElementById('predTotal').textContent = 'Not enough data';
      document.getElementById('ib-label') && (document.querySelector('.ib-label').textContent = err.error || 'Collect at least 24 hours of readings.');
      return;
    }
    const data = await res.json();

    setText('predTotal', data.predicted_kwh + ' kWh');

    const hours = Array.from({ length: 24 }, (_, i) => i + ':00');
    const pCtx = document.getElementById('predictChart');
    if (pCtx) {
      if (state.charts.predict) state.charts.predict.destroy();
      state.charts.predict = new Chart(pCtx, {
        type: 'line',
        data: {
          labels: hours,
          datasets: [{
            label: 'Predicted kWh',
            data: data.hourly_predictions || [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#3b82f6',
            borderWidth: 2
          }]
        },
        options: chartDefaults()
      });
    }

    // Accuracy chart
    loadAccuracyChart();
  } catch (e) {
    console.warn('[Predictions]', e);
  }
}

async function loadAccuracyChart() {
  try {
    const res = await fetch('/api/predict/accuracy');
    if (!res.ok) return;
    const data = await res.json();

    const accEl = document.getElementById('accuracyChart');
    const noDataEl = document.getElementById('noAccuracyData');

    if (!data.accuracy || data.accuracy.length === 0) {
      if (noDataEl) noDataEl.style.display = 'block';
      return;
    }

    if (noDataEl) noDataEl.style.display = 'none';

    if (accEl) {
      if (state.charts.accuracy) state.charts.accuracy.destroy();
      state.charts.accuracy = new Chart(accEl, {
        type: 'line',
        data: {
          labels: data.accuracy.map(d => d.date_label),
          datasets: [{
            label: 'MAE (kWh)',
            data: data.accuracy.map(d => d.mae),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.08)',
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#22c55e',
            borderWidth: 2
          }]
        },
        options: chartDefaults()
      });
    }
  } catch (e) {
    console.warn('[Accuracy]', e);
  }
}

// ========== ALERTS ==========
async function loadAlerts(level = state.alertFilter) {
  try {
    const params = new URLSearchParams({ page: 1 });
    if (level !== 'all') params.set('level', level);
    const res = await fetch('/api/alerts/?' + params);
    if (!res.ok) return;
    const data = await res.json();

    const container = document.getElementById('alertsList');
    if (!container) return;

    if (data.alerts.length === 0) {
      container.innerHTML = `<div style="text-align:center;color:#7d8590;font-size:13px;padding:32px">No alerts found.</div>`;
      return;
    }

    const icons = { high: '🔴', medium: '🟡', low: '🔵' };
    container.innerHTML = data.alerts.map(a => `
      <div class="alert-item level-${a.level} ${a.is_read ? '' : 'unread'}" onclick="markAlertRead(${a.id}, this)">
        <div class="ai-icon">${icons[a.level] || '⚪'}</div>
        <div class="ai-body">
          <div class="ai-title">${escHtml(a.title)}</div>
          <div class="ai-msg">${escHtml(a.message)}</div>
          <div class="ai-time">${formatTime(a.created_at)}</div>
        </div>
        ${!a.is_read ? '<div class="ai-unread-dot"></div>' : ''}
      </div>
    `).join('');
  } catch (e) {
    console.warn('[Alerts]', e);
  }
}

function filterAlerts(level, el) {
  state.alertFilter = level;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  loadAlerts(level);
}

async function markAlertRead(id, el) {
  try {
    await fetch(`/api/alerts/${id}/read`, { method: 'POST' });
    const dot = el.querySelector('.ai-unread-dot');
    if (dot) dot.remove();
    el.classList.remove('unread');
  } catch (e) {}
}

async function markAllRead() {
  try {
    await fetch('/api/alerts/mark-all-read', { method: 'POST' });
    loadAlerts();
    const navBadge = document.getElementById('alertBadge');
    if (navBadge) navBadge.style.display = 'none';
  } catch (e) {}
}

// ========== SETTINGS ==========
async function loadSettings() {
  try {
    const res = await fetch('/api/energy/settings');
    if (!res.ok) return;
    const s = await res.json();
    state.settings = s;

    setSlider('sPowerThresh', s.power_threshold_w, 'sPowerLabel', 'W');
    setSlider('sDailyLimit', s.daily_limit_kwh, 'sDailyLabel', 'kWh', true);
    setSlider('sTariff', s.tariff_per_kwh, 'sTariffLabel', '₹', false, true);

    const ipEl = document.getElementById('sDeviceIP');
    if (ipEl) ipEl.value = s.esp32_ip || '192.168.1.105';

    const pollEl = document.getElementById('sPollInterval');
    if (pollEl) pollEl.value = s.poll_interval_sec || 5;

    const emailEl = document.getElementById('sAlertEmail');
    if (emailEl) emailEl.value = s.alert_email || '';

    const chkEl = document.getElementById('sEmailAlerts');
    if (chkEl) chkEl.checked = s.email_alerts;

    // Update sidebar device IP
    const deviceIPEl = document.getElementById('deviceIP');
    if (deviceIPEl) deviceIPEl.textContent = s.esp32_ip || '—';
  } catch (e) {
    console.warn('[Settings]', e);
  }
}

function setSlider(sliderId, value, labelId, suffix, decimal = false, prefix = false) {
  const slider = document.getElementById(sliderId);
  const label = document.getElementById(labelId);
  if (slider) slider.value = value;
  if (label) {
    if (prefix) label.textContent = suffix + parseFloat(value).toFixed(2);
    else if (decimal) label.textContent = parseFloat(value).toFixed(1) + ' ' + suffix;
    else label.textContent = value + ' ' + suffix;
  }
}

function updateSliderLabel(sliderId, labelId, suffix = '', decimal = false, prefix = false) {
  const slider = document.getElementById(sliderId);
  const label = document.getElementById(labelId);
  if (!slider || !label) return;
  const v = parseFloat(slider.value);
  if (prefix) label.textContent = suffix + v.toFixed(2);
  else if (decimal) label.textContent = v.toFixed(1) + ' ' + suffix;
  else label.textContent = Math.round(v) + (suffix ? ' ' + suffix : '');
}

async function saveSettings() {
  const payload = {
    power_threshold_w: parseFloat(document.getElementById('sPowerThresh').value),
    daily_limit_kwh: parseFloat(document.getElementById('sDailyLimit').value),
    tariff_per_kwh: parseFloat(document.getElementById('sTariff').value),
    esp32_ip: document.getElementById('sDeviceIP').value,
    poll_interval_sec: parseInt(document.getElementById('sPollInterval').value),
    alert_email: document.getElementById('sAlertEmail').value,
    email_alerts: document.getElementById('sEmailAlerts').checked
  };

  try {
    const res = await fetch('/api/energy/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const savedEl = document.getElementById('settingsSaved');
      if (savedEl) {
        savedEl.style.display = 'inline';
        setTimeout(() => savedEl.style.display = 'none', 3000);
      }
      // Restart polling with new interval
      startPolling(payload.poll_interval_sec * 1000);
    }
  } catch (e) {
    console.warn('[Settings Save]', e);
  }
}

// ========== EXPORT ==========
function exportCSV(days = 7) {
  window.location.href = `/api/energy/export/csv?days=${days}`;
}

// ========== HELPERS ==========
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ========== POLLING ==========
function startPolling(intervalMs = 5000) {
  if (state.pollInterval) clearInterval(state.pollInterval);
  state.pollInterval = setInterval(() => {
    if (state.currentPage === 'dashboard') fetchDashboard();
  }, intervalMs);
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  initDashboardCharts();
  fetchDashboard();
  startPolling(5000);

  // Handle URL hash for direct navigation
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    const link = document.querySelector(`[data-page="${hash}"]`);
    if (link) navigate(hash, link);
  }
});
