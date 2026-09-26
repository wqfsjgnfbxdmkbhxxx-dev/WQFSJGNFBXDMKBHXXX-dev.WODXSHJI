// ========== API 设置界面美化 ==========
// 样式表常驻且严格限定在 #api-settings-screen；启停只切换一个类名，
// 避免全局 MutationObserver 和反复装卸 CSS 造成额外样式计算。

(function() {
  'use strict';

  function applyApiStyleBeautify() {
    const screen = document.getElementById('api-settings-screen');
    if (!screen) return;
    screen.classList.toggle(
      'api-scheme-2',
      Boolean(state.globalSettings.apiStyleBeautify)
    );
  }

  window.applyApiStyleBeautify = applyApiStyleBeautify;
})();
