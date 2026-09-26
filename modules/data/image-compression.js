  // ========== 图片压缩辅助函数 ==========

  function calculateSkippedStats(obj) {
    let found = 0;
    let size = 0;
    if (typeof obj !== 'object' || obj === null) return {
      found,
      size
    };

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'string' && value.startsWith('data:image')) {
          found++;
          size += value.length;
        } else if (typeof value === 'object' && value !== null) {
          const nestedStats = calculateSkippedStats(value);
          found += nestedStats.found;
          size += nestedStats.size;
        }
      }
    }
    return {
      found,
      size
    };
  }

  async function traverseAndCompress(obj, stats, parentKey = '') {

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {


        if (parentKey === '' && (key === 'widgetData' || key === 'appIcons' || key === 'cphoneAppIcons' || key === 'myphoneAppIcons')) {
          console.log(`跳过压缩整个对象: ${key}`);
          const {
            found,
            size
          } = calculateSkippedStats(obj[key]);
          stats.found += found;
          stats.skipped += found;
          stats.originalSize += size;
          stats.newSize += size;
          continue;
        }

        const value = obj[key];


        if (typeof value === 'string' && value.startsWith('data:image')) {


          const isExcluded =

            (parentKey === '' && (key === 'wallpaper' || key === 'cphoneWallpaper' || key === 'globalChatBackground')) ||

            (parentKey === 'settings' && key === 'background');

          if (isExcluded) {
            console.log(`跳过压缩背景图片: ${parentKey || 'global'}.${key}`);
            stats.found++;
            stats.skipped++;
            stats.originalSize += value.length;
            stats.newSize += value.length;
            continue;
          }

          stats.found++;
          stats.originalSize += value.length;

          const compressedBase64 = await compressImage(value);
          if (compressedBase64 && compressedBase64 !== value) {
            obj[key] = compressedBase64;
            stats.compressed++;
            stats.newSize += compressedBase64.length;
          } else {
            stats.skipped++;
            stats.newSize += value.length;
          }


        } else if (typeof value === 'object' && value !== null) {

          await traverseAndCompress(value, stats, key);
        }
      }
    }
  }


  async function compressImage(base64Str) {

    if (!base64Str.startsWith('data:image')) {
      return base64Str;
    }


    const MAX_BASE64_SIZE_TO_SKIP = 500000;
    if (base64Str.startsWith('data:image/jpeg') && base64Str.length < MAX_BASE64_SIZE_TO_SKIP) {
      console.log('跳过压缩：图片已经是小体积JPEG。');
      return base64Str;
    }

    try {

      const imageBlob = await (await fetch(base64Str)).blob();


      const SIZE_THRESHOLD_BYTES = 0.3 * 1024 * 1024;
      if (imageBlob.size < SIZE_THRESHOLD_BYTES) {
        console.log(`跳过压缩：图片大小 (${(imageBlob.size / 1024 / 1024).toFixed(2)} MB) 已小于 0.3 MB。`);
        return base64Str;
      }



      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        initialQuality: 0.5,
        fileType: 'image/jpeg'
      };



      console.log(`开始压缩图片，原始大小: ${(imageBlob.size / 1024 / 1024).toFixed(2)} MB`);
      const compressedFile = await imageCompression(imageBlob, options);
      console.log(`压缩完成，新的大小: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);


      if (compressedFile.size > imageBlob.size) {
        console.warn("压缩后的图片体积增大，已保留原始图片。");
        return base64Str;
      }


      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(compressedFile);
      });

    } catch (error) {
      console.error("使用 browser-image-compression 压缩失败:", error);
      return base64Str;
    }
  }


