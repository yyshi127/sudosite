const views = {
  light: { src: "./assets/xiaojing-team-home-light-20261028.png", enSrc: "./assets/xiaojing-team-home-light-en-20261028.png", alt: "小兢会计 Team 浅色主界面", enAlt: "Xiaojing Team light interface", index: "01 / 02" },
  dark: { src: "./assets/xiaojing-team-home-dark-20261028.png", enSrc: "./assets/xiaojing-team-home-dark-en-20261028.png", alt: "小兢会计 Team 深色主界面", enAlt: "Xiaojing Team dark interface", index: "02 / 02" },
};
const copy = {
  zh: { product: "小兢会计", home: "返回官网", headlineFirst: "从一句话开始，", headlineSecond: "组建你的 AI 财务团队", headlineEnd: "。", description: "从财务到日常工作，创建适合不同任务的 Bot，为它们分配角色与职责。在群聊中说出目标，让你的 AI 团队各展所长，一起把事情向前推进。", download: "Windows 版准备中", desktop: "了解桌面版", availability: "安装包即将上线", system: "Windows 桌面客户端", language: "简体中文", light: "浅色", dark: "深色", privacy: "隐私政策", terms: "服务条款", copyright: "© 2026 瑞华云数豆科技（苏州）有限公司. All rights reserved.", lightCaption: "小兢会计 Team · 浅色主界面", darkCaption: "小兢会计 Team · 深色主界面", lightLabel: "主界面 · 浅色", darkLabel: "主界面 · 深色" },
  en: { product: "Xiaojing", home: "Back to site", headlineFirst: "Start with a sentence.", headlineSecond: "Build your AI finance team", headlineEnd: ".", description: "From finance to everyday work, create Bots for different tasks and give each one a role. Share a goal in a group chat and bring your AI team together to move it forward.", download: "Windows version coming soon", desktop: "Desktop edition", availability: "The installer is being prepared", system: "Windows desktop", language: "Simplified Chinese", light: "Light", dark: "Dark", privacy: "Privacy Policy", terms: "Terms of Service", copyright: "© 2026 Ruihua Cloud SUDO Technology (Suzhou) Co., Ltd. All rights reserved.", lightCaption: "Xiaojing Team · Light workspace", darkCaption: "Xiaojing Team · Dark workspace", lightLabel: "Workspace · Light", darkLabel: "Workspace · Dark" },
};
copy.zh.guide = "使用指南";
copy.en.guide = "User guide";
Object.assign(copy.zh, { closingKicker: "从一个人，到一支 AI 团队", closingTitleFirst: "从「我」，", closingTitleSecond: "到「我们」。", closingDescription: "下一件想做成的事，不必一个人出发。", closingRelease: "Windows 桌面版 · 即将上线", backTop: "返回顶部" });
Object.assign(copy.en, { closingKicker: "FROM SOLO WORK TO AN AI TEAM", closingTitleFirst: "From me,", closingTitleSecond: "to we.", closingDescription: "The next task does not have to be a solo effort.", closingRelease: "Windows desktop · Coming soon", backTop: "Back to top" });
const image = document.querySelector("#workspace-image");
const roleCopy = {
  zh: { titleLead: "同一个", titleGoal: "目标", titleSeparator: "，", titleBridge: "同一个", titleTeam: "团队", titleEnd: "。", description: "从财务到日常工作，根据任务需要创建不同角色，让各有所长的 Bot 一起协作。", create: "创建 Bot", createDescription: "根据场景和任务，创建需要的智能体。", assign: "分配职责", assignDescription: "为每个 Bot 设定角色与工作范围。", togetherPrefix: "组队", togetherKeyword: "协作", togetherDescription: "在群聊中围绕共同目标，一起推进任务。" },
  en: { titleLead: "One ", titleGoal: "goal", titleSeparator: ". ", titleBridge: "One ", titleTeam: "team", titleEnd: ".", description: "From finance to everyday work, create different roles for the task and bring Bots together to collaborate.", create: "Create Bots", createDescription: "Create agents suited to your tasks and scenarios.", assign: "Define roles", assignDescription: "Give each Bot a role and a scope of work.", togetherPrefix: "Work ", togetherKeyword: "together", togetherDescription: "Bring the team together around a shared goal in a group chat." },
};
roleCopy.zh.visualCaption = "一个想法，多一位伙伴";
roleCopy.en.visualCaption = "An idea, a new teammate";
const steps = {
  create: { word: "CREATE", figure: "Bot", zh: ["从需要出发", "每项任务，\n都有合适的伙伴。", "从财务到日常工作，根据不同场景创建 Bot。先说清楚你想完成什么，再找到适合这项任务的伙伴。", "你的想法 + 合适的 Bot · 新的开始"], en: ["START WITH A NEED", "The right teammate\nfor every task.", "Create Bots for different tasks, from finance to everyday work. Start with what you want to accomplish and build the team around it.", "Your idea + The right Bot · A new start"] },
  assign: { word: "ROLE", figure: "职责", zh: ["让分工更清楚", "各有所长，\n各有自己的职责。", "为每个 Bot 设定角色和工作范围。根据任务需要，让不同的伙伴发挥各自的长处。", "不同角色 + 清晰分工 · 各展所长"], en: ["DEFINE THE ROLES", "Different strengths.\nClear responsibilities.", "Give each Bot a role and a scope of work, so every teammate can contribute where it fits best.", "Different roles + Clear responsibilities · Stronger together"] },
  together: { word: "TOGETHER", figure: "协作", zh: ["围绕目标，一起前进", "一个群聊，\n一支协作的团队。", "把合适的 Bot 组成群聊，告诉团队你的目标。让伙伴们围绕同一项任务协作，与你一起推进。", "共同目标 + 团队协作 · 一起向前"], en: ["MOVE FORWARD TOGETHER", "One group chat.\nOne team working together.", "Bring the right Bots into a group chat and share your goal. Let the team collaborate around the same task with you.", "Shared goal + Teamwork · Moving forward"] },
};
const dialog = document.querySelector("#image-dialog");
const dialogImage = document.querySelector("#dialog-image");
let currentView = "light";
let language = "zh";
let currentStep = "create";
const stepTabs = [...document.querySelectorAll("[data-step]")];

function updateView() {
  const view = views[currentView];
  image.src = language === "en" ? view.enSrc : view.src;
  image.alt = language === "en" ? view.enAlt : view.alt;
  document.querySelector(".screen-button").dataset.theme = currentView;
  document.querySelector("#workspace-caption").textContent = copy[language][currentView + "Caption"];
  document.querySelector(".workspace-index").textContent = view.index;
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.view === currentView)));
}

function renderStep() {
  const step = steps[currentStep];
  const panel = document.querySelector("#role-panel");
  panel.dataset.active = currentStep;
  panel.setAttribute("aria-labelledby", "step-" + currentStep);
  document.querySelector("#role-word").textContent = step.word;
  document.querySelector("#role-figure").textContent = language === "en" && currentStep !== "create" ? (currentStep === "assign" ? "Role" : "Team") : step.figure;
  ["#role-kicker", "#role-detail-title", "#role-detail-description", "#role-equation"].forEach((selector, index) => { document.querySelector(selector).textContent = step[language][index]; });
  stepTabs.forEach(tab => {
    const active = tab.dataset.step === currentStep;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}
stepTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => { currentStep = tab.dataset.step; renderStep(); });
  tab.addEventListener("keydown", event => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % stepTabs.length;
    else if (event.key === "ArrowLeft") next = (index + stepTabs.length - 1) % stepTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = stepTabs.length - 1;
    else return;
    event.preventDefault();
    stepTabs[next].focus();
    stepTabs[next].click();
  });
});

function applyLanguage(next) {
  language = next;
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-text]").forEach(node => { node.textContent = copy[next][node.dataset.text]; });
  document.querySelectorAll("[data-role-text]").forEach(node => { node.textContent = roleCopy[next][node.dataset.roleText]; });
  document.querySelectorAll("[data-lang]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.lang === next)));
  updateView();
  renderStep();
}
document.querySelectorAll("[data-lang]").forEach(button => button.addEventListener("click", () => applyLanguage(button.dataset.lang)));

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    updateView();
  });
});

function openImage() {
  dialogImage.src = image.src;
  dialogImage.alt = image.alt;
  document.querySelector("#dialog-label").textContent = copy[language][currentView + "Label"];
  dialog.showModal();
}
document.querySelector(".screen-button").addEventListener("click", openImage);
document.querySelector(".close-dialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
