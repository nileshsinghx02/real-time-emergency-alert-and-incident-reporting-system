/* ===================================================================
   Home / Landing Page — Real-time stats + Auth modal
   =================================================================== */

(function () {
  // If already logged in, redirect to dashboard
  if (isLoggedIn()) {
    const user = getUser();
    if (user && user.role === 'admin') {
      window.location.href = '/admin-dashboard.html';
    } else if (user && user.role === 'responder') {
      window.location.href = '/responder-dashboard.html';
    } else {
      window.location.href = '/user-dashboard.html';
    }
    return;
  }

  // Route citizens/responders to the correct dashboards after login
  function dashboardFor(role) {
    if (role === 'admin') return '/admin-dashboard.html';
    if (role === 'responder') return '/responder-dashboard.html';
    return '/user-dashboard.html';
  }

  // Format a date for tables/popups
  function formatDate(d) {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date)) return '—';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---- Load Public Stats (real data from DB) ----
  async function loadPublicStats() {
    try {
      const res = await fetch(API_BASE + '/stats/public');
      const data = await res.json();
      if (!data.success) return;

      const s = data.stats;

      // Main counters
      animateNumber('homeStatTotal', s.totalReports);
      animateNumber('homeStatPending', s.statuses.Pending);
      animateNumber('homeStatProgress', s.statuses['In Progress']);
      animateNumber('homeStatResolved', s.statuses.Resolved);
      animateNumber('homeStatUsers', s.totalUsers);
      document.getElementById('homeStatAvgTime').textContent = s.avgResolutionHours || '—';

      // Severity bar
      const total = s.totalReports || 1;
      const sev = s.severities;
      document.getElementById('sevLow').textContent = sev.low || 0;
      document.getElementById('sevMedium').textContent = sev.medium || 0;
      document.getElementById('sevHigh').textContent = sev.high || 0;
      document.getElementById('sevCritical').textContent = sev.critical || 0;

      const bar = document.getElementById('severityBar');
      bar.innerHTML = `
        <div style="width: ${((sev.low || 0) / total * 100)}%; background: var(--severity-low);" title="Low: ${sev.low || 0}"></div>
        <div style="width: ${((sev.medium || 0) / total * 100)}%; background: var(--severity-medium);" title="Medium: ${sev.medium || 0}"></div>
        <div style="width: ${((sev.high || 0) / total * 100)}%; background: var(--severity-high);" title="High: ${sev.high || 0}"></div>
        <div style="width: ${((sev.critical || 0) / total * 100)}%; background: var(--severity-critical);" title="Critical: ${sev.critical || 0}"></div>
      `;

      // Type breakdown
      const typeContainer = document.getElementById('typeBreakdown');
      const typeConfig = {
        accident: { icon: '🚗', label: 'Accident', bg: 'rgba(249,115,22,0.12)' },
        fire: { icon: '🔥', label: 'Fire', bg: 'rgba(239,68,68,0.12)' },
        crime: { icon: '🚔', label: 'Crime', bg: 'rgba(139,92,246,0.12)' },
        medical: { icon: '🏥', label: 'Medical', bg: 'rgba(236,72,153,0.12)' },
        natural_disaster: { icon: '🌊', label: 'Natural Disaster', bg: 'rgba(6,182,212,0.12)' },
        other: { icon: '📌', label: 'Other', bg: 'rgba(107,114,128,0.12)' }
      };

      const allTypes = ['accident', 'fire', 'crime', 'medical', 'natural_disaster', 'other'];
      typeContainer.innerHTML = allTypes.map(type => {
        const conf = typeConfig[type];
        const count = s.types[type] || 0;
        return `
          <div class="type-card">
            <div class="type-icon" style="background: ${conf.bg};">${conf.icon}</div>
            <div>
              <div class="type-count">${count}</div>
              <div class="type-label">${conf.label}</div>
            </div>
          </div>
        `;
      }).join('');

      // Recently resolved
      const recentContainer = document.getElementById('recentResolved');
      if (s.recentResolved && s.recentResolved.length > 0) {
        recentContainer.innerHTML = `
          <table class="recent-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Location</th>
                <th>Severity</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              ${s.recentResolved.map(r => {
                const tc = typeConfig[r.type] || typeConfig.other;
                const sevColors = { low: 'var(--severity-low)', medium: 'var(--severity-medium)', high: 'var(--severity-high)', critical: 'var(--severity-critical)' };
                return `
                  <tr>
                    <td>${tc.icon} ${tc.label}</td>
                    <td><strong>${r.title}</strong></td>
                    <td style="color: var(--text-secondary);">${r.location?.address || 'N/A'}</td>
                    <td><span class="badge badge-severity-${r.severity}" style="text-transform: capitalize;">${r.severity}</span></td>
                    <td style="color: var(--text-muted); font-size: 0.82rem;">${formatDate(r.resolvedAt || r.createdAt)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      } else {
        recentContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No resolved incidents yet</h3>
            <p>Resolved emergency reports will appear here.</p>
          </div>
        `;
      }

    } catch (err) {
      console.error('Failed to load public stats:', err);
      document.getElementById('homeStatTotal').textContent = '—';
    }
  }

  // Animate number counting up
  function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el || target === 0) { el.textContent = '0'; return; }
    const duration = 800;
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---- Auth Modal ----
  window.openAuthModal = function (mode) {
    document.getElementById('authModal').classList.remove('hidden');
    if (mode === 'register') {
      document.getElementById('loginSection').classList.add('hidden');
      document.getElementById('registerSection').classList.remove('hidden');
    } else {
      document.getElementById('registerSection').classList.add('hidden');
      document.getElementById('loginSection').classList.remove('hidden');
    }
  };

  window.closeAuthModal = function () {
    document.getElementById('authModal').classList.add('hidden');
  };

  // Close modal on overlay click
  document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });

  // Toggle login/register
  document.getElementById('showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('registerSection').classList.remove('hidden');
  });

  document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('registerSection').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
  });

  // Login handler
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) { showToast('warning', 'Missing fields', 'Please fill in all fields'); return; }
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const data = await apiLogin(email, password);
      saveAuth(data);
      showToast('success', 'Welcome back!', `Hello, ${data.user.name}`);
      setTimeout(() => {
        window.location.href = dashboardFor(data.user.role);
      }, 500);
    } catch (err) {
      showToast('error', 'Login failed', err.message);
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  // Register handler
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;

    if (!name || !email || !password) { showToast('warning', 'Missing fields', 'Please fill in all required fields'); return; }
    if (password.length < 6) { showToast('warning', 'Weak password', 'Password must be at least 6 characters'); return; }
    if (password !== confirm) { showToast('error', 'Mismatch', 'Passwords do not match'); return; }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const data = await apiRegister(name, email, password, phone);
      saveAuth(data);
      showToast('success', 'Account created!', `Welcome, ${data.user.name}`);
      setTimeout(() => { window.location.href = '/user-dashboard.html'; }, 500);
    } catch (err) {
      showToast('error', 'Registration failed', err.message);
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });

  // ---- Live Incident Map ----
  let homeMap = null;
  let homeMarkers = null;

  function severityColor(sev) {
    return { low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' }[sev] || '#0ea5e9';
  }

  function initHomeMap() {
    if (!window.L || homeMap) return;
    homeMap = L.map('homeMap', { scrollWheelZoom: false }).setView([28.6139, 77.2090], 11);
    const mapTilerKey = 'PD10oWCF3a50XHfSVfZh';

L.tileLayer(`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${mapTilerKey}`, {
    tileSize: 512,
    zoomOffset: -1,
    minZoom: 1,
    maxZoom: 20,
    attribution: '&copy; MapTiler &copy; OpenStreetMap contributors'
}).addTo(homeMap);
    homeMarkers = L.layerGroup().addTo(homeMap);
  }

  async function loadHomeMap() {
    initHomeMap();
    if (!homeMap) return;
    try {
      const data = await fetch(API_BASE + '/stats/public-map').then(r => r.json()).catch(() => null);
      homeMarkers.clearLayers();
      if (data && data.success && Array.isArray(data.incidents)) {
        data.incidents.forEach(r => {
          if (r.lat && r.lng) {
            const c = severityColor(r.severity);
            L.circleMarker([r.lat, r.lng], {
              radius: r.severity === 'critical' ? 10 : 7,
              color: c,
              weight: 2,
              fillColor: c,
              fillOpacity: 0.5
            }).addTo(homeMarkers)
              .bindPopup(`<strong>${r.title}</strong><br><span style="font-size:12px;color:#666">${r.type.replace('_', ' ')} · ${r.severity} · ${formatDate(r.createdAt)}</span>`);
          }
        });
      }
      setTimeout(() => homeMap && homeMap.invalidateSize(), 200);
    } catch (err) {
      console.warn('Home map load failed:', err);
    }
  }

  // ---- Forgot Password ----
  const forgotSection = document.getElementById('forgotSection');
  const loginSection = document.getElementById('loginSection');

  document.getElementById('showForgot').addEventListener('click', (e) => {
    e.preventDefault();
    loginSection.classList.add('hidden');
    forgotSection.classList.remove('hidden');
  });

  document.getElementById('backToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    forgotSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
  });

  document.getElementById('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('forgotBtn');
    const email = document.getElementById('forgotEmail').value.trim();
    const resultBox = document.getElementById('forgotResult');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    resultBox.classList.add('hidden');
    try {
      const data = await apiForgotPassword(email);
      let html = `<div class="duplicate-warning" style="border-color: rgba(16,185,129,0.4); background: rgba(16,185,129,0.08);">
        <div class="dup-header" style="color:#047857;">✅ ${data.message || 'Reset link sent'}</div>`;
      // In dev (no SMTP configured) the API returns the link directly
      if (data.resetUrl) {
        html += `<p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px;">Email service not configured — use this direct link:</p>
          <a href="${data.resetUrl}" class="btn btn-sm btn-primary">Open reset link</a>`;
      }
      html += `</div>`;
      resultBox.innerHTML = html;
      resultBox.classList.remove('hidden');
    } catch (err) {
      resultBox.innerHTML = `<div class="duplicate-warning" style="border-color: rgba(239,68,68,0.4);">
        <div class="dup-header" style="color:#b91c1c;">❌ ${err.message}</div></div>`;
      resultBox.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Reset Link';
    }
  });

  // ---- Init ----
  loadPublicStats();
  loadHomeMap();

  // Refresh stats every 30 seconds
  setInterval(loadPublicStats, 30000);
  setInterval(loadHomeMap, 30000);
})();
