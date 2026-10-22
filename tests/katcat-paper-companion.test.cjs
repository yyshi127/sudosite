const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 2400, height: 1368 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${process.env.PREVIEW_URL || "http://127.0.0.1:3000"}/katcat-paper.html`);
    const cat = page.locator("#paper-companion");
    const sprite = cat.locator("svg");
    await cat.waitFor({ state: "visible" });
    const anchor = await page.locator(".hero-copy .eyebrow").boundingBox();
    const initial = await cat.boundingBox();
    const title = await page.locator("#product-title").boundingBox();
    assert.equal(initial.x + initial.width, anchor.x - 40);
    assert.equal(initial.y + initial.height, title.y + title.height);
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      scrollTo(0, document.querySelector(".workspace").offsetTop);
    });
    assert.deepEqual(await cat.boundingBox(), initial);
    const preview = await page.locator(".app-preview").boundingBox();
    assert.ok(initial.x + initial.width < preview.x);
    await page.screenshot({ path: "test-results/paper-companion-scrolled.png" });
    await page.mouse.move(initial.x + 60, initial.y + 60);
    await page.mouse.down();
    await page.mouse.move(initial.x + 90, initial.y + 90, { steps: 5 });
    await page.mouse.up();
    const scrolledDrag = await cat.boundingBox();
    assert.equal(scrolledDrag.x, initial.x + 30);
    assert.equal(scrolledDrag.y, initial.y + 30);
    await page.evaluate(() => scrollTo(0, 0));
    assert.deepEqual(await cat.boundingBox(), scrolledDrag);
    await page.locator(".hero-art").evaluate(image => image.decode());
    await page.screenshot({ path: "test-results/paper-companion-desktop.png" });
    await page.evaluate(() => {
      window.seenFrames = new Set();
      const sprite = document.querySelector("#paper-companion svg");
      new MutationObserver(() => window.seenFrames.add(sprite.getAttribute("viewBox"))).observe(sprite, { attributes: true });
    });
    await page.clock.runFor(80000);
    assert.equal(await page.evaluate(() => window.seenFrames.size), 12);
    let box = await cat.boundingBox();
    await page.mouse.move(box.x + 80, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 380, box.y + 280, { steps: 10 });
    await page.mouse.up();
    let moved = await cat.boundingBox();
    assert.equal(Math.round(moved.x - box.x), 300);
    assert.equal(Math.round(moved.y - box.y), 200);
    await page.mouse.move(moved.x + 30, moved.y + 30);
    await page.mouse.down();
    await page.mouse.move(-100, -100);
    await page.mouse.up();
    box = await cat.boundingBox();
    assert.equal(box.x, 8);
    assert.equal(box.y, 8);
    await cat.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal((await cat.boundingBox()).x, 24);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.runFor(10000);
    assert.equal(await sprite.getAttribute("viewBox"), "12 26 354 354");
    assert.equal(await sprite.evaluate(node => getComputedStyle(node).animationName), "none");
    for (const width of [320, 390, 1366, 3440]) {
      await page.setViewportSize({ width, height: 768 });
      box = await cat.boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 768);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await cat.waitFor({ state: "visible" });
    await page.screenshot({ path: "test-results/paper-companion-mobile.png" });
    const cdp = await page.context().newCDPSession(page);
    box = await cat.boundingBox();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 40, y: box.y + 40 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x - 40, y: box.y - 40 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    assert.ok((await cat.boundingBox()).x < box.x);
    assert.equal(await cat.evaluate(node => node.classList.contains("is-dragging")), false);
    assert.deepEqual(errors, []);
    console.log("PASS: all 12 frames, drag, bounds, keyboard, reduced motion, resize and cancellation.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
