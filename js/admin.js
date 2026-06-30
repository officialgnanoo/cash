
/**
 * منصة النقاط - Admin Panel Module
 * Full task management, user warnings, and analytics with PWA
 */

const Admin = {
  currentUser: null,
  currentAnalysisTask: null,

  init() {
    NP.initDemoData();
    this.checkAuth();
    this.bindEvents();
    this.loadDashboard();
  },

  bindEvents() {
    const taskForm = document.getElementById('task-form');
    if (taskForm) {
      taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.createTask();
      });
    }

    const analysisTaskSelect = document.getElementById('analysis-task');
    if (analysisTaskSelect) {
      analysisTaskSelect.addEventListener('change', (e) => {
        this.loadAnalysis(e.target.value);
      });
    }
  },

  checkAuth() {
    const session = NP.Session.get();
    if (!session || !session.isAdmin) {
      document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:20px;text-align:center;padding:20px;">
          <img src="assets/icon-192x192.png" alt="logo" style="width:100px;height:100px;border-radius:20px;margin-bottom:10px">
          <h2 style="color:var(--red)">غير مصرح</h2>
          <p style="color:var(--text-muted)">يجب تسجيل الدخول كأدمن للوصول لهذه الصفحة</p>
          <a href="index.html" class="btn" style="max-width:200px;text-decoration:none">العودة للرئيسية</a>
        </div>
      `;
      return false;
    }

    this.currentUser = NP.UserDB.findByUsername(session.username);
    document.getElementById('admin-name').textContent = this.currentUser.name;
    return true;
  },

  loadDashboard() {
    const stats = NP.AnalyticsDB.getDashboardStats();

    document.getElementById('stat-users').textContent = stats.totalUsers;
    document.getElementById('stat-active').textContent = stats.activeUsers;
    document.getElementById('stat-tasks').textContent = stats.activeTasks;
    document.getElementById('stat-pending').textContent = stats.pendingSubmissions;
    document.getElementById('stat-approved').textContent = stats.approvedSubmissions;
    document.getElementById('stat-egp').textContent = stats.totalEGPDistributed + ' ج.م';

    this.loadTasksTable();
    this.loadSubmissionsTable();
    this.loadUsersTable();
    this.loadAnalysisTasks();
  },

  createTask() {
    const type = document.getElementById('task-type').value;
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-desc').value.trim();
    const pageUrl = document.getElementById('task-url').value.trim();

    if (!title || !pageUrl) {
      this.showAlert('task-alert', '⚠️ أكمل العنوان والرابط', 'error');
      return;
    }

    NP.TaskDB.create({ type, title, description, pageUrl });

    document.getElementById('task-form').reset();
    this.showAlert('task-alert', '✅ تم نشر المهمة بنجاح!', 'success');

    this.loadTasksTable();
    this.loadAnalysisTasks();
  },

  loadTasksTable() {
    const tasks = NP.TaskDB.getAll();
    const tbody = document.getElementById('tasks-tbody');
    if (!tbody) return;

    const TYPE_LABELS = { like: 'لايك', comment: 'كومنت', share: 'شير', follow: 'متابعة' };

    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px">لا توجد مهام</td></tr>';
      return;
    }

    tbody.innerHTML = tasks.map(t => `
      <tr>
        <td><span class="task-badge ${t.type}">${TYPE_LABELS[t.type] || t.type}</span></td>
        <td><strong>${t.title}</strong><br><small style="color:var(--text-muted)">${t.description || ''}</small></td>
        <td><a href="${t.pageUrl}" target="_blank" style="color:var(--primary);font-size:.8rem">${t.pageUrl.substring(0, 40)}...</a></td>
        <td>${t.isActive ? '<span style="color:var(--green)">✓ نشطة</span>' : '<span style="color:var(--text-muted)">متوقفة</span>'}</td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="Admin.toggleTask('${t.taskId}')">${t.isActive ? 'إيقاف' : 'تفعيل'}</button>
          <button class="btn btn-sm btn-danger" onclick="Admin.deleteTask('${t.taskId}')">حذف</button>
        </td>
      </tr>
    `).join('');
  },

  toggleTask(taskId) {
    const task = NP.TaskDB.getById(taskId);
    if (task) {
      NP.TaskDB.update(taskId, { isActive: !task.isActive });
      this.loadTasksTable();
    }
  },

  deleteTask(taskId) {
    if (!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return;
    NP.TaskDB.delete(taskId);
    this.loadTasksTable();
    this.loadAnalysisTasks();
  },

  loadSubmissionsTable() {
    const submissions = NP.SubmissionDB.getPending();
    const tbody = document.getElementById('submissions-tbody');
    if (!tbody) return;

    if (!submissions.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px">لا توجد طلبات معلقة</td></tr>';
      return;
    }

    const TYPE_LABELS = { like: 'لايك', comment: 'كومنت', share: 'شير', follow: 'متابعة' };

    tbody.innerHTML = submissions.map(s => {
      const task = NP.TaskDB.getById(s.taskId);
      return `
        <tr>
          <td><strong>${s.name || s.username}</strong><br><small style="color:var(--text-muted)">${s.phone}</small></td>
          <td><span class="task-badge ${s.type}">${TYPE_LABELS[s.type] || s.type}</span></td>
          <td>${task ? task.title : 'مهمة محذوفة'}</td>
          <td><a href="${s.proof}" target="_blank" style="color:var(--primary);font-size:.8rem">عرض الإثبات</a></td>
          <td><small style="color:var(--text-muted)">${new Date(s.createdAt).toLocaleDateString('ar-EG')}</small></td>
          <td>
            <button class="btn btn-sm btn-success" onclick="Admin.approveSubmission('${s.id}')">✓ موافقة</button>
            <button class="btn btn-sm btn-danger" onclick="Admin.rejectSubmission('${s.id}')">✕ رفض</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  approveSubmission(id) {
    NP.SubmissionDB.approve(id, this.currentUser.username);
    this.loadSubmissionsTable();
    this.loadDashboard();
    this.showToast('✅ تمت الموافقة على الإثبات', 'success');
  },

  rejectSubmission(id) {
    const reason = prompt('سبب الرفض (اختياري):');
    NP.SubmissionDB.reject(id, this.currentUser.username, reason || 'إثبات غير صحيح');
    this.loadSubmissionsTable();
    this.showToast('✕ تم رفض الإثبات', 'error');
  },

  loadUsersTable() {
    const users = NP.UserDB.getAll();
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px">لا يوجد مستخدمين</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <img src="assets/icon-72x72.png" alt="${u.name}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--border)">
            <div>
              <div style="font-weight:700">${u.name}</div>
              <small style="color:var(--text-muted)">@${u.username}</small>
            </div>
          </div>
        </td>
        <td>${u.phone}</td>
        <td><strong style="color:var(--gold)">${u.points}</strong></td>
        <td><strong style="color:var(--green)">${(u.points * NP.CONFIG.POINT_VALUE_EGP).toFixed(2)} ج.م</strong></td>
        <td>
          ${u.isBanned ? '<span class="status-badge missing">محظور</span>' : 
            u.warnings > 0 ? `<span class="status-badge missing">${u.warnings} تحذير</span>` : 
            '<span class="status-badge done">جيد</span>'}
        </td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="Admin.warnUser('${u.username}')">⚠️ تحذير</button>
          ${u.isBanned ? 
            `<button class="btn btn-sm btn-success" onclick="Admin.unbanUser('${u.username}')">فك الحظر</button>` :
            `<button class="btn btn-sm btn-danger" onclick="Admin.banUser('${u.username}')">حظر</button>`
          }
        </td>
      </tr>
    `).join('');
  },

  warnUser(username) {
    const reason = prompt('سبب التحذير:');
    if (!reason) return;

    NP.UserDB.addWarning(username, reason);
    this.loadUsersTable();
    this.loadDashboard();
    this.showToast(`⚠️ تم إرسال تحذير للمستخدم ${username}`, 'warning');
  },

  banUser(username) {
    if (!confirm(`هل أنت متأكد من حظر المستخدم ${username}؟`)) return;
    NP.UserDB.update(username, { isBanned: true });
    this.loadUsersTable();
    this.showToast(`🚫 تم حظر المستخدم ${username}`, 'error');
  },

  unbanUser(username) {
    NP.UserDB.update(username, { isBanned: false, warnings: 0 });
    this.loadUsersTable();
    this.showToast(`✅ تم فك حظر المستخدم ${username}`, 'success');
  },

  loadAnalysisTasks() {
    const select = document.getElementById('analysis-task');
    if (!select) return;

    const tasks = NP.TaskDB.getAll();
    select.innerHTML = '<option value="">اختر مهمة...</option>' + 
      tasks.map(t => `<option value="${t.taskId}">${t.title}</option>`).join('');
  },

  loadAnalysis(taskId) {
    const container = document.getElementById('analysis-results');
    if (!container || !taskId) {
      if (container) container.innerHTML = '';
      return;
    }

    const analysis = NP.AnalyticsDB.getTaskAnalysis(taskId);
    if (!analysis) return;

    const TYPE_LABELS = { like: 'لايك', comment: 'كومنت', share: 'شير', follow: 'متابعة' };

    container.innerHTML = `
      <div class="card" style="margin-bottom:20px">
        <div style="padding:20px;border-bottom:1px solid var(--border)">
          <h3 style="margin-bottom:10px">📊 ${analysis.task.title}</h3>
          <div style="display:flex;gap:20px;flex-wrap:wrap;color:var(--text-muted);font-size:.85rem">
            <span>النوع: ${TYPE_LABELS[analysis.task.type] || analysis.task.type}</span>
            <span>إجمالي المستخدمين: ${analysis.totalUsers}</span>
            <span>نسبة الإنجاز: <strong style="color:var(--green)">${analysis.completionRate}%</strong></span>
          </div>
        </div>

        <div style="padding:20px">
          <div style="display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap">
            <div class="stat-card" style="flex:1;min-width:200px">
              <div class="stat-icon green">✓</div>
              <div class="stat-info">
                <h4>تم التنفيذ</h4>
                <div class="value" style="color:var(--green)">${analysis.completedCount}</div>
              </div>
            </div>
            <div class="stat-card" style="flex:1;min-width:200px">
              <div class="stat-icon red">✕</div>
              <div class="stat-info">
                <h4>لم ينفذ</h4>
                <div class="value" style="color:var(--red)">${analysis.missingCount}</div>
              </div>
            </div>
          </div>

          ${analysis.missing.length > 0 ? `
            <h4 style="color:var(--red);margin-bottom:14px;font-size:1rem">⚠️ المستخدمون المتخلفون (${analysis.missing.length})</h4>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>رقم الهاتف</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  ${analysis.missing.map(u => `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:10px">
                          <img src="assets/icon-72x72.png" alt="${u.name}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid var(--border)">
                          <div>
                            <div style="font-weight:700;font-size:.85rem">${u.name}</div>
                            <small style="color:var(--text-muted)">@${u.username}</small>
                          </div>
                        </div>
                      </td>
                      <td>${u.phone}</td>
                      <td><span class="status-badge missing">متخلف</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div class="empty-state" style="padding:32px"><div class="icon" style="font-size:2rem">🎉</div><h4>الجميع نفذ المهمة!</h4></div>'}

          ${analysis.completed.length > 0 ? `
            <h4 style="color:var(--green);margin:24px 0 14px;font-size:1rem">✓ المستخدمون المنفذون (${analysis.completed.length})</h4>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>تاريخ التسليم</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  ${analysis.completed.map(u => `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:10px">
                          <img src="assets/icon-72x72.png" alt="${u.name}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid var(--border)">
                          <div>
                            <div style="font-weight:700;font-size:.85rem">${u.name}</div>
                            <small style="color:var(--text-muted)">@${u.username}</small>
                          </div>
                        </div>
                      </td>
                      <td><small style="color:var(--text-muted)">${u.submittedAt ? new Date(u.submittedAt).toLocaleDateString('ar-EG') : '-'}</small></td>
                      <td><span class="status-badge done">منفذ</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  showAlert(id, msg, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'alert ' + type + ' show';
    el.innerHTML = msg;
    setTimeout(() => { if (el) el.className = 'alert'; }, 5000);
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container') || this.createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => Admin.init());
