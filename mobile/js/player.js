/* Riff Mobile — playback engine.
   Streams are resolved by the Riff backend (yt-dlp + cache) and routed through
   the shared RiffAudioEngine for the 10-band EQ, DSP effects and analyser. */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;

  const audio = document.getElementById('riff-audio');
  audio.crossOrigin = 'anonymous';
  audio.preload = 'metadata';

  const listeners = new Map();

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event).delete(handler);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    set.forEach((handler) => {
      try { handler(payload); } catch (e) { console.error(e); }
    });
  }

  const state = {
    queue: [],
    index: -1,
    current: null,
    playing: false,
    loading: false,
    error: null,
    currentTime: 0,
    duration: 0,
    context: '',
    shuffleOrder: [],
    shufflePos: 0,
    sleepAt: 0
  };

  let engine = null;
  let engineFailed = false;
  let hls = null;
  let loadToken = 0;
  let historyMarked = false;
  let normalizeTimer = null;
  let sleepTimer = null;
  let retriedWithoutCors = false;
  const resolvedCache = new Map();

  function settings() {
    return Store.state.settings;
  }

  function playback() {
    return Store.state.playback;
  }

  function audioSettings() {
    const s = settings();
    return {
      speed: Number(s.speed) || 1,
      speedPitch: Number(s.speed) || 1,
      pitch: Number(s.pitch) || 0,
      reverb: Number(s.reverb) || 0,
      echo: 0,
      distortion: Number(s.distortion) || 0,
      volume: 1,
      eqBands: Array.isArray(s.eqBands) ? s.eqBands.map(Number) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      eq: { low: 0, mid: 0, high: 0 }
    };
  }

  function ensureEngine() {
    if (engine || engineFailed) return engine;
    try {
      if (typeof global.RiffAudioEngine !== 'function') return null;
      engine = new global.RiffAudioEngine();
      engine.init(audio);
      engine.setHqEnabled(Boolean(settings().hq));
      engine.setAudioSettings(audioSettings());
      engine.setVolume(Number(playback().volume), Boolean(playback().muted));
      return engine;
    } catch (e) {
      engineFailed = true;
      engine = null;
      return null;
    }
  }

  function refreshAudio() {
    const s = settings();
    const p = playback();
    audio.volume = C.clamp(Number(p.volume), 0, 1);
    audio.muted = Boolean(p.muted);
    const eng = ensureEngine();
    if (eng) {
      if (eng.ctx && eng.ctx.state === 'suspended') {
        try { eng.ctx.resume().catch(() => {}); } catch (e) {}
      }
      eng.setHqEnabled(Boolean(s.hq));
      eng.setAudioSettings(audioSettings());
      eng.setVolume(Number(p.volume), Boolean(p.muted));
      if (eng.applySettings) eng.applySettings(audio);
    } else {
      audio.playbackRate = Number(s.speed) || 1;
    }
    updateNormalizer();
  }

  function updateNormalizer() {
    if (normalizeTimer) {
      clearInterval(normalizeTimer);
      normalizeTimer = null;
    }
    if (!settings().normalize) return;
    normalizeTimer = setInterval(() => {
      const eng = engine;
      if (!eng || !eng.getLevelDb || audio.paused) return;
      const db = Number(eng.getLevelDb());
      if (!Number.isFinite(db) || db < -70) return;
      const target = -16;
      const gain = C.clamp(target - db, -10, 10);
      if (eng.setNormalizeGainDb) eng.setNormalizeGainDb(gain);
    }, 900);
  }

  /* ---------------- stream resolution ---------------- */

  function rewriteOrigin(url) {
    if (!url) return url;
    if (!/^http:\/\/127\.0\.0\.1:\d+/i.test(url) && !/^http:\/\/localhost:\d+/i.test(url)) return url;
    try {
      const base = new URL(API.baseUrl);
      const target = new URL(url);
      return C.addTokenToUrl(base.origin + target.pathname + target.search, API.token);
    } catch (e) {
      return url;
    }
  }

  async function findPlayable(track) {
    const query = (track.artist ? track.artist + ' ' : '') + track.title;
    const result = await API.search(query, settings().platform, 4);
    const matches = (result && result.tracks) || [];
    if (matches.length === 0) throw new Error('No playable match for "' + track.title + '"');
    let best = matches[0];
    if (track.duration) {
      const close = matches.find((item) => Math.abs((item.duration || 0) - track.duration) <= Math.max(12, track.duration * 0.06));
      if (close) best = close;
    }
    track.resolvedId = best.id;
    track.resolvedUrl = best.url;
    track.resolvedPlatform = best.platform || 'youtube';
    if (!track.thumbnail) track.thumbnail = best.thumbnail || '';
    return best;
  }

  async function resolveStream(track) {
    if (track.platform === 'local' && track.id) {
      return { url: API.fileUrl(track.id), isLocal: true };
    }
    const key = C.trackKey(track);
    const cached = resolvedCache.get(key);
    if (cached && Date.now() - cached.at < 20 * 60 * 1000) return cached.value;

    let target = track;
    if (track.needsResolve && !track.resolvedId) {
      target = await findPlayable(track);
    }

    const lookup = {
      id: track.resolvedId || track.cleanId || track.id || '',
      url: track.resolvedUrl || track.url || '',
      platform: track.resolvedPlatform || track.platform || 'youtube',
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      thumbnail: track.thumbnail
    };

    const data = await API.streamInfo(lookup);
    if (!data || !data.success) throw new Error((data && data.error) || 'Could not resolve the audio stream');
    let source = data.isLocal ? data.streamUrl : (data.proxyUrl || data.streamUrl);
    source = rewriteOrigin(source);
    const value = { url: source, isHls: Boolean(data.isHls), isLocal: Boolean(data.isLocal) };
    resolvedCache.set(key, { at: Date.now(), value });
    return value;
  }

  /* ---------------- playback ---------------- */

  function stopHls() {
    if (hls) {
      try { hls.destroy(); } catch (e) {}
      hls = null;
    }
  }

  async function load(track, options) {
    const opts = options || {};
    if (!track) return;
    const token = ++loadToken;
    state.current = C.normalizeTrack(track) || track;
    Object.keys(track).forEach((key) => {
      if (state.current[key] === undefined) state.current[key] = track[key];
    });
    state.loading = true;
    state.error = null;
    state.currentTime = 0;
    state.duration = Number(track.duration) || 0;
    historyMarked = false;
    retriedWithoutCors = false;
    emit('track', state.current);
    emit('state', snapshot());

    try {
      const source = await resolveStream(state.current);
      if (token !== loadToken) return;
      stopHls();
      audio.pause();
      if (source.isHls && global.Hls && global.Hls.isSupported()) {
        hls = new global.Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 });
        hls.loadSource(source.url);
        hls.attachMedia(audio);
      } else {
        audio.src = source.url;
      }
      audio.load();
      refreshAudio();
      if (opts.autoplay !== false) {
        const promise = audio.play();
        if (promise && promise.catch) {
          promise.catch((err) => {
            state.loading = false;
            state.playing = false;
            state.error = err && err.name === 'NotAllowedError' ? 'Tap play to start listening' : 'Playback failed';
            emit('state', snapshot());
          });
        }
      }
    } catch (err) {
      if (token !== loadToken) return;
      state.loading = false;
      state.playing = false;
      state.error = err && err.message ? err.message : 'Could not play this track';
      emit('state', snapshot());
      emit('error', state.error);
    }
  }

  function play() {
    if (!state.current) {
      if (state.queue.length > 0) return playIndex(state.index >= 0 ? state.index : 0);
      return;
    }
    const promise = audio.play();
    if (promise && promise.catch) {
      promise.catch((err) => {
        if (err && err.name === 'NotAllowedError') {
          emit('error', 'Tap play to start listening');
        } else {
          emit('error', 'Playback failed');
        }
      });
    }
  }

  function pause() {
    audio.pause();
  }

  function toggle() {
    if (state.playing) pause();
    else play();
  }

  function playIndex(index) {
    if (index < 0 || index >= state.queue.length) return;
    state.index = index;
    if (state.shuffle) {
      const pos = state.shuffleOrder.indexOf(index);
      state.shufflePos = pos >= 0 ? pos : 0;
    }
    load(state.queue[index], { autoplay: true });
  }

  function setQueue(tracks, startIndex, contextLabel, options) {
    const opts = options || {};
    const list = [];
    const seen = new Set();
    (tracks || []).forEach((raw) => {
      const track = C.normalizeTrack(raw);
      if (!track) return;
      const key = C.trackKey(track);
      if (seen.has(key)) return;
      seen.add(key);
      list.push(track);
    });
    state.queue = list;
    state.context = contextLabel || '';
    rebuildShuffle();
    const start = Math.max(0, Math.min(list.length - 1, Number(startIndex) || 0));
    state.index = list.length > 0 ? start : -1;
    emit('queue', queueSnapshot());
    if (list.length === 0) return;
    if (opts.autoplay === false) {
      state.current = list[start];
      emit('track', state.current);
      emit('state', snapshot());
      return;
    }
    playIndex(start);
  }

  function rebuildShuffle() {
    state.shuffleOrder = C.buildShuffleOrder(state.queue.length, state.index);
    state.shufflePos = state.index >= 0 ? Math.max(0, state.shuffleOrder.indexOf(state.index)) : 0;
  }

  function nextIndexFor(direction) {
    const repeat = playback().repeat || 'off';
    if (state.shuffle && state.queue.length > 0) {
      const pos = state.shufflePos + direction;
      if (pos >= 0 && pos < state.shuffleOrder.length) return state.shuffleOrder[pos];
      if (repeat === 'all') return state.shuffleOrder[direction > 0 ? 0 : state.shuffleOrder.length - 1];
      return -1;
    }
    return C.nextIndex({ length: state.queue.length, index: state.index, repeat: repeat, direction: direction });
  }

  function advance(direction, automatic) {
    if (state.queue.length === 0) return;
    if (automatic && playback().repeat === 'one') {
      audio.currentTime = 0;
      play();
      return;
    }
    const target = nextIndexFor(direction);
    if (target < 0) {
      audio.pause();
      state.playing = false;
      emit('state', snapshot());
      return;
    }
    playIndex(target);
  }

  function next() { advance(1, false); }
  function previous() {
    if (audio.currentTime > 3.5) {
      audio.currentTime = 0;
      return;
    }
    advance(-1, false);
  }

  function setShuffle(enabled) {
    Store.setPlayback('shuffle', Boolean(enabled));
    rebuildShuffle();
    emit('state', snapshot());
  }

  function setRepeat(mode) {
    const next = mode === 'all' || mode === 'one' ? mode : 'off';
    Store.setPlayback('repeat', next);
    emit('state', snapshot());
  }

  function cycleRepeat() {
    const order = ['off', 'all', 'one'];
    const current = playback().repeat || 'off';
    setRepeat(order[(order.indexOf(current) + 1) % order.length]);
  }

  function seek(seconds) {
    if (!Number.isFinite(Number(seconds))) return;
    const duration = audio.duration || state.duration || 0;
    audio.currentTime = C.clamp(Number(seconds), 0, duration || Number(seconds));
    state.currentTime = audio.currentTime;
    emit('time', timeSnapshot());
  }

  function setVolume(value) {
    const volume = C.clamp(Number(value), 0, 1);
    Store.setPlayback('volume', volume);
    Store.setPlayback('muted', false);
    audio.volume = volume;
    audio.muted = false;
    if (engine) engine.setVolume(volume, false);
    emit('state', snapshot());
  }

  function toggleMute() {
    const muted = !playback().muted;
    Store.setPlayback('muted', muted);
    audio.muted = muted;
    if (engine) engine.setVolume(Number(playback().volume), muted);
    emit('state', snapshot());
  }

  /* ---------------- queue editing ---------------- */

  function addToQueue(track, playNext) {
    const normalized = C.normalizeTrack(track);
    if (!normalized) return;
    if (state.queue.length === 0) {
      setQueue([normalized], 0, 'Queue');
      return;
    }
    const insertAt = playNext ? state.index + 1 : state.queue.length;
    state.queue.splice(insertAt, 0, normalized);
    if (insertAt <= state.index) state.index++;
    if (state.shuffle) rebuildShuffle();
    emit('queue', queueSnapshot());
  }

  function removeAt(index) {
    if (index < 0 || index >= state.queue.length) return;
    state.queue.splice(index, 1);
    if (index < state.index) state.index--;
    else if (index === state.index) {
      state.index = Math.min(index, state.queue.length - 1);
      if (state.queue.length === 0) {
        state.current = null;
        state.playing = false;
        stopHls();
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        emit('track', null);
      } else {
        load(state.queue[Math.max(0, state.index)], { autoplay: state.playing });
      }
    }
    if (state.shuffle) rebuildShuffle();
    emit('queue', queueSnapshot());
    emit('state', snapshot());
  }

  function moveInQueue(from, to) {
    if (from === to || from < 0 || from >= state.queue.length) return;
    const target = C.clamp(to, 0, state.queue.length - 1);
    const [item] = state.queue.splice(from, 1);
    if (!item) return;
    state.queue.splice(target, 0, item);
    if (from === state.index) state.index = target;
    else if (from < state.index && target >= state.index) state.index--;
    else if (from > state.index && target <= state.index) state.index++;
    if (state.shuffle) rebuildShuffle();
    emit('queue', queueSnapshot());
  }

  function clearQueue() {
    state.queue = [];
    state.index = -1;
    state.shuffleOrder = [];
    emit('queue', queueSnapshot());
  }

  function jumpTo(index) {
    playIndex(index);
  }

  /* ---------------- sleep timer ---------------- */

  function startSleepTimer(minutes) {
    cancelSleepTimer();
    const ms = Number(minutes) * 60 * 1000;
    if (!ms || ms < 0) return 0;
    state.sleepAt = Date.now() + ms;
    sleepTimer = setTimeout(() => {
      pause();
      state.sleepAt = 0;
      sleepTimer = null;
      emit('state', snapshot());
      emit('sleep', true);
    }, ms);
    emit('state', snapshot());
    return state.sleepAt;
  }

  function cancelSleepTimer() {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    state.sleepAt = 0;
    emit('state', snapshot());
  }

  /* ---------------- snapshots ---------------- */

  function snapshot() {
    return {
      current: state.current,
      playing: state.playing,
      loading: state.loading,
      error: state.error,
      duration: state.duration,
      currentTime: state.currentTime,
      context: state.context,
      shuffle: Boolean(playback().shuffle),
      repeat: playback().repeat || 'off',
      volume: Number(playback().volume),
      muted: Boolean(playback().muted),
      sleepAt: state.sleepAt,
      queueLength: state.queue.length,
      index: state.index
    };
  }

  function timeSnapshot() {
    return {
      currentTime: state.currentTime,
      duration: state.duration,
      progress: state.duration > 0 ? state.currentTime / state.duration : 0
    };
  }

  function queueSnapshot() {
    return { queue: state.queue.slice(), index: state.index, context: state.context };
  }

  /* ---------------- audio events ---------------- */

  audio.addEventListener('playing', () => {
    state.playing = true;
    state.loading = false;
    state.error = null;
    ensureEngine();
    refreshAudio();
    if (!historyMarked && state.current) {
      historyMarked = true;
      Store.addHistory(state.current);
    }
    emit('state', snapshot());
    updateMediaSession();
  });

  audio.addEventListener('pause', () => {
    state.playing = false;
    emit('state', snapshot());
  });

  audio.addEventListener('timeupdate', () => {
    state.currentTime = audio.currentTime || 0;
    if (audio.duration && Number.isFinite(audio.duration)) state.duration = audio.duration;
    emit('time', timeSnapshot());
  });

  audio.addEventListener('loadedmetadata', () => {
    if (audio.duration && Number.isFinite(audio.duration)) state.duration = audio.duration;
    emit('time', timeSnapshot());
  });

  audio.addEventListener('waiting', () => {
    state.loading = true;
    emit('state', snapshot());
  });

  audio.addEventListener('canplay', () => {
    state.loading = false;
    emit('state', snapshot());
  });

  audio.addEventListener('ended', () => {
    advance(1, true);
  });

  audio.addEventListener('error', () => {
    if (audio.error && audio.error.code === 4 && audio.crossOrigin && !retriedWithoutCors && audio.src) {
      // CORS-flavoured failure: retry once without the cross-origin request so
      // playback still works, sacrificing the Web Audio graph for this track.
      retriedWithoutCors = true;
      const src = audio.src;
      audio.crossOrigin = null;
      audio.src = src;
      audio.load();
      play();
      return;
    }
    state.loading = false;
    state.playing = false;
    state.error = 'Could not play this track';
    emit('state', snapshot());
  });

  /* ---------------- media session ---------------- */

  function updateMediaSession() {
    // Native builds own the media session (Android MediaSession / iOS Now
    // Playing), so the web handlers would only compete with them.
    if (global.RiffBackground && global.RiffBackground.isNative) return;
    if (!('mediaSession' in navigator) || !state.current) return;
    try {
      const track = state.current;
      navigator.mediaSession.metadata = new global.MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'Riff',
        artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }] : []
      });
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('previoustrack', previous);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details && details.seekTime != null) seek(details.seekTime);
      });
    } catch (e) {}
  }

  /* ---------------- analyser ---------------- */

  function analyserData(buffer) {
    const eng = ensureEngine();
    if (!eng || !eng.getAnalyserNode || !eng.getFrequencyData) return null;
    try {
      const node = eng.getAnalyserNode();
      if (!node) return null;
      eng.setAnalyserEnabled(true);
      eng.getFrequencyData(buffer);
      return buffer;
    } catch (e) {
      return null;
    }
  }

  global.RiffPlayer = {
    on,
    audio,
    state,
    load,
    play,
    pause,
    toggle,
    next,
    previous,
    seek,
    playIndex,
    setQueue,
    addToQueue,
    removeAt,
    moveInQueue,
    clearQueue,
    jumpTo,
    setShuffle,
    setRepeat,
    cycleRepeat,
    setVolume,
    toggleMute,
    refreshAudio,
    startSleepTimer,
    cancelSleepTimer,
    analyserData,
    snapshot,
    timeSnapshot,
    queueSnapshot,
    get queue() { return state.queue; }
  };
})(window);
