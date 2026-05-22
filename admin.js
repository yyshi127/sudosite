const loginPanel = document.querySelector("#admin-login");
const dashboard = document.querySelector("#admin-dashboard");
const loginForm = document.querySelector("#admin-login-form");
const passwordForm = document.querySelector("#admin-password-form");
const settingsModal = document.querySelector("#admin-settings");
const settingsOpen = document.querySelector("#admin-settings-open");
const settingsCloseTargets = [...document.querySelectorAll("[data-settings-close]")];
const deleteModal = document.querySelector("#admin-delete-modal");
const deleteCloseTargets = [...document.querySelectorAll("[data-delete-close]")];
const deleteIntro = document.querySelector("#admin-delete-intro");
const deleteList = document.querySelector("#admin-delete-list");
const confirmDeleteButton = document.querySelector("#admin-confirm-delete");
const loginStatus = document.querySelector("#admin-login-status");
const dashboardStatus = document.querySelector("#admin-dashboard-status");
const passwordStatus = document.querySelector("#admin-password-status");
const deleteStatus = document.querySelector("#admin-delete-status");
const tableBody = document.querySelector("#admin-requests-body");
const emptyState = document.querySelector("#admin-empty");
const countLabel = document.querySelector("#admin-count");
const selectAllCheckbox = document.querySelector("#admin-select-all");
const bulkDeleteButton = document.querySelector("#admin-bulk-delete");
const refreshButton = document.querySelector("#admin-refresh");
const logoutButton = document.querySelector("#admin-logout");
const csvExportLink = document.querySelector('a[href="/api/admin/demo-requests.csv"]');
const filterButtons = [...document.querySelectorAll(".admin-filter-button")];
let currentRows = [];
let currentFilter = "all";
let selectedIds = new Set();
let pendingDeleteIds = [];
let adminSessionTimer = 0;
const adminSessionTimeoutMs = 30 * 60 * 1000;

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.dataset.type = type;
}

function stopAdminIdleTimer() {
  window.clearTimeout(adminSessionTimer);
  adminSessionTimer = 0;
}

function resetAdminIdleTimer() {
  stopAdminIdleTimer();

  if (dashboard.hidden) return;

  adminSessionTimer = window.setTimeout(() => {
    showLoginPanel("登录已过期，请重新登录", "error");
  }, adminSessionTimeoutMs);
}

function showLoginPanel(message = "登录已过期，请重新登录", type = "error") {
  stopAdminIdleTimer();

  if (settingsModal.classList.contains("open")) {
    closeSettings();
  }

  if (deleteModal.classList.contains("open")) {
    closeDeleteModal();
  }

  selectedIds = new Set();
  pendingDeleteIds = [];
  updateSelectionState();
  logoutButton.hidden = true;
  loginPanel.hidden = false;
  dashboard.hidden = true;
  setStatus(loginStatus, message, type);
}

function handleAuthExpired(response) {
  if (response.status !== 401) return false;

  showLoginPanel("登录已过期，请重新登录", "error");
  return true;
}

function markAdminActivity() {
  if (!dashboard.hidden) {
    resetAdminIdleTimer();
  }
}

function formatTime(value) {
  if (!value) return "-";
  return value.replace("T", " ").replace(/\.\d+Z$/, "");
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return { ok: false, error: fallbackMessage };
  }

  try {
    return await response.json();
  } catch (error) {
    return { ok: false, error: fallbackMessage };
  }
}

function getSelectedRows() {
  return getFilteredRows().filter(row => selectedIds.has(row.id));
}

function getFilteredRows() {
  if (currentFilter === "verified") {
    return currentRows.filter(row => row.verified_at);
  }

  if (currentFilter === "unverified") {
    return currentRows.filter(row => !row.verified_at);
  }

  return currentRows;
}

function updateSelectionState() {
  const selectedCount = selectedIds.size;
  bulkDeleteButton.disabled = selectedCount === 0;
  bulkDeleteButton.textContent = selectedCount ? `删除选中（${selectedCount}）` : "删除选中";
  const visibleRows = getFilteredRows();
  selectAllCheckbox.checked = visibleRows.length > 0 && selectedCount === visibleRows.length;
  selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < visibleRows.length;
}

function createCell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function createVerificationCell(row) {
  const td = document.createElement("td");
  td.className = "admin-verify-cell";

  if (row.verified_at) {
    const stamp = document.createElement("span");
    stamp.className = "admin-verified-stamp";
    stamp.textContent = "已核实";
    stamp.title = `核实时间：${formatTime(row.verified_at)}`;
    td.appendChild(stamp);
  } else {
    const pending = document.createElement("span");
    pending.className = "admin-unverified-label";
    pending.textContent = "未核实";
    td.appendChild(pending);
  }

  return td;
}

function updateFilterButtons() {
  filterButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.filter === currentFilter);
  });
}

function renderRows(rows) {
  if (rows) {
    currentRows = rows;
  }

  const visibleRows = getFilteredRows();
  selectedIds = new Set([...selectedIds].filter(id => visibleRows.some(row => row.id === id)));
  tableBody.innerHTML = "";
  countLabel.textContent = `${visibleRows.length} / ${currentRows.length} 条记录`;
  emptyState.hidden = visibleRows.length > 0;

  visibleRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    tr.classList.toggle("admin-row-verified", Boolean(row.verified_at));

    const selectCell = document.createElement("td");
    selectCell.className = "admin-select-cell";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "admin-row-select";
    checkbox.dataset.id = row.id;
    checkbox.checked = selectedIds.has(row.id);
    checkbox.setAttribute("aria-label", `选择 ${row.name} 的预约记录`);
    selectCell.appendChild(checkbox);

    const actionCell = document.createElement("td");
    actionCell.className = "admin-action-cell";
    const verifyButton = document.createElement("button");
    verifyButton.className = "admin-table-verify";
    verifyButton.type = "button";
    verifyButton.dataset.id = row.id;
    verifyButton.dataset.verified = row.verified_at ? "true" : "false";
    verifyButton.textContent = row.verified_at ? "取消核实" : "核实";
    verifyButton.setAttribute("aria-label", `${row.verified_at ? "取消核实" : "核实"} ${row.name} 的预约记录`);
    actionCell.appendChild(verifyButton);

    const deleteButton = document.createElement("button");
    deleteButton.className = "admin-table-delete";
    deleteButton.type = "button";
    deleteButton.dataset.id = row.id;
    deleteButton.setAttribute("aria-label", `删除 ${row.name} 的预约记录`);
    deleteButton.title = "删除";
    deleteButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6" />
        <path d="M18.5 6l-.9 13.1A2 2 0 0 1 15.6 21H8.4a2 2 0 0 1-2-1.9L5.5 6" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </svg>
    `;
    actionCell.appendChild(deleteButton);

    tr.appendChild(selectCell);
    tr.appendChild(createCell(formatTime(row.created_at), "admin-nowrap"));
    tr.appendChild(createCell(row.name));
    tr.appendChild(createCell(row.phone, "admin-nowrap"));
    tr.appendChild(createCell(row.company));
    tr.appendChild(createCell(row.industry || "-"));
    tr.appendChild(createCell(row.message || "-"));
    tr.appendChild(createVerificationCell(row));
    tr.appendChild(actionCell);
    tableBody.appendChild(tr);
  });

  updateFilterButtons();
  updateSelectionState();
}

function updateRowVerification(id, verifiedAt) {
  currentRows = currentRows.map(row => (
    row.id === id ? { ...row, verified_at: verifiedAt } : row
  ));
  renderRows();
}

function openSettings() {
  settingsModal.classList.add("open");
  settingsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  passwordForm.elements.currentPassword.focus();
}

function closeSettings() {
  settingsModal.classList.remove("open");
  settingsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  passwordForm.reset();
  setStatus(passwordStatus, "");
}

function renderDeleteSummary(rows) {
  const previewRows = rows.slice(0, 3);
  deleteList.innerHTML = "";

  previewRows.forEach(row => {
    const item = document.createElement("div");
    item.className = "admin-delete-item";
    const name = document.createElement("strong");
    const company = document.createElement("span");
    const phone = document.createElement("span");
    name.textContent = row.name;
    company.textContent = row.company;
    phone.textContent = row.phone;
    item.append(name, company, phone);
    deleteList.appendChild(item);
  });

  if (rows.length > previewRows.length) {
    const extra = document.createElement("p");
    extra.className = "admin-delete-extra";
    extra.textContent = `还有 ${rows.length - previewRows.length} 条记录将被删除`;
    deleteList.appendChild(extra);
  }
}

function openDeleteModal(rows) {
  pendingDeleteIds = rows.map(row => row.id);
  deleteIntro.textContent = rows.length === 1
    ? "请核实以下预约记录，确认后将从后台列表和 CSV 导出中隐藏。"
    : `请核实以下 ${rows.length} 条预约记录，确认后将从后台列表和 CSV 导出中隐藏。`;
  renderDeleteSummary(rows);
  setStatus(deleteStatus, "");
  deleteModal.classList.add("open");
  deleteModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  confirmDeleteButton.focus();
}

function closeDeleteModal() {
  deleteModal.classList.remove("open");
  deleteModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  pendingDeleteIds = [];
  setStatus(deleteStatus, "");
}

async function loadRequests() {
  setStatus(dashboardStatus, "正在加载预约记录...");
  const response = await fetch("/api/admin/demo-requests", {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (handleAuthExpired(response)) {
    return;
  }

  const result = await response.json();

  if (!response.ok || !result.ok) {
    setStatus(dashboardStatus, result.error || "预约记录加载失败", "error");
    return;
  }

  loginPanel.hidden = true;
  dashboard.hidden = false;
  logoutButton.hidden = false;
  resetAdminIdleTimer();
  renderRows(result.rows || []);
  setStatus(dashboardStatus, "");
}

async function updateVerification(button) {
  const id = Number(button.dataset.id);
  const willVerify = button.dataset.verified !== "true";

  button.disabled = true;
  setStatus(dashboardStatus, willVerify ? "正在标记已核实..." : "正在取消核实...");

  try {
    const response = await fetch(`/api/admin/demo-requests/${id}/verification`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ verified: willVerify }),
    });

    if (handleAuthExpired(response)) {
      return;
    }

    const result = await readJsonResponse(response, "核实接口不可用，请确认后台服务已更新并重启");

    if (!response.ok || !result.ok) {
      setStatus(dashboardStatus, result.error || "核实状态更新失败，请稍后重试", "error");
      return;
    }

    updateRowVerification(result.id, result.verified_at);
    setStatus(dashboardStatus, willVerify ? "已标记为已核实" : "已取消核实", "success");
  } catch (error) {
    setStatus(dashboardStatus, "网络异常，请稍后重试", "error");
  } finally {
    button.disabled = false;
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const password = String(formData.get("password") || "").trim();

  if (!password) {
    setStatus(loginStatus, "请输入后台密码", "error");
    return;
  }

  setStatus(loginStatus, "正在登录...");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      setStatus(loginStatus, result.error || "登录失败", "error");
      return;
    }

    loginForm.reset();
    setStatus(loginStatus, "");
    await loadRequests();
  } catch (error) {
    setStatus(loginStatus, "网络异常，请稍后重试", "error");
  }
});

["click", "input", "keydown", "change"].forEach(eventName => {
  document.addEventListener(eventName, markAdminActivity, true);
});

settingsOpen.addEventListener("click", openSettings);
settingsCloseTargets.forEach(target => target.addEventListener("click", closeSettings));
deleteCloseTargets.forEach(target => target.addEventListener("click", closeDeleteModal));

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && settingsModal.classList.contains("open")) {
    closeSettings();
  }

  if (event.key === "Escape" && deleteModal.classList.contains("open")) {
    closeDeleteModal();
  }
});

selectAllCheckbox.addEventListener("change", () => {
  selectedIds = selectAllCheckbox.checked ? new Set(getFilteredRows().map(row => row.id)) : new Set();
  renderRows();
});

tableBody.addEventListener("change", event => {
  if (!event.target.classList.contains("admin-row-select")) return;

  const id = Number(event.target.dataset.id);
  if (event.target.checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }

  updateSelectionState();
});

tableBody.addEventListener("click", event => {
  const verifyButton = event.target.closest(".admin-table-verify");
  if (verifyButton) {
    updateVerification(verifyButton);
    return;
  }

  const button = event.target.closest(".admin-table-delete");
  if (!button) return;

  const id = Number(button.dataset.id);
  const row = currentRows.find(item => item.id === id);
  if (row) {
    openDeleteModal([row]);
  }
});

filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    selectedIds = new Set();
    renderRows();
  });
});

bulkDeleteButton.addEventListener("click", () => {
  const rows = getSelectedRows();

  if (rows.length) {
    openDeleteModal(rows);
  }
});

refreshButton.addEventListener("click", loadRequests);

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  setStatus(dashboardStatus, "正在退出登录...");

  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });
  } finally {
    logoutButton.disabled = false;
    showLoginPanel("已退出登录", "success");
  }
});

window.addEventListener("focus", () => {
  if (!dashboard.hidden) {
    loadRequests();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !dashboard.hidden) {
    loadRequests();
  }
});

csvExportLink.addEventListener("click", async event => {
  event.preventDefault();

  try {
    const response = await fetch(csvExportLink.href, { credentials: "same-origin" });

    if (handleAuthExpired(response)) {
      return;
    }

    if (!response.ok) {
      setStatus(dashboardStatus, "CSV 导出失败，请稍后重试", "error");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "demo-requests.csv";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(url);
    resetAdminIdleTimer();
  } catch (error) {
    setStatus(dashboardStatus, "网络异常，请稍后重试", "error");
  }
});

confirmDeleteButton.addEventListener("click", async () => {
  if (!pendingDeleteIds.length) return;

  confirmDeleteButton.disabled = true;
  setStatus(deleteStatus, "正在删除预约记录...");

  try {
    const response = pendingDeleteIds.length === 1
      ? await fetch(`/api/admin/demo-requests/${pendingDeleteIds[0]}`, {
          method: "DELETE",
          credentials: "same-origin",
        })
      : await fetch("/api/admin/demo-requests/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ids: pendingDeleteIds }),
        });
    const result = await response.json();

    if (handleAuthExpired(response)) {
      return;
    }

    if (!response.ok || !result.ok) {
      setStatus(deleteStatus, result.error || "删除失败，请稍后重试", "error");
      return;
    }

    selectedIds = new Set();
    closeDeleteModal();
    await loadRequests();
    setStatus(dashboardStatus, pendingDeleteIds.length === 1 ? "已删除 1 条预约记录" : `已删除 ${result.deleted} 条预约记录`, "success");
  } catch (error) {
    setStatus(deleteStatus, "网络异常，请稍后重试", "error");
  } finally {
    confirmDeleteButton.disabled = false;
  }
});

passwordForm.addEventListener("submit", async event => {
  event.preventDefault();
  const formData = new FormData(passwordForm);
  const currentPassword = String(formData.get("currentPassword") || "").trim();
  const newPassword = String(formData.get("newPassword") || "").trim();
  const confirmPassword = String(formData.get("confirmPassword") || "").trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    setStatus(passwordStatus, "请完整填写当前密码和新密码", "error");
    return;
  }

  if (newPassword.length < 8) {
    setStatus(passwordStatus, "新密码至少需要 8 位", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    setStatus(passwordStatus, "两次输入的新密码不一致", "error");
    return;
  }

  setStatus(passwordStatus, "正在保存新密码...");

  try {
    const response = await fetch("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const result = await response.json();

    if (handleAuthExpired(response)) {
      return;
    }

    if (!response.ok || !result.ok) {
      setStatus(passwordStatus, result.error || "密码修改失败", "error");
      return;
    }

    passwordForm.reset();
    setStatus(passwordStatus, "密码已修改，请使用新密码重新登录。", "success");
    setTimeout(() => {
      closeSettings();
      showLoginPanel("请使用新密码登录", "success");
    }, 900);
  } catch (error) {
    setStatus(passwordStatus, "网络异常，请稍后重试", "error");
  }
});

loadRequests();
