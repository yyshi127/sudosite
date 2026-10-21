if (location.hostname === "sudotech.ai" || location.hostname.endsWith(".sudotech.ai")) {
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll([
      'footer [data-i18n="copyright"]',
      'footer [data-i18n="footerCopyright"]',
      '.feedback-footer > span',
      '.legal-filing',
      'footer a[href^="https://beian.miit.gov.cn/"]',
      'footer a[href^="https://beian.mps.gov.cn/"]',
    ].join(",")).forEach(element => element.remove());
  });
}
