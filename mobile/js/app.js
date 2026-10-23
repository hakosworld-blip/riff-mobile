/* Riff Mobile — app shell: routing, navigation, mini player, theming. */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const Player = global.RiffPlayer;
  const V = global.RiffViews;
  const PlayerView = global.RiffPlayerView;

  const host = document.getElementById('screen-host');
  const navBar = document.getElementById('nav-bar');
  const mini = document.getElementById('mini-player');
  const miniArt = document.getElementById('mini-art');
  const miniTitle = document.getElementById('mini-title');
  const miniArtist = document.getElementById('mini-artist');
  const miniPlay = document.getElementById('mini-play');
  const miniNext = document.getElementById('mini-next');
  const miniProgress = document.getElementById('mini-progress-fill');
  const overlayRoot = document.getElementById('overlay-root');

  const routes = {
    home: V.home,
    search: V.search,
    library: V.library,
    settings: V.settings,
    connect: V.connect,
    playlist: V.playlist,
    album: V.album,
    artist: V.artist,
    favorites: V.favorites,
    history: V.history
  };

  const TAB_ROUTES = ['home', 'search', 'library', 'settings'];
  const PARENT_ROUTE = {
    playlist: 'library',
    favorites: 'library',
    history: 'library',
    album: 'search',
    artist: 'search',
    connect: 'settings'
  };

  const stack = [];
  let current = null;
  let historyLock = false;
  let themeTimer = null;

  /* ---------------- theme ---------------- */

  function applyTheme() {
    const settings = Store.state.settings;
    const mode = UI.resolveMode(settings.themeMode);
    UI.applyTheme({ mode: mode, seed: settings.accent || '#d0bcff' });
    if (settings.dynamicColor) {
      UI.dynamicThemeFor(Player.state.current, settings);
    }
  }

  function scheduleThemeUpdate() {
    if (themeTimer) clearTimeout(themeTimer);
    themeTimer = setTimeout(() => {
      themeTimer = null;
      applyTheme();
    }, 80);
  }

  global.RiffTheme = {
    apply: applyTheme,
    refresh: scheduleThemeUpdate
  };

  /* ---------------- router ---------------- */

  function isTab(route) {
    return TAB_ROUTES.indexOf(route) >= 0;
  }

  function destroyCurrent() {
    if (current && current.el && typeof current.el.__onDestroy === 'function') {
      try { current.el.__onDestroy(); } catch (e) {}
    }
  }

  function render(entry, options) {
    const opts = options || {};
    const view = routes[entry.name];
    if (!view) return;
    destroyCurrent();
    if (current) current.scroll = host.scrollTop;

    const element = view.render(entry.params || {});
    host.innerHTML = '';
    host.appendChild(element);
    host.classList.toggle('is-detail', !isTab(entry.name));
    host.scrollTop = opts.keepScroll ? (entry.scroll || 0) : 0;
    current = { name: entry.name, params: entry.params, el: element, scroll: 0 };
    entry.el = element;
    document.title = (entry.name === 'home' ? 'Riff' : capitalize(entry.name) + ' · Riff');
    setNavActive(entry.name);
  }

  function capitalize(text) {
    return String(text || '').charAt(0).toUpperCase() + String(text || '').slice(1);
  }

  function pushHistory() {
    try {
      history.pushState({ riff: stack.length }, '');
    } catch (e) {}
  }

  function go(name, params) {
    if (!routes[name]) return;
    if (PlayerView.isOpen()) PlayerView.close();
    stack.push({ name: name, params: params || {} });
    render(stack[stack.length - 1]);
    pushHistory();
    UI.haptic(4);
  }

  function goTab(name) {
    if (!isTab(name)) return;
    if (PlayerView.isOpen()) PlayerView.close();
    if (current && current.name === name) {
      host.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    stack.length = 0;
    stack.push({ name: name, params: {} });
    render(stack[stack.length - 1]);
    pushHistory();
    UI.haptic(4);
  }

  function replace(name, params) {
    if (!routes[name]) return;
    stack[stack.length - 1] = { name: name, params: params || {}, scroll: host.scrollTop };
    render(stack[stack.length - 1], { keepScroll: false });
  }

  function back() {
    if (UI.closeTopLayer()) return true;
    if (PlayerView.isOpen()) {
      PlayerView.close();
      return true;
    }
    if (stack.length > 1) {
      if (current) current.scroll = host.scrollTop;
      stack.pop();
      const prev = stack[stack.length - 1];
      render(prev, { keepScroll: true });
      return true;
    }
    return false;
  }

  function handleSystemBack() {
    if (UI.closeTopLayer()) return true;
    if (PlayerView.isOpen()) {
      PlayerView.close();
      return true;
    }
    if (stack.length > 1) {
      if (current) current.scroll = host.scrollTop;
      stack.pop();
      const prev = stack[stack.length - 1];
      render(prev, { keepScroll: true });
      return true;
    }
    return false;
  }

  function setNavActive(route) {
    const active = PARENT_ROUTE[route] || route;
    navBar.querySelectorAll('.nav-item').forEach((button) => {
      const isActive = button.dataset.route === active;
      button.classList.toggle('is-active', isActive);
      if (isActive) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  global.RiffNav = {
    go: go,
    goTab: goTab,
    replace: replace,
    back: back,
    current: () => (current ? current.name : null)
  };

  /* ---------------- mini player ---------------- */

  function paintMiniTrack() {
    const track = Player.state.current;
    if (!track) {
      mini.hidden = true;
      return;
    }
    mini.hidden = false;
    miniArt.innerHTML = '';
    miniArt.appendChild(UI.art(track, 'art--s'));
    miniTitle.textContent = track.title;
    miniArtist.textContent = track.artist;
  }

  function paintMiniState() {
    const snap = Player.snapshot();
    if (!snap.current) {
      mini.hidden = true;
      return;
    }
    mini.hidden = false;
    miniPlay.innerHTML = '';
    miniPlay.appendChild(UI.icon(snap.playing ? 'pause' : 'play'));
    miniPlay.setAttribute('aria-label', snap.playing ? 'Pause' : 'Play');
  }

  function paintMiniProgress(time) {
    if (!time || !time.duration) {
      miniProgress.style.width = '0%';
      return;
    }
    const percent = Math.max(0, Math.min(100, (time.currentTime / time.duration) * 100));
    miniProgress.style.width = percent.toFixed(2) + '%';
  }

  /* ---------------- demo badge ---------------- */

  function showDemoBadge() {
    if (!API.isDemo) return;
    const badge = UI.el('div', { class: 'badge-demo', text: 'Demo preview — no backend' });
    document.body.appendChild(badge);
  }

  function seedDemoContent() {
    if (!API.isDemo || !global.RiffDemo) return;
    const state = Store.state;
    if (state.playlists.length || state.favorites.length || state.history.length) return;
    global.RiffDemo.playlists.slice().reverse().forEach((playlist) => {
      Store.createPlaylist(playlist.name, playlist.tracks);
    });
    global.RiffDemo.hot.slice(0, 4).forEach((track) => Store.toggleFavorite(track));
    global.RiffDemo.hot.slice(0, 5).slice().reverse().forEach((track) => Store.addHistory(track));
  }

  /* ---------------- boot ---------------- */

  function splash() {
    const wrap = UI.el('div', {
      class: 'screen',
      style: { minHeight: '100%', display: 'grid', placeItems: 'center', paddingBottom: '0' }
    }, UI.el('div', { style: { textAlign: 'center' } }, [
      UI.el('div', {
        class: 'brand-mark__dot',
        style: { width: '56px', height: '56px', borderRadius: '18px', margin: '0 auto 16px' }
      }, UI.icon('music_note', 28)),
      UI.el('div', { style: { font: 'var(--md-type-headline-xs)', marginBottom: '16px' }, text: 'Riff' }),
      UI.el('div', { style: { display: 'flex', justifyContent: 'center' } }, UI.el('div', { class: 'spinner' }))
    ]));
    host.innerHTML = '';
    host.appendChild(wrap);
  }

  function bindShell() {
    navBar.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-item');
      if (!button) return;
      goTab(button.dataset.route);
    });

    document.getElementById('mini-open').addEventListener('click', () => PlayerView.open());
    miniPlay.addEventListener('click', (event) => {
      event.stopPropagation();
      Player.toggle();
      UI.haptic(6);
    });
    miniNext.addEventListener('click', (event) => {
      event.stopPropagation();
      Player.next();
      UI.haptic(6);
    });

    Player.on('track', () => {
      paintMiniTrack();
      paintMiniState();
      paintMiniProgress(Player.timeSnapshot());
      scheduleThemeUpdate();
    });
    Player.on('state', paintMiniState);
    Player.on('time', paintMiniProgress);
    Player.on('error', (message) => UI.snackbar(message || 'Playback failed'));

    window.addEventListener('popstate', () => {
      if (historyLock) return;
      historyLock = true;
      const handled = handleSystemBack();
      if (handled) {
        setTimeout(() => {
          try { history.pushState({ riff: stack.length }, ''); } catch (e) {}
          historyLock = false;
        }, 0);
      } else {
        historyLock = false;
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        handleSystemBack();
      }
    });

    if (window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: light)');
      const listener = () => {
        if (Store.state.settings.themeMode === 'auto') scheduleThemeUpdate();
      };
      if (media.addEventListener) media.addEventListener('change', listener);
      else if (media.addListener) media.addListener(listener);
    }

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // keep the mini player clear of the on-screen keyboard
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        document.documentElement.style.setProperty('--kb-inset', (window.innerHeight - window.visualViewport.height) + 'px');
      });
    }
  }

  async function boot() {
    Store.load();
    UI.applyTheme({
      mode: UI.resolveMode(Store.state.settings.themeMode),
      seed: Store.state.settings.accent || '#d0bcff'
    });
    splash();
    bindShell();

    const configured = await API.configure({
      serverUrl: Store.state.settings.serverUrl || '',
      token: Store.state.settings.token || undefined,
      demo: Store.state.settings.demoMode === true
    });

    seedDemoContent();
    applyTheme();
    showDemoBadge();

    stack.length = 0;
    if (!configured.online && !API.isDemo && API.isNative && !Store.state.settings.serverUrl) {
      // A fresh native install has no server to talk to: pair before Home.
      stack.push({ name: 'connect', params: { back: false } });
    } else {
      // Home carries the connection card and all local content while offline.
      stack.push({ name: 'home', params: {} });
      if (!configured.online && !API.isDemo) {
        UI.snackbar('Riff is offline. Start the app to stream music.');
      }
    }
    render(stack[0]);
    try { history.replaceState({ riff: 0 }, ''); } catch (e) {}

    // hydrate any static icons and make the mini player consistent
    global.RiffIcons.hydrate(document);
    paintMiniTrack();
    paintMiniState();
    paintMiniProgress(Player.timeSnapshot());
    if (Player.state.current) Player.refreshAudio();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
