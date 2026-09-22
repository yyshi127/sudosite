const form = document.querySelector("#feedback-form");
const panel = document.querySelector("#feedback-panel");
const successPanel = document.querySelector("#feedback-success");
const description = form.elements.description;
const descriptionCount = document.querySelector("#description-count");
const screenshotInput = document.querySelector("#screenshot-input");
const uploadArea = document.querySelector("#feedback-upload");
const filePanel = document.querySelector("#feedback-file");
const filePreview = document.querySelector("#feedback-preview");
const fileName = document.querySelector("#feedback-file-name");
const fileSize = document.querySelector("#feedback-file-size");
const fileRemove = document.querySelector("#feedback-file-remove");
const submitButton = document.querySelector("#feedback-submit");
const status = document.querySelector("#feedback-status");
const ticket = document.querySelector("#feedback-ticket");
const successMessage = document.querySelector("#feedback-success-message");
const submitAgain = document.querySelector("#feedback-again");

let selectedScreenshot = null;
let isSubmitting = false;
let cooldownUntil = 0;
let cooldownTimer = null;

const fieldInputs = {
  description,
  name: form.elements.name,
  screenshot: screenshotInput,
};

function setStatus(message, type = "") {
  status.textContent = message;
  status.dataset.type = type;
  status.setAttribute("role", type === "error" ? "alert" : "status");
  status.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
}

function clearFieldError(field) {
  const hint = document.querySelector(`#feedback-${field}-error`);
  if (!hint) return;
  hint.textContent = "";
  hint.hidden = true;
  fieldInputs[field].removeAttribute("aria-invalid");
}

function setFieldError(field, message) {
  const hint = document.querySelector(`#feedback-${field}-error`);
  if (!hint) {
    setStatus(message, "error");
    return;
  }
  hint.textContent = message;
  hint.hidden = false;
  fieldInputs[field].setAttribute("aria-invalid", "true");
  setStatus(message, "error");
  if (field !== "screenshot") fieldInputs[field].focus();
}

function refreshSubmitButton() {
  submitButton.disabled = isSubmitting || Date.now() < cooldownUntil;
  submitButton.querySelector("span").textContent = isSubmitting ? "正在提交…" : "提交反馈";
}

function beginCooldown(seconds) {
  cooldownUntil = Date.now() + seconds * 1000;
  clearInterval(cooldownTimer);
  const tick = () => {
    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      cooldownUntil = 0;
      setStatus("");
    } else {
      const wait = remaining >= 60 ? `约 ${Math.ceil(remaining / 60)} 分钟` : `约 ${remaining} 秒`;
      setStatus(`提交过于频繁，请${wait}后再试`, "error");
    }
    refreshSubmitButton();
  };
  tick();
  cooldownTimer = setInterval(tick, 1000);
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function clearScreenshot() {
  selectedScreenshot = null;
  screenshotInput.value = "";
  filePreview.removeAttribute("src");
  filePanel.hidden = true;
  uploadArea.hidden = false;
  clearFieldError("screenshot");
}

function useScreenshot(file) {
  if (!file) return;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    clearScreenshot();
    setFieldError("screenshot", "截图仅支持 JPG、PNG 或 WebP 格式");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    clearScreenshot();
    setFieldError("screenshot", "截图不能超过 5MB，请压缩后重新选择");
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedScreenshot = { name: file.name, dataUrl: reader.result };
    filePreview.src = reader.result;
    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size);
    uploadArea.hidden = true;
    filePanel.hidden = false;
    setStatus("");
    clearFieldError("screenshot");
  });
  reader.addEventListener("error", () => setStatus("截图读取失败，请重新选择", "error"));
  reader.readAsDataURL(file);
}

description.addEventListener("input", () => {
  descriptionCount.textContent = String(description.value.length);
  clearFieldError("description");
});
form.elements.name.addEventListener("input", () => clearFieldError("name"));

screenshotInput.addEventListener("change", () => useScreenshot(screenshotInput.files[0]));
fileRemove.addEventListener("click", clearScreenshot);

["dragenter", "dragover"].forEach(eventName => {
  uploadArea.addEventListener(eventName, event => {
    event.preventDefault();
    uploadArea.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach(eventName => {
  uploadArea.addEventListener(eventName, event => {
    event.preventDefault();
    uploadArea.classList.remove("is-dragging");
  });
});

uploadArea.addEventListener("drop", event => useScreenshot(event.dataTransfer.files[0]));

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (isSubmitting || Date.now() < cooldownUntil) return;
  const data = new FormData(form);
  const descriptionValue = String(data.get("description") || "").trim();
  const name = String(data.get("name") || "").trim();

  if (descriptionValue.length < 10) {
    setFieldError("description", "请再详细描述一些，至少填写 10 个字");
    return;
  }

  if (!name) {
    setFieldError("name", "请填写你的姓名");
    return;
  }

  isSubmitting = true;
  refreshSubmitButton();
  setStatus("正在安全提交，请稍候");

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: data.get("type"),
        description: descriptionValue,
        name,
        screenshot: selectedScreenshot,
      }),
    });
    const result = await response.json().catch(() => ({
      ok: false,
      error: response.status === 413
        ? "上传内容过大，请选择 5MB 以内的截图重试"
        : "服务暂时不可用，请稍后重试",
    }));

    if (!response.ok || !result.ok) {
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After") || result.retry_after);
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          beginCooldown(retryAfter);
          return;
        }
      }
      if (result.field && fieldInputs[result.field]) {
        setFieldError(result.field, result.error);
      } else {
        setStatus(result.error || "提交失败，请稍后重试", "error");
      }
      return;
    }

    ticket.textContent = result.ticket_no;
    successMessage.textContent = result.message;
    panel.hidden = true;
    successPanel.hidden = false;
    successPanel.focus({ preventScroll: true });
    successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    setStatus("网络连接异常，请检查网络后重试", "error");
  } finally {
    isSubmitting = false;
    refreshSubmitButton();
  }
});

submitAgain.addEventListener("click", () => {
  form.reset();
  descriptionCount.textContent = "0";
  clearScreenshot();
  clearFieldError("description");
  clearFieldError("name");
  setStatus("");
  successPanel.hidden = true;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
});
