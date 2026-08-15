const DOWNLOAD_URL = "./downloads/xiaojing-accounting-0.1.6-windows-x64-setup.exe";

const translations = {
  zh: {
    metaTitle: "小兢会计 - Windows 桌面端下载 | 数豆科技",
    metaDescription: "小兢会计 Windows 桌面端官方下载页面，由数豆科技提供。",
    brandAria: "返回数豆科技官网",
    productName: "小兢会计",
    languageAria: "切换语言",
    backHome: "返回官网",
    tagline: "AI 办公搭子",
    descriptionLine1: "面向财务与日常办公的 AI 桌面助手",
    descriptionLine2: "让资料、任务与智能协作在一个工作空间内完成。",
    harnessStatement: "基于官方 DeepSeek Harness 构建的桌面端，开箱即用",
    downloadReady: "下载 Windows 版",
    downloadPreparing: "Windows 版即将上线",
    releaseReady: "官方下载已开放",
    releasePreparing: "安装包正在准备中",
    requirementsAria: "系统要求",
    requirementWindows: "Windows 10 / 11",
    requirementArch: "64 位系统",
    requirementLanguage: "简体中文",
    previewSrc: "./assets/xiaojing-desktop-preview.png?v=20260815-3",
    previewAlt: "小兢会计 Windows 桌面端界面",
    copyright: "© 2026 瑞华云数豆科技（苏州）有限公司. All rights reserved.",
    legalAria: "法律信息",
    privacy: "隐私政策",
    terms: "服务条款",
  },
  en: {
    metaTitle: "Xiaojing Accounting - Windows Download | SUDO Technology",
    metaDescription: "Official Windows desktop download page for Xiaojing Accounting by SUDO Technology.",
    brandAria: "Back to the SUDO Technology website",
    productName: "Xiaojing Accounting",
    languageAria: "Switch language",
    backHome: "Back to site",
    tagline: "AI Work Companion",
    descriptionLine1: "An AI desktop assistant for finance and everyday work,",
    descriptionLine2: "bringing files, tasks, and intelligent collaboration into one workspace.",
    harnessStatement: "A ready-to-use desktop app built on the official DeepSeek Harness.",
    downloadReady: "Download for Windows",
    downloadPreparing: "Windows version coming soon",
    releaseReady: "Official download available",
    releasePreparing: "The installer is being prepared",
    requirementsAria: "System requirements",
    requirementWindows: "Windows 10 / 11",
    requirementArch: "64-bit system",
    requirementLanguage: "Simplified Chinese",
    previewSrc: "./assets/xiaojing-desktop-preview-en.png?v=20260815-1",
    previewAlt: "Xiaojing Accounting Windows desktop interface",
    copyright: "© 2026 Ruihua Cloud SUDO Technology (Suzhou) Co., Ltd. All rights reserved.",
    legalAria: "Legal information",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
  },
};

const languageOptions = [...document.querySelectorAll("[data-lang-option]")];
const downloadButton = document.querySelector("#windows-download");
const downloadLabel = document.querySelector("[data-download-label]");
const releaseStatus = document.querySelector("[data-release-status]");
const releaseStatusRow = releaseStatus.closest(".release-status");
const metaDescription = document.querySelector('meta[name="description"]');

let currentLanguage = localStorage.getItem("sudoLanguage") === "en" ? "en" : "zh";

function applyText(language) {
  const dictionary = translations[language];

  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = dictionary.metaTitle;
  metaDescription.setAttribute("content", dictionary.metaDescription);

  document.querySelectorAll("[data-i18n]").forEach(element => {
    const key = element.dataset.i18n;
    if (dictionary[key]) element.textContent = dictionary[key];
  });

  document.querySelectorAll("[data-i18n-aria]").forEach(element => {
    const key = element.dataset.i18nAria;
    if (dictionary[key]) element.setAttribute("aria-label", dictionary[key]);
  });

  document.querySelectorAll("[data-i18n-alt]").forEach(element => {
    const key = element.dataset.i18nAlt;
    if (dictionary[key]) element.setAttribute("alt", dictionary[key]);
  });

  document.querySelectorAll("[data-i18n-src]").forEach(element => {
    const key = element.dataset.i18nSrc;
    if (dictionary[key]) element.setAttribute("src", dictionary[key]);
  });

  languageOptions.forEach(option => {
    const isActive = option.dataset.langOption === language;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
  });

  if (DOWNLOAD_URL) {
    downloadButton.href = DOWNLOAD_URL;
    downloadButton.removeAttribute("aria-disabled");
    downloadButton.removeAttribute("tabindex");
    downloadButton.classList.remove("is-preparing");
    releaseStatusRow.classList.add("is-ready");
    downloadLabel.textContent = dictionary.downloadReady;
    releaseStatus.textContent = dictionary.releaseReady;
  } else {
    downloadButton.removeAttribute("href");
    downloadButton.setAttribute("aria-disabled", "true");
    downloadButton.setAttribute("tabindex", "-1");
    downloadButton.classList.add("is-preparing");
    releaseStatusRow.classList.remove("is-ready");
    downloadLabel.textContent = dictionary.downloadPreparing;
    releaseStatus.textContent = dictionary.releasePreparing;
  }
}

function applyLanguage(language) {
  currentLanguage = language === "en" ? "en" : "zh";
  localStorage.setItem("sudoLanguage", currentLanguage);
  applyText(currentLanguage);
}

languageOptions.forEach(option => {
  option.addEventListener("click", () => applyLanguage(option.dataset.langOption));
});

downloadButton.addEventListener("click", event => {
  if (!DOWNLOAD_URL) event.preventDefault();
});

applyText(currentLanguage);
