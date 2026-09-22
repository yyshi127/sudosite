const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const Database = require("better-sqlite3");
const express = require("express");

const bootstrapAdminPassword = process.env.ADMIN_PASSWORD;

if (!bootstrapAdminPassword) {
  console.error("ADMIN_PASSWORD is required before starting the server.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", "loopback");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const rootDir = __dirname;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, "data");
const dbPath = path.join(dataDir, "demo-requests.sqlite");
const feedbackUploadDir = path.join(dataDir, "feedback-uploads");
const sessions = new Map();
const sessionTtlMs = 30 * 60 * 1000;
const sessionCookieMaxAgeSeconds = Math.floor(sessionTtlMs / 1000);

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(feedbackUploadDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.prepare(`
  CREATE TABLE IF NOT EXISTS demo_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    company TEXT NOT NULL,
    industry TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`).run();
db.prepare(`
  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`).run();
db.prepare(`
  CREATE TABLE IF NOT EXISTS feedback_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_no TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('issue', 'suggestion')),
    description TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_evaluation',
    screenshot_file TEXT DEFAULT NULL,
    screenshot_name TEXT DEFAULT NULL,
    screenshot_mime TEXT DEFAULT NULL,
    screenshot_size INTEGER DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`).run();

const demoColumns = db.prepare("PRAGMA table_info(demo_requests)").all().map(column => column.name);
if (!demoColumns.includes("deleted_at")) {
  db.prepare("ALTER TABLE demo_requests ADD COLUMN deleted_at TEXT DEFAULT NULL").run();
}

if (!demoColumns.includes("industry")) {
  db.prepare("ALTER TABLE demo_requests ADD COLUMN industry TEXT NOT NULL DEFAULT ''").run();
}

if (!demoColumns.includes("verified_at")) {
  db.prepare("ALTER TABLE demo_requests ADD COLUMN verified_at TEXT DEFAULT NULL").run();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

function verifyPassword(password, storedValue) {
  const parts = String(storedValue || "").split("$");

  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = Buffer.from(parts[3], "hex");
  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, "sha256");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function getSetting(key) {
  const row = db.prepare("SELECT value FROM admin_settings WHERE key = ?").get(key);
  return row ? row.value : "";
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO admin_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

if (!getSetting("admin_password_hash")) {
  setSetting("admin_password_hash", hashPassword(bootstrapAdminPassword));
}

function createRateLimiter({ windowMs, maxRequests, errorMessage }) {
  const clients = new Map();
  const cleanupTimer = setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of clients.entries()) {
      if (now >= entry.resetAt) {
        clients.delete(key);
      }
    }
  }, windowMs);

  cleanupTimer.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const entry = clients.get(key);

    if (!entry || now >= entry.resetAt) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ ok: false, error: errorMessage });
      return;
    }

    entry.count += 1;
    next();
  };
}

const adminLoginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  errorMessage: "\u767b\u5f55\u5c1d\u8bd5\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5",
});
const demoRequestRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
  errorMessage: "\u9884\u7ea6\u63d0\u4ea4\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5",
});
const feedbackRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 6,
  errorMessage: "提交过于频繁，请稍后再试",
});

app.use("/api/admin/login", adminLoginRateLimiter);
app.use("/api/demo-requests", demoRequestRateLimiter);
app.use("/api/feedback", feedbackRateLimiter, express.json({ limit: "8mb" }));
app.use(express.json({ limit: "32kb" }));
app.use((error, req, res, next) => {
  if (error && error.type === "entity.parse.failed") {
    res.status(400).json({ ok: false, error: "\u8bf7\u6c42\u683c\u5f0f\u4e0d\u6b63\u786e" });
    return;
  }

  if (error && error.type === "entity.too.large") {
    res.status(413).json({ ok: false, error: "\u8bf7\u6c42\u5185\u5bb9\u8fc7\u5927" });
    return;
  }

  next(error);
});

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return cookies;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function setAdminSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `sudo_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionCookieMaxAgeSeconds}`
  );
}

function clearAdminSessionCookie(res) {
  res.setHeader("Set-Cookie", "sudo_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function createAdminSession(res) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + sessionTtlMs);
  setAdminSessionCookie(res, token);
}

function requireAdmin(req, res, next) {
  const token = parseCookies(req.headers.cookie).sudo_admin_session;
  const expiresAt = token ? sessions.get(token) : 0;

  if (!token || !expiresAt) {
    res.status(401).json({ ok: false, error: "请先登录后台" });
    return;
  }

  if (Date.now() > expiresAt) {
    sessions.delete(token);
    clearAdminSessionCookie(res);
    res.status(401).json({ ok: false, error: "登录已过期，请重新登录" });
    return;
  }

  sessions.set(token, Date.now() + sessionTtlMs);
  setAdminSessionCookie(res, token);
  next();
}

const sessionCleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [token, expiresAt] of sessions.entries()) {
    if (now > expiresAt) {
      sessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

sessionCleanupTimer.unref();

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
}

const feedbackStatuses = {
  issue: ["pending_evaluation", "evaluated_pending", "adopted", "resolved"],
  suggestion: ["pending_evaluation", "evaluated_pending", "adopted", "launched"],
};
const screenshotExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function validateScreenshot(value) {
  if (value == null || value === "") return { data: null };

  if (!value || typeof value !== "object") {
    return { error: "截图格式不正确，请重新选择" };
  }

  const originalName = path.basename(normalizeText(value.name)).slice(0, 180);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value.dataUrl || ""));

  if (!match || !screenshotExtensions[match[1]]) {
    return { error: "截图仅支持 JPG、PNG 或 WebP 格式" };
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    return { error: "截图大小不能超过 5MB" };
  }

  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const signatureMatches = (match[1] === "image/jpeg" && isJpeg)
    || (match[1] === "image/png" && isPng)
    || (match[1] === "image/webp" && isWebp);

  if (!signatureMatches) {
    return { error: "截图内容与文件格式不一致，请重新选择" };
  }

  return {
    data: {
      buffer,
      mime: match[1],
      extension: screenshotExtensions[match[1]],
      originalName: originalName || `screenshot.${screenshotExtensions[match[1]]}`,
    },
  };
}

function validateFeedback(body) {
  const type = normalizeText(body.type);
  const description = normalizeText(body.description);
  const name = normalizeText(body.name);

  if (!feedbackStatuses[type]) {
    return { error: "请选择问题或建议" };
  }

  if (description.length < 10) {
    return { error: "请再详细描述一些，至少填写 10 个字" };
  }

  if (description.length > 3000) {
    return { error: "描述不能超过 3000 个字" };
  }

  if (!name || name.length > 40) {
    return { error: "请填写姓名，最多 40 个字" };
  }

  const screenshot = validateScreenshot(body.screenshot);
  if (screenshot.error) return screenshot;

  return { data: { type, description, name, screenshot: screenshot.data } };
}

function createFeedbackTicket() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let ticket;

  do {
    ticket = `XJ-${day}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  } while (db.prepare("SELECT 1 FROM feedback_items WHERE ticket_no = ?").get(ticket));

  return ticket;
}

function validateDemoRequest(body) {
  const name = normalizeText(body.name);
  const phone = normalizeText(body.phone);
  const company = normalizeText(body.company);
  const industry = normalizeText(body.industry);
  const message = normalizeText(body.message);

  if (!name || !phone || !company || !industry) {
    return { error: "请填写姓名、手机号、公司名称和所属行业" };
  }

  if (!/^[+\d][\d\s-]{5,19}$/.test(phone)) {
    return { error: "请填写有效的手机号" };
  }

  return { data: { name, phone, company, industry, message } };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function softDeleteByIds(ids) {
  if (!ids.length) {
    return 0;
  }

  const placeholders = ids.map(() => "?").join(",");
  const result = db.prepare(`
    UPDATE demo_requests
    SET deleted_at = datetime('now', 'localtime')
    WHERE deleted_at IS NULL
      AND id IN (${placeholders})
  `).run(ids);

  return result.changes;
}

app.post("/api/demo-requests", (req, res) => {
  const result = validateDemoRequest(req.body || {});

  if (result.error) {
    res.status(400).json({ ok: false, error: result.error });
    return;
  }

  const info = db.prepare(`
    INSERT INTO demo_requests (name, phone, company, industry, message)
    VALUES (@name, @phone, @company, @industry, @message)
  `).run(result.data);

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post("/api/feedback", (req, res) => {
  const result = validateFeedback(req.body || {});

  if (result.error) {
    res.status(400).json({ ok: false, error: result.error });
    return;
  }

  const ticketNo = createFeedbackTicket();
  const screenshot = result.data.screenshot;
  const screenshotFile = screenshot ? `${crypto.randomUUID()}.${screenshot.extension}` : null;

  try {
    if (screenshot) {
      fs.writeFileSync(path.join(feedbackUploadDir, screenshotFile), screenshot.buffer, { flag: "wx" });
    }

    db.prepare(`
      INSERT INTO feedback_items (
        ticket_no, type, description, name,
        screenshot_file, screenshot_name, screenshot_mime, screenshot_size
      ) VALUES (
        @ticketNo, @type, @description, @name,
        @screenshotFile, @screenshotName, @screenshotMime, @screenshotSize
      )
    `).run({
      ticketNo,
      type: result.data.type,
      description: result.data.description,
      name: result.data.name,
      screenshotFile,
      screenshotName: screenshot ? screenshot.originalName : null,
      screenshotMime: screenshot ? screenshot.mime : null,
      screenshotSize: screenshot ? screenshot.buffer.length : null,
    });
  } catch (error) {
    if (screenshotFile) {
      fs.rmSync(path.join(feedbackUploadDir, screenshotFile), { force: true });
    }
    throw error;
  }

  res.status(201).json({
    ok: true,
    ticket_no: ticketNo,
    message: result.data.type === "issue" ? "问题已收到，我们会尽快评估" : "建议已收到，感谢你帮助小兢变得更好",
  });
});

app.post("/api/admin/login", (req, res) => {
  const password = normalizeText(req.body && req.body.password);
  const passwordHash = getSetting("admin_password_hash");

  if (!password || !verifyPassword(password, passwordHash)) {
    res.status(401).json({ ok: false, error: "后台密码不正确" });
    return;
  }

  createAdminSession(res);
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = parseCookies(req.headers.cookie).sudo_admin_session;

  if (token) {
    sessions.delete(token);
  }

  clearAdminSessionCookie(res);
  res.json({ ok: true });
});

app.get("/admin/logout", (req, res) => {
  const token = parseCookies(req.headers.cookie).sudo_admin_session;

  if (token) {
    sessions.delete(token);
  }

  clearAdminSessionCookie(res);
  res.redirect("/admin?logged_out=1");
});

app.post("/api/admin/change-password", requireAdmin, (req, res) => {
  const currentPassword = normalizeText(req.body && req.body.currentPassword);
  const newPassword = normalizeText(req.body && req.body.newPassword);
  const passwordHash = getSetting("admin_password_hash");

  if (!verifyPassword(currentPassword, passwordHash)) {
    res.status(400).json({ ok: false, error: "当前密码不正确" });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ ok: false, error: "新密码至少需要 8 位" });
    return;
  }

  if (newPassword === currentPassword) {
    res.status(400).json({ ok: false, error: "新密码不能与当前密码相同" });
    return;
  }

  setSetting("admin_password_hash", hashPassword(newPassword));
  sessions.clear();
  clearAdminSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/admin/demo-requests", requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const rows = db.prepare(`
    SELECT id, name, phone, company, industry, message, verified_at, created_at
    FROM demo_requests
    WHERE deleted_at IS NULL
    ORDER BY datetime(created_at) DESC, id DESC
  `).all();

  res.json({ ok: true, rows });
});

app.get("/api/admin/feedback", requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const rows = db.prepare(`
    SELECT id, ticket_no, type, description, name, status,
           screenshot_file IS NOT NULL AS has_screenshot,
           screenshot_name, screenshot_size, created_at, updated_at
    FROM feedback_items
    ORDER BY datetime(created_at) DESC, id DESC
  `).all();

  res.json({ ok: true, rows });
});

app.patch("/api/admin/feedback/:id/status", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = normalizeText(req.body && req.body.status);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, error: "反馈 ID 无效" });
    return;
  }

  const row = db.prepare("SELECT type FROM feedback_items WHERE id = ?").get(id);
  if (!row) {
    res.status(404).json({ ok: false, error: "反馈记录不存在" });
    return;
  }

  if (!feedbackStatuses[row.type].includes(status)) {
    res.status(400).json({ ok: false, error: "该状态不适用于当前反馈类型" });
    return;
  }

  db.prepare(`
    UPDATE feedback_items
    SET status = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(status, id);

  const updated = db.prepare("SELECT status, updated_at FROM feedback_items WHERE id = ?").get(id);
  res.json({ ok: true, id, status: updated.status, updated_at: updated.updated_at });
});

app.get("/api/admin/feedback/:id/screenshot", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, error: "反馈 ID 无效" });
    return;
  }

  const row = db.prepare(`
    SELECT screenshot_file, screenshot_name, screenshot_mime
    FROM feedback_items
    WHERE id = ?
  `).get(id);

  if (!row || !row.screenshot_file) {
    res.status(404).json({ ok: false, error: "截图不存在" });
    return;
  }

  const filePath = path.join(feedbackUploadDir, row.screenshot_file);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ ok: false, error: "截图文件不存在" });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", row.screenshot_mime);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.screenshot_name || row.screenshot_file)}`);
  res.sendFile(filePath);
});

app.patch("/api/admin/demo-requests/:id/verification", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const verified = req.body && req.body.verified;

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, error: "记录 ID 无效" });
    return;
  }

  if (typeof verified !== "boolean") {
    res.status(400).json({ ok: false, error: "核实状态无效" });
    return;
  }

  const verifiedAt = verified ? db.prepare("SELECT datetime('now', 'localtime') AS value").get().value : null;
  const result = db.prepare(`
    UPDATE demo_requests
    SET verified_at = @verifiedAt
    WHERE deleted_at IS NULL
      AND id = @id
  `).run({ id, verifiedAt });

  if (!result.changes) {
    res.status(404).json({ ok: false, error: "记录不存在或已删除" });
    return;
  }

  res.json({ ok: true, id, verified_at: verifiedAt });
});

app.post("/api/admin/demo-requests/bulk-delete", requireAdmin, (req, res) => {
  const ids = normalizeIds(req.body && req.body.ids);

  if (!ids.length) {
    res.status(400).json({ ok: false, error: "请选择要删除的预约记录" });
    return;
  }

  const deleted = softDeleteByIds(ids);

  if (!deleted) {
    res.status(404).json({ ok: false, error: "记录不存在或已删除" });
    return;
  }

  res.json({ ok: true, deleted });
});

app.delete("/api/admin/demo-requests/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, error: "记录 ID 无效" });
    return;
  }

  const deleted = softDeleteByIds([id]);

  if (!deleted) {
    res.status(404).json({ ok: false, error: "记录不存在或已删除" });
    return;
  }

  res.json({ ok: true });
});

app.get("/api/admin/demo-requests.csv", requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const rows = db.prepare(`
    SELECT id, name, phone, company, industry, message, verified_at, created_at
    FROM demo_requests
    WHERE deleted_at IS NULL
    ORDER BY datetime(created_at) DESC, id DESC
  `).all();
  const header = ["ID", "提交时间", "姓名", "手机号", "公司名称", "所属行业", "需求备注", "核实状态", "核实时间"];
  const body = rows.map(row => [
    row.id,
    row.created_at,
    row.name,
    row.phone,
    row.company,
    row.industry,
    row.message,
    row.verified_at ? "已核实" : "未核实",
    row.verified_at || "",
  ].map(csvEscape).join(","));

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"demo-requests.csv\"");
  res.send(`\uFEFF${header.map(csvEscape).join(",")}\n${body.join("\n")}`);
});

app.get("/admin", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(rootDir, "admin.html"));
});

app.get("/feedback", (req, res) => {
  res.sendFile(path.join(rootDir, "feedback.html"));
});

app.get("/feedback-admin", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(rootDir, "admin.html"));
});

app.use((req, res, next) => {
  const blockedPaths = [
    "/data",
    "/node_modules",
    "/server.js",
    "/package.json",
    "/package-lock.json",
  ];

  if (blockedPaths.some(blockedPath => req.path === blockedPath || req.path.startsWith(`${blockedPath}/`))) {
    res.status(404).send("Not found");
    return;
  }

  next();
});

app.use(express.static(rootDir, {
  extensions: ["html"],
  index: "index.html",
  setHeaders(res, filePath) {
    if (filePath.endsWith("admin.html") || filePath.endsWith("admin.js") || filePath.endsWith("feedback-admin.html") || filePath.endsWith("feedback-admin.js")) {
      res.setHeader("Cache-Control", "no-store");
    }
  },
}));

app.use((error, req, res, next) => {
  console.error("Unhandled request error:", error);

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(500).json({ ok: false, error: "\u670d\u52a1\u5668\u6682\u65f6\u4e0d\u53ef\u7528" });
});

app.listen(port, host, () => {
  console.log(`SUDO website server running at http://${host}:${port}`);
});
