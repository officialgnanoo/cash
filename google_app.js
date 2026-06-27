// ════════════════════════════════════════════════════════
//  منصة النقاط — Google Apps Script Backend v4
//  انسخ الكود ده كله في script.google.com
// ════════════════════════════════════════════════════════

// ⚙️ ضع ID الـ Google Sheet هنا (من رابط الشيت)
// مثال: https://docs.google.com/spreadsheets/d/  [هنا الـ ID]  /edit
const SHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms";

// أسماء الشيتات
const SHEET_USERS       = "Users";
const SHEET_SUBMISSIONS = "Submissions";
const SHEET_TASKS       = "Tasks";
const SHEET_BAN         = "BanList";

const POINTS_PER_ACTION = 5;
const CASH_THRESHOLD    = 50;

// ════════════════════════════════════════════════════════
//  doGet
// ════════════════════════════════════════════════════════
function doGet(e) {
  const p        = e.parameter;
  const callback = p.callback;
  const action   = p.action;

  let result;
  try {
    if      (action === "register") result = handleRegister(p);
    else if (action === "login")    result = handleLogin(p);
    else if (action === "submit")   result = handleSubmit(p);
    else if (action === "getTasks") result = handleGetTasks(p);
    else if (action === "points")   result = handleGetPoints(p);
    else result = { success: false, error: "Unknown action: " + action };
  } catch(err) {
    result = { success: false, error: err.message };
  }

  const json   = JSON.stringify(result);
  const output = callback ? callback + "(" + json + ");" : json;
  return ContentService
    .createTextOutput(output)
    .setMimeType(callback
      ? ContentService.MimeType.JAVASCRIPT
      : ContentService.MimeType.JSON);
}

function doPost(e) { return doGet(e); }

// ════════════════════════════════════════════════════════
//  handleLogin — تسجيل الدخول بـ username + password
// ════════════════════════════════════════════════════════
function handleLogin(p) {
  const username = (p.username || "").trim().toLowerCase();
  const password = (p.password || "").trim();
  if (!username || !password) return { success: false, error: "Missing fields" };

  const ss = SpreadsheetApp.openById(SHEET_ID);

  // تحقق من الحظر
  if (isBanned(ss, username)) return { success: false, error: "محظور — تواصل مع الإدارة" };

  const sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) return { success: false, error: "User not found" };

  const rows = sheet.getDataRange().getValues();
  // هيدرز: UserID | Username | Password | Name | Phone | FacebookURL | TotalPoints | RegisterDate | Status
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim().toLowerCase() === username) {
      if (String(rows[i][2]).trim() !== password)
        return { success: false, error: "Wrong password" };
      if (String(rows[i][8]).trim() === "Banned")
        return { success: false, error: "محظور — تواصل مع الإدارة" };
      return {
        success: true,
        name:    rows[i][3],
        phone:   rows[i][4],
        points:  rows[i][6] || 0
      };
    }
  }
  return { success: false, error: "User not found" };
}

// ════════════════════════════════════════════════════════
//  handleRegister — تسجيل جديد بـ username + password
// ════════════════════════════════════════════════════════
function handleRegister(p) {
  const name     = (p.name     || "").trim();
  const username = (p.username || "").trim().toLowerCase();
  const password = (p.password || "").trim();
  const phone    = (p.phone    || "").trim();
  const fb       = (p.fb       || "").trim();

  if (!name || !username || !password || !phone || !fb)
    return { success: false, error: "Missing fields" };

  const ss    = SpreadsheetApp.openById(SHEET_ID);

  // تحقق من الحظر
  if (isBanned(ss, username) || isBanned(ss, phone))
    return { success: false, error: "محظور — تواصل مع الإدارة" };

  // هيدرز: UserID | Username | Password | Name | Phone | FacebookURL | TotalPoints | RegisterDate | Status
  const sheet = ensureSheet(ss, SHEET_USERS,
    ["UserID","Username","Password","Name","Phone","FacebookURL","TotalPoints","RegisterDate","Status"]);

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim().toLowerCase() === username)
      return { success: false, alreadyExists: true, field: "username", error: "Username already taken" };
    if (String(rows[i][4]).trim() === phone)
      return { success: false, alreadyExists: true, field: "phone", error: "Phone already registered" };
  }

  const id = "U" + Date.now();
  sheet.appendRow([id, username, password, name, phone, fb, 0, new Date().toLocaleString("ar-EG"), "Active"]);
  return { success: true, message: "Registered", userId: id };
}

// ════════════════════════════════════════════════════════
//  handleGetTasks — جلب المهام من الشيت + المهام المنجزة
// ════════════════════════════════════════════════════════
function handleGetTasks(p) {
  const username = (p.username || "").trim().toLowerCase();
  if (!username) return { success: false, error: "No username" };

  const ss = SpreadsheetApp.openById(SHEET_ID);

  if (isBanned(ss, username)) return { success: false, error: "محظور" };

  // جلب النقاط الحالية
  let points = 0;
  let phone  = "";
  const users = ss.getSheetByName(SHEET_USERS);
  if (users) {
    const uRows = users.getDataRange().getValues();
    for (let i = 1; i < uRows.length; i++) {
      if (String(uRows[i][1]).trim().toLowerCase() === username) {
        points = uRows[i][6] || 0;
        phone  = uRows[i][4];
        break;
      }
    }
  }

  // جلب المهام النشطة
  // هيدرز Tasks: TaskID | Title | Description | PageURL | Type | Status | CreatedDate
  const tasksSheet = ensureSheet(ss, SHEET_TASKS,
    ["TaskID","Title","Description","PageURL","Type","Status","CreatedDate"]);
  const tRows = tasksSheet.getDataRange().getValues();

  const tasks = [];
  for (let i = 1; i < tRows.length; i++) {
    if (String(tRows[i][5]).trim().toLowerCase() !== "active") continue;
    tasks.push({
      taskId:      String(tRows[i][0]).trim(),
      title:       tRows[i][1],
      description: tRows[i][2] || "",
      pageUrl:     tRows[i][3],
      type:        String(tRows[i][4]).trim().toLowerCase()
    });
  }

  // جلب المهام اللي سلّمها المستخدم
  // هيدرز Submissions: SubID | Username | TaskID | ProofURL | Points | TaskType | Status | Date | ReviewNote
  const subs = ss.getSheetByName(SHEET_SUBMISSIONS);
  const completed = {};
  if (subs) {
    const sRows = subs.getDataRange().getValues();
    for (let i = 1; i < sRows.length; i++) {
      if (String(sRows[i][1]).trim().toLowerCase() === username) {
        const taskId = String(sRows[i][2]).trim();
        const status = String(sRows[i][6]).trim();
        if (status === "Pending" || status === "Approved") completed[taskId] = true;
      }
    }
  }

  return { success: true, tasks, completed, points, phone };
}

// ════════════════════════════════════════════════════════
//  handleSubmit — تسليم مهمة
// ════════════════════════════════════════════════════════
function handleSubmit(p) {
  const username = (p.username || "").trim().toLowerCase();
  const phone    = (p.phone    || "").trim();
  const type     = (p.type     || "").trim();
  const taskId   = (p.taskId   || "").trim();
  const proof    = (p.proof    || "").trim();
  const date     = p.date      || new Date().toLocaleString("ar-EG");

  if (!username || !type || !proof || !taskId)
    return { success: false, error: "Missing fields" };

  const ss = SpreadsheetApp.openById(SHEET_ID);

  if (isBanned(ss, username)) return { success: false, error: "محظور — تواصل مع الإدارة" };

  // هيدرز Submissions: SubID | Username | TaskID | ProofURL | Points | TaskType | Status | Date | ReviewNote
  const subs = ensureSheet(ss, SHEET_SUBMISSIONS,
    ["SubID","Username","TaskID","ProofURL","Points","TaskType","Status","Date","ReviewNote"]);

  // تحقق إنه مسجل
  const users = ss.getSheetByName(SHEET_USERS);
  const uRows = users.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < uRows.length; i++) {
    if (String(uRows[i][1]).trim().toLowerCase() === username) {
      if (String(uRows[i][8]).trim() === "Banned")
        return { success: false, error: "محظور" };
      found = true; break;
    }
  }
  if (!found) return { success: false, error: "User not found" };

  // تحقق ما سلّمش المهمة دي قبل كده
  const sRows = subs.getDataRange().getValues();
  for (let i = 1; i < sRows.length; i++) {
    if (String(sRows[i][1]).trim().toLowerCase() === username &&
        String(sRows[i][2]).trim() === taskId) {
      const st = String(sRows[i][6]).trim();
      if (st === "Pending" || st === "Approved")
        return { success: false, error: "سبق وسلّمت المهمة دي" };
    }
  }

  subs.appendRow(["S" + Date.now(), username, taskId, proof, POINTS_PER_ACTION, type, "Pending", date, ""]);
  return { success: true, message: "Submitted", points: POINTS_PER_ACTION };
}

// ════════════════════════════════════════════════════════
//  handleGetPoints
// ════════════════════════════════════════════════════════
function handleGetPoints(p) {
  const username = (p.username || p.phone || "").trim();
  if (!username) return { success: false, error: "No identifier" };

  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) return { success: false, error: "No users sheet" };

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim().toLowerCase() === username.toLowerCase() ||
        String(rows[i][4]).trim() === username) {
      return { success: true, name: rows[i][3], points: rows[i][6] };
    }
  }
  return { success: false, error: "User not found" };
}

// ════════════════════════════════════════════════════════
//  approveSubmission — موافقة يدوية
//  مثال: approveSubmission("S1234567890")
// ════════════════════════════════════════════════════════
function approveSubmission(subId) {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const subs = ss.getSheetByName(SHEET_SUBMISSIONS);
  if (!subs) return "No submissions sheet";
  const data = subs.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === subId && data[i][6] === "Pending") {
      subs.getRange(i + 1, 7).setValue("Approved");

      const username = String(data[i][1]).trim().toLowerCase();
      const pts      = Number(data[i][4]);
      const users    = ss.getSheetByName(SHEET_USERS);
      const uData    = users.getDataRange().getValues();

      for (let j = 1; j < uData.length; j++) {
        if (String(uData[j][1]).trim().toLowerCase() === username) {
          const newPts = (Number(uData[j][6]) || 0) + pts;
          users.getRange(j + 1, 7).setValue(newPts);
          if (newPts >= CASH_THRESHOLD) notifyCashReady(uData[j][3], uData[j][4], newPts);
          break;
        }
      }
      return "✅ Approved: " + subId;
    }
  }
  return "❌ Not found or already processed";
}

// ════════════════════════════════════════════════════════
//  rejectSubmission — رفض مهمة مع ملاحظة
//  مثال: rejectSubmission("S1234567890", "شال الايك")
// ════════════════════════════════════════════════════════
function rejectSubmission(subId, note) {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const subs = ss.getSheetByName(SHEET_SUBMISSIONS);
  if (!subs) return "No submissions sheet";
  const data = subs.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === subId && data[i][6] === "Pending") {
      subs.getRange(i + 1, 7).setValue("Rejected");
      subs.getRange(i + 1, 9).setValue(note || "مرفوض");
      return "✅ Rejected: " + subId;
    }
  }
  return "❌ Not found";
}

// ════════════════════════════════════════════════════════
//  banUser — حظر مستخدم
//  مثال: banUser("ahmed123", "شال الايك بعد المراجعة")
// ════════════════════════════════════════════════════════
function banUser(username, reason) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  username = username.trim().toLowerCase();

  const banSheet = ensureSheet(ss, SHEET_BAN,
    ["Username","Reason","BanDate","BannedBy"]);
  banSheet.appendRow([username, reason || "تلاعب", new Date().toLocaleString("ar-EG"), Session.getActiveUser().getEmail()]);

  const users = ss.getSheetByName(SHEET_USERS);
  if (users) {
    const rows = users.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).trim().toLowerCase() === username) {
        users.getRange(i + 1, 9).setValue("Banned");
        break;
      }
    }
  }
  return "🚫 Banned: " + username + " — " + (reason || "تلاعب");
}

// ════════════════════════════════════════════════════════
//  unbanUser — رفع الحظر
//  مثال: unbanUser("ahmed123")
// ════════════════════════════════════════════════════════
function unbanUser(username) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  username = username.trim().toLowerCase();

  const banSheet = ss.getSheetByName(SHEET_BAN);
  if (banSheet) {
    const rows = banSheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim().toLowerCase() === username) banSheet.deleteRow(i + 1);
    }
  }

  const users = ss.getSheetByName(SHEET_USERS);
  if (users) {
    const rows = users.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).trim().toLowerCase() === username) {
        users.getRange(i + 1, 9).setValue("Active");
        break;
      }
    }
  }
  return "✅ Unbanned: " + username;
}

// ════════════════════════════════════════════════════════
//  addTask — إضافة مهمة جديدة
//  مثال: addTask("متابعة صفحة X", "اتابع الصفحة", "https://fb.com/page", "follow")
// ════════════════════════════════════════════════════════
function addTask(title, description, pageUrl, type) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ensureSheet(ss, SHEET_TASKS,
    ["TaskID","Title","Description","PageURL","Type","Status","CreatedDate"]);

  const id = "T" + Date.now();
  sheet.appendRow([id, title, description || "", pageUrl, type || "like", "Active", new Date().toLocaleString("ar-EG")]);
  return "✅ Task added: " + id;
}

// ════════════════════════════════════════════════════════
//  disableTask — إيقاف مهمة
//  مثال: disableTask("T1234567890")
// ════════════════════════════════════════════════════════
function disableTask(taskId) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_TASKS);
  if (!sheet) return "No tasks sheet";
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === taskId) {
      sheet.getRange(i + 1, 6).setValue("Inactive");
      return "✅ Disabled: " + taskId;
    }
  }
  return "❌ Task not found";
}

// ════════════════════════════════════════════════════════
//  getPendingReview — التسليمات المعلقة
// ════════════════════════════════════════════════════════
function getPendingReview() {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const subs = ss.getSheetByName(SHEET_SUBMISSIONS);
  if (!subs) return "No submissions";

  const data = subs.getDataRange().getValues();
  const pending = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][6] === "Pending") {
      pending.push({ subId: data[i][0], username: data[i][1], taskId: data[i][2], proof: data[i][3], type: data[i][5], date: data[i][7] });
    }
  }
  return pending.length ? pending : "لا توجد تسليمات معلقة";
}

// ════════════════════════════════════════════════════════
//  isBanned
// ════════════════════════════════════════════════════════
function isBanned(ss, identifier) {
  const banSheet = ss.getSheetByName(SHEET_BAN);
  if (!banSheet) return false;
  const rows = banSheet.getDataRange().getValues();
  const id   = identifier.trim().toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === id) return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════
//  notifyCashReady — إيميل لما حد يوصل للكاش
// ════════════════════════════════════════════════════════
function notifyCashReady(name, phone, points) {
  MailApp.sendEmail({
    to:      Session.getActiveUser().getEmail(),
    subject: "💰 عميل وصل للكاش! — منصة النقاط",
    body:    "المستخدم: " + name + "\nرقم الهاتف: " + phone + "\nالنقاط: " + points + "\n\nتواصل معه لصرف المكافأة."
  });
}

// ════════════════════════════════════════════════════════
//  ensureSheet
// ════════════════════════════════════════════════════════
function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#1877F2")
      .setFontColor("#ffffff");
  }
  return sheet;
}

// ════════════════════════════════════════════════════════
//  setupSheets — شغّلها مرة واحدة بعد النشر
// ════════════════════════════════════════════════════════
function setupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheet(ss, SHEET_USERS,       ["UserID","Username","Password","Name","Phone","FacebookURL","TotalPoints","RegisterDate","Status"]);
  ensureSheet(ss, SHEET_SUBMISSIONS, ["SubID","Username","TaskID","ProofURL","Points","TaskType","Status","Date","ReviewNote"]);
  ensureSheet(ss, SHEET_TASKS,       ["TaskID","Title","Description","PageURL","Type","Status","CreatedDate"]);
  ensureSheet(ss, SHEET_BAN,         ["Username","Reason","BanDate","BannedBy"]);
  return "✅ تم إنشاء / تحديث كل الشيتات بنجاح";
}
