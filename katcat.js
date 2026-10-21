const KATCAT_VERSION = "1.0.0";
const previewSources = {
  zh: {
    light: "./assets/katcat-app-light.png",
    dark: "./assets/katcat-app-dark.png",
  },
  en: {
    light: "./assets/katcat-app-light-en.png?v=20261022-2",
    dark: "./assets/katcat-app-dark-en.png",
  },
};

const translations = {
  zh: {
    metaTitle: "Katcat.AI - 超级个人助理 | 数豆科技",
    metaDescription: "Katcat.AI 是您的超级个人助理，陪您探索想法、推进任务，把想做的事一步步做成。",
    brandAria: "返回数豆科技官网",
    languageAria: "切换语言",
    backHome: "返回官网",
    tagline: "您的超级个人助理",
    description: "无论是一个天马行空的想法，还是一件想做成的事，都可以交给我一起探索、推进。",
    downloadReady: "下载 Windows 版",
    downloadVersion: `版本 ${KATCAT_VERSION}`,
    releaseReady: "官方下载已开放",
    requirementsAria: "系统要求",
    requirementArch: "64 位系统",
    requirementLanguage: "简体中文",
    previewRegionAria: "Katcat.AI 系统界面",
    themeAria: "界面主题",
    lightMode: "浅色",
    darkMode: "深色",
    previewAltLight: "Katcat.AI Windows 桌面端浅色界面",
    previewAltDark: "Katcat.AI Windows 桌面端深色界面",
    copyright: "© 2026 瑞华云数豆科技（苏州）有限公司. All rights reserved.",
    legalAria: "法律信息",
    privacy: "隐私政策",
    terms: "服务条款",
  },
  en: {
    metaTitle: "Katcat.AI - Your Super Personal Assistant | SUDO Technology",
    metaDescription: "Katcat.AI is your super personal assistant for exploring ideas and moving meaningful work forward.",
    brandAria: "Back to the SUDO Technology website",
    languageAria: "Switch language",
    backHome: "Back to site",
    tagline: "Your Super Personal Assistant",
    description: "Whether it starts as a wild idea or something you want to make real, bring it to me and we will explore it and move it forward together.",
    downloadReady: "Download for Windows",
    downloadVersion: `Version ${KATCAT_VERSION}`,
    releaseReady: "Official download available",
    requirementsAria: "System requirements",
    requirementArch: "64-bit system",
    requirementLanguage: "Simplified Chinese",
    previewRegionAria: "Katcat.AI product interface",
    themeAria: "Interface theme",
    lightMode: "Light",
    darkMode: "Dark",
    previewAltLight: "Katcat.AI Windows desktop in light mode",
    previewAltDark: "Katcat.AI Windows desktop in dark mode",
    copyright: "© 2026 Ruihua Cloud SUDO Technology (Suzhou) Co., Ltd. All rights reserved.",
    legalAria: "Legal information",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
  },
};

const languageOptions = [...document.querySelectorAll("[data-lang-option]")];
const themeOptions = [...document.querySelectorAll("[data-theme-option]")];
const previewImage = document.querySelector("#katcat-preview");
const metaDescription = document.querySelector('meta[name="description"]');
const savedLanguage = localStorage.getItem("katcatLanguagePreference");
const savedTheme = localStorage.getItem("katcatThemePreference");
let currentLanguage = savedLanguage === "zh" || savedLanguage === "en"
  ? savedLanguage
  : "en";
let currentTheme = savedTheme === "dark" ? "dark" : "light";

function applyLanguage(language) {
  currentLanguage = language === "en" ? "en" : "zh";
  localStorage.setItem("katcatLanguagePreference", currentLanguage);
  const dictionary = translations[currentLanguage];

  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.title = dictionary.metaTitle;
  metaDescription.setAttribute("content", dictionary.metaDescription);

  document.querySelectorAll("[data-i18n]").forEach(element => {
    const value = dictionary[element.dataset.i18n];
    if (value) element.textContent = value;
  });

  document.querySelectorAll("[data-i18n-aria]").forEach(element => {
    const value = dictionary[element.dataset.i18nAria];
    if (value) element.setAttribute("aria-label", value);
  });

  languageOptions.forEach(option => {
    const active = option.dataset.langOption === currentLanguage;
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-pressed", String(active));
  });

  updatePreview();
}

function updatePreview() {
  const sources = previewSources[currentLanguage];
  const theme = sources[currentTheme] ? currentTheme : "light";
  previewImage.src = sources[theme];
  const key = theme === "dark" ? "previewAltDark" : "previewAltLight";
  previewImage.alt = translations[currentLanguage][key];
  themeOptions.forEach(option => {
    const active = option.dataset.themeOption === theme;
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-pressed", String(active));
  });
}

function applyTheme(theme) {
  currentTheme = theme === "dark" ? "dark" : "light";
  localStorage.setItem("katcatThemePreference", currentTheme);
  updatePreview();
}

languageOptions.forEach(option => {
  option.addEventListener("click", () => applyLanguage(option.dataset.langOption));
});

themeOptions.forEach(option => {
  option.addEventListener("click", () => applyTheme(option.dataset.themeOption));
});

applyLanguage(currentLanguage);
applyTheme(currentTheme);
