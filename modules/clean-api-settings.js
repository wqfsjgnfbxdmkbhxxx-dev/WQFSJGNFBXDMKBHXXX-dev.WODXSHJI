// ========== 整洁 API 设置 - 原页面内 Tab 布局 ==========
// 保留 #api-settings-screen 及其所有真实控件，仅按显式分类切换可见分组。

(function() {
  'use strict';

  const CATEGORY_ORDER = ['api', 'ai', 'service', 'notify', 'system', 'data'];
  const CATEGORY_LABELS = {
    'zh-CN': {
      api: 'API',
      ai: 'AI行为',
      service: '服务',
      notify: '通知',
      system: '系统',
      data: '数据'
    },
    en: {
      api: 'API',
      ai: 'AI Behavior',
      service: 'Services',
      notify: 'Notifications',
      system: 'System',
      data: 'Data'
    }
  };

  let activeCategory = 'api';
  let tabBarEl = null;
  const scrollPositions = Object.create(null);

  function getScreen() {
    return document.getElementById('api-settings-screen');
  }

  function getContainer() {
    const screen = getScreen();
    return screen ? screen.querySelector('.settings-container') : null;
  }

  function getLanguage() {
    const select = document.getElementById('language-select');
    return select && select.value === 'en' ? 'en' : 'zh-CN';
  }

  function annotateGroups() {
    const container = getContainer();
    if (!container) return [];

    let currentCategory = null;
    const uncategorized = [];

    Array.from(container.children).forEach(element => {
      const declaredCategory = element.dataset.apiCategory;
      if (declaredCategory) currentCategory = declaredCategory;
      else if (element.classList.contains('settings-header')) currentCategory = null;

      if (currentCategory && CATEGORY_ORDER.includes(currentCategory)) {
        element.dataset.apiResolvedCategory = currentCategory;
      } else {
        delete element.dataset.apiResolvedCategory;
        uncategorized.push(element);
      }
    });

    if (uncategorized.length && typeof console !== 'undefined') {
      console.warn('[整洁API设置] 存在未分类的顶层设置节点：', uncategorized);
    }
    return uncategorized;
  }

  function ensureTabBar() {
    const screen = getScreen();
    if (!screen) return null;

    if (tabBarEl && tabBarEl.isConnected) return tabBarEl;

    tabBarEl = document.createElement('div');
    tabBarEl.id = 'clean-api-settings-tabs';
    tabBarEl.className = 'cas-tabs';
    tabBarEl.setAttribute('role', 'tablist');
    tabBarEl.setAttribute('aria-label', 'API 设置分类');

    CATEGORY_ORDER.forEach(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cas-tab';
      button.dataset.apiTab = category;
      button.setAttribute('role', 'tab');
      button.addEventListener('click', () => switchTab(category));
      tabBarEl.appendChild(button);
    });

    tabBarEl.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = CATEGORY_ORDER.indexOf(activeCategory);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + CATEGORY_ORDER.length) % CATEGORY_ORDER.length;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % CATEGORY_ORDER.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = CATEGORY_ORDER.length - 1;
      switchTab(CATEGORY_ORDER[nextIndex]);
      const nextTab = tabBarEl.querySelector('.cas-tab.active');
      if (nextTab) nextTab.focus();
    });

    const languageSelect = document.getElementById('language-select');
    if (languageSelect) languageSelect.addEventListener('change', updateTabLabels);

    // 保留原整洁模式“完成后返回首页”的操作链，但只在持久化成功后离开。
    screen.addEventListener('api-settings-save-success', () => {
      if (screen.classList.contains('api-clean-layout')) showScreen('home-screen');
    });

    const header = screen.querySelector('.header');
    if (header) header.insertAdjacentElement('afterend', tabBarEl);
    else screen.prepend(tabBarEl);

    return tabBarEl;
  }

  function updateTabLabels() {
    const labels = CATEGORY_LABELS[getLanguage()];
    if (!tabBarEl) return;
    tabBarEl.setAttribute('aria-label', getLanguage() === 'en' ? 'API setting categories' : 'API 设置分类');
    tabBarEl.querySelectorAll('.cas-tab').forEach(tab => {
      tab.textContent = labels[tab.dataset.apiTab];
    });
  }

  function updateVisibleGroups() {
    const container = getContainer();
    if (!container) return;

    Array.from(container.children).forEach(element => {
      const category = element.dataset.apiResolvedCategory;
      element.hidden = Boolean(category && category !== activeCategory);
    });

    if (!tabBarEl) return;
    tabBarEl.querySelectorAll('.cas-tab').forEach(tab => {
      const selected = tab.dataset.apiTab === activeCategory;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    const selectedTab = tabBarEl.querySelector('.cas-tab.active');
    if (selectedTab) selectedTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function switchTab(category) {
    if (!CATEGORY_ORDER.includes(category) || category === activeCategory) return;
    const container = getContainer();
    if (!container) return;

    scrollPositions[activeCategory] = container.scrollTop;
    activeCategory = category;
    updateVisibleGroups();
    container.scrollTop = scrollPositions[activeCategory] || 0;
  }

  function applyCleanApiSettingsLayout(enabled) {
    const screen = getScreen();
    const container = getContainer();
    if (!screen || !container) return;

    annotateGroups();
    ensureTabBar();
    updateTabLabels();

    const shouldEnable = enabled === undefined
      ? Boolean(state.globalSettings.cleanApiSettings)
      : Boolean(enabled);

    screen.classList.toggle('api-clean-layout', shouldEnable);
    tabBarEl.hidden = !shouldEnable;

    if (shouldEnable) {
      updateVisibleGroups();
      container.scrollTop = scrollPositions[activeCategory] || 0;
    } else {
      Array.from(container.children).forEach(element => {
        element.hidden = false;
      });
    }
  }

  function openCleanApiSettings() {
    applyCleanApiSettingsLayout(true);
  }

  function closeCleanApiSettings() {
    applyCleanApiSettingsLayout(false);
    showScreen('home-screen');
  }

  window.applyCleanApiSettingsLayout = applyCleanApiSettingsLayout;
  window.openCleanApiSettings = openCleanApiSettings;
  window.closeCleanApiSettings = closeCleanApiSettings;
})();
