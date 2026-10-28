const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const Database = require("better-sqlite3");

const root = path.resolve(__dirname, "..");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudo-download-test-"));
const port = 31849;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "download-test-password";
const trackingPath = "/api/download/xiaojing-accounting/latest";
const expectedFile = "/downloads/xiaojing-accounting-0.3.3-windows-x64-preview.exe";
const katcatPath = "/api/download/katcat/latest";
const katcatInstallerRoute = "/api/download/katcat/installer";
const katcatFile = "/downloads/Katcat.AI-V1.0.2-Windows-x64-20261023.exe";
function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, ADMIN_PASSWORD: password, DATA_DIR: testDir, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => { serverOutput += chunk; });
  child.stderr.on("data", chunk => { serverOutput += chunk; });
  return child;
}

let serverOutput = "";
let server = startServer();
const installerFixture = path.join(root, "downloads", path.basename(katcatFile.split("?")[0]));
let ownsInstallerFixture = false;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/download.html`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start:\n${serverOutput}`);
}

(async () => {
  let browser;
  try {
    await waitForServer();

    const unauthorized = await fetch(`${baseUrl}/api/admin/download-stats`);
    assert.equal(unauthorized.status, 401);

    const head = await fetch(`${baseUrl}${trackingPath}`, { method: "HEAD", redirect: "manual" });
    assert.equal(head.status, 302);

    const first = await fetch(`${baseUrl}${trackingPath}`, {
      redirect: "manual",
      headers: { "X-Forwarded-Proto": "https" },
    });
    assert.equal(first.status, 302);
    assert.equal(first.headers.get("location"), expectedFile);
    assert.equal(first.headers.get("cache-control"), "no-store");
    assert.match(first.headers.get("set-cookie"), /sudo_download_visitor=/);
    assert.match(first.headers.get("set-cookie"), /; Secure/);
    const visitorCookie = first.headers.get("set-cookie").split(";")[0];

    const repeat = await fetch(`${baseUrl}${trackingPath}`, {
      redirect: "manual",
      headers: { Cookie: visitorCookie },
    });
    assert.equal(repeat.status, 302);
    assert.equal(repeat.headers.get("location"), expectedFile);

    const secondVisitor = await fetch(`${baseUrl}${trackingPath}`, {
      redirect: "manual",
      headers: { "X-Forwarded-For": "203.0.113.88" },
    });
    assert.equal(secondVisitor.status, 302);

    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const adminCookie = login.headers.get("set-cookie").split(";")[0];
    const stats = await fetch(`${baseUrl}/api/admin/download-stats`, { headers: { Cookie: adminCookie } });
    assert.equal(stats.status, 200);
    const statsBody = await stats.json();
    assert.equal(statsBody.summary.total, 2);
    assert.equal(statsBody.summary.today, 2);
    assert.equal(statsBody.versions.find(row => row.product === "xiaojing-accounting").download_count, 2);
    assert.equal(statsBody.versions.find(row => row.product === "katcat").download_count, 0);
    assert.deepEqual(statsBody.events, []);

    const katcatHead = await fetch(`${baseUrl}${katcatPath}`, { method: "HEAD", redirect: "manual" });
    assert.equal(katcatHead.status, 302);
    assert.equal(katcatHead.headers.get("location"), katcatInstallerRoute);
    assert.equal((await fetch(`${baseUrl}/api/download/toString/latest`, { redirect: "manual" })).status, 404);
    for (let i = 0; i < 2; i += 1) {
      const response = await fetch(`${baseUrl}${katcatPath}`, {
        redirect: "manual",
        headers: { Cookie: visitorCookie, "X-Forwarded-For": "::ffff:203.0.113.7", "CF-Connecting-IP": "198.51.100.123" },
      });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), katcatInstallerRoute);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    await fetch(`${baseUrl}${katcatPath}`, {
      redirect: "manual", headers: { "X-Forwarded-For": "2001:db8::7" },
    });
    const getStats = async query => {
      const response = await fetch(`${baseUrl}/api/admin/download-stats${query}`, { headers: { Cookie: adminCookie } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return response.json();
    };
    const katcatStats = await getStats("?product=katcat");
    assert.equal(katcatStats.summary.total, 2);
    assert.equal(katcatStats.summary.today, 2);
    assert.equal(katcatStats.versions.length, 1);
    assert.equal(katcatStats.events.length, 2);
    assert.deepEqual(katcatStats.events.map(row => row.ip_address), ["2001:db8::7", "203.0.113.7"]);
    assert.ok(katcatStats.events.every(row => row.file_url === katcatFile));
    assert.ok(katcatStats.events.every(row => row.version === "1.0.2"));
    for (const [filename, release] of [["Katcat.AI-V1.0.0-Windows-x64-20261022.exe", "original"], ["Katcat.AI-V1.0.0-Windows-x64-20261022-Preview.exe", "preview"]]) {
      const legacy = await fetch(`${baseUrl}/downloads/${filename}`, { method: "HEAD", redirect: "manual" });
      assert.equal(legacy.status, 302);
      assert.equal(legacy.headers.get("location"), `${katcatInstallerRoute}?release=${release}`);
    }
    assert.equal((await getStats("?product=xiaojing-accounting")).summary.total, 2);
    assert.deepEqual((await getStats("?product=xiaojing-accounting")).events, []);
    assert.equal((await getStats("")).summary.total, 4);
    for (const query of ["?product=invalid", "?product=toString", "?page=0", "?page=1.5", "?page=oops"]) {
      assert.equal((await fetch(`${baseUrl}/api/admin/download-stats${query}`, { headers: { Cookie: adminCookie } })).status, 400);
    }
    assert.equal((await fetch(`${baseUrl}/api/admin/download-stats?product=katcat`)).status, 401);

    // Pagination and retention fixtures are isolated from production data and counters.
    const db = new Database(path.join(testDir, "demo-requests.sqlite"));
    try {
      const insert = db.prepare("INSERT INTO download_events (product, version, ip_address, file_url, created_at) VALUES (?, ?, ?, ?, ?)");
      for (let i = 0; i < 20; i += 1) insert.run("katcat", "1.0.0", "198.51.100.10", katcatFile, new Date().toISOString());
      insert.run("katcat", "1.0.0", "198.51.100.99", katcatFile, "2000-01-01T00:00:00.000Z");
      assert.equal(db.prepare("SELECT download_count FROM download_stats WHERE product = 'katcat'").get().download_count, 2);
    } finally { db.close(); }
    const paged = await getStats("?product=katcat&page=2");
    assert.equal(paged.pagination.total, 22);
    assert.equal(paged.events.length, 2);
    assert.equal((await getStats("?product=katcat&page=999")).pagination.page, 2);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
    await page.locator('input[name="password"]').fill(password);
    await page.locator("#admin-login-form button").click();
    await page.locator('[data-admin-view="downloads"]').click();
    await page.locator("#download-admin-total").waitFor();
    await page.waitForFunction(() => document.querySelector("#download-admin-total").textContent === "4");
    assert.equal(await page.locator("#download-admin-today").textContent(), "4");
    await page.locator("#download-admin-product").selectOption("katcat");
    await page.waitForFunction(() => document.querySelector("#download-admin-total").textContent === "2");
    await page.locator("#download-admin-next").click();
    await page.waitForFunction(() => document.querySelector("#download-admin-page").textContent.includes("第 2"));
    assert.match(await page.locator("#download-admin-events").textContent(), /203\.0\.113\.7/);
    await page.locator("#download-admin-product").selectOption("xiaojing-accounting");
    await page.locator("#download-admin-details").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#download-admin-total").textContent(), "2");
    await page.locator("#download-admin-product").selectOption("katcat");
    await page.locator("#download-admin-details").waitFor({ state: "visible" });
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await page.screenshot({ path: path.join(root, "test-results", "download-stats-desktop.png"), fullPage: true });
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator('[data-admin-view="downloads"]').getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#download-admin-dashboard").isVisible(), true);
    await page.waitForFunction(() => document.querySelector("#download-admin-total").textContent === "4");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    await page.screenshot({ path: path.join(root, "test-results", "download-stats-mobile.png"), fullPage: true });

    server.kill("SIGTERM");
    await new Promise(resolve => server.once("exit", resolve));
    server = startServer();
    await waitForServer();
    await fetch(`${baseUrl}${katcatPath}`, { redirect: "manual", headers: { Cookie: visitorCookie } });
    const persisted = new Database(path.join(testDir, "demo-requests.sqlite"), { readonly: true });
    try {
      assert.equal(persisted.prepare("SELECT SUM(download_count) AS total FROM download_stats").get().total, 4);
      assert.equal(persisted.prepare("SELECT COUNT(*) AS total FROM download_events").get().total, 22);
      assert.equal(persisted.prepare("SELECT COUNT(*) AS total FROM download_events WHERE ip_address = '198.51.100.99'").get().total, 0);
    } finally { persisted.close(); }

    // A tiny exclusive fixture exercises the real static-file response, not a mocked redirect.
    fs.writeFileSync(installerFixture, Buffer.alloc(1024, 42), { flag: "wx" });
    ownsInstallerFixture = true;
    const readTotal = () => {
      const database = new Database(path.join(testDir, "demo-requests.sqlite"), { readonly: true });
      try { return database.prepare("SELECT SUM(download_count) AS n FROM download_stats WHERE product = 'katcat'").get().n; }
      finally { database.close(); }
    };
    const fileRequest = async (headers = {}, method = "GET") => {
      const response = await fetch(baseUrl + katcatFile, { method, headers });
      await response.arrayBuffer();
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.ok(response.url.endsWith(katcatInstallerRoute));
      return response;
    };
    assert.equal((await fileRequest({}, "HEAD")).status, 200);
    assert.equal((await fileRequest({ Range: "bytes=100-199" })).status, 206);
    assert.equal((await fileRequest({ Range: "bytes=0-99", Cookie: visitorCookie })).status, 206);
    assert.equal(readTotal(), 2, "Button followed by installer must not count twice");
    const direct = await fileRequest();
    assert.equal(direct.status, 200);
    const directCookie = direct.headers.get("set-cookie").split(";")[0];
    assert.equal(readTotal(), 3, "Completed direct installer transfer must count");
    await fileRequest({ Cookie: directCookie });
    await fileRequest({ Cookie: directCookie, Range: "bytes=0-99" });
    await fetch(baseUrl + katcatPath, { redirect: "manual", headers: { Cookie: directCookie } });
    assert.equal(readTotal(), 3, "Direct, range and button requests must share dedupe");
    assert.equal((await fileRequest({ Range: "bytes=0-99" })).status, 206);
    assert.equal(readTotal(), 4, "Initial range download must count");
    assert.equal((await fileRequest({ "If-None-Match": direct.headers.get("etag"), "Cache-Control": "max-age=0" })).status, 304);
    assert.equal(readTotal(), 4, "Cache validation must not count");
    fs.unlinkSync(installerFixture);
    ownsInstallerFixture = false;
    assert.equal((await fileRequest()).status, 404);
    assert.equal(readTotal(), 4, "Missing installer must not count");

    const teamPath = "/api/download/xiaojing-team/latest";
    const teamFile = "/downloads/Xiaojing-Team-V1.0.2-Windows-x64-20261028.exe";
    const teamHead = await fetch(baseUrl + teamPath, { method: "HEAD", redirect: "manual" });
    assert.equal(teamHead.status, 302);
    assert.equal(teamHead.headers.get("location"), teamFile);
    const teamDownload = await fetch(baseUrl + teamPath, { redirect: "manual" });
    assert.equal(teamDownload.status, 302);
    assert.equal(teamDownload.headers.get("location"), teamFile);
    const teamDb = new Database(path.join(testDir, "demo-requests.sqlite"), { readonly: true });
    try {
      assert.equal(teamDb.prepare("SELECT download_count FROM download_stats WHERE product = 'xiaojing-team' AND version = '1.0.2'").get().download_count, 1);
    } finally { teamDb.close(); }
    await page.goto(`${baseUrl}/xiaojing-team.html`);
    assert.equal(await page.locator(".download-button").getAttribute("href"), teamPath);
    await page.locator('[data-lang="en"]').click();
    assert.equal(await page.locator('.download-button [data-text="download"]').textContent(), "Download for Windows");
    console.log("download tracking: PASS (including direct downloads, cache headers, ranges and shared dedupe)");
  } finally {
    if (browser) await browser.close();
    if (ownsInstallerFixture) fs.unlinkSync(installerFixture);
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise(resolve => server.once("exit", resolve));
    }
    fs.rmSync(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
