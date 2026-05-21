const slides = [
  {
    title: "连接全球经营数据",
    body: "从业务发生到财务判断，减少系统外 Excel、人工解释和事后补救。",
  },
  {
    title: "让 Agent 执行财务工作",
    body: "把单据理解、对账、凭证草稿、补资料和审批流变成可追踪任务。",
  },
  {
    title: "形成可审计决策闭环",
    body: "每次判断、引用、动作和人工确认都能回放、治理和追责。",
  },
];

const tabs = [...document.querySelectorAll(".switch-tab")];
const images = [...document.querySelectorAll(".stage-img")];
const captionTitle = document.querySelector(".stage-caption h3");
const captionBody = document.querySelector(".stage-caption p:last-child");
const progress = document.querySelector(".stage-progress");
let active = 0;
let timer;

function setSlide(index) {
  active = index;
  tabs.forEach((tab, i) => tab.classList.toggle("active", i === index));
  images.forEach((img, i) => img.classList.toggle("active", i === index));
  captionTitle.textContent = slides[index].title;
  captionBody.textContent = slides[index].body;
  progress.classList.remove("running");
  void progress.offsetWidth;
  progress.classList.add("running");
}

function startAuto() {
  clearInterval(timer);
  timer = setInterval(() => setSlide((active + 1) % slides.length), 4800);
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    setSlide(index);
    startAuto();
  });
});

const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
setSlide(0);
startAuto();

const demoModal = document.querySelector("#demo-request");
const demoForm = document.querySelector("#demo-form");
const demoSuccess = document.querySelector("#demo-success");
const demoStatus = document.querySelector("#demo-form-status");
const demoTriggers = [...document.querySelectorAll(".demo-trigger")];
const demoCloseTargets = [...document.querySelectorAll("[data-demo-close]")];
let lastFocusedElement = null;

function setDemoStatus(message, type = "") {
  demoStatus.textContent = message;
  demoStatus.dataset.type = type;
}

function showDemoForm() {
  demoForm.hidden = false;
  demoSuccess.hidden = true;
  setDemoStatus("");
}

function showDemoSuccess() {
  demoForm.hidden = true;
  demoSuccess.hidden = false;
  demoSuccess.querySelector("button").focus();
}

function openDemoModal(event) {
  event.preventDefault();
  lastFocusedElement = document.activeElement;
  demoForm.reset();
  showDemoForm();
  demoModal.classList.add("open");
  demoModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  demoForm.elements.name.focus();
}

function closeDemoModal() {
  demoModal.classList.remove("open");
  demoModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  demoForm.reset();
  showDemoForm();

  if (lastFocusedElement) {
    lastFocusedElement.focus();
  }
}

function validateDemoForm(data) {
  if (!data.name || !data.phone || !data.company) {
    return "请填写姓名、手机号和公司名称";
  }

  if (!/^[+\d][\d\s-]{5,19}$/.test(data.phone)) {
    return "请填写有效的手机号";
  }

  return "";
}

demoTriggers.forEach(trigger => trigger.addEventListener("click", openDemoModal));
demoCloseTargets.forEach(target => target.addEventListener("click", closeDemoModal));

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && demoModal.classList.contains("open")) {
    closeDemoModal();
  }
});

demoForm.addEventListener("submit", async event => {
  event.preventDefault();

  const formData = new FormData(demoForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    company: String(formData.get("company") || "").trim(),
    message: String(formData.get("message") || "").trim(),
  };
  const error = validateDemoForm(payload);

  if (error) {
    setDemoStatus(error, "error");
    return;
  }

  const submitButton = demoForm.querySelector(".demo-submit");
  submitButton.disabled = true;
  setDemoStatus("正在提交预约信息...");

  try {
    const response = await fetch("/api/demo-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      setDemoStatus(result.error || "提交失败，请稍后重试", "error");
      return;
    }

    demoForm.reset();
    showDemoSuccess();
  } catch (error) {
    setDemoStatus("网络异常，请稍后重试", "error");
  } finally {
    submitButton.disabled = false;
  }
});
