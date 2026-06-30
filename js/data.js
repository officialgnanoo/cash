
/**
 * منصة النقاط - Data Layer
 * LocalStorage-based backend simulation with full modular architecture
 */

const DB_KEYS = {
  USERS: 'np_users',
  TASKS: 'np_tasks',
  SUBMISSIONS: 'np_submissions',
  WARNINGS: 'np_warnings',
  SESSION: 'np_session',
  DAILY_BONUS: 'np_daily_bonus',
  ANALYTICS: 'np_analytics'
};

const CONFIG = {
  POINTS_PER_ACTION: 1,
  CASH_TARGET: 400,
  CASH_VALUE_EGP: 100,
  POINT_VALUE_EGP: 0.25,
  ADMIN_CODE: 'admin2024'
};

// ==================== UTILITIES ====================
const generateId = () => 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

const getToday = () => new Date().toISOString().split('T')[0];

const hashPassword = (pwd) => {
  // Simple hash for demo - in production use bcrypt
  let hash = 0;
  for (let i = 0; i < pwd.length; i++) {
    const char = pwd.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hash_' + Math.abs(hash).toString(16);
};

// ==================== STORAGE ====================
const Storage = {
  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

// ==================== USERS ====================
const UserDB = {
  getAll() {
    return Storage.get(DB_KEYS.USERS) || [];
  },

  findByUsername(username) {
    return this.getAll().find(u => u.username === username);
  },

  findByPhone(phone) {
    return this.getAll().find(u => u.phone === phone);
  },

  create(userData) {
    const users = this.getAll();
    const newUser = {
      id: generateId(),
      ...userData,
      passwordHash: hashPassword(userData.password),
      points: 0,
      totalEarned: 0,
      warnings: 0,
      isBanned: false,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      avatar: null,
      dailyStreak: 0
    };
    users.push(newUser);
    Storage.set(DB_KEYS.USERS, users);
    return newUser;
  },

  update(username, updates) {
    const users = this.getAll();
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    Storage.set(DB_KEYS.USERS, users);
    return users[idx];
  },

  addPoints(username, points) {
    const user = this.findByUsername(username);
    if (!user) return null;
    const newPoints = user.points + points;
    return this.update(username, { 
      points: newPoints, 
      totalEarned: user.totalEarned + points 
    });
  },

  deductPoints(username, points) {
    const user = this.findByUsername(username);
    if (!user) return null;
    const newPoints = Math.max(0, user.points - points);
    return this.update(username, { points: newPoints });
  },

  addWarning(username, reason) {
    const user = this.findByUsername(username);
    if (!user) return null;
    const warnings = Storage.get(DB_KEYS.WARNINGS) || [];
    warnings.push({
      id: generateId(),
      username,
      reason,
      date: new Date().toISOString(),
      isRead: false
    });
    Storage.set(DB_KEYS.WARNINGS, warnings);

    const newWarnings = user.warnings + 1;
    const isBanned = newWarnings >= 3;
    return this.update(username, { warnings: newWarnings, isBanned });
  },

  getLeaderboard() {
    return this.getAll()
      .filter(u => !u.isBanned)
      .sort((a, b) => b.points - a.points)
      .map((u, i) => ({
        rank: i + 1,
        name: u.name,
        username: u.username,
        points: u.points,
        earnings: (u.points * CONFIG.POINT_VALUE_EGP).toFixed(2),
        avatar: u.avatar || u.name.charAt(0).toUpperCase()
      }));
  },

  checkDailyBonus(username) {
    const user = this.findByUsername(username);
    if (!user) return { granted: false };

    const today = getToday();
    const lastBonus = user.lastDailyBonus;

    if (lastBonus === today) return { granted: false, alreadyClaimed: true };

    const newPoints = user.points + 1;
    const streak = (user.dailyStreak || 0) + 1;
    this.update(username, { 
      points: newPoints, 
      lastDailyBonus: today,
      dailyStreak: streak
    });

    return { granted: true, points: newPoints, streak };
  }
};

// ==================== TASKS ====================
const TaskDB = {
  getAll() {
    return Storage.get(DB_KEYS.TASKS) || [];
  },

  create(taskData) {
    const tasks = this.getAll();
    const newTask = {
      taskId: generateId(),
      ...taskData,
      createdAt: new Date().toISOString(),
      isActive: true,
      completions: 0
    };
    tasks.push(newTask);
    Storage.set(DB_KEYS.TASKS, tasks);
    return newTask;
  },

  update(taskId, updates) {
    const tasks = this.getAll();
    const idx = tasks.findIndex(t => t.taskId === taskId);
    if (idx === -1) return null;
    tasks[idx] = { ...tasks[idx], ...updates };
    Storage.set(DB_KEYS.TASKS, tasks);
    return tasks[idx];
  },

  delete(taskId) {
    const tasks = this.getAll().filter(t => t.taskId !== taskId);
    Storage.set(DB_KEYS.TASKS, tasks);
  },

  getActive() {
    return this.getAll().filter(t => t.isActive);
  },

  getById(taskId) {
    return this.getAll().find(t => t.taskId === taskId);
  }
};

// ==================== SUBMISSIONS ====================
const SubmissionDB = {
  getAll() {
    return Storage.get(DB_KEYS.SUBMISSIONS) || [];
  },

  create(submission) {
    const submissions = this.getAll();
    const newSub = {
      id: generateId(),
      ...submission,
      status: 'pending', // pending, approved, rejected
      reviewedAt: null,
      reviewedBy: null,
      createdAt: new Date().toISOString()
    };
    submissions.push(newSub);
    Storage.set(DB_KEYS.SUBMISSIONS, submissions);
    return newSub;
  },

  approve(id, adminUsername) {
    const submissions = this.getAll();
    const idx = submissions.findIndex(s => s.id === id);
    if (idx === -1) return null;
    submissions[idx].status = 'approved';
    submissions[idx].reviewedAt = new Date().toISOString();
    submissions[idx].reviewedBy = adminUsername;
    Storage.set(DB_KEYS.SUBMISSIONS, submissions);

    // Add points to user
    const sub = submissions[idx];
    UserDB.addPoints(sub.username, CONFIG.POINTS_PER_ACTION);

    return submissions[idx];
  },

  reject(id, adminUsername, reason) {
    const submissions = this.getAll();
    const idx = submissions.findIndex(s => s.id === id);
    if (idx === -1) return null;
    submissions[idx].status = 'rejected';
    submissions[idx].reviewedAt = new Date().toISOString();
    submissions[idx].reviewedBy = adminUsername;
    submissions[idx].rejectReason = reason;
    Storage.set(DB_KEYS.SUBMISSIONS, submissions);
    return submissions[idx];
  },

  getByUser(username) {
    return this.getAll().filter(s => s.username === username);
  },

  getByTask(taskId) {
    return this.getAll().filter(s => s.taskId === taskId);
  },

  getPending() {
    return this.getAll().filter(s => s.status === 'pending');
  },

  hasCompleted(username, taskId) {
    return this.getAll().some(
      s => s.username === username && s.taskId === taskId && s.status === 'approved'
    );
  },

  getCompletedTasks(username) {
    return this.getAll()
      .filter(s => s.username === username && s.status === 'approved')
      .map(s => s.taskId);
  }
};

// ==================== ANALYTICS ====================
const AnalyticsDB = {
  getTaskAnalysis(taskId) {
    const task = TaskDB.getById(taskId);
    if (!task) return null;

    const allUsers = UserDB.getAll().filter(u => !u.isBanned);
    const submissions = SubmissionDB.getByTask(taskId);
    const completedUsernames = new Set(submissions.filter(s => s.status === 'approved').map(s => s.username));

    const completed = [];
    const missing = [];

    allUsers.forEach(user => {
      const userData = {
        username: user.username,
        name: user.name,
        phone: user.phone,
        avatar: user.avatar || user.name.charAt(0).toUpperCase(),
        submittedAt: null
      };

      if (completedUsernames.has(user.username)) {
        const sub = submissions.find(s => s.username === user.username && s.status === 'approved');
        userData.submittedAt = sub ? sub.createdAt : null;
        completed.push(userData);
      } else {
        missing.push(userData);
      }
    });

    return {
      task,
      totalUsers: allUsers.length,
      completedCount: completed.length,
      missingCount: missing.length,
      completionRate: allUsers.length > 0 ? ((completed.length / allUsers.length) * 100).toFixed(1) : 0,
      completed,
      missing
    };
  },

  getDashboardStats() {
    const users = UserDB.getAll();
    const tasks = TaskDB.getAll();
    const submissions = SubmissionDB.getAll();

    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => !u.isBanned).length,
      bannedUsers: users.filter(u => u.isBanned).length,
      totalTasks: tasks.length,
      activeTasks: tasks.filter(t => t.isActive).length,
      totalSubmissions: submissions.length,
      pendingSubmissions: submissions.filter(s => s.status === 'pending').length,
      approvedSubmissions: submissions.filter(s => s.status === 'approved').length,
      rejectedSubmissions: submissions.filter(s => s.status === 'rejected').length,
      totalPointsDistributed: submissions.filter(s => s.status === 'approved').length * CONFIG.POINTS_PER_ACTION,
      totalEGPDistributed: (submissions.filter(s => s.status === 'approved').length * CONFIG.POINTS_PER_ACTION * CONFIG.POINT_VALUE_EGP).toFixed(2)
    };
  }
};

// ==================== SESSION ====================
const Session = {
  save(user) {
    Storage.set(DB_KEYS.SESSION, {
      username: user.username,
      name: user.name,
      points: user.points,
      isAdmin: user.isAdmin || false,
      loginAt: new Date().toISOString()
    });
  },

  get() {
    return Storage.get(DB_KEYS.SESSION);
  },

  clear() {
    Storage.remove(DB_KEYS.SESSION);
  },

  isAdmin() {
    const s = this.get();
    return s && s.isAdmin === true;
  }
};

// ==================== INIT DEMO DATA ====================
function initDemoData() {
  // Only if no data exists
  if (UserDB.getAll().length === 0) {
    // Create demo admin
    UserDB.create({
      name: 'المدير',
      username: 'admin',
      password: 'admin123',
      phone: '01000000000',
      fbUrl: 'https://facebook.com/admin',
      isAdmin: true
    });
    UserDB.update('admin', { isAdmin: true, points: 999 });

    // Create demo users
    const demoUsers = [
      { name: 'أحمد محمد', username: 'ahmed123', password: '123456', phone: '01111111111', fbUrl: 'https://facebook.com/ahmed' },
      { name: 'محمد علي', username: 'mohamed', password: '123456', phone: '01222222222', fbUrl: 'https://facebook.com/mohamed' },
      { name: 'سارة أحمد', username: 'sara', password: '123456', phone: '01333333333', fbUrl: 'https://facebook.com/sara' },
      { name: 'فاطمة حسن', username: 'fatma', password: '123456', phone: '01444444444', fbUrl: 'https://facebook.com/fatma' },
      { name: 'خالد محمود', username: 'khaled', password: '123456', phone: '01555555555', fbUrl: 'https://facebook.com/khaled' }
    ];

    demoUsers.forEach((u, i) => {
      UserDB.create(u);
      UserDB.update(u.username, { points: (i + 1) * 50 });
    });
  }

  if (TaskDB.getAll().length === 0) {
    // Create demo tasks
    const demoTasks = [
      { type: 'like', title: 'تفاعل مع بوستنا الجديد', description: 'اعمل لايك على البوست وارسل إثبات', pageUrl: 'https://facebook.com/demo/post1' },
      { type: 'comment', title: 'علّق على صورتنا', description: 'اكتب كومنت إيجابي على الصورة', pageUrl: 'https://facebook.com/demo/post2' },
      { type: 'share', title: 'شارك المنشور', description: 'اعمل شير عام للمنشور', pageUrl: 'https://facebook.com/demo/post3' },
      { type: 'follow', title: 'تابع صفحتنا', description: 'اعمل متابعة للصفحة الرسمية', pageUrl: 'https://facebook.com/demo/page' }
    ];

    demoTasks.forEach(t => TaskDB.create(t));
  }
}

// Export for modules
window.NP = {
  CONFIG,
  DB_KEYS,
  Storage,
  UserDB,
  TaskDB,
  SubmissionDB,
  AnalyticsDB,
  Session,
  generateId,
  getToday,
  hashPassword,
  initDemoData
};
