const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudo-language-test-"));
const port = 31848;
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, ADMIN_PASSWORD: "language-test-password", DATA_DIR: testDir, PORT: String(port), HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", chunk => { serverOutput += chunk; });
server.stderr.on("data", chunk => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start:\n${serverOutput}`);
}

(async () => {
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-proxy-server",
        "--host-resolver-rules=MAP sudotech.ai 127.0.0.1, MAP www.sudotech.ai 127.0.0.1, MAP sudo.vip 127.0.0.1",
      ],
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("sudoLanguage", "zh"));
    await page.goto(`http://sudotech.ai:${port}/`, { waitUntil: "networkidle" });
    if (await page.locator("html").getAttribute("lang") !== "en") throw new Error("sudotech.ai should default to English");
    if (!await page.locator('[data-lang-option="en"]').evaluate(element => element.classList.contains("active"))) {
      throw new Error("English option should be active on sudotech.ai");
    }

    await page.locator('[data-lang-option="zh"]').click();
    await page.reload({ waitUntil: "networkidle" });
    if (await page.locator("html").getAttribute("lang") !== "zh-CN") throw new Error("saved language should be preserved");

    const downloadContext = await browser.newContext();
    const downloadPage = await downloadContext.newPage();
    await downloadPage.goto(`http://www.sudotech.ai:${port}/download.html`, { waitUntil: "networkidle" });
    if (await downloadPage.locator("html").getAttribute("lang") !== "en") throw new Error("English download page should default to English");

    const chinaContext = await browser.newContext();
    const chinaPage = await chinaContext.newPage();
    await chinaPage.goto(`http://sudo.vip:${port}/`, { waitUntil: "networkidle" });
    if (await chinaPage.locator("html").getAttribute("lang") !== "zh-CN") throw new Error("sudo.vip should continue to default to Chinese");

    console.log("language defaults: PASS");
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
