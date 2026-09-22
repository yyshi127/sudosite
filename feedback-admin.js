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

function renderRows() {
  const filteredRows = getFilteredRows();
  list.replaceChildren();
  countLabel.textContent = `${filteredRows.length} 条反馈`;
  emptyState.hidden = filteredRows.length !== 0;
  typeFilters.forEach(button => button.classList.toggle("active", button.dataset.typeFilter === typeFilter));

  filteredRows.forEach(row => {
    const article = createElement("article", "feedback-admin-item");
    article.dataset.id = String(row.id);

    const top = createElement("div", "feedback-admin-item-top");
    const identity = createElement("div", "feedback-admin-identity");
    identity.append(
      createElement("span", `feedback-admin-type feedback-admin-type-${row.type}`, row.type === "issue" ? "问题" : "建议"),
      createElement("strong", "", row.ticket_no),
      createElement("span", "feedback-admin-time", formatDate(row.created_at))
    );
    const statusBadge = createElement("span", `feedback-admin-status-badge status-${row.status}`, statusLabels[row.status] || row.status);
    top.append(identity, statusBadge);

    const body = createElement("div", "feedback-admin-item-body");
    const description = createElement("p", "feedback-admin-description", row.description);
    const submitter = createElement("p", "feedback-admin-submitter");
    submitter.append(createElement("span", "", "提交人"), createElement("strong", "", row.name));
    body.append(description, submitter);

    const footer = createElement("div", "feedback-admin-item-footer");
    const attachment = createElement("div", "feedback-admin-attachment");
    if (row.has_screenshot) {
      const link = createElement("a", "", `查看截图 · ${row.screenshot_name || "截图"}`);
      link.href = `/api/admin/feedback/${row.id}/screenshot`;
      link.target = "_blank";
      link.rel = "noopener";
      attachment.append(link);
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
      list.replaceChildren();
      countLabel.textContent = "0 条反馈";
      emptyState.hidden = true;
      setStatus(dashboardStatus, "");
    },
  };
} else {
  loadFeedback();
}
})();
