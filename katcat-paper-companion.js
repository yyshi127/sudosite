(() => {
  const cat = document.querySelector("#paper-companion");
  const sprite = cat.querySelector("svg");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  // Frame coordinates and timing match the desktop companion's supplied sprite sheet.
  const motions = {
    blink: [[0, 80], [1, 85], [2, 120], [3, 85], [0, 80]],
    tail: [[4, 180], [5, 180], [6, 220], [7, 180], [6, 180], [5, 180], [4, 180]],
    yawn: [[8, 400], [9, 850], [10, 400], [11, 200]],
  };
  const sequence = ["blink", "tail", "blink", "blink", "tail", "blink", "yawn"];
  let timer;
  let motionIndex = 0;
  let drag = null;
  let moved = false;
  let positioned = false;

  function frame(index) {
    sprite.setAttribute("viewBox", `${[12, 374, 736, 1098][index % 4]} ${[26, 380, 726][Math.floor(index / 4)]} 354 354`);
  }
  function stopMotion() {
    clearTimeout(timer);
    frame(0);
  }
  function schedule() {
    clearTimeout(timer);
    if (reducedMotion.matches || document.hidden || drag) return;
    timer = setTimeout(() => play(sequence[motionIndex++ % sequence.length]), 4000 + Math.floor(Math.random() * 3000));
  }
  function play(name) {
    stopMotion();
    if (reducedMotion.matches || document.hidden || drag) return;
    let index = 0;
    function advance() {
      if (index === motions[name].length) {
        frame(0);
        schedule();
        return;
      }
      const [next, duration] = motions[name][index++];
      frame(next);
      timer = setTimeout(advance, duration);
    }
    advance();
  }
  function move(x, y) {
    const size = cat.offsetWidth;
    cat.style.left = `${Math.max(8, Math.min(x, innerWidth - size - 8))}px`;
    cat.style.top = `${Math.max(8, Math.min(y, innerHeight - size - 8))}px`;
  }
  function initialPosition() {
    const anchor = document.querySelector(".hero-copy .eyebrow").getBoundingClientRect();
    const title = document.querySelector("#product-title").getBoundingClientRect();
    const header = document.querySelector(".paper-header").getBoundingClientRect();
    const gap = 24;
    const preferredSize = innerWidth <= 700 ? 88 : 180;
    const fitsLeft = anchor.left >= preferredSize + 48;
    const size = fitsLeft ? preferredSize : Math.max(24, Math.min(preferredSize, anchor.top - header.bottom - gap - 8));
    cat.style.width = `${size}px`;
    cat.style.height = `${size}px`;
    // Reconstruct the initial viewport placement even when resizing after scrolling.
    move(fitsLeft ? anchor.left - size - 40 : anchor.left,
      (fitsLeft ? title.bottom - size : anchor.top - size - gap) + scrollY);
  }
  function updateLabel() {
    const chinese = document.documentElement.lang.startsWith("zh");
    cat.setAttribute("aria-label", chinese ? "拖动 Katcat 小猫" : "Drag Katcat");
    cat.title = chinese ? "拖动可移动，也可用方向键移动" : "Drag to move; arrow keys also move Katcat";
  }
  cat.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    const box = cat.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top };
    moved = false;
    stopMotion();
    cat.classList.add("is-dragging");
    cat.setPointerCapture(event.pointerId);
  });
  cat.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) moved = true;
    if (moved) {
      positioned = true;
      move(drag.left + dx, drag.top + dy);
    }
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    cat.classList.remove("is-dragging");
    if (cat.hasPointerCapture(event.pointerId)) cat.releasePointerCapture(event.pointerId);
    schedule();
  }
  cat.addEventListener("pointerup", endDrag);
  cat.addEventListener("pointercancel", endDrag);
  cat.addEventListener("lostpointercapture", endDrag);
  cat.addEventListener("click", () => { if (!moved) play("blink"); moved = false; });
  cat.addEventListener("keydown", event => {
    const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
    if (!delta) return;
    event.preventDefault();
    positioned = true;
    const box = cat.getBoundingClientRect();
    move(box.left + delta[0], box.top + delta[1]);
  });
  addEventListener("resize", () => {
    if (!positioned) return initialPosition();
    const box = cat.getBoundingClientRect();
    move(box.left, box.top);
  });
  document.addEventListener("visibilitychange", () => { stopMotion(); schedule(); });
  reducedMotion.addEventListener("change", () => { stopMotion(); schedule(); });
  new MutationObserver(updateLabel).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  new ResizeObserver(() => { if (!positioned && !cat.hidden) initialPosition(); }).observe(document.querySelector(".hero-copy"));
  updateLabel();
  const image = new Image();
  image.onload = () => { cat.hidden = false; initialPosition(); schedule(); };
  image.src = "./assets/katcat-companion-motions.png";
})();
