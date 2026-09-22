(() => {
const embedded = document.body.classList.contains("admin-page");
const loginPanel = document.querySelector("#feedback-admin-login");
const dashboard = document.querySelector("#feedback-admin-dashboard");
const loginForm = document.querySelector("#feedback-admin-login-form");
const loginStatus = document.querySelector("#feedback-admin-login-status");
const dashboardStatus = document.querySelector("#feedback-admin-dashboard-status");
const logoutButton = document.querySelector("#feedback-admin-logout");
const refreshButton = document.querySelector("#feedback-admin-refresh");
const countLabel = document.querySelector("#feedback-admin-count");
const list = document.querySelector("#feedback-admin-list");
const emptyState = document.querySelector("#feedback-admin-empty");
const typeFilters = [...document.querySelectorAll("[data-type-filter]")];
const statusFilter = document.querySelector("#feedback-admin-status-filter");
const selectAllCheckbox = document.querySelector("#feedback-admin-select-all");
const bulkDeleteButton = document.querySelector("#feedback-admin-bulk-delete");
const deleteDialog = document.querySelector("#feedback-admin-delete-dialog");
const deleteIntro = document.querySelector("#feedback-admin-delete-intro");
const deleteList = document.querySelector("#feedback-admin-delete-list");
const deleteStatus = document.querySelector("#feedback-admin-delete-status");
const confirmDeleteButton = document.querySelector("#feedback-admin-confirm-delete");
const imageDialog = document.querySelector("#feedback-admin-image-dialog");
const imageTitle = document.querySelector("#feedback-admin-image-title");
const imageStatus = document.querySelector("#feedback-admin-image-status");
const image = document.querySelector("#feedback-admin-image");

const statusLabels = {
  pending_evaluation: "待评估",
  evaluated_pending: "已评估待定",
  adopted: "已采纳",
  resolved: "已解决",
  launched: "已上线",
};
const statusFlows = {
  issue: ["pending_evaluation", "evaluated_pending", "adopted", "resolved"],
  suggestion: ["pending_evaluation", "evaluated_pending", "adopted", "launched"],
};

let rows = [];
let typeFilter = "all";
let selectedIds = new Set();
let pendingDeleteIds = [];
let imageUrl = "";
let imageController = null;

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.dataset.type = type;
}

function formatDate(value) {
  if (!value) return "";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function showLogin(message = "", type = "") {
  rows = [];
  selectedIds.clear();
  closeDeleteDialog();
  if (imageDialog.open) imageDialog.close();
  list.replaceChildren();
  if (embedded) {
    document.dispatchEvent(new CustomEvent("admin:session-expired"));
    return;
  }
  loginPanel.hidden = false;
  dashboard.hidden = true;
  logoutButton.hidden = true;
  setStatus(loginStatus, message, type);
}

function getFilteredRows() {
  const selectedStatus = statusFilter.value;
  return rows.filter(row => {
    const typeMatches = typeFilter === "all" || row.type === typeFilter;
    const statusMatches = selectedStatus === "all" || row.status === selectedStatus;
    return typeMatches && statusMatches;
  });
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function updateSelectionState(filteredRows = getFilteredRows()) {
  const visibleIds = new Set(filteredRows.map(row => row.id));
  selectedIds = new Set([...selectedIds].filter(id => visibleIds.has(id)));
  const selectedCount = selectedIds.size;
  countLabel.textContent = `${filteredRows.length} 条反馈${selectedCount ? ` · 已选 ${selectedCount} 条` : ""}`;
  selectAllCheckbox.disabled = filteredRows.length === 0;
  selectAllCheckbox.checked = filteredRows.length > 0 && selectedCount === filteredRows.length;
  selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < filteredRows.length;
  bulkDeleteButton.disabled = selectedCount === 0;
  bulkDeleteButton.setAttribute("aria-label", selectedCount ? `删除选中的 ${selectedCount} 条反馈` : "删除选中反馈");
  list.querySelectorAll(".feedback-admin-item").forEach(article => {
    const selected = selectedIds.has(Number(article.dataset.id));
    article.classList.toggle("is-selected", selected);
    article.querySelector(".feedback-admin-row-select").checked = selected;
  });
}

function renderRows() {
  const filteredRows = getFilteredRows();
  list.replaceChildren();
  emptyState.hidden = filteredRows.length !== 0;
  typeFilters.forEach(button => button.classList.toggle("active", button.dataset.typeFilter === typeFilter));

  filteredRows.forEach(row => {
    const article = createElement("article", "feedback-admin-item");
    article.dataset.id = String(row.id);

    const top = createElement("div", "feedback-admin-item-top");
    const identity = createElement("div", "feedback-admin-identity");
    const selectLabel = createElement("label", "feedback-admin-select");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "feedback-admin-row-select";
    checkbox.dataset.id = String(row.id);
    checkbox.setAttribute("aria-label", `选择反馈 ${row.ticket_no}`);
    selectLabel.append(checkbox);
    identity.append(
      selectLabel,
      createElement("span", `feedback-admin-type feedback-admin-type-${row.type}`, row.type === "issue" ? "问题" : "建议"),
      createElement("strong", "", row.ticket_no),
      createElement("span", "feedback-admin-time", formatDate(row.created_at))
    );
    const statusBadge = createElement("span", `feedback-admin-status-badge status-${row.status}`, statusLabels[row.status] || row.status);
    const actions = createElement("div", "feedback-admin-item-actions");
    const deleteButton = createElement("button", "feedback-admin-icon-button feedback-admin-delete-button feedback-admin-delete");
    deleteButton.type = "button";
    deleteButton.dataset.id = String(row.id);
    deleteButton.setAttribute("aria-label", `删除反馈 ${row.ticket_no}`);
    deleteButton.title = "删除反馈";
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6M18.5 6l-.9 13.1A2 2 0 0 1 15.6 21H8.4a2 2 0 0 1-2-1.9L5.5 6M10 11v5m4-5v5" /></svg>';
    actions.append(statusBadge, deleteButton);
    top.append(identity, actions);

    const body = createElement("div", "feedback-admin-item-body");
    const description = createElement("p", "feedback-admin-description", row.description);
    const submitter = createElement("p", "feedback-admin-submitter");
    submitter.append(createElement("span", "", "提交人"), createElement("strong", "", row.name));
    body.append(description, submitter);

    const footer = createElement("div", "feedback-admin-item-footer");
    const attachment = createElement("div", "feedback-admin-attachment");
    if (row.has_screenshot) {
      const previewButton = createElement("button", "feedback-admin-preview", `查看截图 · ${row.screenshot_name || "截图"}`);
      previewButton.type = "button";
      previewButton.dataset.id = String(row.id);
      attachment.append(previewButton);
    } else {
      attachment.textContent = "未附截图";
    }

    const statusControl = createElement("label", "feedback-admin-status-control");
    statusControl.append(createElement("span", "", "处理状态"));
    const select = document.createElement("select");
    select.dataset.id = String(row.id);
    select.dataset.previous = row.status;
    statusFlows[row.type].forEach(status => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = statusLabels[status];
      option.selected = status === row.status;
      select.append(option);
    });
    statusControl.append(select);
    footer.append(attachment, statusControl);
    article.append(top, body, footer);
    list.append(article);
  });
  updateSelectionState(filteredRows);
}

function closeDeleteDialog() {
  if (deleteDialog.open) deleteDialog.close();
  pendingDeleteIds = [];
  setStatus(deleteStatus, "");
}

function openDeleteDialog(targetRows) {
  if (!targetRows.length) return;
  if (imageDialog.open) imageDialog.close();
  pendingDeleteIds = targetRows.map(row => row.id);
  deleteIntro.textContent = targetRows.length === 1
    ? "删除后将无法恢复，关联截图也会被清理。请确认工单："
    : `即将删除 ${targetRows.length} 条反馈，删除后无法恢复，关联截图也会被清理。`;
  deleteList.replaceChildren();
  targetRows.slice(0, 3).forEach(row => {
    deleteList.append(createElement("li", "", `${row.ticket_no} · ${row.name}`));
  });
  if (targetRows.length > 3) {
    deleteList.append(createElement("li", "", `另有 ${targetRows.length - 3} 条反馈`));
  }
  setStatus(deleteStatus, "");
  deleteDialog.showModal();
  confirmDeleteButton.focus();
}

async function openScreenshot(row) {
  if (!row) return;
  imageTitle.textContent = `反馈截图 · ${row.ticket_no}`;
  image.hidden = true;
  setStatus(imageStatus, "正在加载截图…");
  imageDialog.showModal();
  imageController = new AbortController();

  try {
    const response = await fetch(`/api/admin/feedback/${row.id}/screenshot`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: imageController.signal,
    });
    if (response.status === 401) {
      imageDialog.close();
      showLogin("登录已过期，请重新登录", "error");
      return;
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "截图加载失败，请稍后重试");
    }
    const blob = await response.blob();
    if (!imageDialog.open) return;
    imageUrl = URL.createObjectURL(blob);
    image.src = imageUrl;
    image.alt = `反馈 ${row.ticket_no} 的截图`;
    image.hidden = false;
    setStatus(imageStatus, "");
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus(imageStatus, error.message || "截图加载失败，请稍后重试", "error");
    }
  }
}

async function loadFeedback() {
  setStatus(dashboardStatus, "正在读取反馈…");

  try {
    const response = await fetch("/api/admin/feedback", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) {
      showLogin("请登录后查看反馈", "error");
      return;
    }
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "反馈读取失败");
    rows = result.rows || [];
    selectedIds.clear();
    if (!embedded) {
      loginPanel.hidden = true;
      dashboard.hidden = false;
      logoutButton.hidden = false;
    }
    renderRows();
    setStatus(dashboardStatus, "");
  } catch (error) {
    setStatus(dashboardStatus, error.message || "网络异常，请稍后重试", "error");
  }
}

if (loginForm) loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const password = String(new FormData(loginForm).get("password") || "").trim();
  if (!password) {
    setStatus(loginStatus, "请输入后台密码", "error");
    return;
  }

  setStatus(loginStatus, "正在登录…");
  const button = loginForm.querySelector("button");
  button.disabled = true;
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
    await loadFeedback();
  } catch {
    setStatus(loginStatus, "网络异常，请稍后重试", "error");
  } finally {
    button.disabled = false;
  }
});

list.addEventListener("change", async event => {
  const checkbox = event.target.closest(".feedback-admin-row-select");
  if (checkbox) {
    const id = Number(checkbox.dataset.id);
    if (checkbox.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateSelectionState();
    return;
  }

  const select = event.target.closest("select[data-id]");
  if (!select) return;
  const id = Number(select.dataset.id);
  const previous = select.dataset.previous;
  const next = select.value;
  select.disabled = true;
  setStatus(dashboardStatus, `正在更新为“${statusLabels[next]}”…`);

  try {
    const response = await fetch(`/api/admin/feedback/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ status: next }),
    });
    if (response.status === 401) {
      showLogin("登录已过期，请重新登录", "error");
      return;
    }
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "状态更新失败");
    const row = rows.find(item => item.id === id);
    if (row) {
      row.status = result.status;
      row.updated_at = result.updated_at;
    }
    renderRows();
    setStatus(dashboardStatus, `状态已更新为“${statusLabels[next]}”`, "success");
  } catch (error) {
    select.value = previous;
    setStatus(dashboardStatus, error.message || "状态更新失败，请稍后重试", "error");
  } finally {
    select.disabled = false;
  }
});

list.addEventListener("click", event => {
  const previewButton = event.target.closest(".feedback-admin-preview");
  if (previewButton) {
    openScreenshot(rows.find(row => row.id === Number(previewButton.dataset.id)));
    return;
  }
  const deleteButton = event.target.closest(".feedback-admin-delete");
  if (deleteButton) {
    const row = rows.find(item => item.id === Number(deleteButton.dataset.id));
    if (row) openDeleteDialog([row]);
  }
});

selectAllCheckbox.addEventListener("change", () => {
  getFilteredRows().forEach(row => {
    if (selectAllCheckbox.checked) selectedIds.add(row.id);
    else selectedIds.delete(row.id);
  });
  updateSelectionState();
});

bulkDeleteButton.addEventListener("click", () => {
  openDeleteDialog(getFilteredRows().filter(row => selectedIds.has(row.id)));
});

document.querySelectorAll("[data-feedback-delete-close]").forEach(button => {
  button.addEventListener("click", closeDeleteDialog);
});

deleteDialog.addEventListener("close", () => {
  pendingDeleteIds = [];
  setStatus(deleteStatus, "");
});

deleteDialog.addEventListener("cancel", event => {
  if (confirmDeleteButton.disabled) event.preventDefault();
});

confirmDeleteButton.addEventListener("click", async () => {
  const ids = [...pendingDeleteIds];
  if (!ids.length) return;
  confirmDeleteButton.disabled = true;
  setStatus(deleteStatus, "正在删除反馈…");

  try {
    const response = ids.length === 1
      ? await fetch(`/api/admin/feedback/${ids[0]}`, { method: "DELETE", credentials: "same-origin" })
      : await fetch("/api/admin/feedback/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids }),
      });
    if (response.status === 401) {
      closeDeleteDialog();
      showLogin("登录已过期，请重新登录", "error");
      return;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "删除失败，请稍后重试");
    rows = rows.filter(row => !ids.includes(row.id));
    selectedIds.clear();
    closeDeleteDialog();
    renderRows();
    const message = `已删除 ${result.deleted} 条反馈`;
    setStatus(dashboardStatus, result.screenshot_cleanup_failed
      ? `${message}，但有 ${result.screenshot_cleanup_failed} 张截图未能清理，请检查服务器文件`
      : message, result.screenshot_cleanup_failed ? "error" : "success");
  } catch (error) {
    setStatus(deleteStatus, error.message || "删除失败，请稍后重试", "error");
  } finally {
    confirmDeleteButton.disabled = false;
  }
});

document.querySelector("[data-feedback-image-close]").addEventListener("click", () => imageDialog.close());
imageDialog.addEventListener("close", () => {
  if (imageController) imageController.abort();
  imageController = null;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = "";
  image.removeAttribute("src");
  image.hidden = true;
  setStatus(imageStatus, "");
});

typeFilters.forEach(button => {
  button.addEventListener("click", () => {
    typeFilter = button.dataset.typeFilter;
    renderRows();
  });
});

statusFilter.addEventListener("change", renderRows);
refreshButton.addEventListener("click", loadFeedback);

if (logoutButton) logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    logoutButton.disabled = false;
    showLogin("已退出登录", "success");
  }
});

if (embedded) {
  window.feedbackAdmin = {
    load: loadFeedback,
    clear() {
      rows = [];
      selectedIds.clear();
      closeDeleteDialog();
      if (imageDialog.open) imageDialog.close();
      list.replaceChildren();
      countLabel.textContent = "0 条反馈";
      selectAllCheckbox.checked = false;
      selectAllCheckbox.disabled = true;
      bulkDeleteButton.disabled = true;
      emptyState.hidden = true;
      setStatus(dashboardStatus, "");
    },
  };
} else {
  loadFeedback();
}
})();
