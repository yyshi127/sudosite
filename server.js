const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const Database = require("better-sqlite3");
const express = require("express");
const sharp = require("sharp");

const bootstrapAdminPassword = process.env.ADMIN_PASSWORD;

if (!bootstrapAdminPassword) {
  console.error("ADMIN_PASSWORD is required before starting the server.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const rootDir = __dirname;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, "data");
const dbPath = path.join(dataDir, "demo-requests.sqlite");
const feedbackUploadDir = path.join(dataDir, "feedback-uploads");
const sessions = new Map();
const sessionTtlMs = 30 * 60 * 1000;
const sessionCookieMaxAgeSeconds = Math.floor(sessionTtlMs / 1000);
const downloadProducts = {
  "xiaojing-accounting": {
    name: "小兢会计桌面版",
    version: "0.3.2",
    fileUrl: "/downloads/xiaojing-accounting-0.3.2-20261004-windows-x64-setup.exe",
  },
};
const downloadDedupeWindowMs = 10 * 60 * 1000;

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
db.prepare(`
  CREATE TABLE IF NOT EXISTS download_stats (
    product TEXT NOT NULL,
    version TEXT NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    first_download_at TEXT DEFAULT NULL,
    last_download_at TEXT DEFAULT NULL,
    PRIMARY KEY (product, version)
  )
`).run();
db.prepare(`
  CREATE TABLE IF NOT EXISTS download_daily_stats (
    product TEXT NOT NULL,
    version TEXT NOT NULL,
    download_date TEXT NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product, version, download_date)
  )
`).run();
db.prepare(`
  CREATE TABLE IF NOT EXISTS download_visitors (
    product TEXT NOT NULL,
    version TEXT NOT NULL,
    visitor_hash TEXT NOT NULL,
    last_counted_at INTEGER NOT NULL,
    PRIMARY KEY (product, version, visitor_hash)
  )
`).run();
db.prepare("CREATE INDEX IF NOT EXISTS download_visitors_time_idx ON download_visitors(last_counted_at)").run();

const feedbackColumns = db.prepare("PRAGMA table_info(feedback_items)").all().map(column => column.name);
if (!feedbackColumns.includes("dedupe_hash")) {
  db.prepare("ALTER TABLE feedback_items ADD COLUMN dedupe_hash TEXT DEFAULT NULL").run();
}
if (!feedbackColumns.includes("dedupe_at")) {
  db.prepare("ALTER TABLE feedback_items ADD COLUMN dedupe_at INTEGER DEFAULT NULL").run();
}
db.prepare("CREATE INDEX IF NOT EXISTS feedback_items_dedupe_idx ON feedback_items(dedupe_hash, dedupe_at)").run();

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
if (!getSetting("download_visitor_secret")) {
  setSetting("download_visitor_secret", crypto.randomBytes(32).toString("hex"));
}
const downloadVisitorSecret = getSetting("download_visitor_secret");

function createRateLimiter({ windowMs, maxRequests, errorMessage, countOnRequest = true }) {
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

  function getEntry(req) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let entry = clients.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(key, entry);
    }
    return entry;
  }

  const limiter = (req, res, next) => {
    const entry = getEntry(req);

    if (entry.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ ok: false, error: errorMessage, retry_after: retryAfterSeconds });
      return;
    }

    if (countOnRequest) entry.count += 1;
    next();
  };

  limiter.record = req => { getEntry(req).count += 1; };
  return limiter;
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
const feedbackAttemptRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 100,
  errorMessage: "提交尝试过于频繁，请稍后再试",
});
const feedbackSubmissionRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 30,
  errorMessage: "提交过于频繁，请稍后再试",
  countOnRequest: false,
});
const downloadRequestRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 60,
  errorMessage: "下载请求过于频繁，请稍后再试",
});

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  next();
});
app.use("/api/admin/login", adminLoginRateLimiter);
app.use("/api/demo-requests", demoRequestRateLimiter);
app.post("/api/feedback", feedbackAttemptRateLimiter, express.json({ limit: "8mb" }));
app.use("/api/download", downloadRequestRateLimiter);
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

function getDownloadVisitorHash(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies.sudo_download_visitor;

  if (!/^[a-f0-9]{32}$/.test(token || "")) {
    token = crypto.randomBytes(16).toString("hex");
    res.append(
      "Set-Cookie",
      `sudo_download_visitor=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req.secure ? "; Secure" : ""}`
    );
  }

  return crypto.createHmac("sha256", downloadVisitorSecret).update(token).digest("hex");
}

function setAdminSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `sudo_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionCookieMaxAgeSeconds}${res.req.secure ? "; Secure" : ""}`
  );
}

function clearAdminSessionCookie(res) {
  res.setHeader("Set-Cookie", `sudo_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${res.req.secure ? "; Secure" : ""}`);
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

function getShanghaiDateKey(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const recordDownload = db.transaction(({ product, version, visitorHash, now }) => {
  const previous = db.prepare(`
    SELECT last_counted_at FROM download_visitors
    WHERE product = ? AND version = ? AND visitor_hash = ?
  `).get(product, version, visitorHash);

  if (previous && now - previous.last_counted_at < downloadDedupeWindowMs) {
    return false;
  }

  const timestamp = new Date(now).toISOString();
  const dateKey = getShanghaiDateKey(now);
  db.prepare(`
    INSERT INTO download_visitors (product, version, visitor_hash, last_counted_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(product, version, visitor_hash)
    DO UPDATE SET last_counted_at = excluded.last_counted_at
  `).run(product, version, visitorHash, now);
  db.prepare(`
    INSERT INTO download_stats (product, version, download_count, first_download_at, last_download_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(product, version) DO UPDATE SET
      download_count = download_count + 1,
      last_download_at = excluded.last_download_at
  `).run(product, version, timestamp, timestamp);
  db.prepare(`
    INSERT INTO download_daily_stats (product, version, download_date, download_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(product, version, download_date)
    DO UPDATE SET download_count = download_count + 1
  `).run(product, version, dateKey);
  db.prepare("DELETE FROM download_visitors WHERE last_counted_at < ?").run(now - 30 * 24 * 60 * 60 * 1000);
  return true;
});

const feedbackStatuses = {
  issue: ["pending_evaluation", "evaluated_pending", "adopted", "resolved"],
  suggestion: ["pending_evaluation", "evaluated_pending", "adopted", "launched"],
};
const screenshotExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function validateScreenshot(value) {
  if (value == null || value === "") return { data: null };

  if (!value || typeof value !== "object") {
    return { error: "截图格式不正确，请重新选择", field: "screenshot" };
  }

  const originalName = path.basename(normalizeText(value.name)).slice(0, 180);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value.dataUrl || ""));

  if (!match || !screenshotExtensions[match[1]]) {
    return { error: "截图仅支持 JPG、PNG 或 WebP 格式", field: "screenshot" };
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    return { error: "截图大小不能超过 5MB", field: "screenshot" };
  }

  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const signatureMatches = (match[1] === "image/jpeg" && isJpeg)
    || (match[1] === "image/png" && isPng)
    || (match[1] === "image/webp" && isWebp);

  if (!signatureMatches) {
    return { error: "截图内容与文件格式不一致，请重新选择", field: "screenshot" };
  }

  let normalizedBuffer;
  try {
    const image = sharp(buffer, { failOn: "warning", limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== match[1].slice(6)) {
      return { error: "截图内容与文件格式不一致，请重新选择", field: "screenshot" };
    }
    normalizedBuffer = await image.toFormat(metadata.format).toBuffer();
  } catch (error) {
    return { error: "截图文件已损坏或分辨率过大，请重新选择", field: "screenshot" };
  }

  if (normalizedBuffer.length > 5 * 1024 * 1024) {
    return { error: "截图处理后大小不能超过 5MB", field: "screenshot" };
  }

  return {
    data: {
      buffer: normalizedBuffer,
      mime: match[1],
      extension: screenshotExtensions[match[1]],
      originalName: originalName || `screenshot.${screenshotExtensions[match[1]]}`,
    },
  };
}

async function validateFeedback(body) {
  const type = normalizeText(body.type);
  const description = normalizeText(body.description);
  const name = normalizeText(body.name);

  if (!feedbackStatuses[type]) {
    return { error: "请选择问题或建议", field: "type" };
  }

  if (description.length < 10) {
    return { error: "请再详细描述一些，至少填写 10 个字", field: "description" };
  }

  if (description.length > 3000) {
    return { error: "描述不能超过 3000 个字", field: "description" };
  }

  if (!name || name.length > 40) {
    return { error: "请填写姓名，最多 40 个字", field: "name" };
  }

  const screenshot = await validateScreenshot(body.screenshot);
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

app.post("/api/feedback", async (req, res) => {
  const result = await validateFeedback(req.body || {});

  if (result.error) {
    res.status(400).json({ ok: false, error: result.error, field: result.field });
    return;
  }

  const screenshot = result.data.screenshot;
  const dedupeHash = crypto.createHash("sha256").update(JSON.stringify([
    req.ip, result.data.type, result.data.description, result.data.name,
    screenshot ? crypto.createHash("sha256").update(screenshot.buffer).digest("hex") : "",
  ])).digest("hex");
  const dedupeAt = Date.now();
  const duplicate = db.prepare(`
    SELECT ticket_no FROM feedback_items
    WHERE dedupe_hash = ? AND dedupe_at >= ?
    ORDER BY dedupe_at DESC LIMIT 1
  `).get(dedupeHash, dedupeAt - 2 * 60 * 1000);
  if (duplicate) {
    res.json({ ok: true, ticket_no: duplicate.ticket_no, duplicate: true, message: "这条反馈已收到，请勿重复提交" });
    return;
  }

  let allowed = false;
  feedbackSubmissionRateLimiter(req, res, () => { allowed = true; });
  if (!allowed) return;

  const ticketNo = createFeedbackTicket();
  const screenshotFile = screenshot ? `${crypto.randomUUID()}.${screenshot.extension}` : null;

  try {
    if (screenshot) {
      fs.writeFileSync(path.join(feedbackUploadDir, screenshotFile), screenshot.buffer, { flag: "wx" });
    }

    db.prepare(`
      INSERT INTO feedback_items (
        ticket_no, type, description, name,
        screenshot_file, screenshot_name, screenshot_mime, screenshot_size, dedupe_hash, dedupe_at
      ) VALUES (
        @ticketNo, @type, @description, @name,
        @screenshotFile, @screenshotName, @screenshotMime, @screenshotSize, @dedupeHash, @dedupeAt
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
      dedupeHash,
      dedupeAt,
    });
  } catch (error) {
    if (screenshotFile) {
      fs.rmSync(path.join(feedbackUploadDir, screenshotFile), { force: true });
    }
    throw error;
  }

  feedbackSubmissionRateLimiter.record(req);
  res.status(201).json({
    ok: true,
    ticket_no: ticketNo,
    message: result.data.type === "issue" ? "问题已收到，我们会尽快评估" : "建议已收到，感谢你帮助小兢变得更好",
  });
});

app.head("/api/download/:product/latest", (req, res) => {
  const product = downloadProducts[req.params.product];
  if (!product) {
    res.status(404).end();
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, product.fileUrl);
});

app.get("/api/download/:product/latest", (req, res) => {
  const productKey = req.params.product;
  const product = downloadProducts[productKey];
  if (!product) {
    res.status(404).json({ ok: false, error: "下载产品不存在" });
    return;
  }

  const visitorHash = getDownloadVisitorHash(req, res);
  recordDownload({ product: productKey, version: product.version, visitorHash, now: Date.now() });
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, product.fileUrl);
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

app.get("/api/admin/download-stats", requireAdmin, (req, res) => {
  const today = getShanghaiDateKey();
  const rows = db.prepare(`
    SELECT
      stats.product,
      stats.version,
      stats.download_count,
      stats.first_download_at,
      stats.last_download_at,
      COALESCE(daily.download_count, 0) AS today_count
    FROM download_stats AS stats
    LEFT JOIN download_daily_stats AS daily
      ON daily.product = stats.product
      AND daily.version = stats.version
      AND daily.download_date = ?
    ORDER BY stats.last_download_at DESC
  `).all(today);

  for (const [productKey, product] of Object.entries(downloadProducts)) {
    if (!rows.some(row => row.product === productKey && row.version === product.version)) {
      rows.unshift({
        product: productKey,
        version: product.version,
        download_count: 0,
        first_download_at: null,
        last_download_at: null,
        today_count: 0,
      });
    }
  }

  const versions = rows.map(row => ({
    ...row,
    product_name: downloadProducts[row.product]?.name || row.product,
    is_current: downloadProducts[row.product]?.version === row.version,
  }));
  const lastDownload = versions.reduce((latest, row) => {
    if (!row.last_download_at) return latest;
    return !latest || row.last_download_at > latest ? row.last_download_at : latest;
  }, null);

  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    summary: {
      total: versions.reduce((sum, row) => sum + row.download_count, 0),
      today: versions.reduce((sum, row) => sum + row.today_count, 0),
      last_download_at: lastDownload,
    },
    versions,
  });
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

function deleteFeedbackByIds(ids) {
  const placeholders = ids.map(() => "?").join(",");
  const records = db.prepare(`
    SELECT screenshot_file FROM feedback_items WHERE id IN (${placeholders})
  `).all(...ids);
  if (records.length !== ids.length) return { deleted: 0, screenshot_cleanup_failed: 0 };

  const deleted = db.prepare(`DELETE FROM feedback_items WHERE id IN (${placeholders})`).run(...ids).changes;
  let screenshotCleanupFailed = 0;
  records.forEach(row => {
    if (!row.screenshot_file) return;
    if (path.basename(row.screenshot_file) !== row.screenshot_file) {
      screenshotCleanupFailed += 1;
      return;
    }
    try {
      fs.rmSync(path.join(feedbackUploadDir, row.screenshot_file), { force: true });
    } catch (error) {
      screenshotCleanupFailed += 1;
      console.error("反馈截图清理失败:", error);
    }
  });

  return { deleted, screenshot_cleanup_failed: screenshotCleanupFailed };
}

app.post("/api/admin/feedback/bulk-delete", requireAdmin, (req, res) => {
  const ids = normalizeIds(req.body && req.body.ids);
  if (!ids.length) {
    res.status(400).json({ ok: false, error: "请选择要删除的反馈记录" });
    return;
  }

  const result = deleteFeedbackByIds(ids);
  if (!result.deleted) {
    res.status(404).json({ ok: false, error: "反馈记录不存在" });
    return;
  }
  res.json({ ok: true, ...result });
});

app.delete("/api/admin/feedback/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, error: "反馈 ID 无效" });
    return;
  }

  const result = deleteFeedbackByIds([id]);
  if (!result.deleted) {
    res.status(404).json({ ok: false, error: "反馈记录不存在" });
    return;
  }
  res.json({ ok: true, ...result });
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
