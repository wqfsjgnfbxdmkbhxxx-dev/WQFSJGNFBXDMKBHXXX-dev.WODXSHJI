  // ========== 更新检查 ==========

  function compareVersions(v1, v2) {

    if (!v1 || !v2 || typeof v1 !== 'string' || typeof v2 !== 'string') {
      return 0;
    }

    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
      const p1 = parts1[i] || 0; // 如果部分不存在，则视为 0
      const p2 = parts2[i] || 0;

      if (p1 > p2) {
        return 1;
      }
      if (p1 < p2) {
        return -1;
      }
    }
    return 0;
  }


  async function checkForUpdates() {



    const CURRENT_APP_VERSION = "1.0";

    try {

      const response = await fetch('update-notice.html?_=' + Date.now());
      if (!response.ok) {
        console.warn('获取更新通知文件失败。');
        return;
      }
      const noticeHtml = await response.text();


      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = noticeHtml;
      const noticeContent = tempDiv.querySelector('[data-version]');

      if (!noticeContent) {
        console.error('更新通知文件中缺少 data-version 属性。');
        return;
      }

      const notificationVersion = noticeContent.dataset.version;


      const dismissedVersion = localStorage.getItem('dismissedUpdateVersion');



      if (!dismissedVersion || compareVersions(notificationVersion, dismissedVersion) > 0) {
        console.log(`发现新版本通知: ${notificationVersion} (已忽略版本: ${dismissedVersion || '无'})`);
        showUpdateNotice(notificationVersion, noticeContent.innerHTML);
      } else {
        console.log(`当前通知版本 (${notificationVersion}) 已被用户忽略或为旧版本，无需显示。`);
      }

    } catch (error) {
      console.error('检查更新时出错:', error);
    }
  }


  function showUpdateNotice(version, contentHtml) {
    const modal = document.getElementById('update-notice-modal');
    const body = document.getElementById('update-notice-body');
    const confirmBtn = document.getElementById('update-notice-confirm-btn');
    const dismissBtn = document.getElementById('update-notice-dismiss-btn');

    body.innerHTML = contentHtml;


    confirmBtn.disabled = true;
    dismissBtn.disabled = true;


    const confirmOriginalText = confirmBtn.textContent;
    let countdown = 10;
    confirmBtn.textContent = `${confirmOriginalText} (${countdown}s)`;


    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {

        confirmBtn.textContent = `${confirmOriginalText} (${countdown}s)`;
      } else {

        clearInterval(countdownInterval);
        confirmBtn.disabled = false;
        dismissBtn.disabled = false;
        confirmBtn.textContent = confirmOriginalText;
      }
    }, 1000);


    confirmBtn.onclick = () => {
      clearInterval(countdownInterval);
      modal.classList.remove('visible');
      confirmBtn.textContent = confirmOriginalText;
    };

    dismissBtn.onclick = () => {
      clearInterval(countdownInterval);
      localStorage.setItem('dismissedUpdateVersion', version);
      modal.classList.remove('visible');
      console.log(`用户已忽略版本: ${version}`);
      confirmBtn.textContent = confirmOriginalText;
    };



    modal.classList.add('visible');
  }


