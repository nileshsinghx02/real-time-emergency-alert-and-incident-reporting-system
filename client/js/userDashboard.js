/* ===================================================================
   User Dashboard — Report form, image upload, map, report tracking
   =================================================================== */

(function () {
  // ---- Auth guard ----
  if (!isLoggedIn()) {
    window.location.href = '/';
    return;
  }
  const user = getUser();
  if (user.role === 'admin') {
    window.location.href = '/admin-dashboard.html';
    return;
  }

  // Set user info in navbar
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearAuth();
    disconnectSocket();
    window.location.href = '/';
  });

  // ---- Tabs ----
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-newReport').classList.toggle('hidden', btn.dataset.tab !== 'newReport');
      document.getElementById('tab-myReports').classList.toggle('hidden', btn.dataset.tab !== 'myReports');
      document.getElementById('tab-profile').classList.toggle('hidden', btn.dataset.tab !== 'profile');
      if (btn.dataset.tab === 'myReports') loadMyReports();
      if (btn.dataset.tab === 'profile') loadProfile();
    });
  });

  // ---- Profile ----
  function loadProfile() {
    const u = getUser();
    document.getElementById('profileAvatar').textContent = u.name.charAt(0).toUpperCase();
    document.getElementById('profileDisplayName').textContent = u.name;
    document.getElementById('profileDisplayEmail').textContent = u.email;
    document.getElementById('profileName').value = u.name;
    document.getElementById('profilePhone').value = u.phone || '';
  }

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveProfileBtn');
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const currentPassword = document.getElementById('profileCurrentPass').value;
    const newPassword = document.getElementById('profileNewPass').value;
    const confirmPassword = document.getElementById('profileConfirmPass').value;

    if (!name) { showToast('warning', 'Missing field', 'Name is required'); return; }

    // Password change validation
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) { showToast('warning', 'Current password required', 'Enter your current password to change it'); return; }
      if (newPassword.length < 6) { showToast('warning', 'Weak password', 'New password must be at least 6 characters'); return; }
      if (newPassword !== confirmPassword) { showToast('error', 'Mismatch', 'New passwords do not match'); return; }
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const payload = { name, phone };
      if (newPassword && currentPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const data = await apiUpdateProfile(payload);
      // Update local storage
      const updatedUser = { ...getUser(), name: data.user.name, phone: data.user.phone };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      // Update navbar
      document.getElementById('userName').textContent = data.user.name;
      document.getElementById('userAvatar').textContent = data.user.name.charAt(0).toUpperCase();
      document.getElementById('profileAvatar').textContent = data.user.name.charAt(0).toUpperCase();
      document.getElementById('profileDisplayName').textContent = data.user.name;

      // Clear password fields
      document.getElementById('profileCurrentPass').value = '';
      document.getElementById('profileNewPass').value = '';
      document.getElementById('profileConfirmPass').value = '';

      showToast('success', 'Profile updated', 'Your changes have been saved');
    } catch (err) {
      showToast('error', 'Update failed', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save Changes';
    }
  });

  // ---- Map Setup (Leaflet) ----
  let map, marker;
  const defaultCenter = [20.5937, 78.9629]; // India center

  function initMap() {
    map = L.map('map').setView(defaultCenter, 5);
    const mapTilerKey = 'PD10oWCF3a50XHfSVfZh';

L.tileLayer(`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${mapTilerKey}`, {
    tileSize: 512,
    zoomOffset: -1,
    minZoom: 1,
    maxZoom: 20,
    attribution: '&copy; MapTiler &copy; OpenStreetMap contributors'
}).addTo(map);

    marker = L.marker(defaultCenter, { draggable: true }).addTo(map);
    marker.on('dragend', function () {
      const pos = marker.getLatLng();
      document.getElementById('reportLat').value = pos.lat;
      document.getElementById('reportLng').value = pos.lng;
      reverseGeocode(pos.lat, pos.lng);
    });

    map.on('click', function (e) {
      marker.setLatLng(e.latlng);
      document.getElementById('reportLat').value = e.latlng.lat;
      document.getElementById('reportLng').value = e.latlng.lng;
      reverseGeocode(e.latlng.lat, e.latlng.lng);
    });
  }

  // Reverse geocode using Nominatim
  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data.display_name) {
        document.getElementById('reportAddress').value = data.display_name;
      }
    } catch (err) {
      console.warn('Reverse geocode failed:', err);
    }
  }

  // Locate Me button
  document.getElementById('locateMeBtn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('warning', 'Not supported', 'Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 16);
        marker.setLatLng([latitude, longitude]);
        document.getElementById('reportLat').value = latitude;
        document.getElementById('reportLng').value = longitude;
        reverseGeocode(latitude, longitude);
        showToast('success', 'Located!', 'Your position has been set on the map');
      },
      (err) => {
        showToast('error', 'Location error', err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ---- Image Upload ----
  let selectedFiles = [];
  const uploadZone = document.getElementById('uploadZone');
  const imageInput = document.getElementById('imageInput');
  const previewGrid = document.getElementById('imagePreviewGrid');

  uploadZone.addEventListener('click', () => imageInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragging');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragging');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragging');
    handleFiles(e.dataTransfer.files);
  });

  imageInput.addEventListener('change', () => {
    handleFiles(imageInput.files);
  });

  function handleFiles(fileList) {
    const files = Array.from(fileList);
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    for (const file of files) {
      if (selectedFiles.length >= 4) {
        showToast('warning', 'Limit reached', 'Maximum 4 images allowed');
        break;
      }
      if (!allowed.includes(file.type)) {
        showToast('warning', 'Invalid file', `${file.name} is not a supported image format`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('warning', 'File too large', `${file.name} exceeds 5MB limit`);
        continue;
      }
      selectedFiles.push(file);
    }
    renderPreviews();
  }

  function renderPreviews() {
    previewGrid.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        div.innerHTML = `
          <img src="${e.target.result}" alt="Preview">
          <button class="remove-btn" data-idx="${idx}">✕</button>
        `;
        div.querySelector('.remove-btn').addEventListener('click', () => {
          selectedFiles.splice(idx, 1);
          renderPreviews();
        });
        previewGrid.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- Submit Report ----
  document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitReportBtn');
    const type = document.getElementById('reportType').value;
    const severity = document.getElementById('reportSeverity').value;
    const title = document.getElementById('reportTitle').value.trim();
    const description = document.getElementById('reportDescription').value.trim();
    const address = document.getElementById('reportAddress').value.trim();
    const lat = document.getElementById('reportLat').value;
    const lng = document.getElementById('reportLng').value;

    if (!type || !title || !description || !address) {
      showToast('warning', 'Missing fields', 'Please fill in all required fields');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Submitting...';

    try {
      const formData = new FormData();
      formData.append('type', type);
      formData.append('severity', severity);
      formData.append('title', title);
      formData.append('description', description);
      formData.append('address', address);
      if (lat) formData.append('lat', lat);
      if (lng) formData.append('lng', lng);
      selectedFiles.forEach(f => formData.append('images', f));

      const data = await apiSubmitReport(formData);
      showToast('success', 'Report submitted!', 'Emergency services have been notified');

      // Reset form
      document.getElementById('reportForm').reset();
      selectedFiles = [];
      renderPreviews();
      document.getElementById('reportLat').value = '';
      document.getElementById('reportLng').value = '';
      marker.setLatLng(defaultCenter);
      map.setView(defaultCenter, 5);

    } catch (err) {
      showToast('error', 'Submission failed', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🚨 Submit Emergency Report';
    }
  });

  // ---- Notifications ----
  const notifBell = document.getElementById('notifBell');
  const notifPanel = document.getElementById('notifPanel');
  const notifBadge = document.getElementById('notifBadge');

  notifBell.addEventListener('click', async (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle('hidden');
    if (!notifPanel.classList.contains('hidden')) {
      await loadNotifications();
    }
  });

  document.addEventListener('click', (e) => {
    if (!notifPanel.contains(e.target) && e.target !== notifBell) {
      notifPanel.classList.add('hidden');
    }
  });

  document.getElementById('markAllReadBtn').addEventListener('click', async () => {
    try {
      await apiMarkAllNotificationsRead();
      await loadNotifications();
      await refreshUnreadBadge();
    } catch (err) {
      showToast('error', 'Failed', err.message);
    }
  });

  const notifTypeMeta = {
    newReport: { icon: '🆕', title: 'New Report' },
    reportVerified: { icon: '✅', title: 'Report Verified' },
    reportRejected: { icon: '❌', title: 'Report Rejected' },
    priorityChanged: { icon: '📈', title: 'Priority Changed' },
    responderAssigned: { icon: '🧑‍🚒', title: 'Responder Assigned' },
    dispatched: { icon: '🚑', title: 'Responder Dispatched' },
    responderAccepted: { icon: '👍', title: 'Responder Accepted' },
    responderArrived: { icon: '📍', title: 'Responder Arrived' },
    reportResolved: { icon: '🎉', title: 'Report Resolved' },
    reportClosed: { icon: '📁', title: 'Report Closed' },
    reportWithdrawn: { icon: '↩️', title: 'Report Withdrawn' },
    feedbackReceived: { icon: '⭐', title: 'Feedback Received' },
    assignmentRejected: { icon: '⚠️', title: 'Assignment Rejected' },
    adminMessage: { icon: '💬', title: 'Message from Admin' },
    accountCreated: { icon: '👋', title: 'Welcome!' }
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
        const meta = notifTypeMeta[n.type] || { icon: '🔔', title: 'Notification' };
        return `
          <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n._id}" data-report="${n.report?._id || n.report || ''}">
            <div class="notif-icon level-${n.level || 'info'}">${meta.icon}</div>
            <div class="notif-body">
              <div class="notif-title">${n.title || meta.title}</div>
              <div class="notif-message">${n.message}</div>
              <div class="notif-time">${formatDate(n.createdAt)}</div>
            </div>
          </div>`;
      }).join('');

      list.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async () => {
          const id = item.dataset.id;
          const reportId = item.dataset.report;
          if (!item.classList.contains('unread')) {
            if (reportId) openReportDetail(reportId);
            return;
          }
          try {
            await apiMarkNotificationRead(id);
            item.classList.remove('unread');
            await refreshUnreadBadge();
            if (reportId) openReportDetail(reportId);
          } catch { /* silent */ }
        });
      });
    } catch (err) {
      list.innerHTML = `<div class="notif-empty">Failed to load: ${err.message}</div>`;
    }
  }

  // ---- My Reports: filters + pagination ----
  let myPage = 1;
  let mySearchTimer = null;

  function readMyFilters() {
    return {
      page: myPage,
      limit: 10,
      search: document.getElementById('mySearch').value.trim(),
      status: document.getElementById('myStatusFilter').value,
      type: document.getElementById('myTypeFilter').value
    };
  }

  ['mySearch', 'myStatusFilter', 'myTypeFilter'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      clearTimeout(mySearchTimer);
      mySearchTimer = setTimeout(() => { myPage = 1; loadMyReports(); }, 300);
    });
  });

  // ---- Load My Reports ----
  async function loadMyReports() {
    const container = document.getElementById('myReportsList');
    container.innerHTML = '<div class="flex justify-center" style="padding: 40px;"><div class="spinner"></div></div>';

    try {
      const data = await apiGetMyReports(readMyFilters());
      if (!data.reports || data.reports.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No reports found</h3>
            <p>Submit an emergency report to see it here.</p>
          </div>`;
        return;
      }
      container.innerHTML = '';
      data.reports.forEach(report => {
        container.appendChild(createReportCard(report));
      });
      renderMyPagination(data.pagination);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error loading reports</h3><p>${err.message}</p></div>`;
    }
  }

  function renderMyPagination(pagination) {
    const el = document.getElementById('myReportsPagination');
    if (!el || !pagination || pagination.pages <= 1) { if (el) el.innerHTML = ''; return; }
    let html = `<button ${pagination.page <= 1 ? 'disabled' : ''} data-p="${pagination.page - 1}">‹</button>`;
    for (let i = 1; i <= pagination.pages; i++) {
      html += `<button class="${i === pagination.page ? 'active' : ''}" data-p="${i}">${i}</button>`;
    }
    html += `<button ${pagination.page >= pagination.pages ? 'disabled' : ''} data-p="${pagination.pages + 1}">›</button>`;
    el.innerHTML = html;
    el.querySelectorAll('button[data-p]').forEach(b => {
      b.addEventListener('click', () => {
        const p = parseInt(b.dataset.p);
        if (p <= pagination.pages) { myPage = p; loadMyReports(); }
      });
    });
  }

  // ---- Report Detail Modal (timeline + actions) ----
  let currentDetailReport = null;

  async function openReportDetail(reportId) {
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
  }

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

    const canEdit = r.status === 'REPORTED';
    const canWithdraw = ['REPORTED', 'VERIFIED', 'PRIORITIZED'].includes(r.status);
    const canFeedback = ['RESOLVED', 'CLOSED'].includes(r.status);

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
        ${r.affectedPeople ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Affected</span><span class="detail-value">${r.affectedPeople} people</span></div>` : ''}
        ${r.priorityReason ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Priority</span><span class="detail-value" style="font-size: 0.82rem;">${r.priorityReason}</span></div>` : ''}
        ${r.rejectedReason ? `<div class="detail-row" style="margin-top: 8px;"><span class="detail-label">Rejected</span><span class="detail-value" style="color:#b91c1c;">${r.rejectedReason}</span></div>` : ''}
      </div>
      ${r.images && r.images.length ? `<div class="report-images">${r.images.map(img => `<img src="${img}" onclick="openLightbox('${img}')">`).join('')}</div>` : ''}
      <h4 style="margin: 18px 0 12px;">🕓 Activity Timeline</h4>
      ${timelineHTML}
      <div id="detailActions" style="margin-top: 18px;"></div>
    `;

    const actions = document.getElementById('detailActions');

    // Edit (only while REPORTED)
    if (canEdit) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm';
      editBtn.textContent = '✏️ Edit Report';
      editBtn.addEventListener('click', () => showEditForm(r));
      actions.appendChild(editBtn);
    }

    // Withdraw
    if (canWithdraw) {
      const wdBtn = document.createElement('button');
      wdBtn.className = 'btn btn-sm btn-danger';
      wdBtn.style.marginLeft = '8px';
      wdBtn.textContent = '↩️ Withdraw';
      wdBtn.addEventListener('click', () => {
        actions.innerHTML = `
          <div class="neo-inset" style="margin-top: 8px;">
            <label style="font-size: 0.8rem; display:block; margin-bottom: 4px;">Withdraw this report</label>
            <textarea id="withdrawReason" class="form-control" rows="2" placeholder="Reason (optional) — e.g. situation resolved on its own"></textarea>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <button class="btn btn-sm btn-danger" id="confirmWithdrawBtn">↩️ Confirm Withdraw</button>
              <button class="btn btn-sm" id="cancelWithdrawBtn">Cancel</button>
            </div>
          </div>`;
        document.getElementById('confirmWithdrawBtn').addEventListener('click', async () => {
          const reason = document.getElementById('withdrawReason').value.trim();
          try {
            await apiWithdrawReport(r._id, reason);
            showToast('success', 'Withdrawn', 'The report has been withdrawn');
            document.getElementById('reportDetailModal').classList.add('hidden');
            loadMyReports();
          } catch (err) { showToast('error', 'Failed', err.message); }
        });
        document.getElementById('cancelWithdrawBtn').addEventListener('click', () => openReportDetail(r._id));
      });
      actions.appendChild(wdBtn);
    }

    // Feedback
    if (canFeedback) {
      const fbBtn = document.createElement('button');
      fbBtn.className = 'btn btn-sm btn-warning';
      fbBtn.style.marginLeft = '8px';
      fbBtn.textContent = '⭐ Rate Response';
      fbBtn.addEventListener('click', () => showFeedbackForm(r));
      actions.appendChild(fbBtn);
    }
  }

  function showEditForm(r) {
    const actions = document.getElementById('detailActions');
    actions.innerHTML = `
      <div class="neo-inset">
        <h4 style="margin-bottom: 12px;">✏️ Edit Report</h4>
        <div class="form-group"><label>Title</label><input id="editTitle" class="form-control" value="${r.title}"></div>
        <div class="form-group"><label>Description</label><textarea id="editDescription" class="form-control" rows="3">${r.description}</textarea></div>
        <div class="form-row">
          <div class="form-group"><label>Severity</label>
            <select id="editSeverity" class="form-control">
              <option value="low" ${r.severity === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${r.severity === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${r.severity === 'high' ? 'selected' : ''}>High</option>
              <option value="critical" ${r.severity === 'critical' ? 'selected' : ''}>Critical</option>
            </select>
          </div>
          <div class="form-group"><label>Affected People</label><input id="editAffected" type="number" min="0" class="form-control" value="${r.affectedPeople || 0}"></div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-primary" id="saveEditBtn">Save</button>
          <button class="btn btn-sm" id="cancelEditBtn">Cancel</button>
        </div>
      </div>`;
    document.getElementById('cancelEditBtn').addEventListener('click', () => renderReportDetail(currentDetailReport));
    document.getElementById('saveEditBtn').addEventListener('click', async () => {
      try {
        await apiUpdateReport(r._id, {
          title: document.getElementById('editTitle').value.trim(),
          description: document.getElementById('editDescription').value.trim(),
          severity: document.getElementById('editSeverity').value,
          affectedPeople: parseInt(document.getElementById('editAffected').value) || 0
        });
        showToast('success', 'Updated', 'Report updated successfully');
        const data = await apiGetReport(r._id);
        currentDetailReport = data.report;
        renderReportDetail(data.report);
        loadMyReports();
      } catch (err) {
        showToast('error', 'Update failed', err.message);
      }
    });
  }

  function showFeedbackForm(r) {
    const actions = document.getElementById('detailActions');
    actions.innerHTML = `
      <div class="neo-inset">
        <h4 style="margin-bottom: 12px;">⭐ Rate the Response</h4>
        <div class="star-rating" id="starRating">
          ${[1, 2, 3, 4, 5].map(i => `<span class="star" data-v="${i}">★</span>`).join('')}
        </div>
        <div class="form-group" style="margin-top: 12px;">
          <textarea id="feedbackComment" class="form-control" rows="2" placeholder="Optional comment..."></textarea>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-primary" id="sendFeedbackBtn">Submit</button>
          <button class="btn btn-sm" id="cancelFeedbackBtn">Cancel</button>
        </div>
      </div>`;
    let rating = 0;
    document.querySelectorAll('#starRating .star').forEach(star => {
      star.addEventListener('click', () => {
        rating = parseInt(star.dataset.v);
        document.querySelectorAll('#starRating .star').forEach(s =>
          s.classList.toggle('selected', parseInt(s.dataset.v) <= rating));
      });
    });
    document.getElementById('cancelFeedbackBtn').addEventListener('click', () => renderReportDetail(currentDetailReport));
    document.getElementById('sendFeedbackBtn').addEventListener('click', async () => {
      if (!rating) { showToast('warning', 'Select rating', 'Please choose a star rating'); return; }
      try {
        await apiSubmitFeedback(r._id, rating, document.getElementById('feedbackComment').value.trim());
        showToast('success', 'Thank you!', 'Your feedback helps improve emergency response');
        renderReportDetail(currentDetailReport);
      } catch (err) {
        showToast('error', 'Failed', err.message);
      }
    });
  }

  // ---- Real-Time: Status Updates ----
  const sock = initSocket();
  if (sock) {
    sock.on('statusUpdate', (data) => {
      showToast('info', 'Status Updated', `Report status changed to: ${formatStatus(data.status)}`);
      const myReportsTab = document.querySelector('[data-tab="myReports"]');
      if (myReportsTab.classList.contains('active')) {
        loadMyReports();
      }
    });
    sock.on('incidentUpdate', (data) => {
      const myReportsTab = document.querySelector('[data-tab="myReports"]');
      if (myReportsTab.classList.contains('active')) loadMyReports();
      if (currentDetailReport && data.report?._id === currentDetailReport._id) {
        currentDetailReport = data.report;
        renderReportDetail(data.report);
      }
    });
    sock.on('notification', (n) => {
      showToast(n.level === 'critical' ? 'error' : n.level === 'success' ? 'success' : 'info', n.title || 'Notification', n.message);
      refreshUnreadBadge();
    });
  }

  // ---- Init ----
  initMap();
  refreshUnreadBadge();

  // Expose inline-onclick handlers used in dynamically-generated HTML
  window.openReportDetail = openReportDetail;
  window.openLightbox = window.openLightbox || ((src) => showToast('info', 'Image', src));

  // ---- Modal close wiring ----
  document.getElementById('closeReportDetail').addEventListener('click', () => {
    document.getElementById('reportDetailModal').classList.add('hidden');
  });
  document.getElementById('reportDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'reportDetailModal') e.currentTarget.classList.add('hidden');
  });

})();
