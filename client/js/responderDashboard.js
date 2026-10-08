/* ===================================================================
   Responder Console — assignments, duty status, profile
   =================================================================== */

(function () {
  // ---- Auth guard ----
  if (!isLoggedIn()) {
    window.location.href = '/';
    return;
  }
  const user = getUser();
  if (user.role !== 'responder') {
    window.location.href = user.role === 'admin' ? '/admin-dashboard.html' : '/user-dashboard.html';
    return;
  }

  // Set identity
  document.getElementById('respName').textContent = user.name;
  document.getElementById('respAvatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('profileAvatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('profileDisplayName').textContent = user.name;
  document.getElementById('profileDisplayEmail').textContent = user.email || '—';

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    apiLogout();
  });

  // ---- Tabs ----
  const tabBtns = document.querySelectorAll('#respTabs .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['assignments', 'history', 'profile'].forEach(t => {
        document.getElementById('tab-' + t).classList.toggle('hidden', t !== btn.dataset.tab);
      });
      if (btn.dataset.tab === 'history') loadHistory();
      if (btn.dataset.tab === 'profile') loadProfile();
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
    responderAssigned: { icon: '🚨' }, dispatched: { icon: '🚑' }, responderAccepted: { icon: '👍' },
    responderArrived: { icon: '📍' }, reportResolved: { icon: '🎉' }, reportClosed: { icon: '📁' },
    assignmentRejected: { icon: '⚠️' }, adminMessage: { icon: '💬' }, accountCreated: { icon: '👋' },
    priorityChanged: { icon: '📈' }, reportWithdrawn: { icon: '↩️' }
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
            openIncidentModal(reportId);
          }
        });
      });
    } catch (err) {
      list.innerHTML = `<div class="notif-empty">Failed: ${err.message}</div>`;
    }
  }

  // ---- State ----
  let myProfile = null;
  let currentIncident = null;

  // ---- Duty Status ----
  async function loadProfile() {
    try {
      const data = await apiGetMyResponderProfile();
      myProfile = data.responder;
      renderProfile();
    } catch (err) {
      showToast('error', 'Failed to load profile', err.message);
    }
  }

  function renderProfile() {
    if (!myProfile) return;
    const spec = myProfile.specialization || 'General';
    document.getElementById('respSpecChip').textContent = spec;
    document.getElementById('profSpecialization').value = spec;
    document.getElementById('profZone').value = myProfile.zone || '';
    document.getElementById('profContact').value = myProfile.contactPhone || '';
    if (myProfile.lastLocation) {
      document.getElementById('profLat').value = myProfile.lastLocation.lat ?? '';
      document.getElementById('profLng').value = myProfile.lastLocation.lng ?? '';
    }
    document.getElementById('availabilitySelect').value = myProfile.availability || 'Available';
    updateAvailDot(myProfile.availability || 'Available');

    // KPIs
    document.getElementById('kpiAvailability').textContent = myProfile.availability || '—';
    document.getElementById('kpiActive').textContent = myProfile.activeAssignments ?? '—';
    const stats = myProfile.stats || {};
    document.getElementById('kpiResolved').textContent = stats.resolvedCount ?? '—';
    document.getElementById('kpiRating').textContent = stats.avgRating ? stats.avgRating.toFixed(1) + '★' : '—';
  }

  function updateAvailDot(avail) {
    const dot = document.getElementById('availDot');
    dot.className = 'availability-dot ' + (avail || 'available').toLowerCase();
    const hint = document.getElementById('availabilityHint');
    if (avail === 'Available') hint.textContent = '🟢 You are visible to the control room for dispatch';
    else if (avail === 'Assigned') hint.textContent = '🟡 You have an assignment pending acceptance';
    else if (avail === 'Responding') hint.textContent = '🟠 You are en route / on scene';
    else hint.textContent = '⚫ You are offline — control room cannot dispatch you';
  }

  document.getElementById('saveAvailabilityBtn').addEventListener('click', async () => {
    const availability = document.getElementById('availabilitySelect').value;
    try {
      const data = await apiUpdateResponderProfile({ availability });
      myProfile = data.responder;
      updateAvailDot(myProfile.availability);
      document.getElementById('kpiAvailability').textContent = myProfile.availability;
      showToast('success', 'Duty status updated', `You are now ${myProfile.availability}`);
    } catch (err) {
      showToast('error', 'Failed', err.message);
    }
  });

  // ---- Profile form ----
  document.getElementById('respProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      specialization: document.getElementById('profSpecialization').value,
      zone: document.getElementById('profZone').value.trim(),
      contactPhone: document.getElementById('profContact').value.trim()
    };
    const lat = document.getElementById('profLat').value;
    const lng = document.getElementById('profLng').value;
    if (lat && lng) {
      payload.lat = parseFloat(lat);
      payload.lng = parseFloat(lng);
    }
    try {
      const data = await apiUpdateResponderProfile(payload);
      myProfile = data.responder;
      renderProfile();
      showToast('success', 'Details saved', 'Your responder profile is up to date');
    } catch (err) {
      showToast('error', 'Failed', err.message);
    }
  });

  document.getElementById('useGpsBtn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('error', 'GPS unavailable', 'Your browser does not support geolocation');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('profLat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('profLng').value = pos.coords.longitude.toFixed(6);
        showToast('info', 'Location captured', 'Press Save Details to update');
      },
      () => showToast('error', 'GPS failed', 'Could not get your location'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // ---- Assignments ----
  async function loadAssignments() {
    const list = document.getElementById('assignmentList');
    try {
      const data = await apiGetMyIncidents('active');
      const reports = data.reports || [];
      if (reports.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🛌</div>
            <h3>No active assignments</h3>
            <p>You're on standby. Dispatches will appear here with sound alerts.</p>
          </div>`;
        document.getElementById('kpiActive').textContent = 0;
        return;
      }
      document.getElementById('kpiActive').textContent = reports.length;
      list.innerHTML = '';
      reports.forEach(r => list.appendChild(createAssignmentCard(r)));
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${err.message}</p></div>`;
    }
  }

  function createAssignmentCard(r) {
    const typeInfo = getTypeInfo(r.type);
    const sevInfo = getSeverityInfo(r.severity);
    const div = document.createElement('div');
    div.className = `assignment-card ${r.priority === 'CRITICAL' ? 'urgent' : ''}`;

    const priorityBadge = r.priority ? `<span class="badge-priority badge-priority-${r.priority}">${r.priority}</span>` : '';
    const slaChip = r.slaBreached ? '<span class="sla-chip sla-breached">⏰ SLA breached</span>' : '';

    div.innerHTML = `
      <div class="report-header">
        <div style="flex: 1;">
          <div class="report-title">${typeInfo.icon} ${r.title}</div>
          <div class="report-meta">
            <span class="badge badge-type">${typeInfo.label}</span>
            <span class="badge badge-severity-${r.severity}">${sevInfo.icon} ${sevInfo.label}</span>
            <span class="badge badge-status-${r.status}">${formatStatus(r.status)}</span>
            ${priorityBadge}
            ${slaChip}
          </div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <button class="btn btn-sm" data-open="${r._id}">Details</button>
        </div>
      </div>
      <div class="report-description">${r.description}</div>
      <div class="report-footer">
        <div>
          <span class="text-muted" style="font-size: 0.82rem;">📍 ${r.location?.address || 'N/A'}</span>
          ${r.location?.lat ? `<button class="btn btn-sm" style="margin-left: 8px; padding: 2px 10px;" data-nav="${r._id}">🗺️ Navigate</button>` : ''}
        </div>
        <div class="flex items-center gap-1">
          ${r.user?.phone ? `<span class="text-muted" style="font-size: 0.82rem;">📞 ${r.user.phone}</span>` : ''}
          <span class="text-muted" style="font-size: 0.82rem;">🕐 ${formatDate(r.createdAt)}</span>
        </div>
      </div>
      <div class="assignment-actions" data-actions="${r._id}"></div>
    `;

    div.querySelector(`[data-open]`).addEventListener('click', () => openIncidentModal(r._id));
    const navBtn = div.querySelector('[data-nav]');
    if (navBtn) {
      navBtn.addEventListener('click', () => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.location.lat},${r.location.lng}`, '_blank');
      });
    }
    renderAssignmentActions(r, div.querySelector(`[data-actions="${r._id}"]`));
    return div;
  }

  function renderAssignmentActions(r, container) {
    container.innerHTML = '';
    const mkBtn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn btn-sm ' + cls;
      b.style.marginRight = '8px';
      b.style.marginTop = '8px';
      b.textContent = label;
      b.addEventListener('click', fn);
      container.appendChild(b);
    };
    const s = r.status;

    if (s === 'DISPATCHED' || s === 'ASSIGNED') {
      mkBtn('✅ Accept Assignment', 'btn-success', async () => {
        try {
          await apiUpdateReportStatus(r._id, 'RESPONDER_ACCEPTED');
          showToast('success', 'Accepted', 'Stay safe out there!');
          await apiUpdateResponderProfile({ availability: 'Responding' }).catch(() => {});
          loadAssignments();
        } catch (err) { showToast('error', 'Failed', err.message); }
      });
      mkBtn('❌ Reject', 'btn-danger', () => {
        container.innerHTML = `
          <div class="neo-inset" style="margin-top: 8px;">
            <label style="font-size: 0.8rem; display:block; margin-bottom: 4px;">Reason for rejecting (required)</label>
            <textarea id="rejectReason" class="form-control" rows="2" placeholder="e.g. Out of district, no equipment..."></textarea>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <button class="btn btn-sm btn-danger" data-confirm>❌ Confirm Reject</button>
              <button class="btn btn-sm" data-cancel>Cancel</button>
          </div>
        `;
        container.querySelector('[data-confirm]').addEventListener('click', async () => {
          const reason = container.querySelector('#rejectReason').value.trim();
          if (!reason) { showToast('warning', 'Reason required', 'Please tell the control room why you cannot take this'); return; }
          try {
            await apiRejectAssignment(r._id, reason);
            showToast('info', 'Rejected', 'Control room notified — incident returned to queue');
            loadAssignments();
          } catch (err) { showToast('error', 'Failed', err.message); }
        });
        container.querySelector('[data-cancel]').addEventListener('click', () => renderAssignmentActions(r, container));
      });
    }

    if (s === 'RESPONDER_ACCEPTED') {
      mkBtn('📍 Mark Arrived', 'btn-primary', async () => {
        try {
          await apiUpdateReportStatus(r._id, 'RESPONDER_ARRIVED');
          showToast('success', 'On scene', 'Citizen has been notified of your arrival');
          loadAssignments();
        } catch (err) { showToast('error', 'Failed', err.message); }
      });
    }

    if (s === 'RESPONDER_ARRIVED') {
      mkBtn('✅ Mark Resolved', 'btn-success', () => {
        container.innerHTML = `
          <div class="neo-inset" style="margin-top: 8px;">
            <label style="font-size: 0.8rem; display:block; margin-bottom: 4px;">Resolution notes (optional)</label>
            <textarea id="resolveNotes" class="form-control" rows="2" placeholder="What was done on scene?"></textarea>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <button class="btn btn-sm btn-success" data-confirm>✅ Confirm Resolved</button>
              <button class="btn btn-sm" data-cancel>Cancel</button>
          </div>
        `;
        container.querySelector('[data-confirm]').addEventListener('click', async () => {
          const notes = container.querySelector('#resolveNotes').value.trim();
          try {
            await apiUpdateReportStatus(r._id, 'RESOLVED', notes);
            showToast('success', 'Resolved', 'Great work! Awaiting citizen feedback.');
            await apiUpdateResponderProfile({ availability: 'Available' }).catch(() => {});
            loadAssignments();
          } catch (err) { showToast('error', 'Failed', err.message); }
        });
        container.querySelector('[data-cancel]').addEventListener('click', () => renderAssignmentActions(r, container));
      });
    }
  }

  // ---- History ----
  async function loadHistory() {
    const list = document.getElementById('historyList');
    try {
      const data = await apiGetMyIncidents('all');
      const reports = (data.reports || []).filter(r => ['RESOLVED', 'CLOSED'].includes(r.status));
      if (reports.length === 0) {
        list.innerHTML = '<div class="notif-empty">No completed incidents yet</div>';
        return;
      }
      list.innerHTML = '';
      reports.forEach(r => {
        const typeInfo = getTypeInfo(r.type);
        const div = document.createElement('div');
        div.className = 'report-card';
        div.innerHTML = `
          <div class="report-header">
            <div style="flex: 1;">
              <div class="report-title">${typeInfo.icon} ${r.title}</div>
              <div class="report-meta">
                <span class="badge badge-status-${r.status}">${formatStatus(r.status)}</span>
                ${r.priority ? `<span class="badge-priority badge-priority-${r.priority}">${r.priority}</span>` : ''}
                ${r.resolutionMinutes != null ? `<span class="sla-chip">⏱ resolved in ${r.resolutionMinutes}m</span>` : ''}
              </div>
            </div>
            <button class="btn btn-sm" data-open="${r._id}">Details</button>
          </div>
          <div class="report-footer">
            <span class="text-muted" style="font-size: 0.82rem;">📍 ${r.location?.address || 'N/A'}</span>
            <span class="text-muted" style="font-size: 0.82rem;">🕐 ${formatDate(r.createdAt)}</span>
          </div>`;
        div.querySelector('[data-open]').addEventListener('click', () => openIncidentModal(r._id));
        list.appendChild(div);
      });
    } catch (err) {
      list.innerHTML = `<div class="notif-empty">Failed: ${err.message}</div>`;
    }
  }

  document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);

  // ---- Incident Detail Modal ----
  window.openIncidentModal = async function (reportId) {
    const modal = document.getElementById('incidentModal');
    const content = document.getElementById('incidentModalContent');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="flex justify-center" style="padding: 40px;"><div class="spinner"></div></div>';
    try {
      const data = await apiGetReport(reportId);
      currentIncident = data.report;
      renderIncidentDetail(data.report);
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${err.message}</p></div>`;
    }
  };

  function renderIncidentDetail(r) {
    const typeInfo = getTypeInfo(r.type);
    const sevInfo = getSeverityInfo(r.severity);
    const content = document.getElementById('incidentModalContent');

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

    content.innerHTML = `
      <h3 style="margin-bottom: 4px;">${typeInfo.icon} ${r.title}</h3>
      <div class="report-meta" style="margin-bottom: 14px;">
        <span class="badge badge-type">${typeInfo.label}</span>
        <span class="badge badge-severity-${r.severity}">${sevInfo.icon} ${sevInfo.label}</span>
        <span class="badge badge-status-${r.status}">${formatStatus(r.status)}</span>
        ${r.priority ? `<span class="badge-priority badge-priority-${r.priority}">${r.priority}</span>` : ''}
      </div>
      <div class="neo-inset" style="margin-bottom: 14px;">
        <div class="detail-row"><span class="detail-label">Description</span><span class="detail-value">${r.description}</span></div>
        <div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Location</span><span class="detail-value">📍 ${r.location?.address || 'N/A'}</span></div>
        ${r.location?.lat ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Coordinates</span><span class="detail-value">${r.location.lat.toFixed(5)}, ${r.location.lng.toFixed(5)}</span></div>` : ''}
        ${r.affectedPeople ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Affected</span><span class="detail-value">${r.affectedPeople} people</span></div>` : ''}
        ${r.user?.phone ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Reporter</span><span class="detail-value">${r.user.name || ''} · 📞 ${r.user.phone}</span></div>` : ''}
      </div>
      ${r.images && r.images.length ? `<div class="report-images">${r.images.map(img => `<img src="${img}" style="cursor: zoom-in;" data-img="${img}">`).join('')}</div>` : ''}
      <h4 style="margin: 18px 0 12px;">🕓 Activity Timeline</h4>
      ${timelineHTML}
      <div id="incidentActions" style="margin-top: 18px;"></div>
    `;

    content.querySelectorAll('[data-img]').forEach(img => {
      img.addEventListener('click', () => window.open(img.dataset.img, '_blank'));
    });

    renderIncidentActions(r);
  }

  function renderIncidentActions(r) {
    const actions = document.getElementById('incidentActions');
    actions.innerHTML = '';
    const mkBtn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn btn-sm ' + cls;
      b.style.marginRight = '8px';
      b.style.marginBottom = '8px';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    const s = r.status;

    if (s === 'DISPATCHED' || s === 'ASSIGNED') {
      mkBtn('✅ Accept', 'btn-success', async () => {
        try {
          await apiUpdateReportStatus(r._id, 'RESPONDER_ACCEPTED');
          showToast('success', 'Accepted', 'Stay safe out there!');
          await apiUpdateResponderProfile({ availability: 'Responding' }).catch(() => {});
          reloadIncident(r._id);
        } catch (err) { showToast('error', 'Failed', err.message); }
      });
      mkBtn('❌ Reject', 'btn-danger', () => {
        const actions = document.getElementById('incidentActions');
        actions.innerHTML = `
          <div class="neo-inset" style="margin-top: 8px;">
            <label style="font-size: 0.8rem; display:block; margin-bottom: 4px;">Reason for rejecting (required)</label>
            <textarea id="rejectReason" class="form-control" rows="2" placeholder="e.g. Out of district, no equipment..."></textarea>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <button class="btn btn-sm btn-danger" data-confirm>❌ Confirm Reject</button>
              <button class="btn btn-sm" data-cancel>Cancel</button>
            </div>
          </div>`;
        actions.querySelector('[data-confirm]').addEventListener('click', async () => {
          const reason = actions.querySelector('#rejectReason').value.trim();
          if (!reason) { showToast('warning', 'Reason required', 'Tell the control room why you cannot take this'); return; }
          try {
            await apiRejectAssignment(r._id, reason);
            showToast('info', 'Rejected', 'Returned to control room');
            reloadIncident(r._id);
          } catch (err) { showToast('error', 'Failed', err.message); }
        });
        actions.querySelector('[data-cancel]').addEventListener('click', () => renderIncidentActions(r));
      });
    }
    if (s === 'RESPONDER_ACCEPTED') {
      mkBtn('📍 Mark Arrived', 'btn-primary', async () => {
        try {
          await apiUpdateReportStatus(r._id, 'RESPONDER_ARRIVED');
          showToast('success', 'On scene', 'Citizen notified');
          reloadIncident(r._id);
        } catch (err) { showToast('error', 'Failed', err.message); }
      });
    }
    if (s === 'RESPONDER_ARRIVED') {
      mkBtn('✅ Mark Resolved', 'btn-success', () => {
        const actions = document.getElementById('incidentActions');
        actions.innerHTML = `
          <div class="neo-inset" style="margin-top: 8px;">
            <label style="font-size: 0.8rem; display:block; margin-bottom: 4px;">Resolution notes (optional)</label>
            <textarea id="resolveNotes" class="form-control" rows="2" placeholder="What was done on scene?"></textarea>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <button class="btn btn-sm btn-success" data-confirm>✅ Confirm Resolved</button>
              <button class="btn btn-sm" data-cancel>Cancel</button>
            </div>
          </div>`;
        actions.querySelector('[data-confirm]').addEventListener('click', async () => {
          const notes = actions.querySelector('#resolveNotes').value.trim();
          try {
            await apiUpdateReportStatus(r._id, 'RESOLVED', notes);
            showToast('success', 'Resolved', 'Great work!');
            await apiUpdateResponderProfile({ availability: 'Available' }).catch(() => {});
            reloadIncident(r._id);
          } catch (err) { showToast('error', 'Failed', err.message); }
        });
        actions.querySelector('[data-cancel]').addEventListener('click', () => renderIncidentActions(r));
      });
    }
    if (r.location?.lat) {
      mkBtn('🗺️ Navigate', '', () => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.location.lat},${r.location.lng}`, '_blank');
      });
    }
  }

  async function reloadIncident(id) {
    try {
      const data = await apiGetReport(id);
      currentIncident = data.report;
      renderIncidentDetail(data.report);
    } catch { /* ignore */ }
    loadAssignments();
  }

  // ---- Modal close ----
  document.getElementById('closeIncidentModal').addEventListener('click', () => {
    document.getElementById('incidentModal').classList.add('hidden');
  });
  document.getElementById('incidentModal').addEventListener('click', (e) => {
    if (e.target.id === 'incidentModal') e.target.classList.add('hidden');
  });

  // ---- Real-Time ----
  const sock = initSocket();
  if (sock) {
    sock.on('notification', (n) => {
      const meta = notifTypeMeta[n.type] || {};
      showToast(n.level === 'critical' ? 'error' : n.level === 'success' ? 'success' : 'info',
        meta.icon ? `${meta.icon} ${n.title || 'Notification'}` : (n.title || 'Notification'), n.message, 6000);
      refreshUnreadBadge();
      loadAssignments();
      // Play sound for dispatches
      if (n.type === 'responderAssigned' || n.type === 'dispatched') {
        const audio = document.getElementById('dispatchSound');
        if (audio) audio.play().catch(() => {});
      }
    });
    sock.on('incidentUpdate', (data) => {
      if (data.report && currentIncident && data.report._id === currentIncident._id) {
        currentIncident = data.report;
        renderIncidentDetail(data.report);
      }
      loadAssignments();
    });
  }

  // ---- Initial Load ----
  loadProfile();
  loadAssignments();
  refreshUnreadBadge();

})();
