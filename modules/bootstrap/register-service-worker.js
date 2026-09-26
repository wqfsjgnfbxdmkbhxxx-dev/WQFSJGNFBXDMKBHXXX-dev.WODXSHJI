(function registerEPhoneServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // 检测是否处于本地开发/预览环境（localhost, 127.0.0.1, 局域网IP, 或本地端口）
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname) ||
                  location.hostname.startsWith('192.168.') ||
                  location.hostname.startsWith('10.') ||
                  location.hostname.startsWith('172.') ||
                  location.protocol === 'file:' ||
                  location.port !== '';

  if (isLocal) {
    // 本地开发模式：彻底注销 Service Worker 并清空缓存，确保每次改动刷新立即可见
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then(names => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
    console.log('[Dev] 本地开发环境：已禁用 Service Worker 并清除缓存，刷新即可加载最新文件');
    return;
  }

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(registration => {
      console.log('ServiceWorker 注册成功，作用域为:', registration.scope);
    })
    .catch(error => {
      console.error('ServiceWorker 注册失败:', error);
    });
})();
