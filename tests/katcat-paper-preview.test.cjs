const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const base = process.env.PREVIEW_URL || "http://127.0.0.1:3000";
    for (const width of [320, 390, 820, 1440, 3440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/katcat-paper.html`);
      await page.locator('[data-lang-option="en"]').click();
      await page.locator(".hero-art").evaluate(image => image.decode());
      const art = await page.locator(".hero-art").evaluate(image => {
        const box = image.getBoundingClientRect();
        return { left: box.left, right: box.right, width: innerWidth, fit: getComputedStyle(image).objectFit };
      });
      assert.equal(art.left, 0);
      assert.equal(art.right, art.width);
      assert.equal(art.fit, "cover");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 1440 || width === 390) {
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = "auto";
          scrollTo(0, document.querySelector(".workspace").offsetTop - 400);
        });
        await page.screenshot({ path: `test-results/paper-soft-transition-${width}.png` });
      }
      for (const type of ["privacy", "terms"]) {
        await page.locator(`footer a[data-i18n="${type}"]`).click();
        await page.waitForURL(`**/katcat-paper-${type}.html`);
        for (const language of ["en", "zh"]) {
          await page.locator(`[data-lang-option="${language}"]`).click();
          assert.equal(await page.locator("article:visible").count(), 1);
          assert.equal(await page.locator(".home-link [data-language]:visible").count(), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.equal(await page.locator(".home-link").getAttribute("href"), "./katcat-paper.html");
          assert.equal(await page.locator('a[href="./index.html"], a[href="./privacy.html"], a[href="./terms.html"]').count(), 0);
          if (width === 1440 || width === 390) {
            await page.screenshot({ path: `test-results/paper-${type}-${language}-${width}.png`, fullPage: true });
          }
        }
        await page.locator(".home-link").click();
        await page.waitForURL("**/katcat-paper.html");
        assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
      }
    }
    for (const [width, height] of [[1280, 600], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [3440, 1440]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}/katcat-paper.html`);
      for (const language of ["en", "zh"]) {
        await page.locator(`[data-lang-option="${language}"]`).click();
        const layout = await page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect();
          const hero = rect(".paper-hero");
          const copy = rect(".hero-copy");
          return { heroHeight: hero.height, nextTop: rect(".workspace").top, copyTop: copy.top, copyBottom: copy.bottom, headerBottom: rect(".paper-header").bottom, scrollTop: rect(".scroll-link").top };
        });
        assert.equal(layout.heroHeight, height);
        assert.equal(layout.nextTop, height);
        assert.ok(layout.copyTop >= layout.headerBottom);
        assert.ok(layout.copyBottom <= layout.scrollTop);
      }
      if (width === 1366 || width === 3440) {
        await page.locator(".hero-art").evaluate(image => image.decode());
        await page.screenshot({ path: `test-results/paper-one-screen-${width}.png` });
      }
    }
    assert.deepEqual(errors, []);
    console.log("PASS: paper preview, both legal pages, language persistence and return links at five viewport widths.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
