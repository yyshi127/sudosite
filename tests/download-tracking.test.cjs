const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudo-download-test-"));
const port = 31849;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "download-test-password";
const trackingPath = "/api/download/xiaojing-accounting/latest";
const expectedFile = "/downloads/xiaojing-accounting-0.3.2-20261004-windows-x64-setup.exe";
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, ADMIN_PASSWORD: password, DATA_DIR: testDir, PORT: String(port), HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", chunk => { serverOutput += chunk; });
server.stderr.on("data", chunk => { serverOutput += chunk; });

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
    assert.equal(statsBody.versions[0].version, "0.3.2");
    assert.equal(statsBody.versions[0].download_count, 2);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
    await page.locator('input[name="password"]').fill(password);
    await page.locator("#admin-login-form button").click();
    await page.locator('[data-admin-view="downloads"]').click();
    await page.locator("#download-admin-total").waitFor();
    assert.equal(await page.locator("#download-admin-total").textContent(), "2");
    assert.equal(await page.locator("#download-admin-today").textContent(), "2");
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await page.screenshot({ path: path.join(root, "test-results", "download-stats-desktop.png"), fullPage: true });
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator('[data-admin-view="downloads"]').getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#download-admin-dashboard").isVisible(), true);
    assert.equal(await page.locator("#download-admin-total").textContent(), "2");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    await page.screenshot({ path: path.join(root, "test-results", "download-stats-mobile.png"), fullPage: true });

    console.log("download tracking: PASS");
  } finally {
    if (browser) await browser.close();
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
