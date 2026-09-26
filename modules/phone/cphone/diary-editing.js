  // ========== 从 script.js 迁移：editDiary, handleWriteNewDiaryEntry ==========
  // 注意：这些函数依赖 activeDiaryForViewing, activeCharacterId 等全局变量

  function editDiary() {
    if (!activeDiaryForViewing || !activeCharacterId) return;
    const diary = activeDiaryForViewing;
    const char = state.chats[activeCharacterId];
    if (!char || !char.diary) return;
    const escapedTitle = diary.title.replace(/"/g, '&quot;');
    const escapedContent = diary.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const formHtml = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div><label style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;display:block;">标题</label>
        <input id="edit-diary-title-input" type="text" value="${escapedTitle}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:16px;box-sizing:border-box;"></div>
        <div><label style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;display:block;">内容</label>
        <textarea id="edit-diary-content-input" rows="10" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:15px;box-sizing:border-box;resize:vertical;line-height:1.6;">${escapedContent}</textarea></div>
      </div>`;
    window._modalResolve = null;
    window._modalTitle.textContent = '编辑日记';
    window._modalBody.innerHTML = formHtml;
    const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
    if (modalFooter) {
      modalFooter.style.flexDirection = 'row';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.style.maxHeight = '';
      modalFooter.style.overflowY = '';
      modalFooter.innerHTML = `<button id="custom-modal-cancel">取消</button><button id="custom-modal-confirm" class="confirm-btn">保存</button>`;
    }
    document.getElementById('custom-modal-cancel').onclick = () => hideCustomModal();
    document.getElementById('custom-modal-confirm').onclick = async () => {
      const newTitle = document.getElementById('edit-diary-title-input').value.trim();
      const newContent = document.getElementById('edit-diary-content-input').value;
      if (!newTitle) { await showCustomAlert('提示', '标题不能为空。'); return; }
      const entryIndex = char.diary.findIndex(d => d.id === diary.id);
      if (entryIndex === -1) return;
      char.diary[entryIndex].title = newTitle;
      char.diary[entryIndex].content = newContent;
      await db.chats.put(char);
      activeDiaryForViewing = char.diary[entryIndex];
      document.getElementById('char-diary-detail-title').textContent = newTitle;
      const formattedContent = parseMarkdown(newContent).split('\n').map(p => `<p>${p || '&nbsp;'}</p>`).join('');
      document.getElementById('char-diary-detail-content').innerHTML = formattedContent;
      if (typeof renderCharDiaryList === 'function') renderCharDiaryList();
      hideCustomModal();
      await showCustomAlert('编辑成功', '日记已更新。');
    };
    showCustomModal();
  }

  window.editDiary = editDiary;
  window.handleWriteNewDiaryEntry = typeof handleWriteNewDiaryEntry !== 'undefined' ? handleWriteNewDiaryEntry : function() { console.warn('handleWriteNewDiaryEntry not yet migrated'); };

