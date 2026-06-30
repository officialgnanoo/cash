
/**
 * منصة النقاط - User Application Module
 * Modular architecture with PWA support
 */

const App = {
  user: null,
  currentTask: null,
  fbCheckTimeout: null,

  init() {
    NP.initDemoData();
    this.checkSession();
    this.bindEvents();
  },

  bindEvents() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchAuth(e.target.dataset.tab));
    });

    const termsCheck = document.getElementById('terms-check');
    if (termsCheck) {
      termsCheck.addEventListener('change', (e) => {
        document.getElementById('reg-btn').disabled = !e.target.checked;
      });
    }
  },

  switchAuth(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.auth-panel').forEach(p => {
      p.classList.toggle('active', p.id === 'auth-' + tab);
    });
  },

  async loginUser() {
    this.hideAlert('login-alert');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!username || !password) {
      this.showAlert('login-alert', '⚠️ ادخل اسم المستخدم وكلمة السر', 'error');
      return;
    }

    this.setBtn('login-btn', 'جاري التحقق <span class="spinner"></span>', true);

    await this.delay(600);

    const user = NP.UserDB.findByUsername(username);
    if (!user || user.passwordHash !== NP.hashPassword(password)) {
      this.showAlert('login-alert', '❌ اسم المستخدم أو كلمة السر غلط', 'error');
      this.setBtn('login-btn', '🔑 دخول', false);
      return;
    }

    if (user.isBanned) {
      this.showAlert('login-alert', '❌ الحساب محظور بسبب مخالفات متكررة', 'error');
      this.setBtn('login-btn', '🔑 دخول', false);
      return;
    }

    NP.UserDB.update(username, { lastLogin: new Date().toISOString() });
    NP.Session.save(user);
    this.user = user;

    this.showAlert('login-alert', '✅ تم الدخول بنجاح!', 'success');
    setTimeout(() => this.enterApp(), 800);
  },

  async registerUser() {
    this.hideAlert('reg-alert');
    const name = document.getElementById('reg-name').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const fbUrl = document.getElementById('reg-fb').value.trim();
    const termsCheck = document.getElementById('terms-check');

    if (!name || !username || !password || !phone || !fbUrl) {
      this.showAlert('reg-alert', '⚠️ اكمل جميع الحقول', 'error');
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      this.showAlert('reg-alert', '⚠️ اسم المستخدم: حروف وأرقام فقط (3-20 حرف)', 'error');
      return;
    }

    if (password.length < 6) {
      this.showAlert('reg-alert', '⚠️ كلمة السر لازم تكون ٦ أحرف على الأقل', 'error');
      return;
    }

    if (!/^01\d{9}$/.test(phone.replace(/\s/g, ''))) {
      this.showAlert('reg-alert', '⚠️ رقم الهاتف لازم يكون 11 رقم ويبدأ بـ 01', 'error');
      return;
    }

    if (!fbUrl.startsWith('http')) {
      this.showAlert('reg-alert', '⚠️ الرابط لازم يكون صحيح', 'error');
      return;
    }

    if (termsCheck && !termsCheck.checked) {
      this.showAlert('reg-alert', '⚠️ يجب الموافقة على الشروط والأحكام', 'error');
      return;
    }

    this.setBtn('reg-btn', 'جاري التسجيل <span class="spinner"></span>', true);

    await this.delay(600);

    if (NP.UserDB.findByUsername(username)) {
      this.showAlert('reg-alert', '⚠️ اسم المستخدم موجود — اختار اسم تاني', 'error');
      this.setBtn('reg-btn', '✨ إنشاء حساب', false);
      return;
    }

    if (NP.UserDB.findByPhone(phone)) {
      this.showAlert('reg-alert', '⚠️ رقم الهاتف مسجل — استخدم تسجيل الدخول', 'error');
      this.setBtn('reg-btn', '✨ إنشاء حساب', false);
      return;
    }

    const newUser = NP.UserDB.create({ name, username, password, phone, fbUrl });
    NP.Session.save(newUser);
    this.user = newUser;

    this.showAlert('reg-alert', '✅ تم التسجيل! جاري الدخول...', 'success');
    setTimeout(() => this.enterApp(), 1000);
  },

  logout() {
    this.user = null;
    NP.Session.clear();
    document.getElementById('page-tasks').style.display = 'none';
    document.getElementById('page-landing').style.display = 'flex';
    document.getElementById('header-user').style.display = 'none';
    const adminLink = document.getElementById('admin-link');
    if (adminLink) adminLink.style.display = 'none';
    this.switchAuth('login');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
  },

  enterApp() {
    document.getElementById('page-landing').style.display = 'none';
    document.getElementById('page-tasks').style.display = 'block';
    document.getElementById('header-user').style.display = 'flex';

    const user = NP.UserDB.findByUsername(this.user.username);
    this.user = user;

    document.getElementById('hdr-name').textContent = user.name;
    document.getElementById('hdr-points').textContent = user.points + ' نقطة';

    const avatarEl = document.getElementById('hdr-avatar');
    if (avatarEl) {
      avatarEl.src = 'assets/icon-72x72.png';
      avatarEl.alt = user.name;
    }

    if (user.isAdmin) {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.style.display = 'inline-flex';
    }

    this.updatePointsUI(user.points);
    this.checkDailyBonus();
    this.loadTasks();
    this.loadLeaderboard();
    this.checkWarnings();
  },

  checkSession() {
    const session = NP.Session.get();
    if (session) {
      const user = NP.UserDB.findByUsername(session.username);
      if (user && !user.isBanned) {
        this.user = user;
        this.enterApp();
      } else {
        NP.Session.clear();
      }
    }
  },

  checkDailyBonus() {
    const result = NP.UserDB.checkDailyBonus(this.user.username);
    if (result.granted) {
      this.user.points = result.points;
      this.updatePointsUI(result.points);
      const dailyBonus = document.getElementById('daily-bonus');
      if (dailyBonus) {
        dailyBonus.style.display = 'inline-flex';
        dailyBonus.innerHTML = '🎁 نقطة يومية! استمرارك ' + result.streak + ' أيام متتالية';
      }
      this.showToast('✅ حصلت على نقطة يومية بسبب انتظامك!', 'success');
      document.getElementById('hdr-points').textContent = result.points + ' نقطة';
    }
  },

  updatePointsUI(pts) {
    const config = NP.CONFIG;
    const egpValue = (pts * config.POINT_VALUE_EGP).toFixed(2);
    const progress = Math.min((pts / config.CASH_TARGET) * 100, 100);

    document.getElementById('pts-display').textContent = pts;
    document.getElementById('pts-name-disp').textContent = this.user.name;
    document.getElementById('pts-value').textContent = '= ' + egpValue + ' ج.م';
    document.getElementById('pts-bar').style.width = progress + '%';
    document.getElementById('pts-label').textContent = pts + ' / ' + config.CASH_TARGET + ' نقطة للسحب';

    const cashBadge = document.getElementById('cash-badge');
    if (pts >= config.CASH_TARGET) {
      cashBadge.style.display = 'inline-flex';
      cashBadge.innerHTML = '🎉 وصلت للسحب! ' + config.CASH_TARGET + ' نقطة = ' + config.CASH_VALUE_EGP + 'ج كاش';
    } else {
      cashBadge.style.display = 'none';
    }

    document.getElementById('hdr-points').textContent = pts + ' نقطة';
  },

  async loadTasks() {
    const container = document.getElementById('tasks-container');
    container.innerHTML = '<div class="skeleton"><div class="sk-line"></div><div class="sk-line w60"></div><div class="sk-line w40"></div></div><div class="skeleton"><div class="sk-line"></div><div class="sk-line w60"></div><div class="sk-line w40"></div></div>';

    await this.delay(400);

    const tasks = NP.TaskDB.getActive();
    const completed = NP.SubmissionDB.getCompletedTasks(this.user.username);
    const warnings = NP.Storage.get(NP.DB_KEYS.WARNINGS) || [];
    const userWarnings = warnings.filter(w => w.username === this.user.username && !w.isRead);

    this.renderTasks(tasks, completed, userWarnings.length > 0);
  },

  renderTasks(tasks, completedIds, hasWarning) {
    const container = document.getElementById('tasks-container');

    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">🎯</div><h4>مفيش مهام حالياً</h4><p>هيتم إضافة مهام جديدة قريباً، تابع الموقع.</p></div>';
      return;
    }

    const TYPE_LABELS = { like: 'لايك', comment: 'كومنت', share: 'شير', follow: 'متابعة' };
    const TYPE_ICONS = { like: '👍', comment: '💬', share: '🔁', follow: '➕' };

    container.innerHTML = tasks.map((t, i) => {
      const done = completedIds.includes(t.taskId);
      const icon = TYPE_ICONS[t.type] || '🎯';
      const lbl = TYPE_LABELS[t.type] || t.type;
      const egpPerPoint = (NP.CONFIG.POINT_VALUE_EGP).toFixed(2);
      const domain = this.extractDomain(t.pageUrl);

      return '<div class="task-card ' + (done ? 'done' : '') + ' ' + (hasWarning ? 'warned' : '') + ' animate-in" style="animation-delay:' + (i*0.1) + 's" id="card-' + t.taskId + '">' +
        '<div class="task-top">' +
          '<div class="task-meta">' +
            '<span class="task-badge ' + t.type + '">' + icon + ' ' + lbl + '</span>' +
            '<div class="task-title">' + t.title + '</div>' +
            (t.description ? '<div class="task-desc">' + t.description + '</div>' : '') +
          '</div>' +
          '<div class="task-pts-badge">' +
            '<div class="num">' + NP.CONFIG.POINTS_PER_ACTION + '</div>' +
            '<div class="lbl">نقطة</div>' +
            '<div class="val">' + egpPerPoint + ' ج.م</div>' +
          '</div>' +
        '</div>' +
        '<div class="link-preview">' +
          '<div class="link-favicon">' + icon + '</div>' +
          '<div class="link-info">' +
            '<div class="domain">' + domain + '</div>' +
            '<a href="' + t.pageUrl + '" target="_blank" rel="noopener" class="url-text">' + t.pageUrl + '</a>' +
          '</div>' +
          '<button class="copy-btn" onclick="App.copyLink('' + t.pageUrl + '', this)">📋 نسخ</button>' +
        '</div>' +
        (done
          ? '<div class="verify-status success">✅ تم تنفيذ المهمة — تمت الموافقة</div>'
          : '<button class="task-action-btn" onclick="App.openTaskModal('' + t.taskId + '', '' + t.type + '', '' + t.pageUrl + '', '' + t.title + '')">' + icon + ' افتح الصفحة وارسل إثباتك</button><div class="verify-status" id="vs-' + t.taskId + '"></div>'
        ) +
      '</div>';
    }).join('');
  },

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'رابط خارجي';
    }
  },

  copyLink(url, btn) {
    navigator.clipboard.writeText(url).then(() => {
      btn.innerHTML = '✓ تم';
      btn.style.background = 'var(--green)';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.innerHTML = '📋 نسخ';
        btn.style.background = '';
        btn.style.color = '';
      }, 1500);
    });
  },

  openTaskModal(taskId, type, pageUrl, title) {
    this.currentTask = { taskId, type, pageUrl, title };
    const TYPE_LABELS = { like: 'لايك', comment: 'كومنت', share: 'شير', follow: 'متابعة' };
    const TYPE_ICONS = { like: '👍', comment: '💬', share: '🔁', follow: '➕' };

    document.getElementById('modal-info').innerHTML = 
      'المهمة: <strong>' + title + '</strong><br>النوع: ' + (TYPE_ICONS[type] || '') + ' ' + (TYPE_LABELS[type] || type) + ' — <strong style="color:var(--gold)">' + NP.CONFIG.POINTS_PER_ACTION + ' نقطة = ' + NP.CONFIG.POINT_VALUE_EGP + ' ج.م</strong>';

    this.hideAlert('modal-alert');
    document.getElementById('modal-proof').value = '';
    document.getElementById('task-modal').classList.add('show');
    window.open(pageUrl, '_blank');
  },

  closeModal() {
    document.getElementById('task-modal').classList.remove('show');
    this.currentTask = null;
  },

  async submitFromModal() {
    this.hideAlert('modal-alert');
    const proof = document.getElementById('modal-proof').value.trim();

    if (!proof) {
      this.showAlert('modal-alert', '⚠️ الصق رابط الإثبات', 'error');
      return;
    }

    if (!proof.startsWith('http')) {
      this.showAlert('modal-alert', '⚠️ الرابط لازم يكون صحيح', 'error');
      return;
    }

    this.setBtn('modal-submit-btn', 'جاري الإرسال <span class="spinner"></span>', true);

    await this.delay(500);

    if (NP.SubmissionDB.hasCompleted(this.user.username, this.currentTask.taskId)) {
      this.showAlert('modal-alert', '⚠️ تم تسليم هذه المهمة من قبل', 'error');
      this.setBtn('modal-submit-btn', '🚀 إرسال للمراجعة', false);
      return;
    }

    NP.SubmissionDB.create({
      username: this.user.username,
      phone: this.user.phone,
      type: this.currentTask.type,
      taskId: this.currentTask.taskId,
      proof,
      date: new Date().toLocaleString('ar-EG')
    });

    const card = document.getElementById('card-' + this.currentTask.taskId);
    if (card) {
      card.classList.add('done');
      const btn = card.querySelector('.task-action-btn');
      if (btn) btn.remove();
      let vs = card.querySelector('[id^="vs-"]');
      if (vs) {
        vs.className = 'verify-status pending';
        vs.style.display = 'flex';
        vs.innerHTML = '⏳ تم التسليم — في انتظار مراجعة الأدمن';
      }
    }

    this.showToast('✅ تم إرسال الإثبات بنجاح! في انتظار المراجعة', 'success');
    this.closeModal();
    this.setBtn('modal-submit-btn', '🚀 إرسال للمراجعة', false);
  },

  loadLeaderboard() {
    const leaderboard = NP.UserDB.getLeaderboard();
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    const topUsers = leaderboard.slice(0, 10);

    if (topUsers.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding: 32px 20px;"><div class="icon">🏆</div><h4>لا يوجد مستخدمين بعد</h4></div>';
      return;
    }

    container.innerHTML = topUsers.map((u, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const isMe = u.username === this.user.username;
      return '<div class="leaderboard-item ' + (isMe ? 'animate-in' : '') + '" style="' + (isMe ? 'background:rgba(245,166,35,.08)' : '') + '">' +
        '<div class="lb-rank ' + rankClass + '">' + (i + 1) + '</div>' +
        '<img src="assets/icon-72x72.png" alt="' + u.name + '" class="lb-avatar-img" style="width:40px;height:40px">' +
        '<div class="lb-info">' +
          '<div class="name">' + u.name + (isMe ? ' <span style="color:var(--gold)">(أنت)</span>' : '') + '</div>' +
          '<div class="username">@' + u.username + '</div>' +
        '</div>' +
        '<div class="lb-points">' + u.points + '<div class="egp">' + u.earnings + ' ج.م</div></div>' +
      '</div>';
    }).join('');
  },

  checkWarnings() {
    const warnings = NP.Storage.get(NP.DB_KEYS.WARNINGS) || [];
    const userWarnings = warnings.filter(w => w.username === this.user.username && !w.isRead);

    if (userWarnings.length > 0) {
      const banner = document.getElementById('warn-banner');
      if (banner) {
        banner.style.display = 'flex';
        banner.innerHTML = '<span>⚠️</span><div><strong>تحذير!</strong> ' + userWarnings.length + ' تحذير بسبب عدم الالتزام بالشروط.' + (this.user.warnings >= 2 ? '<br><span style="color:var(--red)">عند الوصول لـ 3 تحذيرات سيتم حظر حسابك!</span>' : '') + '</div>';
      }

      const allWarnings = warnings.map(w => {
        if (w.username === this.user.username) w.isRead = true;
        return w;
      });
      NP.Storage.set(NP.DB_KEYS.WARNINGS, allWarnings);
    }
  },

  showTerms() {
    document.getElementById('terms-modal').classList.add('show');
  },

  closeTerms() {
    document.getElementById('terms-modal').classList.remove('show');
  },

  // ==================== FACEBOOK PROFILE CHECK ====================
  checkFacebookProfile(url) {
    clearTimeout(this.fbCheckTimeout);

    const preview = document.getElementById('fb-preview');
    const errorDiv = document.getElementById('fb-error');
    const previewImg = document.getElementById('fb-preview-img');
    const previewName = document.getElementById('fb-preview-name');
    const previewUrl = document.getElementById('fb-preview-url');
    const previewBadge = document.getElementById('fb-preview-badge');
    const previewStatus = document.getElementById('fb-preview-status');
    const previewCard = document.querySelector('.fb-preview-card');

    if (!url || !url.includes('facebook.com')) {
      if (preview) preview.style.display = 'none';
      if (errorDiv) errorDiv.style.display = 'none';
      return;
    }

    if (preview) preview.style.display = 'block';
    if (errorDiv) errorDiv.style.display = 'none';
    if (previewImg) {
      previewImg.classList.add('skeleton-avatar');
      previewImg.src = '';
    }
    if (previewName) previewName.textContent = 'جاري التحقق...';
    if (previewUrl) previewUrl.textContent = url;
    if (previewBadge) previewBadge.innerHTML = '<span class="fb-preview-loading"><span class="spinner"></span> جاري التحقق</span>';
    if (previewCard) previewCard.classList.remove('fb-preview-error');

    this.fbCheckTimeout = setTimeout(() => {
      this.validateFacebookUrl(url);
    }, 800);
  },

  validateFacebookUrl(url) {
    const preview = document.getElementById('fb-preview');
    const errorDiv = document.getElementById('fb-error');
    const previewImg = document.getElementById('fb-preview-img');
    const previewName = document.getElementById('fb-preview-name');
    const previewUrl = document.getElementById('fb-preview-url');
    const previewBadge = document.getElementById('fb-preview-badge');
    const previewStatus = document.getElementById('fb-preview-status');
    const previewCard = document.querySelector('.fb-preview-card');

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      if (!hostname.includes('facebook.com') && !hostname.includes('fb.com')) {
        throw new Error('الرابط لازم يكون من فيسبوك');
      }

      let username = '';
      const path = urlObj.pathname.replace(/^\//, '').replace(/\/$/, '');

      if (path.startsWith('profile.php')) {
        const idMatch = path.match(/id=(\d+)/);
        if (idMatch) username = idMatch[1];
      } else if (path.includes('people/')) {
        const peopleMatch = path.match(/people\/([^/]+)/);
        if (peopleMatch) username = peopleMatch[1];
      } else {
        const parts = path.split('/').filter(p => p);
        if (parts.length > 0 && !['pages', 'groups', 'events', 'watch'].includes(parts[0])) {
          username = parts[0];
        }
      }

      if (!username) {
        throw new Error('تعذر استخراج اسم المستخدم من الرابط');
      }

      const reserved = ['home', 'login', 'logout', 'settings', 'help', 'about', 'privacy', 'terms', 'developers', 'business', 'ads', 'media', 'watch', 'marketplace', 'gaming', 'jobs', 'news', 'weather', 'safety', 'community', 'fundraisers', 'donate', 'blood', 'birthdays', 'memories', 'saved', 'pages', 'groups', 'events', 'friends', 'messages', 'notifications', 'search', 'reel', 'story', 'live', 'shop'];

      if (reserved.includes(username.toLowerCase())) {
        throw new Error('هذا ليس رابط بروفايل شخصي');
      }

      if (previewImg) {
        previewImg.classList.remove('skeleton-avatar');
        previewImg.src = 'https://graph.facebook.com/' + username + '/picture?type=large';
        previewImg.onerror = function() {
          this.src = 'assets/icon-192x192.png';
          this.style.padding = '8px';
          this.style.background = 'rgba(255,255,255,.1)';
        };
        previewImg.onload = function() {
          this.style.padding = '0';
          this.style.background = 'transparent';
        };
      }

      if (previewName) previewName.textContent = username;
      if (previewUrl) previewUrl.textContent = url;
      if (previewBadge) previewBadge.innerHTML = '✓ رابط بروفايل صحيح';
      if (previewStatus) {
        previewStatus.textContent = '✓';
        previewStatus.style.background = 'var(--green)';
      }
      if (previewCard) previewCard.classList.remove('fb-preview-error');
      if (errorDiv) errorDiv.style.display = 'none';

    } catch (e) {
      if (preview) preview.style.display = 'block';
      if (previewImg) {
        previewImg.classList.remove('skeleton-avatar');
        previewImg.src = 'assets/icon-192x192.png';
        previewImg.style.padding = '8px';
        previewImg.style.background = 'rgba(255,255,255,.1)';
      }
      if (previewName) previewName.textContent = 'خطأ في الرابط';
      if (previewUrl) previewUrl.textContent = url;
      if (previewBadge) previewBadge.innerHTML = '✕ رابط غير صحيح';
      if (previewStatus) {
        previewStatus.textContent = '✕';
        previewStatus.style.background = 'var(--red)';
      }
      if (previewCard) previewCard.classList.add('fb-preview-error');
      if (errorDiv) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = '⚠️ ' + e.message;
      }
    }
  },

  // ==================== UTILITIES ====================
  showAlert(id, msg, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'alert ' + type + ' show';
    el.innerHTML = msg;
  },

  hideAlert(id) {
    const el = document.getElementById(id);
    if (el) el.className = 'alert';
  },

  setBtn(id, html, disabled) {
    const b = document.getElementById(id);
    if (!b) return;
    b.innerHTML = html;
    b.disabled = disabled;
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  showToast(message, type) {
    const container = document.getElementById('toast-container') || this.createToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
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

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  App.init();
});

// Close modal on overlay click
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
});
