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

function setStatus(message, type = "") {
  status.textContent = message;
  status.dataset.type = type;
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
}

function useScreenshot(file) {
  if (!file) return;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    setStatus("截图仅支持 JPG、PNG 或 WebP 格式", "error");
    clearScreenshot();
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setStatus("截图不能超过 5MB，请压缩后重新选择", "error");
    clearScreenshot();
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
  });
  reader.addEventListener("error", () => setStatus("截图读取失败，请重新选择", "error"));
  reader.readAsDataURL(file);
}

description.addEventListener("input", () => {
  descriptionCount.textContent = String(description.value.length);
});

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
  const data = new FormData(form);
  const descriptionValue = String(data.get("description") || "").trim();
  const name = String(data.get("name") || "").trim();

  if (descriptionValue.length < 10) {
    setStatus("请再详细描述一些，至少填写 10 个字", "error");
    description.focus();
    return;
  }

  if (!name) {
    setStatus("请填写你的姓名", "error");
    form.elements.name.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "正在提交…";
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
    const result = await response.json().catch(() => ({ ok: false, error: "服务暂时不可用，请稍后重试" }));

    if (!response.ok || !result.ok) {
      setStatus(result.error || "提交失败，请稍后重试", "error");
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
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "提交反馈";
  }
});

submitAgain.addEventListener("click", () => {
  form.reset();
  descriptionCount.textContent = "0";
  clearScreenshot();
  setStatus("");
  successPanel.hidden = true;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
});
