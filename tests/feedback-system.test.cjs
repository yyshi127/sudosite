const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudo-feedback-test-"));
const port = 31847;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "feedback-test-password";
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
      const response = await fetch(`${baseUrl}/feedback.html`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start:\n${serverOutput}`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, options);
  const body = await response.json();
  return { response, body };
}

(async () => {
  let browser;
  try {
    await waitForServer();
    const screenshotPath = path.join(root, "assets", "xiaojing-app-icon.png");
    const screenshotBuffer = fs.readFileSync(screenshotPath);
    const screenshot = {
      name: "problem.png",
      dataUrl: `data:image/png;base64,${screenshotBuffer.toString("base64")}`,
    };

    const issue = await jsonRequest("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "issue", description: "打开工作区后任务没有继续执行，请帮助检查。", name: "测试用户", screenshot }),
    });
    assert.equal(issue.response.status, 201);
    assert.match(issue.body.ticket_no, /^XJ-\d{8}-[A-F0-9]{6}$/);

    const suggestion = await jsonRequest("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "suggestion", description: "希望增加任务完成后的结果摘要和复制入口。", name: "建议用户", screenshot: null }),
    });
    assert.equal(suggestion.response.status, 201);

    const tooShort = await jsonRequest("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "issue", description: "太短", name: "用户" }),
    });
    assert.equal(tooShort.response.status, 400);

    const unauthorized = await jsonRequest("/api/admin/feedback");
    assert.equal(unauthorized.response.status, 401);

    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const adminHeaders = { Cookie: cookie };

    const records = await jsonRequest("/api/admin/feedback", { headers: adminHeaders });
    assert.equal(records.response.status, 200);
    assert.equal(records.body.rows.length, 2);
    const issueRow = records.body.rows.find(row => row.type === "issue");
    const suggestionRow = records.body.rows.find(row => row.type === "suggestion");
    assert.equal(issueRow.has_screenshot, 1);
    assert.equal(suggestionRow.has_screenshot, 0);

    const imageResponse = await fetch(`${baseUrl}/api/admin/feedback/${issueRow.id}/screenshot`, { headers: adminHeaders });
    assert.equal(imageResponse.status, 200);
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), screenshotBuffer);

    const invalidTransition = await jsonRequest(`/api/admin/feedback/${issueRow.id}/status`, {
      method: "PATCH",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "launched" }),
    });
    assert.equal(invalidTransition.response.status, 400);

    for (const status of ["evaluated_pending", "adopted", "resolved"]) {
      const update = await jsonRequest(`/api/admin/feedback/${issueRow.id}/status`, {
        method: "PATCH",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      assert.equal(update.response.status, 200);
      assert.equal(update.body.status, status);
    }

    const launchSuggestion = await jsonRequest(`/api/admin/feedback/${suggestionRow.id}/status`, {
      method: "PATCH",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "launched" }),
    });
    assert.equal(launchSuggestion.response.status, 200);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/feedback.html`, { waitUntil: "networkidle" });
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await page.screenshot({ path: path.join(root, "test-results", "feedback-form-desktop.png"), fullPage: true });
    await page.locator('label:has(input[value="suggestion"])').click();
    assert.equal(await page.locator('input[value="suggestion"]').isChecked(), true);
    await page.locator('textarea[name="description"]').fill("建议在任务执行完成后显示一份清晰的结果摘要。 ");
    await page.locator('input[name="name"]').fill("浏览器测试");
    await page.locator("#screenshot-input").setInputFiles(screenshotPath);
    await page.locator("#feedback-submit").click();
    await page.locator("#feedback-success:not([hidden])").waitFor();
    assert.match(await page.locator("#feedback-ticket").textContent(), /^XJ-/);
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: path.join(root, "test-results", "feedback-desktop.png"), fullPage: true });

    const adminPage = await context.newPage();
    await adminPage.goto(`${baseUrl}/feedback-admin.html`, { waitUntil: "networkidle" });
    await adminPage.locator('input[name="password"]').fill(password);
    await adminPage.locator("#feedback-admin-login-form button").click();
    await adminPage.locator(".feedback-admin-item").first().waitFor();
    assert.equal(await adminPage.locator(".feedback-admin-item").count(), 3);
    await adminPage.screenshot({ path: path.join(root, "test-results", "feedback-admin-desktop.png"), fullPage: true });

    const unifiedPage = await context.newPage();
    const unifiedErrors = [];
    unifiedPage.on("pageerror", error => unifiedErrors.push(error.message));
    await unifiedPage.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
    await unifiedPage.locator("#admin-dashboard:not([hidden])").waitFor();
    const adminUrl = unifiedPage.url();
    await unifiedPage.locator("#admin-tab-feedback").click();
    await unifiedPage.locator("#feedback-admin-dashboard:not([hidden])").waitFor();
    await unifiedPage.locator(".feedback-admin-item").first().waitFor();
    assert.equal(unifiedPage.url(), adminUrl);
    assert.equal(await unifiedPage.locator(".feedback-admin-item").count(), 3);

    const integratedIssue = unifiedPage.locator(`.feedback-admin-item[data-id="${issueRow.id}"]`);
    await integratedIssue.locator("select").selectOption("adopted");
    await unifiedPage.locator("#feedback-admin-dashboard-status[data-type='success']").waitFor();
    const changed = await jsonRequest(`/api/admin/feedback/${issueRow.id}/status`, {
      method: "PATCH",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    assert.equal(changed.response.status, 200);

    await unifiedPage.locator('[data-type-filter="issue"]').click();
    assert.equal(await unifiedPage.locator(".feedback-admin-item").count(), 1);
    await unifiedPage.locator("#admin-tab-requests").click();
    assert.equal(await unifiedPage.locator("#admin-dashboard").isVisible(), true);
    await unifiedPage.locator("#admin-tab-feedback").click();
    await unifiedPage.locator(".feedback-admin-item").first().waitFor();
    assert.equal(unifiedPage.url(), adminUrl);
    assert.equal(await unifiedPage.locator(".feedback-admin-item").count(), 1);
    await unifiedPage.screenshot({ path: path.join(root, "test-results", "admin-integrated-feedback-desktop.png"), fullPage: true });

    for (const width of [390, 320]) {
      await unifiedPage.setViewportSize({ width, height: 844 });
      assert.equal(await unifiedPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
      await unifiedPage.screenshot({ path: path.join(root, "test-results", `admin-integrated-feedback-${width}.png`), fullPage: true });
    }
    assert.deepEqual(unifiedErrors, []);
    await unifiedPage.locator("#admin-logout").click();
    await unifiedPage.locator("#admin-login:not([hidden])").waitFor();
    assert.equal(await unifiedPage.locator("#feedback-admin-dashboard").isHidden(), true);

    const directPage = await context.newPage();
    await directPage.goto(`${baseUrl}/feedback-admin`, { waitUntil: "networkidle" });
    await directPage.locator("#admin-tab-feedback").waitFor();
    assert.equal(await directPage.locator("#admin-tab-feedback").getAttribute("aria-selected"), "true");
    await directPage.locator('#admin-login-form input[name="password"]').fill(password);
    await directPage.locator('#admin-login-form button[type="submit"]').click();
    await directPage.locator("#feedback-admin-dashboard:not([hidden])").waitFor();
    await directPage.locator("#admin-tab-requests").click();
    assert.equal(directPage.url(), `${baseUrl}/feedback-admin`);
    assert.equal(await directPage.locator("#admin-tab-requests").getAttribute("aria-selected"), "true");
    assert.equal(await directPage.locator("#admin-dashboard").isVisible(), true);

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobilePage.goto(`${baseUrl}/feedback.html`, { waitUntil: "networkidle" });
    assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    await mobilePage.screenshot({ path: path.join(root, "test-results", "feedback-mobile.png"), fullPage: true });

    console.log("feedback system: PASS");
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) {
      await new Promise(resolve => {
        server.once("exit", resolve);
        server.kill();
      });
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  console.error(serverOutput);
  process.exitCode = 1;
});
