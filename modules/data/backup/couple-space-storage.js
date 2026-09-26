// ============================================================
// backup-import-export.js — 备份导入导出 + 数据分布统计
// 从 script.js 拆分（原始行范围：6093~6974 + 54517~55595）
// ============================================================

  // ============================================================
  // 情侣空间 localStorage 数据备份和恢复辅助函数
  // ============================================================
  
  /**
   * 导出 localStorage 中的情侣空间相关数据
   * @returns {Object} 包含所有情侣空间相关的 localStorage 数据
   */
  function exportCoupleSpaceLocalStorage() {
    const localStorageData = {};
    
    // 需要备份的情侣空间相关键前缀
    const coupleSpacePrefixes = [
      'couple',           // 所有以 couple 开头的键
    ];
    
    // 遍历所有 localStorage 键
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      
      // 检查是否匹配情侣空间相关的键
      const shouldBackup = coupleSpacePrefixes.some(prefix => key.startsWith(prefix));
      
      if (shouldBackup) {
        try {
          localStorageData[key] = localStorage.getItem(key);
        } catch (e) {
          console.warn(`无法备份 localStorage 键: ${key}`, e);
        }
      }
    }
    
    console.log(`已备份 ${Object.keys(localStorageData).length} 个情侣空间相关的 localStorage 键`);
    return localStorageData;
  }
  
  /**
   * 清理 localStorage 中的情侣空间相关数据
   */
  function clearCoupleSpaceLocalStorage() {
    const keysToRemove = [];
    
    // 收集所有需要删除的键
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('couple')) {
        keysToRemove.push(key);
      }
    }
    
    // 删除收集到的键
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn(`无法删除 localStorage 键: ${key}`, e);
      }
    });
    
    console.log(`已清理 ${keysToRemove.length} 个情侣空间相关的 localStorage 键`);
  }
  
  /**
   * 恢复 localStorage 中的情侣空间相关数据
   * @param {Object} localStorageData - 要恢复的 localStorage 数据
   */
  function restoreCoupleSpaceLocalStorage(localStorageData) {
    if (!localStorageData || typeof localStorageData !== 'object') {
      console.log('备份中没有 localStorage 数据，跳过恢复');
      return;
    }
    
    let restoredCount = 0;
    for (const key in localStorageData) {
      try {
        localStorage.setItem(key, localStorageData[key]);
        restoredCount++;
      } catch (e) {
        console.warn(`无法恢复 localStorage 键: ${key}`, e);
      }
    }
    
    console.log(`已恢复 ${restoredCount} 个情侣空间相关的 localStorage 键`);
  }

