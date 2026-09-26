  // ========== 从 script.js 迁移：generateFilenameForNai, downloadNaiImage ==========
  function generateFilenameForNai(prompt) {
    let cleanTitle = (prompt || 'NAI_Image')
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 30);

    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .split('.')[0];

    return `${cleanTitle}_${timestamp}.png`;
  }

  function downloadNaiImage(imageSrc, prompt) {
    try {
      const filename = generateFilenameForNai(prompt);
      const link = document.createElement('a');
      link.href = imageSrc;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);

      showDownloadToast('📥 图片下载中...');
    } catch (error) {
      console.error('❌ [NAI下载] 下载失败:', error);
      showDownloadToast('下载失败，请重试', 'error');
    }
  }

  window.generateFilenameForNai = generateFilenameForNai;
  window.downloadNaiImage = downloadNaiImage;

