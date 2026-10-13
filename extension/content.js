(() => {
  const KEY = '__togetherVideoSyncState';
  if (window[KEY]) {
    chrome.storage.local.get(['syncRoom', 'syncServer'], (cfg) => window[KEY].configure(cfg));
    return;
  }

  const state = {
    ws: null,
    room: null,
    server: null,
    reconnectTimer: null,
    suppressUntil: 0,
    lastTickAt: 0,
    lastTickTime: 0,
    pendingRemote: null,
    attached: new WeakSet(),
    configure,
    applyRemote
  };
  window[KEY] = state;

  function configure(cfg) {
    const room = (cfg.syncRoom || '').trim();
    const server = (cfg.syncServer || '').trim();
    if (!room || !server) return;
    if (state.room === room && state.server === server && state.ws && state.ws.readyState <= WebSocket.OPEN) return;

    state.room = room;
    state.server = server;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    if (state.ws) {
      state.ws.onclose = null;
      state.ws.close();
    }

    let socket;
    try {
      socket = new WebSocket(server);
    } catch (error) {
      console.warn('[Together Video Sync] Invalid WebSocket server:', error);
      return;
    }
    state.ws = socket;

    socket.addEventListener('open', () => {
      if (state.ws !== socket) return;
      socket.send(JSON.stringify({ type: 'join', room }));
      console.info('[Together Video Sync] Connected to room:', room);
    });
    socket.addEventListener('message', (event) => {
      if (state.ws !== socket) return;
      try {
        const message = JSON.parse(event.data);
        if (message && ['snapshot', 'play', 'pause', 'seek', 'rate', 'tick'].includes(message.type)) {
          applyRemote(message);
        }
      } catch (_) {
        // Ignore malformed server messages.
      }
    });
    socket.addEventListener('close', () => {
      if (state.ws !== socket) return;
      state.ws = null;
      // Reconnect while this tab is still open.
      state.reconnectTimer = setTimeout(() => configure({ syncRoom: state.room, syncServer: state.server }), 1800);
    });
    socket.addEventListener('error', () => {
      console.warn('[Together Video Sync] WebSocket connection failed. Check the server URL and that the server is running.');
    });
  }

  function getBestVideo() {
    const videos = [...document.querySelectorAll('video')];
    let best = null;
    let bestScore = 0;
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const score = width * height;
      if (score > bestScore && rect.width > 80 && rect.height > 45) {
        best = video;
        bestScore = score;
      }
    }
    return best;
  }

  function publish(type, video) {
    if (Date.now() < state.suppressUntil) return;
    if (video !== getBestVideo()) return;
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    const payload = {
      type,
      time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      rate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
      paused: video.paused,
      sentAt: Date.now()
    };
    try { state.ws.send(JSON.stringify(payload)); } catch (_) { /* reconnect handler will recover */ }
  }

  function applyRemote(message) {
    const video = getBestVideo();
    if (!video) {
      state.pendingRemote = message;
      return;
    }

    state.pendingRemote = null;
    state.suppressUntil = Date.now() + 900;
    try {
      if (Number.isFinite(message.rate) && message.rate > 0) video.playbackRate = message.rate;

      if (Number.isFinite(message.time) && message.time >= 0) {
        const elapsed = !message.paused && message.type !== 'pause'
          ? Math.max(0, (Date.now() - (message.sentAt || Date.now())) / 1000)
          : 0;
        const target = message.time + elapsed * (Number.isFinite(message.rate) ? message.rate : 1);
        const threshold = message.type === 'tick' ? 1.2 : 0.3;
        if (Math.abs(video.currentTime - target) > threshold) video.currentTime = target;
      }

      if (message.type === 'pause' || (message.type === 'snapshot' && message.paused)) {
        video.pause();
      } else if (message.type === 'play' || (message.type === 'snapshot' && !message.paused)) {
        const result = video.play();
        if (result && typeof result.catch === 'function') result.catch(() => {
          console.info('[Together Video Sync] Browser blocked remote playback. Click play once on this device, then try again.');
        });
      }
    } catch (error) {
      console.debug('[Together Video Sync] Could not apply playback state:', error);
    }
  }

  function attach(video) {
    if (state.attached.has(video)) return;
    state.attached.add(video);
    video.addEventListener('play', () => publish('play', video));
    video.addEventListener('pause', () => { if (!video.ended) publish('pause', video); });
    video.addEventListener('seeking', () => publish('seek', video));
    video.addEventListener('ratechange', () => publish('rate', video));
    video.addEventListener('timeupdate', () => {
      if (video !== getBestVideo() || video.paused || Date.now() < state.suppressUntil) return;
      const now = Date.now();
      if (now - state.lastTickAt >= 3000) {
        state.lastTickAt = now;
        publish('tick', video);
      }
    });
    video.addEventListener('loadedmetadata', flushPending);
    video.addEventListener('playing', flushPending);
  }

  function flushPending() {
    if (state.pendingRemote && getBestVideo()) {
      const message = state.pendingRemote;
      state.pendingRemote = null;
      applyRemote(message);
    }
  }

  function scan() {
    document.querySelectorAll('video').forEach(attach);
    flushPending();
  }

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.syncRoom || changes.syncServer)) {
      chrome.storage.local.get(['syncRoom', 'syncServer'], configure);
    }
  });
  chrome.storage.local.get(['syncRoom', 'syncServer'], configure);
})();
