(() => {
  const copyNodes = [...document.querySelectorAll('[data-guide-copy]')];
  const chinese = {
    teamFooter: '小兢会计 Team', company: '数豆科技', footerNote: '用 AI 重新定义财务。',
    startGuide: '开始阅读', overviewKicker: '00 / 认识你的团队', overviewTitle: '一支团队，一起做财务。',
    skip: '跳转到使用指南', guideLabel: '使用指南', back: '返回产品页', contents: '本页目录',
    navOverview: '认识你的团队', navSetup: '连接模型', navBots: '创建 Bot', navRoles: '设置职责',
    navGroups: '组建群聊', navWork: '开始协作', navControl: '掌握节奏', chapters: '章节',
    sidebarNote: '分工清楚，协作有序。', introKicker: '小兢会计 TEAM · 使用指南', titleGuide: '使用指南',
    introTitle: '从第一个 Bot，到一支协作的财务团队。',
    introDescription: '让不同的 Bot 分别负责票据整理、账务处理和财务复核。可以单独交办，也可以建群协作，由你确认目标、跟进进度、验收结果。',
    homeLabel: '你的 AI 财务团队', light: '浅色', dark: '深色',
    homeCaption: '左侧选择主 Bot、普通 Bot 或群聊；中间对话，右侧查看与调整设置。',
    mainBot: '主 Bot · 小兢会计', mainBotText: '告诉它你需要哪些成员，它可以帮助创建 Bot、配置职责并组建群聊。',
    members: '普通 Bot', membersText: '每个 Bot 有独立的职责和私聊。整理一张票据，也可以直接交给它。',
    groups: '群聊协作', groupsText: '把普通 Bot 加入群聊，按分工处理同一项任务；可选一位群负责人统筹。',
    setupKicker: '01 / 连接模型', setupTitle: '先连接模型，再开始工作。',
    install: '安装小兢会计团队版。', installText: '前往', downloadPage: '产品页', installEnd: '获取 Windows x64 安装包，安装并打开应用。',
    connect: '配置模型。', connectText: '按照首次启动引导，或打开「设置 → 模型」，添加模型服务商和 API Key，选择全局基础模型。',
    check: '确认可以对话。', checkText: '选择左侧主 Bot「小兢会计」，发送一条简短消息。收到回复后，就可以创建你的财务团队。',
    keyTitle: '模型服务与 API Key',
    keyText: 'API 使用费用由模型服务商收取。请妥善保管 API Key，反馈问题时不要将它包含在截图中。',
    botsKicker: '02 / 创建 BOT', botsTitle: '先请一位新同事加入。',
    botsText: '点击左侧「创建新 Bot」，填写名称，选择豆子头像和颜色，再点击「创建」。也可以直接告诉主 Bot 要创建哪些成员。',
    createLabel: '创建 Bot', createCaption: '创建后自动打开新 Bot 的聊天首页。默认排在「未分组」最上方，列表自动滚动，让它清晰可见。',
    promptIntro: '一次创建团队并建群，可以这样对主 Bot 说：',
    examplePrompt: '帮我创建票据整理、账务处理、财务复核三个 Bot，分别设置清楚职责，再组成「财务团队」群聊，由财务复核负责统筹。',
    rolesKicker: '03 / 设置职责', rolesTitle: '把每位成员的工作交代清楚。',
    rolesText: '选择一个普通 Bot，打开右侧「Bot 设置」。填写职责说明，按需选择模型并保存；也可以在私聊中安排具体任务。',
    instructions: '职责说明', instructionsText: '写清负责的环节、使用的资料、交付的内容和检查标准。例如：整理票据信息，输出明细表，并单列缺失或存疑项目。',
    model: '模型', modelText: '跟随全局基础模型，或为这个 Bot 单独指定模型。',
    permissions: '工作文件夹与权限', permissionsText: '查看 Bot 的固定工作文件夹，按任务设置操作权限。私聊与各群聊的成员权限分别设置。',
    memory: '记忆', memoryText: '为 Bot 或群聊保存常用背景；需要团队共用的内容，可明确分享至团队记忆。',
    groupsKicker: '04 / 组建群聊', groupsTitle: '把分工串成一条工作流程。',
    groupText: '点击左侧「群聊」旁的 +，输入群名、勾选普通 Bot，可指定一名「群负责人」统筹，再创建群聊。群内职责留空时沿用 Bot 自身职责，也可单独填写。',
    groupLabel: '群设置 · 协作规则与权限', groupCaption: '群设置局部：调整每轮协作次数、交接记录显示与成员权限，仅影响当前群聊。',
    groupNoteTitle: '分组整理列表，群聊开展协作。',
    groupNote: '分组名后的括号表示 Bot 与群聊的总数，每个群聊计为 1 个；群名后的数字是群成员数。主 Bot 用于创建和配置，不作为普通群成员。建群后，发送目标才会开始工作。',
    workKicker: '05 / 开始协作', workTitle: '给团队一个清楚的任务。',
    workText: '在群聊中说明目标、提供材料，并约定交付格式。成员使用群工作文件夹共享资料，群负责人按分工协调推进。',
    taskPrompt: '根据我提供的本月票据，票据整理 Bot 先输出明细并列出缺失资料；账务处理 Bot 根据确认后的资料给出分录建议；财务复核 Bot 检查金额、依据和待确认事项，最后汇总交付给我验收。',
    chatLabel: '一句话，创建团队并建群', chatCaption: '主 Bot 创建团队后的实际结果：岗位、职责、成员和负责人一并确认。',
    reviewText: '通过成员名称和交接记录查看进展。打开交付文件，核对明细、依据与待确认事项，再决定是否补充资料或进入下一步。成员任务显示「已完成」后，仍需由你验收成果。',
    controlKicker: '06 / 掌握节奏', controlTitle: '需要继续、调整，还是停一下？',
    followup: '补充消息', followupText: '普通消息加入队列，当前任务继续执行；暂停期间发送的消息会等待恢复后处理。',
    pause: '暂停 / 继续', pauseText: '「暂停」停止后续接话，当前成员先完成任务。显示「已暂停接话」时，查看下方原因，再点击「继续」；达到本轮协作次数上限也会暂停。',
    interrupt: '打断并调整', interruptText: '输入新的安排，选择「打断并调整」，中断当前任务并按新指令开始新一轮。',
    stop: '停止', stopText: '结束本轮协作，已保存的结果保留，已完成的操作不会撤销。之后发送新指令可开始新一轮。',
    faqModel: 'Bot 没有回复，应该检查什么？',
    faqModelText: '先查看是否等待审批、确认或已暂停，再检查「设置 → 模型」中的服务商、API Key 和所选模型，以及网络连接与服务商余额。',
    faqRecords: '可以只看对话，不看交接记录吗？', faqRecordsText: '可以。在群设置中关闭「显示交接记录与状态」。协作照常进行，交接记录与已交付的文件卡片仍会保留。',
    faqHelp: '如何反馈问题？', faqHelpText: '请提供应用版本、复现步骤和去除隐私信息的截图。', issueLink: '反馈问题',
    finishKicker: '现在，开始你的第一项任务', finishTitle: '分工交给团队，关键判断由你把关。', fit: '适应窗口',
  };
  let theme = 'light';
  const homeImage = document.querySelector('#home-image');
  const dialog = document.querySelector('#guide-image-dialog');
  const viewerImage = document.querySelector('#viewer-image');
  const viewerBody = document.querySelector('#viewer-body');
  const viewerTitle = document.querySelector('#viewer-title');
  const closeButton = document.querySelector('#viewer-close');
  let opener;

  function renderHome() {
    homeImage.src = `./assets/xiaojing-team-home-${theme}-20261028.png`;
    homeImage.alt = `小兢会计团队版主界面，${theme === 'light' ? '浅色' : '深色'}主题`;
    document.querySelectorAll('[data-guide-theme]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.guideTheme === theme));
    });
  }

  function applyCopy() {
    document.documentElement.lang = 'zh-CN';
    document.title = '小兢会计团队版 · 使用指南';
    document.querySelector('meta[name="description"]').content = '小兢会计团队版使用指南：连接模型、创建与设置 Bot、组建财务团队群聊，从票据整理到财务复核，有序开展 AI 协作。';
    copyNodes.forEach(node => { node.textContent = chinese[node.dataset.guideCopy]; });
    document.querySelector('.theme-switcher').setAttribute('aria-label', '截图主题');
    document.querySelector('#chapter-nav').setAttribute('aria-label', '指南目录');
    document.querySelector('.site-footer nav').setAttribute('aria-label', '相关网站');
    document.querySelector('.back-link').setAttribute('aria-label', chinese.back);
    document.querySelector('.back-link').title = chinese.back;
    dialog.setAttribute('aria-label', '截图查看器');
    closeButton.title = '关闭截图';
    closeButton.setAttribute('aria-label', closeButton.title);
    document.querySelectorAll('[data-enlarge]').forEach(button => {
      button.title = '放大查看截图';
      button.setAttribute('aria-label', button.title);
    });
    const imageAlts = {
      'create-image': '小兢会计团队版创建 Bot，填写名称并选择豆子头像与颜色',
      'group-image': '小兢会计群聊设置局部：协作规则与成员权限',
      'chat-image': '小兢会计主 Bot 创建财务团队后的结果，展示岗位、职责、群成员与负责人',
    };
    Object.entries(imageAlts).forEach(([id, alt]) => { document.getElementById(id).alt = alt; });
    renderHome();
  }

  function setZoom(actual) {
    viewerBody.dataset.actual = String(actual);
    document.querySelector('#zoom-fit').setAttribute('aria-pressed', String(!actual));
    document.querySelector('#zoom-actual').setAttribute('aria-pressed', String(actual));
    viewerBody.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-enlarge]').forEach(button => {
    button.addEventListener('click', () => {
      opener = button;
      const source = document.getElementById(button.dataset.enlarge);
      viewerImage.src = source.src;
      viewerImage.alt = source.alt;
      viewerTitle.textContent = button.closest('figure').querySelector('.figure-label').textContent;
      setZoom(false);
      dialog.showModal();
      closeButton.focus();
    });
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => { viewerImage.removeAttribute('src'); opener?.focus({ preventScroll: true }); });
  document.querySelector('#zoom-fit').addEventListener('click', () => setZoom(false));
  document.querySelector('#zoom-actual').addEventListener('click', () => setZoom(true));
  document.querySelectorAll('[data-guide-theme]').forEach(button => {
    button.addEventListener('click', () => { theme = button.dataset.guideTheme; renderHome(); });
  });
  const chapters = [...document.querySelectorAll('.guide-section')];
  const chapterLinks = [...document.querySelectorAll('#chapter-nav a')];
  const chapterSelect = document.querySelector('#chapter-select');
  function updateChapter() {
    const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + 16;
    const current = chapters.filter(section => section.getBoundingClientRect().top <= offset).at(-1) || chapters[0];
    chapterLinks.forEach(link => {
      if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    chapterSelect.value = current.id;
  }
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => { updateChapter(); scrollPending = false; });
  }, { passive: true });
  window.addEventListener('resize', updateChapter);
  window.addEventListener('load', updateChapter);
  chapterSelect.addEventListener('change', () => {
    const id = chapterSelect.value;
    if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    document.getElementById(id).scrollIntoView();
  });
  applyCopy();
  updateChapter();
})();
