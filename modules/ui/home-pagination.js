// ============================================================
// 主屏翻页 (原 script.js 第 47597~47705 行)
// ============================================================

  let currentPage = 0;
  const totalPages = 4;


  function setupHomeScreenPagination() {
    const pagesContainer = document.getElementById('home-screen-pages-container');
    const pages = document.getElementById('home-screen-pages');
    const dots = document.querySelectorAll('.pagination-dot');

    // ★ 先移除旧的监听器，防止叠加
    if (pagesContainer._onDragStart) {
      pagesContainer.removeEventListener('mousedown', pagesContainer._onDragStart);
      pagesContainer.removeEventListener('mousemove', pagesContainer._onDragMove);
      pagesContainer.removeEventListener('mouseup', pagesContainer._onDragEnd);
      pagesContainer.removeEventListener('mouseleave', pagesContainer._onDragEnd);
      pagesContainer.removeEventListener('touchstart', pagesContainer._onDragStart);
      pagesContainer.removeEventListener('touchmove', pagesContainer._onDragMove);
      pagesContainer.removeEventListener('touchend', pagesContainer._onDragEnd);
    }

    let startX = 0,
      startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isClick = true;

    const updatePagination = () => {
      pages.style.transform = `translateX(-${currentPage * (100 / totalPages)}%)`;
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentPage);
      });
    };

    const onDragStart = (e) => {
      isDragging = true;
      isClick = true;
      startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      startY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      pages.style.transition = 'none';
    };

    const onDragMove = (e) => {
      if (!isDragging) return;

      const currentY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      let diffX = currentX - startX;
      const diffY = currentY - startY;


      if (isClick && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
        isClick = false;
      }


      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.cancelable) e.preventDefault();

        // 限制滑动距离，确保不会一次滑动超过一页
        const maxSwipeDistance = pagesContainer.offsetWidth * 0.8;

        // 限制向左滑动（下一页）
        if (diffX < 0 && currentPage >= totalPages - 1) {
          diffX = Math.max(diffX, -maxSwipeDistance * 0.3); // 最后一页时限制滑动
        } else if (diffX < 0) {
          diffX = Math.max(diffX, -maxSwipeDistance); // 限制最大向左滑动距离
        }

        // 限制向右滑动（上一页）
        if (diffX > 0 && currentPage <= 0) {
          diffX = Math.min(diffX, maxSwipeDistance * 0.3); // 第一页时限制滑动
        } else if (diffX > 0) {
          diffX = Math.min(diffX, maxSwipeDistance); // 限制最大向右滑动距离
        }

        pages.style.transform = `translateX(calc(-${currentPage * (100 / totalPages)}% + ${diffX}px))`;
      }
    };

    const onDragEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      pages.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';


      if (isClick) {
        updatePagination();

        return;
      }


      const diffX = currentX - startX;
      const swipeThreshold = pagesContainer.offsetWidth / 3; // 提高阈值到1/3，确保翻页更明确

      // 只允许一次翻一页
      if (Math.abs(diffX) > swipeThreshold) {
        if (diffX > 0 && currentPage > 0) {
          // 向右滑动，返回上一页
          currentPage--;
        } else if (diffX < 0 && currentPage < totalPages - 1) {
          // 向左滑动，前往下一页
          currentPage++;
        }
      }
      updatePagination();
    };

    // ★ 存到元素属性上，方便下次移除
    pagesContainer._onDragStart = onDragStart;
    pagesContainer._onDragMove = onDragMove;
    pagesContainer._onDragEnd = onDragEnd;

    pagesContainer.addEventListener('mousedown', onDragStart);
    pagesContainer.addEventListener('mousemove', onDragMove);
    pagesContainer.addEventListener('mouseup', onDragEnd);
    pagesContainer.addEventListener('mouseleave', onDragEnd);


    pagesContainer.addEventListener('touchstart', onDragStart, {
      passive: false
    });
    pagesContainer.addEventListener('touchmove', onDragMove, {
      passive: false
    });
    pagesContainer.addEventListener('touchend', onDragEnd);
  }


