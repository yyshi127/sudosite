const legalLanguageButtons = [...document.querySelectorAll("[data-lang-option]")];

function setLegalLanguage(language) {
  const selected = language === "zh" ? "zh" : "en";
  document.documentElement.lang = selected === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-language]").forEach(element => {
    element.hidden = element.dataset.language !== selected;
  });
  legalLanguageButtons.forEach(button => {
    const active = button.dataset.langOption === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.title = `${document.querySelector(`[data-language="${selected}"] h1`).textContent} - Katcat.AI`;
  localStorage.setItem("katcatLanguagePreference", selected);
}

legalLanguageButtons.forEach(button => {
  button.addEventListener("click", () => setLegalLanguage(button.dataset.langOption));
});
setLegalLanguage(localStorage.getItem("katcatLanguagePreference"));
