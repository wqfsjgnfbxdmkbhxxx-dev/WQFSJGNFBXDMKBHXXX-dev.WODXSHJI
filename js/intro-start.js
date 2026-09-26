// ============================================================
// intro-start.js — 启动页切换（无鉴权版）
//
// 仅负责“小蛋启动页 → 主界面”的显示切换，不做任何账号/密码验证：
//   - 不读取/写入 ephone_auth
//   - 不请求任何远程鉴权 API
//   - 不调用 ephoneLogout、不 reload 页面
// 保留原“Tap to Start”点击进入体验。
// ============================================================

(function () {
  'use strict';

  function initIntroStart() {
    const introScreen = document.getElementById('intro-screen');
    const phoneScreen = document.getElementById('phone-screen');
    if (!introScreen || !phoneScreen) return;
    // 防止重复绑定（脚本可能被多次执行时）。
    if (introScreen.dataset.introStartBound === '1') return;
    introScreen.dataset.introStartBound = '1';

    // 初始状态：启动页显示，主界面隐藏。
    introScreen.classList.remove('hidden');
    introScreen.style.display = '';
    phoneScreen.style.display = 'none';

    function enterApp() {
      introScreen.removeEventListener('click', enterApp);
      introScreen.classList.add('hidden');
      // 与原启动逻辑一致：淡出后隐藏 intro、显示主界面。
      setTimeout(function () {
        introScreen.style.display = 'none';
        phoneScreen.style.display = 'block';
      }, 500);
    }

    introScreen.addEventListener('click', enterApp, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIntroStart, { once: true });
  } else {
    initIntroStart();
  }
})();
