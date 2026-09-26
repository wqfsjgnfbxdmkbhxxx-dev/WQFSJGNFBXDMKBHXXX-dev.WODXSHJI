// 固定索引并发装配思路参考 wq70/xinyuan330 PR #1，重写为限流、重试且不改变片段顺序。
// https://github.com/wq70/xinyuan330/pull/1
(function loadDocumentFragments() {
  const fragmentScripts = window.__EPHONE_HTML_FRAGMENT_SCRIPTS;
  const htmlParts = new Array(Array.isArray(fragmentScripts) ? fragmentScripts.length : 0);
  // 兼容仍在 Service Worker 旧缓存中的 push(...) 片段，并按当前脚本路径归位。
  htmlParts.push = function registerLegacyFragment(content) {
    const currentSource = document.currentScript?.getAttribute?.('src') || document.currentScript?.src || '';
    let fragmentIndex = fragmentScripts.findIndex(fragmentPath => currentSource.endsWith(fragmentPath));
    if (fragmentIndex < 0) fragmentIndex = htmlParts.findIndex(part => typeof part !== 'string');
    if (fragmentIndex >= 0) htmlParts[fragmentIndex] = content;
    return htmlParts.length;
  };
  window.__EPHONE_HTML_PARTS = htmlParts;
  const concurrency = 4;
  const maxAttempts = 2;
  let nextFragmentIndex = 0;
  let completedFragments = 0;
  let failed = false;

  const showFailure = error => {
    if (failed) return;
    failed = true;
    console.error('[DocumentLoader] 页面片段加载失败:', error);
    document.body.innerHTML = '';
    const message = document.createElement('main');
    message.style.cssText = 'max-width:560px;margin:15vh auto;padding:24px;font-family:sans-serif;line-height:1.6;';
    const title = document.createElement('h1');
    title.textContent = '页面加载失败';
    const detail = document.createElement('p');
    detail.textContent = '无法读取页面片段，请确认项目文件完整后刷新。';
    message.append(title, detail);
    document.body.appendChild(message);
  };

  if (!Array.isArray(fragmentScripts) || fragmentScripts.length === 0) {
    showFailure(new Error('HTML fragment script manifest is missing.'));
    return;
  }

  const finishDocument = () => {
    if (failed || completedFragments !== fragmentScripts.length) return;
    if (htmlParts.some(part => typeof part !== 'string')) {
      showFailure(new Error('One or more HTML fragments did not register their content.'));
      return;
    }
    try { performance.mark('ephone-fragments-ready'); } catch (_) {}
    delete window.__EPHONE_HTML_FRAGMENT_SCRIPTS;
    delete window.__EPHONE_HTML_PARTS;
    document.open('text/html', 'replace');
    document.write(htmlParts.join(''));
    document.close();
  };

  const loadFragment = (fragmentIndex, attempt = 1) => {
    const fragmentPath = fragmentScripts[fragmentIndex];
    const script = document.createElement('script');
    script.src = fragmentPath;
    script.async = true;
    script.onload = () => {
      script.remove();
      if (failed) return;
      if (typeof htmlParts[fragmentIndex] !== 'string') {
        showFailure(new Error(`Fragment ${fragmentPath} did not provide content.`));
        return;
      }
      completedFragments += 1;
      if (completedFragments === fragmentScripts.length) finishDocument();
      else startAvailableFragments();
    };
    script.onerror = () => {
      script.remove();
      if (failed) return;
      if (attempt < maxAttempts) loadFragment(fragmentIndex, attempt + 1);
      else showFailure(new Error(`Unable to load ${fragmentPath}`));
    };
    document.head.appendChild(script);
  };

  function startAvailableFragments() {
    if (failed) return;
    while (nextFragmentIndex < fragmentScripts.length &&
      nextFragmentIndex - completedFragments < concurrency) {
      const fragmentIndex = nextFragmentIndex;
      nextFragmentIndex += 1;
      loadFragment(fragmentIndex);
    }
  }

  try { performance.mark('ephone-fragments-start'); } catch (_) {}
  startAvailableFragments();
})();
