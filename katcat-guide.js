const guidePages = { zh: "./katcat-guide.html", en: "./katcat-guide-en.html" };
const pageLanguage = document.documentElement.lang === "en" ? "en" : "zh";

function syncGuideLanguage() {
  const saved = localStorage.getItem("katcatLanguagePreference");
  const language = saved === "zh" ? "zh" : "en";
  if (language !== pageLanguage) location.replace(guidePages[language]);
}

document.querySelectorAll("[data-guide-language]").forEach(button => {
  button.addEventListener("click", () => {
    const language = button.dataset.guideLanguage;
    localStorage.setItem("katcatLanguagePreference", language);
    if (language !== pageLanguage) location.assign(guidePages[language]);
  });
});

syncGuideLanguage();
window.addEventListener("pageshow", syncGuideLanguage);
