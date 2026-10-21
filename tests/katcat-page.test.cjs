const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudo-katcat-test-"));
const port = 31851;
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, ADMIN_PASSWORD: "katcat-test-password", DATA_DIR: testDir, PORT: String(port), HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", chunk => { serverOutput += chunk; });
server.stderr.on("data", chunk => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/katcat.html`)).ok) return;
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
      args: ["--no-proxy-server", "--host-resolver-rules=MAP www.sudotech.ai 127.0.0.1"],
    });

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.goto(`http://www.sudotech.ai:${port}/katcat.html`, { waitUntil: "networkidle" });
    assert.equal(await desktop.locator("html").getAttribute("lang"), "en");
    assert.equal(await desktop.locator(".product-tagline").textContent(), "Your Super Personal Assistant");
    assert.equal(await desktop.locator(".windows-download").isDisabled(), true);
    assert.equal(await desktop.locator(".download-version").textContent(), "Version 1.0.0");
    assert.match(await desktop.locator("#katcat-preview").getAttribute("src"), /katcat-app-light-en\.png\?/);
    assert.equal(await desktop.locator(".theme-switcher").isVisible(), true);
    await desktop.locator("#katcat-preview").evaluate(image => image.decode());

    await desktop.locator('[data-theme-option="dark"]').click();
    assert.match(await desktop.locator("#katcat-preview").getAttribute("src"), /katcat-app-dark-en\.png$/);
    await desktop.locator("#katcat-preview").evaluate(image => image.decode());
    assert.equal(await desktop.locator('[data-theme-option="dark"]').getAttribute("aria-pressed"), "true");

    await desktop.locator('[data-lang-option="zh"]').click();
    assert.match(await desktop.locator("#katcat-preview").getAttribute("src"), /katcat-app-dark\.png$/);
    assert.equal(await desktop.locator(".product-tagline").textContent(), "您的超级个人助理");
    assert.equal(
      await desktop.locator(".product-description").textContent().then(value => value.trim()),
      "无论是一个天马行空的想法，还是一件想做成的事，都可以交给我一起探索、推进。"
    );

    const desktopLayout = await desktop.evaluate(() => {
      const copy = document.querySelector(".katcat-copy").getBoundingClientRect();
      const preview = document.querySelector(".product-window").getBoundingClientRect();
      return { copyLeft: copy.left, previewLeft: preview.left, viewportWidth: window.innerWidth };
    });
    assert.ok(desktopLayout.copyLeft >= 0, "desktop copy must remain inside the viewport");
    assert.ok(desktopLayout.previewLeft > desktopLayout.copyLeft, "desktop preview must remain to the right of the copy");

    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await desktop.screenshot({ path: path.join(root, "test-results", "katcat-desktop.png") });

    for (const viewport of [
      { name: "laptop", width: 1366, height: 768 },
      { name: "full-hd", width: 1920, height: 1080 },
      { name: "ultrawide", width: 3440, height: 1440 },
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(`http://127.0.0.1:${port}/katcat.html`, { waitUntil: "networkidle" });
      const layout = await page.evaluate(() => {
        const copy = document.querySelector(".katcat-copy").getBoundingClientRect();
        const preview = document.querySelector(".product-window").getBoundingClientRect();
        return { copyLeft: copy.left, copyRight: copy.right, previewLeft: preview.left };
      });
      assert.ok(layout.copyLeft >= 0, `${viewport.name}: copy must not be clipped`);
      assert.ok(layout.copyRight <= layout.previewLeft, `${viewport.name}: copy and preview must not overlap`);
      await page.screenshot({ path: path.join(root, "test-results", `katcat-${viewport.name}.png`) });
      await page.close();
    }

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(`http://127.0.0.1:${port}/katcat.html`, { waitUntil: "networkidle" });
    assert.equal(await mobile.locator("html").getAttribute("lang"), "en");
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await mobile.screenshot({ path: path.join(root, "test-results", "katcat-mobile.png"), fullPage: true });

    console.log("katcat page: PASS");
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
