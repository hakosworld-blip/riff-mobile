/* Riff Mobile — local state and persistence.
   Favorites, history, playlists and preferences live on the device (localStorage),
   mirroring Riff's privacy-first "nothing leaves this machine" behaviour. */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const KEY = 'riff_mobile_state_v1';

  function defaults() {
    return {
      favorites: [],
      history: [],
      playlists: [],
      recentSearches: [],
      settings: {
        themeMode: 'dark',
        dynamicColor: true,
        accent: '#d0bcff',
        platform: 'ytmusic',
        downloadFormat: 'mp3',
        downloadQuality: '0',
        normalize: false,
        hq: false,
        serverUrl: '',
        token: '',
        demoMode: false,
        eqPreset: 'flat',
        eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        speed: 1,
        pitch: 0,
        reverb: 0,
        distortion: 0,
        sleepTimerMinutes: 0
      },
      playback: {
        volume: 0.9,
        muted: false,
        shuffle: false,
        repeat: 'off'
      }
    };
  }

  function mergeDefaults(source, fallback) {
    const out = Array.isArray(fallback) ? [] : {};
    if (Array.isArray(fallback)) {
      return Array.isArray(source) ? source : fallback.slice();
    }
    Object.keys(fallback).forEach((key) => {
      const value = fallback[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = mergeDefaults(source && source[key], value);
      } else {
        out[key] = source && source[key] !== undefined ? source[key] : value;
      }
    });
    return out;
  }

  const state = defaults();
  const listeners = new Set();
  let loaded = false;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = mergeDefaults(parsed, defaults());
        Object.keys(merged).forEach((key) => { state[key] = merged[key]; });
      }
    } catch (e) {}
    if (!Array.isArray(state.settings.eqBands) || state.settings.eqBands.length !== 10) {
      state.settings.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    loaded = true;
    return state;
  }

  let saveTimer = null;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 120);
  }

  function persist() {
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function emit(reason) {
    listeners.forEach((fn) => {
      try { fn(reason, state); } catch (e) {}
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function touch(reason) {
    save();
    emit(reason);
  }

  function setSetting(key, value) {
    if (!loaded) load();
    state.settings[key] = value;
    touch('settings');
  }

  function setPlayback(key, value) {
    state.playback[key] = value;
    touch('playback');
  }

  function isFavorite(track) {
    const key = C.trackKey(track);
    return state.favorites.some((item) => C.trackKey(item) === key);
  }

  function toggleFavorite(track) {
    const key = C.trackKey(track);
    const index = state.favorites.findIndex((item) => C.trackKey(item) === key);
    if (index >= 0) {
      state.favorites.splice(index, 1);
      touch('favorites');
      return false;
    }
    const normalized = C.normalizeTrack(track);
    if (normalized) state.favorites.unshift(Object.assign(normalized, { addedAt: Date.now() }));
    touch('favorites');
    return true;
  }

  function removeFavorite(track) {
    const key = C.trackKey(track);
    const index = state.favorites.findIndex((item) => C.trackKey(item) === key);
    if (index >= 0) {
      state.favorites.splice(index, 1);
      touch('favorites');
    }
  }

  function addHistory(track) {
    const normalized = C.normalizeTrack(track);
    if (!normalized) return;
    state.history = C.mergeHistory(state.history, normalized, 120);
    touch('history');
  }

  function clearHistory() {
    state.history = [];
    touch('history');
  }

  function newId(prefix) {
    return (prefix || 'p') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createPlaylist(name, tracks) {
    const playlist = {
      id: newId('pl'),
      name: String(name || 'New playlist').trim() || 'New playlist',
      createdAt: Date.now(),
      tracks: (tracks || []).map(C.normalizeTrack).filter(Boolean)
    };
    state.playlists.unshift(playlist);
    touch('playlists');
    return playlist;
  }

  function findPlaylist(id) {
    return state.playlists.find((item) => item.id === id) || null;
  }

  function renamePlaylist(id, name) {
    const playlist = findPlaylist(id);
    if (!playlist) return null;
    playlist.name = String(name || '').trim() || playlist.name;
    touch('playlists');
    return playlist;
  }

  function deletePlaylist(id) {
    const index = state.playlists.findIndex((item) => item.id === id);
    if (index >= 0) {
      state.playlists.splice(index, 1);
      touch('playlists');
    }
  }

  function addToPlaylist(playlistId, tracks) {
    const playlist = findPlaylist(playlistId);
    if (!playlist) return { added: 0, playlist: null };
    const existing = new Set(playlist.tracks.map(C.trackKey));
    let added = 0;
    (Array.isArray(tracks) ? tracks : [tracks]).forEach((raw) => {
      const track = C.normalizeTrack(raw);
      if (!track) return;
      const key = C.trackKey(track);
      if (existing.has(key)) return;
      existing.add(key);
      playlist.tracks.push(track);
      added++;
    });
    if (added > 0) touch('playlists');
    return { added, playlist };
  }

  function removeFromPlaylist(playlistId, track) {
    const playlist = findPlaylist(playlistId);
    if (!playlist) return;
    const key = C.trackKey(track);
    playlist.tracks = playlist.tracks.filter((item) => C.trackKey(item) !== key);
    touch('playlists');
  }

  function reorderPlaylist(playlistId, from, to) {
    const playlist = findPlaylist(playlistId);
    if (!playlist) return;
    if (from < 0 || from >= playlist.tracks.length) return;
    const target = Math.max(0, Math.min(playlist.tracks.length - 1, to));
    const [moved] = playlist.tracks.splice(from, 1);
    playlist.tracks.splice(target, 0, moved);
    touch('playlists');
  }

  function addRecentSearch(query) {
    const text = String(query || '').trim();
    if (!text) return;
    state.recentSearches = [text]
      .concat(state.recentSearches.filter((item) => item.toLowerCase() !== text.toLowerCase()))
      .slice(0, 8);
    touch('searches');
  }

  function clearRecentSearches() {
    state.recentSearches = [];
    touch('searches');
  }

  function reset() {
    const fresh = defaults();
    Object.keys(fresh).forEach((key) => { state[key] = fresh[key]; });
    persist();
    emit('reset');
  }

  global.RiffStore = {
    state,
    load,
    save,
    persist,
    subscribe,
    setSetting,
    setPlayback,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    addHistory,
    clearHistory,
    createPlaylist,
    findPlaylist,
    renamePlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
    addRecentSearch,
    clearRecentSearches,
    reset
  };
})(window);
