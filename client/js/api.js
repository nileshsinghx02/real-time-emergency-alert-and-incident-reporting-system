/* ===================================================================
   API Layer — Centralized fetch wrapper for all backend calls
   =================================================================== */

const API_BASE = window.location.origin + '/api';

// ---- Helpers ----

function getToken() {
  return localStorage.getItem('token');
}

function getHeaders(isJSON = true) {
  const headers = {};
  if (isJSON) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function saveAuth(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('refreshToken', data.refreshToken || '');
  localStorage.setItem('user', JSON.stringify(data.user));
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

function isLoggedIn() {
  return !!getToken();
}

// Generic fetch wrapper with error handling
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(API_BASE + endpoint, options);
    const data = await res.json();

    if (!res.ok) {
      // Access token expired → try silent refresh once, then retry original request
      if (res.status === 401 && data.code === 'TOKEN_EXPIRED' && !options._isRetry) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          const retryOptions = { ...options, _isRetry: true };
          if (retryOptions.body instanceof FormData) {
            delete retryOptions.headers;
          } else if (retryOptions.headers) {
            retryOptions.headers = { ...retryOptions.headers, Authorization: `Bearer ${getToken()}` };
          }
          return apiFetch(endpoint, retryOptions);
        }
      }
      // If unauthorized, redirect to login
      if (res.status === 401) {
        clearAuth();
        window.location.href = '/';
        return;
      }
      throw new Error(data.message || data.errors?.[0]?.msg || 'Something went wrong');
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Network error — check your connection');
    }
    throw err;
  }
}

// Silent refresh flow
async function tryRefreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;
  try {
    const res = await fetch(API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const data = await res.json();
    if (!res.ok) return false;
    localStorage.setItem('token', data.token);
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    return true;
  } catch {
    return false;
  }
}

// ---- Auth API ----

async function apiRegister(name, email, password, phone = '') {
  return apiFetch('/auth/register', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, email, password, phone })
  });
}

async function apiLogin(email, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email, password })
  });
}

async function apiGetMe() {
  return apiFetch('/auth/me', {
    headers: getHeaders()
  });
}

async function apiUpdateProfile(data) {
  return apiFetch('/auth/profile', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
}

async function apiLogout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST', headers: getHeaders() });
  } catch { /* ignore */ }
  disconnectSocket();
  clearAuth();
  window.location.href = '/';
}

async function apiForgotPassword(email) {
  return apiFetch('/auth/forgot-password', {
    method: 'POST',
    credentials: 'include',
    headers: getHeaders(),
    body: JSON.stringify({ email })
  });
}

async function apiResetPassword(token, password) {
  return apiFetch('/auth/reset-password', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ token, password })
  });
}

// ---- Reports API ----

async function apiSubmitReport(formData) {
  // formData is a FormData object (for file upload)
  return apiFetch('/reports', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData
  });
}

async function apiGetMyReports(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/reports/my?${query}`, {
    headers: getHeaders()
  });
}

async function apiGetAllReports(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/reports?${query}`, {
    headers: getHeaders()
  });
}

async function apiGetReport(id) {
  return apiFetch(`/reports/${id}`, {
    headers: getHeaders()
  });
}

async function apiUpdateReportStatus(id, status, adminNotes = '') {
  return apiFetch(`/reports/${id}/status`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({
      status,
      note: adminNotes,
      rejectedReason: adminNotes,
      resolutionNotes: adminNotes
    })
  });
}

async function apiDeleteReport(id) {
  return apiFetch(`/reports/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
}

async function apiUpdateReport(id, data) {
  return apiFetch(`/reports/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
}

async function apiWithdrawReport(id, reason) {
  return apiFetch(`/reports/${id}/withdraw`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ reason })
  });
}

async function apiSetPriority(id, priority, reason = '') {
  return apiFetch(`/reports/${id}/priority`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ priority, reason })
  });
}

async function apiGetRecommendations(id) {
  return apiFetch(`/reports/${id}/recommendations`, { headers: getHeaders() });
}

async function apiAssignResponder(id, responderUserId) {
  return apiFetch(`/reports/${id}/assign`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ responderUserId })
  });
}

async function apiRejectAssignment(id, reason) {
  return apiFetch(`/reports/${id}/reject-assignment`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ reason })
  });
}

async function apiLinkDuplicate(id, primaryId) {
  return apiFetch(`/reports/${id}/link-duplicate`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ primaryId })
  });
}

async function apiUnlinkDuplicate(id) {
  return apiFetch(`/reports/${id}/unlink-duplicate`, {
    method: 'PATCH',
    headers: getHeaders()
  });
}

async function apiSubmitFeedback(id, rating, comment) {
  return apiFetch(`/reports/${id}/feedback`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ rating, comment })
  });
}

async function apiGetFeedback(id) {
  return apiFetch(`/reports/${id}/feedback`, { headers: getHeaders() });
}

// ---- Responders API ----

async function apiGetMyResponderProfile() {
  return apiFetch('/responders/me', { headers: getHeaders() });
}

async function apiUpdateResponderProfile(data) {
  return apiFetch('/responders/me', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
}

async function apiGetMyIncidents(view = 'active') {
  return apiFetch(`/responders/me/incidents?view=${view}`, { headers: getHeaders() });
}

async function apiGetResponders(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/responders?${query}`, { headers: getHeaders() });
}

async function apiCreateResponder(data) {
  return apiFetch('/responders', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
}

async function apiUpdateResponder(id, data) {
  return apiFetch(`/responders/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
}

async function apiDeactivateResponder(id) {
  return apiFetch(`/responders/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
}

async function apiGetNearbyResponders(lat, lng, specialization = '', radiusKm = 10) {
  return apiFetch(`/responders/nearby?lat=${lat}&lng=${lng}&specialization=${specialization}&radiusKm=${radiusKm}`, { headers: getHeaders() });
}

// ---- Notifications API ----

async function apiGetNotifications(unreadOnly = false, limit = 30) {
  return apiFetch(`/notifications?limit=${limit}${unreadOnly ? '&unread=true' : ''}`, { headers: getHeaders() });
}

async function apiGetUnreadCount() {
  return apiFetch('/notifications/unread-count', { headers: getHeaders() });
}

async function apiMarkNotificationRead(id) {
  return apiFetch(`/notifications/${id}/read`, {
    method: 'PATCH',
    headers: getHeaders()
  });
}

async function apiMarkAllNotificationsRead() {
  return apiFetch('/notifications/read-all', {
    method: 'PATCH',
    headers: getHeaders()
  });
}

// ---- Users API (admin) ----

async function apiGetUsers(params = {}) {
  // drop empty values so server-side validators (isIn etc.) don't reject ''
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  const query = new URLSearchParams(clean).toString();
  return apiFetch(`/users?${query}`, { headers: getHeaders() });
}

async function apiSetUserActive(id, active) {
  return apiFetch(`/users/${id}/${active ? 'activate' : 'deactivate'}`, {
    method: 'PATCH',
    headers: getHeaders()
  });
}

// ---- Audit API (admin) ----

async function apiGetAuditLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/audit?${query}`, { headers: getHeaders() });
}

// ---- Hotspots API ----

async function apiGetHotspots(days = 30, minCount = 2) {
  return apiFetch(`/hotspots?days=${days}&minCount=${minCount}`, { headers: getHeaders() });
}

// ---- Admin Analytics ----

async function apiGetAdminStats() {
  return apiFetch('/stats/admin', { headers: getHeaders() });
}

/* ============================================================
   SHARED UI HELPERS (used by every dashboard page)
   ============================================================ */

/* ---------- Toast notifications ---------- */
const TOAST_ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

function showToast(type, title, message, duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</div>
    <div class="toast-body">
      <div class="toast-title">${title || ''}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  const remove = () => {
    if (!toast.parentNode) return;
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', remove);
  container.appendChild(toast);
  setTimeout(remove, duration);
}

/* ---------- Formatting ---------- */
function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatStatus(s) {
  return (s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function getTypeInfo(type) {
  const map = {
    accident: { icon: '🚗', label: 'Accident' },
    fire: { icon: '🔥', label: 'Fire' },
    crime: { icon: '🚔', label: 'Crime' },
    medical: { icon: '🏥', label: 'Medical' },
    natural_disaster: { icon: '🌊', label: 'Natural Disaster' },
    other: { icon: '📌', label: 'Other' }
  };
  return map[type] || map.other;
}

function getSeverityInfo(sev) {
  const map = {
    low: { icon: '🟢', label: 'Low' },
    medium: { icon: '🟡', label: 'Medium' },
    high: { icon: '🟠', label: 'High' },
    critical: { icon: '🔴', label: 'Critical' }
  };
  return map[sev] || map.medium;
}

/* ---------- Report card (citizen "My Reports" list) ---------- */
function createReportCard(report) {
  const t = getTypeInfo(report.type);
  const sev = getSeverityInfo(report.severity);
  const card = document.createElement('div');
  card.className = `report-card severity-${report.severity || 'medium'}`;
  card.innerHTML = `
    <div class="report-header">
      <div class="report-title">${t.icon} ${t.label}</div>
      <div class="report-meta">
        <span class="badge badge-type">${t.label}</span>
        <span class="badge badge-severity-${report.severity || 'medium'}">${sev.icon} ${sev.label}</span>
        <span class="badge badge-status-${formatStatus(report.status)}">${formatStatus(report.status)}</span>
        ${report.priorityScore != null ? `<span class="badge badge-priority-${report.priorityLevel || 'medium'}">⚡ ${report.priorityScore}</span>` : ''}
      </div>
    </div>
    <p class="report-description">${(report.description || '').slice(0, 140)}${(report.description || '').length > 140 ? '…' : ''}</p>
    <div class="report-footer">
      <span>📍 ${report.location?.address || 'Location on map'}</span>
      <span>🕐 ${formatDate(report.createdAt)}</span>
    </div>
  `;
  card.addEventListener('click', () => openReportDetail(report._id));
  return card;
}

/* ---------- Image lightbox (fallback; admin page defines its own) ---------- */
window.openLightbox = window.openLightbox || function (src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:10000;cursor:zoom-out;';
  overlay.innerHTML = `<img src="${src}" style="max-width:90%;max-height:90%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.6)">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
};
