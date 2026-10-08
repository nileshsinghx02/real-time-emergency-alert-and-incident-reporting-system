/* ===================================================================
   Admin Dashboard — Live report feed, filters, status management
   =================================================================== */

(function () {
  // ---- Auth guard ----
  if (!isLoggedIn()) {
    window.location.href = '/';
    return;
  }
  const user = getUser();
  if (user.role !== 'admin') {
    window.location.href = '/user-dashboard.html';
    return;
  }

  // Set admin info
  document.getElementById('adminName').textContent = user.name;
  document.getElementById('adminAvatar').textContent = user.name.charAt(0).toUpperCase();

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearAuth();
    disconnectSocket();
    window.location.href = '/';
  });

  // ---- Profile Toggle ----
  let profileVisible = false;

  // ---- Tabs ----
  const tabBtns = document.querySelectorAll('#adminTabs .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['overview', 'reports', 'analytics', 'hotspots', 'responders', 'users', 'audit', 'profile'].forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.classList.toggle('hidden', t !== btn.dataset.tab);
      });
      const tab = btn.dataset.tab;
      if (tab === 'overview') { loadReports(1); loadSlaWatchlist(); }
      if (tab === 'reports') loadReports(1);
      if (tab === 'analytics') loadAnalytics();
      if (tab === 'hotspots') loadHotspots();
      if (tab === 'responders') loadResponders();
      if (tab === 'users') loadUsers();
      if (tab === 'audit') loadAudit();
    });
  });

  // ---- Notifications ----
  const notifPanel = document.getElementById('notifPanel');
  const notifBadge = document.getElementById('bellBadge');

  document.getElementById('notifBell').addEventListener('click', async (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle('hidden');
    if (!notifPanel.classList.contains('hidden')) await loadNotifications();
  });

  document.addEventListener('click', (e) => {
    if (!notifPanel.contains(e.target) && !e.target.closest('#notifBell')) {
      notifPanel.classList.add('hidden');
    }
  });

  document.getElementById('markAllReadBtn').addEventListener('click', async () => {
    try {
      await apiMarkAllNotificationsRead();
      await loadNotifications();
      await refreshUnreadBadge();
    } catch (err) { showToast('error', 'Failed', err.message); }
  });

  const notifTypeMeta = {
    newReport: { icon: '🆕' }, reportVerified: { icon: '✅' }, reportRejected: { icon: '❌' },
    priorityChanged: { icon: '📈' }, responderAssigned: { icon: '🧑‍🚒' }, dispatched: { icon: '🚑' },
    responderAccepted: { icon: '👍' }, responderArrived: { icon: '📍' }, reportResolved: { icon: '🎉' },
    reportClosed: { icon: '📁' }, reportWithdrawn: { icon: '↩️' }, feedbackReceived: { icon: '⭐' },
    assignmentRejected: { icon: '⚠️' }, adminMessage: { icon: '💬' }, accountCreated: { icon: '👋' }
  };

  async function refreshUnreadBadge() {
    try {
      const data = await apiGetUnreadCount();
      const count = data.count || 0;
      notifBadge.textContent = count > 99 ? '99+' : count;
      notifBadge.classList.toggle('hidden', count === 0);
    } catch { /* silent */ }
  }

  async function loadNotifications() {
    const list = document.getElementById('notifList');
    try {
      const data = await apiGetNotifications(false, 30);
      if (!data.notifications || data.notifications.length === 0) {
        list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
        return;
      }
      list.innerHTML = data.notifications.map(n => {
        const meta = notifTypeMeta[n.type] || { icon: '🔔' };
        return `
          <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n._id}" data-report="${n.report?._id || n.report || ''}">
            <div class="notif-icon level-${n.level || 'info'}">${meta.icon}</div>
            <div class="notif-body">
              <div class="notif-title">${n.title || 'Notification'}</div>
              <div class="notif-message">${n.message}</div>
              <div class="notif-time">${formatDate(n.createdAt)}</div>
            </div>
          </div>`;
      }).join('');
      list.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async () => {
          const reportId = item.dataset.report;
          if (item.classList.contains('unread')) {
            try { await apiMarkNotificationRead(item.dataset.id); item.classList.remove('unread'); await refreshUnreadBadge(); } catch {}
          }
          if (reportId) {
            notifPanel.classList.add('hidden');
            openReportDetail(reportId);
          }
        });
      });
    } catch (err) {
      list.innerHTML = `<div class="notif-empty">Failed: ${err.message}</div>`;
    }
  }

  // ---- State ----
  let currentPage = 1;
  let newAlertCount = 0;
  let filterTimeout;

  // ---- Load Reports ----
  async function loadReports(page = 1) {
    const container = document.getElementById('adminReportsList');
    container.innerHTML = '<div class="flex justify-center" style="padding: 40px;"><div class="spinner"></div></div>';

    const params = { page, limit: 10 };
    const status = document.getElementById('filterStatus').value;
    const type = document.getElementById('filterType').value;
    const severity = document.getElementById('filterSeverity').value;
    const priority = document.getElementById('filterPriority').value;
    const assigned = document.getElementById('filterAssigned').value;
    const search = document.getElementById('searchInput').value.trim();

    if (status) params.status = status;
    if (type) params.type = type;
    if (severity) params.severity = severity;
    if (priority) params.priority = priority;
    if (assigned) params.assigned = assigned;
    if (search) params.search = search;

    try {
      const data = await apiGetAllReports(params);

      // Update stats (legacy 4-status from server)
      const stats = data.stats || {};
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      document.getElementById('statTotal').textContent = total;
      document.getElementById('statPending').textContent = stats.Pending || 0;
      document.getElementById('statProgress').textContent = stats['In Progress'] || 0;
      document.getElementById('statResolved').textContent = stats.Resolved || 0;

      if (!data.reports || data.reports.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No reports found</h3>
            <p>Try adjusting your filters or wait for new reports.</p>
          </div>`;
        renderPagination(0, 1);
        return;
      }

      container.innerHTML = '';
      data.reports.forEach(report => {
        container.appendChild(createAdminReportCard(report));
      });

      renderPagination(data.pagination.pages, data.pagination.page);
      currentPage = data.pagination.page;

    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error loading reports</h3><p>${err.message}</p></div>`;
    }
  }

  function createAdminReportCard(report) {
    const typeInfo = getTypeInfo(report.type);
    const sevInfo = getSeverityInfo(report.severity);
    const div = document.createElement('div');
    div.className = `report-card severity-${report.severity}`;
    div.dataset.id = report._id;

    const userName = report.user?.name || 'Unknown';
    const userPhone = report.user?.phone || '';

    let imagesHTML = '';
    if (report.images && report.images.length > 0) {
      imagesHTML = `<div class="report-images">
        ${report.images.map(img => `<img src="${img}" alt="Evidence" onclick="event.stopPropagation(); openLightbox('${img}')">`).join('')}
      </div>`;
    }

    const priorityBadge = report.priority
      ? `<span class="badge-priority badge-priority-${report.priority}">${report.priority}</span>` : '';
    const slaChip = report.slaBreached
      ? `<span class="sla-chip sla-breached">⏰ SLA breached</span>`
      : (report.responseMinutes != null ? `<span class="sla-chip">⏱ ${report.responseMinutes}m response</span>` : '');
    const assignedChip = report.assignedResponder
      ? `<span class="specialization-chip">🧑‍🚒 ${report.assignedResponder.name || 'Responder'}</span>` : '';

    div.innerHTML = `
      <div class="report-header">
        <div style="flex: 1;">
          <div class="report-title">${typeInfo.icon} ${report.title}</div>
          <div class="report-meta">
            <span class="badge badge-type">${typeInfo.label}</span>
            <span class="badge badge-severity-${report.severity}">${sevInfo.icon} ${sevInfo.label}</span>
            <span class="badge badge-status-${report.status}">${formatStatus(report.status)}</span>
            ${priorityBadge}
            ${slaChip}
            ${assignedChip}
          </div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <button class="btn btn-sm btn-primary" onclick="openReportDetail('${report._id}')">Manage</button>
        </div>
      </div>
      <div class="report-description">${report.description}</div>
      ${imagesHTML}
      <div class="report-footer">
        <div>
          <span class="text-muted" style="font-size: 0.82rem;">📍 ${report.location?.address || 'N/A'}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-muted" style="font-size: 0.82rem;">👤 ${userName}</span>
          ${userPhone ? `<span class="text-muted" style="font-size: 0.82rem;">📞 ${userPhone}</span>` : ''}
          <span class="text-muted" style="font-size: 0.82rem;">🕐 ${formatDate(report.createdAt)}</span>
        </div>
      </div>
    `;

    div.addEventListener('click', (e) => {
      if (!e.target.closest('button')) openReportDetail(report._id);
    });
    return div;
  }

  function formatStatus(s) {
    return (s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  // ---- Report Detail Modal (control-room actions) ----
  let currentDetailReport = null;

  window.openReportDetail = async function (reportId) {
    const modal = document.getElementById('reportDetailModal');
    const content = document.getElementById('reportDetailContent');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="flex justify-center" style="padding: 40px;"><div class="spinner"></div></div>';
    try {
      const data = await apiGetReport(reportId);
      currentDetailReport = data.report;
      renderReportDetail(data.report);
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${err.message}</p></div>`;
    }
  };

  function renderReportDetail(r) {
    const typeInfo = getTypeInfo(r.type);
    const sevInfo = getSeverityInfo(r.severity);
    const content = document.getElementById('reportDetailContent');

    const timelineHTML = (r.timeline && r.timeline.length > 0)
      ? `<div class="timeline">${r.timeline.slice().reverse().map(t => `
          <div class="timeline-item">
            <div class="timeline-dot done">●</div>
            <div class="timeline-content">
              <div class="timeline-title">${t.action}</div>
              ${t.note ? `<div class="timeline-note">${t.note}</div>` : ''}
              <div class="timeline-meta">
                <span>👤 ${t.actorName || 'System'}</span>
                <span>🕐 ${formatDate(t.at)}</span>
              </div>
            </div>
          </div>`).join('')}</div>`
      : '<p class="text-muted" style="font-size: 0.85rem;">No activity yet.</p>';

    const dupHTML = (r.duplicates && r.duplicates.length > 0)
      ? `<div class="duplicate-warning">
          <div class="dup-header">🔗 Linked duplicates (${r.duplicates.length})</div>
          ${r.duplicates.map(d => `<div class="duplicate-item"><span>${d.title || d}</span></div>`).join('')}
        </div>`
      : (r.duplicateOf ? `<div class="duplicate-warning"><div class="dup-header">🔗 Duplicate of another report</div></div>` : '');

    content.innerHTML = `
      <h3 style="margin-bottom: 4px;">${typeInfo.icon} ${r.title}</h3>
      <div class="report-meta" style="margin-bottom: 14px;">
        <span class="badge badge-type">${typeInfo.label}</span>
        <span class="badge badge-severity-${r.severity}">${sevInfo.icon} ${sevInfo.label}</span>
        <span class="badge badge-status-${r.status}">${formatStatus(r.status)}</span>
        ${r.priority ? `<span class="badge-priority badge-priority-${r.priority}">${r.priority}</span>` : ''}
      </div>
      <div class="neo-inset" style="margin-bottom: 14px;">
        <div class="detail-row"><span class="detail-label">Reporter</span><span class="detail-value">${r.user?.name || 'Unknown'} ${r.user?.phone ? '· 📞 ' + r.user.phone : ''}</span></div>
        <div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Description</span><span class="detail-value">${r.description}</span></div>
        <div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Location</span><span class="detail-value">📍 ${r.location?.address || 'N/A'}</span></div>
        ${r.affectedPeople ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Affected</span><span class="detail-value">${r.affectedPeople} people</span></div>` : ''}
        ${r.priorityReason ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Priority</span><span class="detail-value" style="font-size: 0.82rem;">${r.priorityReason}</span></div>` : ''}
        ${r.rejectedReason ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Rejected</span><span class="detail-value" style="color:#b91c1c;">${r.rejectedReason}</span></div>` : ''}
      </div>
      ${r.images && r.images.length ? `<div class="report-images">${r.images.map(img => `<img src="${img}" onclick="openLightbox('${img}')">`).join('')}</div>` : ''}
      ${dupHTML}
      <h4 style="margin: 18px 0 12px;">🕓 Activity Timeline</h4>
      ${timelineHTML}
      <div id="adminActions" style="margin-top: 18px;"></div>
    `;

    renderAdminActions(r);
  }

  function renderAdminActions(r) {
    const actions = document.getElementById('adminActions');
    actions.innerHTML = '';
    const s = r.status;

    const mkBtn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn btn-sm ' + cls;
      b.style.marginRight = '8px';
      b.style.marginBottom = '8px';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    };

    // Verify / Reject (REPORTED)
    if (s === 'REPORTED') {
      mkBtn('✅ Verify', 'btn-success', async () => {
        try {
          await apiUpdateReportStatus(r._id, 'VERIFIED');
          showToast('success', 'Verified', 'Report verified — SLA clock started');
          reloadDetail(r._id);
        } catch (err) { showToast('error', 'Failed', err.message); }
      });
      mkBtn('❌ Reject', 'btn-danger', () => {
        const actions = document.getElementById('adminActions');
        actions.innerHTML = `
          <div class="neo-inset">
            <h4 style="margin-bottom: 12px;">❌ Reject Report</h4>
            <div class="form-group">
              <label>Reason (required)</label>
              <textarea id="rejectReasonInput" class="form-control" rows="2" placeholder="e.g. Duplicate, prank, insufficient information..."></textarea>
            </div>
            <div class="flex gap-1" style="margin-top: 10px;">
              <button class="btn btn-sm btn-danger" id="confirmRejectBtn">Confirm Reject</button>
              <button class="btn btn-sm" id="cancelRejectBtn">Cancel</button>
            </div>
          </div>`;
        document.getElementById('confirmRejectBtn').addEventListener('click', async () => {
          const reason = document.getElementById('rejectReasonInput').value.trim();
          if (!reason) { showToast('warning', 'Reason required', 'Please provide a rejection reason'); return; }
          try {
            await apiUpdateReportStatus(r._id, 'REJECTED', reason);
            showToast('success', 'Rejected', 'Report rejected');
            reloadDetail(r._id);
          } catch (err) { showToast('error', 'Failed', err.message); }
        });
        document.getElementById('cancelRejectBtn').addEventListener('click', () => renderAdminActions(r));
      });
    }

    // Dispatch (VERIFIED / PRIORITIZED) — pick a responder first
    if (['VERIFIED', 'PRIORITIZED'].includes(s)) {
      mkBtn('🚑 Dispatch Responder', 'btn-primary', () => showRecommendations(r));
    }

    // Dispatch (ASSIGNED) — responder already chosen, send the dispatch order
    if (s === 'ASSIGNED') {
      mkBtn('🚑 Dispatch', 'btn-primary', async () => {
        try {
          await apiUpdateReportStatus(r._id, 'DISPATCHED');
          showToast('success', 'Dispatched', 'Responder notified — awaiting acceptance');
          reloadDetail(r._id);
        } catch (err) { showToast('error', 'Failed', err.message); }
      });
      mkBtn('🔄 Reassign', '', () => showRecommendations(r));
    }

    // Close (RESOLVED)
    if (s === 'RESOLVED') {
      mkBtn('📁 Close Incident', 'btn-primary', async () => {
        try {
          await apiUpdateReportStatus(r._id, 'CLOSED');
          showToast('success', 'Closed', 'Incident closed');
          reloadDetail(r._id);
        } catch (err) { showToast('error', 'Failed', err.message); }
      });
    }

    // Priority change (admin, any open status)
    if (!['RESOLVED', 'CLOSED', 'REJECTED', 'WITHDRAWN'].includes(s)) {
      mkBtn('📈 Change Priority', '', () => showPriorityForm(r));
    }

    // Link duplicate
    if (!['RESOLVED', 'CLOSED', 'REJECTED', 'WITHDRAWN'].includes(s)) {
      mkBtn('🔗 Link Duplicate', '', () => {
        const actions = document.getElementById('adminActions');
        actions.innerHTML = `
          <div class="neo-inset">
            <h4 style="margin-bottom: 12px;">🔗 Link Duplicate</h4>
            <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 8px;">Paste the ID of the primary (original) report. The current report will be marked as its duplicate.</p>
            <div class="form-group">
              <label>Primary report ID</label>
              <input type="text" id="primaryReportId" class="form-control" placeholder="e.g. 66f0a1b2c3d4e5f6a7b8c9d0" />
            </div>
            <div class="flex gap-1" style="margin-top: 10px;">
              <button class="btn btn-sm btn-primary" id="confirmLinkBtn">Link as Duplicate</button>
              <button class="btn btn-sm" id="cancelLinkBtn">Cancel</button>
            </div>
          </div>`;
        document.getElementById('confirmLinkBtn').addEventListener('click', async () => {
          const primaryId = document.getElementById('primaryReportId').value.trim();
          if (!primaryId) { showToast('warning', 'ID required', 'Paste the primary report ID first'); return; }
          try {
            await apiLinkDuplicate(r._id, primaryId);
            showToast('success', 'Linked', 'Marked as duplicate');
            reloadDetail(r._id);
          } catch (err) { showToast('error', 'Failed', err.message); }
        });
        document.getElementById('cancelLinkBtn').addEventListener('click', () => renderAdminActions(r));
      });
    }

    // Map
    if (r.location?.lat) {
      mkBtn('🗺️ View Map', '', () => viewOnMap(r.location.lat, r.location.lng, r.title));
    }

    // Delete (admin)
    mkBtn('🗑️ Delete', 'btn-danger', async () => {
      if (!confirm('Permanently delete this report?')) return;
      try {
        await apiDeleteReport(r._id);
        showToast('success', 'Deleted', 'Report deleted');
        document.getElementById('reportDetailModal').classList.add('hidden');
        loadReports(currentPage);
      } catch (err) { showToast('error', 'Failed', err.message); }
    });
  }

  async function reloadDetail(id) {
    try {
      const data = await apiGetReport(id);
      currentDetailReport = data.report;
      renderReportDetail(data.report);
    } catch { /* ignore */ }
    loadReports(currentPage);
  }

  // ---- Recommendations + Assign ----
  async function showRecommendations(r) {
    const actions = document.getElementById('adminActions');
    actions.innerHTML = '<div class="flex justify-center" style="padding: 20px;"><div class="spinner"></div></div>';
    try {
      const data = await apiGetRecommendations(r._id);
      const recs = data.recommendations || [];
      if (recs.length === 0) {
        actions.innerHTML = '<div class="notif-empty">No available responders found. Try again later.</div>';
        return;
      }
      actions.innerHTML = `
        <h4 style="margin-bottom: 12px;">🚑 Recommended Responders</h4>
        ${recs.map((rec, i) => `
          <div class="recommendation-item">
            <div class="rec-rank">#${i + 1}</div>
            <div class="rec-info">
              <div class="rec-name">${rec.name} <span class="specialization-chip">${rec.specialization}</span></div>
              <div class="rec-reason">${rec.reason}</div>
            </div>
            <div class="rec-score">${rec.score}</div>
            <button class="btn btn-sm btn-primary" data-uid="${rec.userId}">Assign</button>
          </div>`).join('')}
        <button class="btn btn-sm" id="cancelRecBtn">Cancel</button>`;

      actions.querySelectorAll('button[data-uid]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await apiAssignResponder(r._id, btn.dataset.uid);
            showToast('success', 'Assigned', 'Responder assigned & notified');
            reloadDetail(r._id);
          } catch (err) { showToast('error', 'Failed', err.message); }
        });
      });
      document.getElementById('cancelRecBtn').addEventListener('click', () => renderAdminActions(r));
    } catch (err) {
      actions.innerHTML = `<div class="notif-empty">Failed to load recommendations: ${err.message}</div>`;
    }
  }

  // ---- Priority Form ----
  function showPriorityForm(r) {
    const actions = document.getElementById('adminActions');
    actions.innerHTML = `
      <div class="neo-inset">
        <h4 style="margin-bottom: 12px;">📈 Change Priority</h4>
        <div class="form-row">
          <div class="form-group">
            <select id="newPriority" class="form-control">
              <option value="LOW" ${r.priority === 'LOW' ? 'selected' : ''}>LOW</option>
              <option value="MEDIUM" ${r.priority === 'MEDIUM' ? 'selected' : ''}>MEDIUM</option>
              <option value="HIGH" ${r.priority === 'HIGH' ? 'selected' : ''}>HIGH</option>
              <option value="CRITICAL" ${r.priority === 'CRITICAL' ? 'selected' : ''}>CRITICAL</option>
            </select>
          </div>
        </div>
        <div class="form-group"><textarea id="priorityReason" class="inline-reason" placeholder="Reason (optional)"></textarea></div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-primary" id="savePriorityBtn">Save</button>
          <button class="btn btn-sm" id="cancelPriorityBtn">Cancel</button>
        </div>
      </div>`;
    document.getElementById('cancelPriorityBtn').addEventListener('click', () => renderAdminActions(r));
    document.getElementById('savePriorityBtn').addEventListener('click', async () => {
      try {
        await apiSetPriority(r._id, document.getElementById('newPriority').value, document.getElementById('priorityReason').value.trim());
        showToast('success', 'Priority updated', 'SLA deadlines recalculated');
        reloadDetail(r._id);
      } catch (err) { showToast('error', 'Failed', err.message); }
    });
  }

  // ---- SLA Watchlist ----
  async function loadSlaWatchlist() {
    const el = document.getElementById('slaWatchlist');
    try {
      const data = await apiGetAllReports({ escalated: 'true', limit: 10 });
      const reports = data.reports || [];
      if (reports.length === 0) {
        el.innerHTML = '<div class="notif-empty">✅ No SLA breaches — all incidents on track</div>';
        return;
      }
      el.innerHTML = reports.map(r => `
        <div class="duplicate-item" style="cursor:pointer;" onclick="openReportDetail('${r._id}')">
          <div>
            <strong>${r.title}</strong>
            <div class="dup-meta">${formatStatus(r.status)} · ${r.priority || ''} · ${r.location?.address || ''}</div>
          </div>
          <span class="sla-chip sla-breached">⏰ SLA breached</span>
        </div>`).join('');
    } catch (err) {
      el.innerHTML = `<div class="notif-empty">Failed: ${err.message}</div>`;
    }
  }

  // ---- Live Map ----
  let adminMap = null;
  let adminMarkers = null;

  function initAdminMap() {
    if (!window.L || adminMap) return;
    adminMap = L.map('adminMap', { scrollWheelZoom: true }).setView([28.6139, 77.2090], 11);
    const mapTilerKey = 'PD10oWCF3a50XHfSVfZh';

L.tileLayer(`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${mapTilerKey}`, {
    tileSize: 512,
    zoomOffset: -1,
    minZoom: 1,
    maxZoom: 20,
    attribution: '&copy; MapTiler &copy; OpenStreetMap contributors'
}).addTo(adminMap);
    adminMarkers = L.layerGroup().addTo(adminMap);
  }

  async function loadAdminMap() {
    initAdminMap();
    if (!adminMap) return;
    try {
      const data = await fetch(API_BASE + '/stats/public-map').then(r => r.json()).catch(() => null);
      adminMarkers.clearLayers();
      if (data && data.success && Array.isArray(data.incidents)) {
        data.incidents.forEach(r => {
          if (r.lat && r.lng) {
            const c = { low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' }[r.severity] || '#0ea5e9';
            L.circleMarker([r.lat, r.lng], {
              radius: r.severity === 'critical' ? 10 : 7,
              color: c, weight: 2, fillColor: c, fillOpacity: 0.5
            }).addTo(adminMarkers)
              .bindPopup(`<strong>${r.title}</strong><br><span style="font-size:12px;color:#666">${formatStatus(r.status)} · ${r.severity}</span>`)
              .on('click', () => openReportDetail(r.id));
          }
        });
      }
      setTimeout(() => adminMap && adminMap.invalidateSize(), 200);
    } catch (err) { console.warn('Admin map failed:', err); }
  }

  // ---- Analytics ----
  async function loadAnalytics() {
    try {
      const data = await apiGetAdminStats();
      const s = data.stats;
      if (!s) return;

      // KPIs
      const kpis = [
        { label: 'Total Reports', value: s.totals?.allReports ?? '—', color: 'var(--accent)' },
        { label: 'Avg Response (hrs)', value: s.avgResponseHours ?? '—', color: 'var(--status-pending)' },
        { label: 'Avg Resolution (hrs)', value: s.avgResolutionHours ?? '—', color: 'var(--status-progress)' },
        { label: 'Resolution Rate', value: (s.resolutionRate?.percent ?? 0) + '%', color: 'var(--status-resolved)' },
        { label: 'Feedback Score', value: s.feedback?.average ? s.feedback.average.toFixed(1) + '★' : '—', color: '#f59e0b' },
        { label: 'Active Responders', value: s.totals?.activeResponders ?? '—', color: 'var(--severity-high)' }
      ];
      document.getElementById('kpiRow').innerHTML = kpis.map(k => `
        <div class="kpi-box"><div class="kpi-value" style="color:${k.color}">${k.value}</div><div class="kpi-label">${k.label}</div></div>`).join('');

      // Bar charts (pure CSS bars)
      renderBarChart('chartOverTime', (s.overTime || []).map(d => ({ label: d._id, value: d.count, color: 'var(--accent)' })));
      renderBarChart('chartByCategory', (s.byCategory || []).map(d => ({
        label: (getTypeInfo(d._id)?.label || d._id), value: d.count, color: getTypeInfo(d._id)?.color || 'var(--accent)'
      })));
      renderBarChart('chartBySeverity', (s.bySeverity || []).map(d => ({
        label: d._id, value: d.count,
        color: { low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' }[d._id] || 'var(--accent)'
      })));
      renderBarChart('chartByStatus', (s.byStatus || []).map(d => ({ label: formatStatus(d._id), value: d.count, color: 'var(--accent-dark)' })));
      renderBarChart('chartByPriority', (s.byPriority || []).map(d => ({
        label: d._id, value: d.count,
        color: { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' }[d._id] || 'var(--accent)'
      })));
      renderBarChart('chartFeedback', (s.feedback?.distribution || []).map(d => ({
        label: '★'.repeat(d._id), value: d.count, color: '#f59e0b'
      })));

      // Responder performance table
      const tbody = document.querySelector('#responderPerfTable tbody');
      const perf = s.responderPerformance || [];
      tbody.innerHTML = perf.length === 0
        ? '<tr><td colspan="4" class="notif-empty">No responder activity yet</td></tr>'
        : perf.map(p => `<tr>
            <td><strong>${p.name}</strong></td>
            <td><span class="specialization-chip">${p.specialization || 'General'}</span></td>
            <td>${p.resolvedCount}</td>
            <td>${p.avgRating ? p.avgRating.toFixed(1) + '★' : '—'}</td>
          </tr>`).join('');
    } catch (err) {
      showToast('error', 'Analytics failed', err.message);
    }
  }

  function renderBarChart(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const max = Math.max(...items.map(i => i.value), 1);
    if (items.length === 0) {
      el.innerHTML = '<div class="notif-empty">No data</div>';
      return;
    }
    el.innerHTML = items.map(i => `
      <div class="bar-row">
        <div class="bar-label">${i.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(i.value / max * 100)}%; background:${i.color};"></div></div>
        <div class="bar-value">${i.value}</div>
      </div>`).join('');
  }

  // ---- Hotspots ----
  async function loadHotspots() {
    const grid = document.getElementById('hotspotGrid');
    const days = document.getElementById('hotspotDays').value;
    const minCount = document.getElementById('hotspotMin').value;
    grid.innerHTML = '<div class="flex justify-center" style="padding: 40px;"><div class="spinner"></div></div>';
    try {
      const data = await apiGetHotspots(days, minCount);
      const spots = data.hotspots || [];
      if (spots.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🗺️</div><h3>No hotspots found</h3><p>No repeat-incident clusters in this window.</p></div>';
        return;
      }
      grid.innerHTML = spots.map(h => `
        <div class="hotspot-card">
          <div class="hotspot-count" style="color:${h.count >= 5 ? '#ef4444' : h.count >= 3 ? '#f97316' : '#f59e0b'};">${h.count}</div>
          <div class="hotspot-area">📍 ${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}</div>
          <div class="hotspot-types">
            ${(h.types || []).map(t => `<span class="badge badge-type">${getTypeInfo(t)?.label || t}</span>`).join('')}
          </div>
          <div class="intensity-bar"><div class="intensity-fill" style="width:${Math.round(h.intensity * 100)}%;"></div></div>
          ${h.sampleTitles?.length ? `<div style="margin-top: 10px; font-size: 0.78rem; color: var(--text-muted);">"${h.sampleTitles[0]}"</div>` : ''}
        </div>`).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${err.message}</p></div>`;
    }
  }

  document.getElementById('hotspotDays').addEventListener('change', loadHotspots);
  document.getElementById('hotspotMin').addEventListener('change', loadHotspots);

  // ---- Responders ----
  async function loadResponders() {
    const tbody = document.querySelector('#responderTable tbody');
    try {
      const data = await apiGetResponders();
      const responders = data.responders || [];
      document.getElementById('responderCount').textContent = `${responders.length} team members`;
      tbody.innerHTML = responders.length === 0
        ? '<tr><td colspan="7" class="notif-empty">No responders yet</td></tr>'
        : responders.map(r => `<tr>
            <td><strong>${r.user?.name || '—'}</strong><div style="font-size:0.75rem;color:var(--text-muted)">${r.user?.email || ''}</div></td>
            <td><span class="specialization-chip">${r.specialization}</span></td>
            <td><span class="availability-dot ${r.availability.toLowerCase()}"></span> ${r.availability}</td>
            <td>${r.zone || '—'}</td>
            <td>${r.stats?.avgRating ? r.stats.avgRating.toFixed(1) + '★' : '—'}</td>
            <td>${r.activeAssignments ?? 0}</td>
            <td class="table-actions">
              <button class="btn btn-sm" onclick="toggleResponder('${r._id}', ${!r.active})">${r.active ? 'Deactivate' : 'Activate'}</button>
            </td>
          </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="notif-empty">Failed: ${err.message}</td></tr>`;
    }
  }

  window.toggleResponder = async function (id, activate) {
    try {
      await apiUpdateResponder(id, { active: activate });
      showToast('success', 'Updated', `Responder ${activate ? 'activated' : 'deactivated'}`);
      loadResponders();
    } catch (err) { showToast('error', 'Failed', err.message); }
  };

  document.getElementById('addResponderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiCreateResponder({
        name: document.getElementById('respName').value.trim(),
        email: document.getElementById('respEmail').value.trim(),
        password: document.getElementById('respPassword').value,
        phone: document.getElementById('respPhone').value.trim(),
        specialization: document.getElementById('respSpecialization').value,
        contactPhone: document.getElementById('respContact').value.trim()
      });
      showToast('success', 'Responder added', 'Account created with responder role');
      document.getElementById('addResponderForm').reset();
      loadResponders();
    } catch (err) {
      showToast('error', 'Failed', err.message);
    }
  });

  // ---- Users ----
  async function loadUsers() {
    const tbody = document.querySelector('#userTable tbody');
    const search = document.getElementById('userSearch').value.trim();
    const role = document.getElementById('userRoleFilter').value;
    try {
      const data = await apiGetUsers({ search, role });
      const users = data.users || [];
      tbody.innerHTML = users.length === 0
        ? '<tr><td colspan="7" class="notif-empty">No users found</td></tr>'
        : users.map(u => `<tr>
            <td><strong>${u.name}</strong></td>
            <td>${u.email}</td>
            <td><span class="badge badge-type">${u.role}</span></td>
            <td>${u.reportCount ?? 0}</td>
            <td>${u.active ? '<span class="sla-chip">Active</span>' : '<span class="sla-chip sla-breached">Disabled</span>'}</td>
            <td style="font-size:0.8rem;">${formatDate(u.createdAt)}</td>
            <td class="table-actions">
              ${u.role !== 'admin' ? `<button class="btn btn-sm" onclick="setUserActive('${u._id}', ${!u.active})">${u.active ? 'Disable' : 'Enable'}</button>` : '—'}
            </td>
          </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="notif-empty">Failed: ${err.message}</td></tr>`;
    }
  }

  window.setUserActive = async function (id, active) {
    try {
      await apiSetUserActive(id, active);
      showToast('success', 'Updated', `User ${active ? 'enabled' : 'disabled'}`);
      loadUsers();
    } catch (err) { showToast('error', 'Failed', err.message); }
  };

  document.getElementById('userSearch').addEventListener('input', debounceLoad);
  document.getElementById('userRoleFilter').addEventListener('change', loadUsers);

  // ---- Audit ----
  async function loadAudit() {
    const tbody = document.querySelector('#auditTable tbody');
    const search = document.getElementById('auditSearch').value.trim();
    const action = document.getElementById('auditAction').value;
    try {
      const data = await apiGetAuditLogs({ search, action });
      const logs = data.logs || [];
      if (data.actions && document.getElementById('auditAction').options.length <= 1) {
        const sel = document.getElementById('auditAction');
        data.actions.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a; opt.textContent = a;
          sel.appendChild(opt);
        });
      }
      tbody.innerHTML = logs.length === 0
        ? '<tr><td colspan="5" class="notif-empty">No audit entries</td></tr>'
        : logs.map(l => `<tr>
            <td style="font-size:0.8rem;">${formatDate(l.createdAt)}</td>
            <td><strong>${l.actorName || 'System'}</strong><div style="font-size:0.72rem;color:var(--text-muted)">${l.actorRole || ''}</div></td>
            <td><span class="badge badge-type">${l.action}</span></td>
            <td style="font-size:0.78rem;">${l.target?.kind || ''}</td>
            <td style="font-size:0.82rem;">${l.description || ''}</td>
          </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="notif-empty">Failed: ${err.message}</td></tr>`;
    }
  }

  document.getElementById('auditSearch').addEventListener('input', debounceLoad);
  document.getElementById('auditAction').addEventListener('change', loadAudit);

  // ---- Pagination ----
  function renderPagination(totalPages, current) {
    const el = document.getElementById('paginationControls');
    if (!el) return;
    if (!totalPages || totalPages <= 1) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="pagination-btn ${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.addEventListener('click', () => loadReports(parseInt(btn.dataset.page, 10)));
    });
  }

  // ---- Debounced filter reload ----
  function debounceLoad() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      const activeTab = document.querySelector('#adminTabs .tab-btn.active')?.dataset.tab;
      if (activeTab === 'reports') loadReports(1);
      if (activeTab === 'users') loadUsers();
      if (activeTab === 'audit') loadAudit();
    }, 400);
  }

  // ---- Report filter listeners ----
  document.getElementById('searchInput').addEventListener('input', debounceLoad);
  ['filterStatus', 'filterType', 'filterSeverity', 'filterPriority', 'filterAssigned'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => loadReports(1));
  });

  // ---- Lightbox ----
  window.openLightbox = function (src) {
    const lb = document.getElementById('lightbox');
    document.getElementById('lightboxImg').src = src;
    lb.classList.remove('hidden');
  };
  document.getElementById('lightbox').addEventListener('click', () => {
    document.getElementById('lightbox').classList.add('hidden');
  });

  // ---- View on Map (opens OSM in new tab) ----
  function viewOnMap(lat, lng, title) {
    window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`, '_blank');
  }

  // ---- Detail modal close ----
  document.getElementById('closeReportDetail').addEventListener('click', () => {
    document.getElementById('reportDetailModal').classList.add('hidden');
  });
  document.getElementById('reportDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'reportDetailModal') e.target.classList.add('hidden');
  });

  // ---- Profile form ----
  document.getElementById('adminProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('adminNewPass').value;
    const confirmPass = document.getElementById('adminConfirmPass').value;
    if (newPass && newPass !== confirmPass) {
      showToast('error', 'Password mismatch', 'New passwords do not match');
      return;
    }
    try {
      const payload = {
        name: document.getElementById('adminProfileName').value.trim(),
        phone: document.getElementById('adminProfilePhone').value.trim()
      };
      if (newPass) {
        payload.currentPassword = document.getElementById('adminCurrentPass').value;
        payload.newPassword = newPass;
      }
      await apiUpdateProfile(payload);
      showToast('success', 'Profile updated', 'Your profile has been saved');
      document.getElementById('adminNewPass').value = '';
      document.getElementById('adminConfirmPass').value = '';
      document.getElementById('adminCurrentPass').value = '';
      document.getElementById('profileDisplayName').textContent = payload.name;
      document.getElementById('adminName').textContent = payload.name;
    } catch (err) {
      showToast('error', 'Failed', err.message);
    }
  });

  // ---- Real-Time: New Reports ----
  const sock = initSocket();
  if (sock) {
    sock.on('newReport', (report) => {
      newAlertCount++;
      const badge = document.getElementById('bellBadge');
      badge.textContent = newAlertCount;
      badge.classList.remove('hidden');

      const audio = document.getElementById('alertSound');
      if (audio) audio.play().catch(() => {});

      const typeInfo = getTypeInfo(report.type);
      showToast('warning', `🚨 New ${typeInfo.label} Report`, report.title, 6000);

      loadReports(currentPage);
      refreshUnreadBadge();
    });
    sock.on('incidentUpdate', (data) => {
      const activeTab = document.querySelector('#adminTabs .tab-btn.active')?.dataset.tab;
      if (['overview', 'reports'].includes(activeTab)) loadReports(currentPage);
      if (currentDetailReport && data.report?._id === currentDetailReport._id) {
        currentDetailReport = data.report;
        renderReportDetail(data.report);
      }
    });
    sock.on('notification', (n) => {
      showToast(n.level === 'critical' ? 'error' : n.level === 'success' ? 'success' : 'info', n.title || 'Notification', n.message);
      refreshUnreadBadge();
    });
    sock.on('responderAvailabilityChanged', () => {
      const activeTab = document.querySelector('#adminTabs .tab-btn.active')?.dataset.tab;
      if (activeTab === 'responders') loadResponders();
    });
  }

  // Reset bell on click
  document.getElementById('notifBell').addEventListener('click', () => {
    newAlertCount = 0;
  });

  // ---- Initial Load ----
  loadReports(1);
  loadSlaWatchlist();
  loadAdminMap();
  refreshUnreadBadge();

})();
