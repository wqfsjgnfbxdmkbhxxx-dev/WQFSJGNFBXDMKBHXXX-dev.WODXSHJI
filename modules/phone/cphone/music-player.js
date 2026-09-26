  function renderCharMusicScreen() {
    const listEl = document.getElementById('char-music-list');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    const playlist = char.simulatedMusicPlaylist || [];

    if (playlist.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">TA的歌单还是空的，<br>点击右上角刷新按钮生成一些歌曲吧！</p>';
      return;
    }

    playlist.forEach((track, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-music-item';
      itemEl.innerHTML = `
            <img src="${track.cover}" class="music-item-cover">
            <div class="music-item-info">
                <div class="music-item-name">${track.name}</div>
                <div class="music-item-artist">${track.artist}</div>
            </div>
        `;

      itemEl.addEventListener('click', () => playCharSong(index, playlist));
      listEl.appendChild(itemEl);
    });
  }



  let charPlayerState = {
    currentPlaylist: [],
    currentIndex: -1,
    isPlaying: false,
    playMode: 'order',
    lrcUpdateInterval: null,

    parsedLyrics: [],
    currentLyricIndex: -1
  };

  // 参考并改写自 yxlforever/YYY：
  // https://github.com/yxlforever/YYY/commit/ece2d6bec633ced55c89af3871f96c97ebf3aa7e
  // 用途：回收角色手机/我的手机共用播放器产生的本地歌曲 Blob URL。
  // 保留最小化继续播放、恢复播放器、播放模式和全部音乐入口。
  function releaseCharMusicObjectUrl(player) {
    if (!player || !player.dataset.objectUrl) return;
    URL.revokeObjectURL(player.dataset.objectUrl);
    delete player.dataset.objectUrl;
  }
  window.releaseCharMusicObjectUrl = releaseCharMusicObjectUrl;


  function playCharSong(songIndex, playlist) {
    const player = document.getElementById('char-audio-player');
    const modal = document.getElementById('char-music-player-modal');

    if (charPlayerState.lrcUpdateInterval) {
      clearInterval(charPlayerState.lrcUpdateInterval);
      charPlayerState.lrcUpdateInterval = null;
    }
    player.pause();
    releaseCharMusicObjectUrl(player);


    charPlayerState.currentPlaylist = playlist;

    charPlayerState.currentIndex = songIndex;

    const songObject = playlist[songIndex];
    if (!songObject) {
      console.error("playCharSong: 歌曲索引无效或歌单为空。");
      return;
    }

    document.getElementById('char-music-player-title').textContent = songObject.name;
    document.getElementById('char-music-artist').textContent = songObject.artist;
    document.getElementById('char-music-cover').src = songObject.cover;


    charPlayerState.parsedLyrics = parseLRC(songObject.lrcContent || "");
    renderCharLyrics();


    if (songObject.isLocal) {
      const blob = new Blob([songObject.src], {
        type: songObject.fileType || 'audio/mpeg'
      });
      const objectUrl = URL.createObjectURL(blob);
      player.src = objectUrl;
      player.dataset.objectUrl = objectUrl;
    } else {
      player.src = songObject.src;
    }
    player.play().catch(e => console.error("音频播放失败:", e));

    player.onloadedmetadata = () => {
      document.getElementById('char-music-total-time').textContent = formatMusicTime(player.duration);
      charPlayerState.lrcUpdateInterval = setInterval(updateCharMusicProgress, 1000);
    };

    modal.classList.add('visible');
  }


  function minimizeCharMusicPlayer() {
    const modal = document.getElementById('char-music-player-modal');
    modal.classList.remove('visible');

    document.getElementById('char-music-restore-btn').style.display = 'flex';
  }


  function restoreCharMusicPlayer() {
    const modal = document.getElementById('char-music-player-modal');
    modal.classList.add('visible');

    document.getElementById('char-music-restore-btn').style.display = 'none';
  }


  function closeCharMusicPlayer() {
    const modal = document.getElementById('char-music-player-modal');
    const player = document.getElementById('char-audio-player');

    if (charPlayerState.lrcUpdateInterval) {
      clearInterval(charPlayerState.lrcUpdateInterval);
      charPlayerState.lrcUpdateInterval = null;
    }
    player.pause();
    player.onloadedmetadata = null;
    releaseCharMusicObjectUrl(player);
    player.removeAttribute('src');
    try { player.load(); } catch (error) { }

    modal.classList.remove('visible');
    charPlayerState.isPlaying = false;
    document.getElementById('char-vinyl-container').classList.remove('spinning');


    document.getElementById('char-music-restore-btn').style.display = 'none';
  }


  function updateCharMusicProgress() {
    const player = document.getElementById('char-audio-player');
    if (!player.duration) return;

    const currentTime = player.currentTime;
    const duration = player.duration;
    document.getElementById('char-music-progress-fill').style.width = `${(currentTime / duration) * 100}%`;
    document.getElementById('char-music-current-time').textContent = formatMusicTime(currentTime);


    updateCharActiveLyric(currentTime);
  }



  function renderCharLyrics() {
    const lyricsContainer = document.getElementById('char-music-lyrics');
    lyricsContainer.innerHTML = '';
    charPlayerState.currentLyricIndex = -1;


    const scrollWrapper = document.createElement('div');
    scrollWrapper.id = 'char-lyrics-scroll-wrapper';
    scrollWrapper.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    lyricsContainer.appendChild(scrollWrapper);

    if (!charPlayerState.parsedLyrics || charPlayerState.parsedLyrics.length === 0) {
      scrollWrapper.innerHTML = '<p>♪ 暂无歌词 ♪</p>';
      return;
    }
    charPlayerState.parsedLyrics.forEach((line, index) => {
      const p = document.createElement('p');
      p.textContent = line.text;
      p.dataset.index = index;

      p.style.margin = '0';
      p.style.padding = '5px 0';
      p.style.color = '#888';
      p.style.transition = 'all 0.3s';
      scrollWrapper.appendChild(p);
    });
  }

  function updateCharActiveLyric(currentTime) {
    const lyrics = charPlayerState.parsedLyrics;
    if (lyrics.length === 0) return;

    let newLyricIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        newLyricIndex = i;
      } else {
        break;
      }
    }
    if (newLyricIndex === charPlayerState.currentLyricIndex) return;
    charPlayerState.currentLyricIndex = newLyricIndex;


    const wrapper = document.getElementById('char-lyrics-scroll-wrapper');
    if (!wrapper) return;

    const lines = wrapper.querySelectorAll('p');
    lines.forEach(line => {
      line.classList.remove('active');
      line.style.color = '#888';
      line.style.transform = 'scale(1)';
    });

    if (newLyricIndex > -1) {
      const activeLine = wrapper.querySelector(`p[data-index="${newLyricIndex}"]`);
      if (activeLine) {
        activeLine.classList.add('active');
        activeLine.style.color = '#333';
        activeLine.style.fontWeight = 'bold';
        activeLine.style.transform = 'scale(1.1)';

        const containerHeight = document.getElementById('char-music-lyrics').clientHeight;
        const offset = (containerHeight / 2) - activeLine.offsetTop - (activeLine.clientHeight / 2);

        wrapper.style.transform = `translateY(${offset}px)`;
      }
    }
  }



  function playNextCharSong() {
    if (charPlayerState.currentPlaylist.length === 0) return;
    let nextIndex;
    switch (charPlayerState.playMode) {
      case 'random':
        nextIndex = Math.floor(Math.random() * charPlayerState.currentPlaylist.length);
        break;
      case 'single':

        playCharSong(charPlayerState.currentPlaylist[charPlayerState.currentIndex]);
        return;
      case 'order':
      default:
        nextIndex = (charPlayerState.currentIndex + 1) % charPlayerState.currentPlaylist.length;
        break;
    }
    playCharSong(nextIndex, charPlayerState.currentPlaylist);
  }

  function playPrevCharSong() {
    if (charPlayerState.currentPlaylist.length === 0) return;
    const newIndex = (charPlayerState.currentIndex - 1 + charPlayerState.currentPlaylist.length) % charPlayerState.currentPlaylist.length;
    playCharSong(newIndex, charPlayerState.currentPlaylist);
  }

  function changeCharPlayMode() {
    const modes = ['order', 'random', 'single'];
    const currentModeIndex = modes.indexOf(charPlayerState.playMode);
    charPlayerState.playMode = modes[(currentModeIndex + 1) % modes.length];
    document.getElementById('char-music-mode-btn').textContent = {
      'order': '顺序',
      'random': '随机',
      'single': '单曲'
    }[charPlayerState.playMode];
  }



  function setupCharPlayerControls() {
    const player = document.getElementById('char-audio-player');
    const playBtn = document.getElementById('char-music-play-pause-btn');
    const vinyl = document.getElementById('char-vinyl-container');

    playBtn.addEventListener('click', () => {
      if (player.paused) {
        if (charPlayerState.currentIndex > -1) player.play();
      } else {
        player.pause();
      }
    });

    player.onplay = () => {
      playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`;
      vinyl.classList.add('spinning');
      charPlayerState.isPlaying = true;
    };
    player.onpause = () => {
      playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
      vinyl.classList.remove('spinning');
      charPlayerState.isPlaying = false;
    };
    player.onended = () => {
      vinyl.classList.remove('spinning');
      charPlayerState.isPlaying = false;
      playNextCharSong();
    };

    document.getElementById('char-music-prev-btn').addEventListener('click', playPrevCharSong);
    document.getElementById('char-music-next-btn').addEventListener('click', playNextCharSong);
    document.getElementById('char-music-mode-btn').addEventListener('click', changeCharPlayMode);

    document.getElementById('char-music-progress-bar').addEventListener('click', (e) => {
      if (!player.duration) return;
      const bar = e.currentTarget;
      const clickX = e.offsetX;
      player.currentTime = (clickX / bar.clientWidth) * player.duration;
    });
  }

  // ========== 全局暴露 ==========
  window.renderCharAlbum = renderCharAlbum;
  window.renderCharTaobao = renderCharTaobao;
  window.renderCharAppUsage = renderCharAppUsage;
  window.renderCharSimulatedQQ = renderCharSimulatedQQ;
  window.renderCharArticle = renderCharArticle;
  window.renderCharWallet = renderCharWallet;
  window.loadMoreMirroredMessages = loadMoreMirroredMessages;
  window.loadMoreMyPhoneMessages = loadMoreMyPhoneMessages;
  window.setupCharPlayerControls = setupCharPlayerControls;
  window.openCharSimulatedConversation = openCharSimulatedConversation;
  window.handleContinueRealConversationFromCPhone = handleContinueRealConversationFromCPhone;
  window.handleGenerateSimulatedAlbum = handleGenerateSimulatedAlbum;
  window.handleGenerateSimulatedBilibili = handleGenerateSimulatedBilibili;
  window.handleGenerateSimulatedDiaries = handleGenerateSimulatedDiaries;
  window.handleGenerateSimulatedMemos = handleGenerateSimulatedMemos;
  window.handleGenerateSimulatedMusic = handleGenerateSimulatedMusic;
  window.handleGenerateSimulatedQQ = handleGenerateSimulatedQQ;
  window.handleGenerateTaobaoHistory = handleGenerateTaobaoHistory;
  window.handleGenerateAmapHistory = handleGenerateAmapHistory;
  window.handleGenerateAppUsage = handleGenerateAppUsage;
  window.handleGenerateBrowserHistory = handleGenerateBrowserHistory;
  window.handleGenerateMyPhoneQQ = handleGenerateMyPhoneQQ;

  // ========== 从 script.js 迁移：B类函数 ==========

