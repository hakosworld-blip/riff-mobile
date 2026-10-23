/* Riff Mobile — client for the Riff local API.
   The app talks to the same endpoints as the desktop renderer
   (search, stream resolution, lyrics, library, downloads, imports). */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const params = new URLSearchParams(location.search);
  const forcedDemo = params.get('demo') === '1';

  const injectedServer = typeof global.__RIFF_SERVER__ === 'string' ? global.__RIFF_SERVER__ : '';
  let baseUrl = (params.get('server') || injectedServer).replace(/\/+$/, '');
  if (!baseUrl && /^https?:$/.test(location.protocol) && location.port) {
    baseUrl = location.origin;
  }
  let token = global.__RIFF_TOKEN__ || (global.electronAPI && global.electronAPI.serverToken) || '';
  let demoMode = false;
  let online = false;
  let initialized = false;

  const DEFAULT_PORT = 38472;

  // Capacitor serves the app from capacitor://localhost (iOS) or
  // https://localhost (Android): loopback there is the phone, not the computer.
  function isNative() {
    if (global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function') {
      return global.Capacitor.isNativePlatform();
    }
    return /^(capacitor|ionic):$/.test(location.protocol) ||
      ((location.protocol === 'https:' || location.protocol === 'http:') &&
        (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
        !global.__RIFF_SERVER__);
  }

  function demo() {
    return forcedDemo || demoMode;
  }

  function url(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return baseUrl + path;
  }

  // <audio>/<img> cannot send the pairing header, so media URLs carry the
  // token in the query string. Only same-origin /api/ paths get it.
  function mediaUrl(path) {
    return C.addTokenToUrl(url(path), token);
  }

  function query(params) {
    const search = new URLSearchParams();
    Object.keys(params || {}).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === '') return;
      search.set(key, String(value));
    });
    const text = search.toString();
    return text ? '?' + text : '';
  }

  class ApiError extends Error {
    constructor(message, status) {
      super(message || 'Request failed');
      this.name = 'ApiError';
      this.status = status || 0;
    }
  }

  async function request(path, options) {
    if (demo()) {
      throw new ApiError('Riff backend is not connected (demo mode)');
    }
    if (!baseUrl) {
      throw new ApiError('Pair Riff Mobile with your computer first');
    }
    const opts = options || {};
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeout || 30000);
    const headers = Object.assign({}, opts.headers);
    if (token) headers['X-Riff-Token'] = token;
    if (opts.body && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    try {
      const res = await fetch(url(path), {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body,
        signal: controller.signal,
        cache: 'no-store'
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = text;
      }
      if (data && typeof data === 'object' && baseUrl) {
        // media URLs point at the computer's loopback address; rewrite them
        data = C.rewriteServerUrls(data, baseUrl, token);
      }
      if (!res.ok) {
        const message = (data && typeof data === 'object' && data.error) ||
          (typeof data === 'string' ? data : '') ||
          ('Request failed (' + res.status + ')');
        throw new ApiError(message, res.status);
      }
      return data;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new ApiError('The request timed out');
      if (err instanceof ApiError) throw err;
      throw new ApiError(err && err.message ? err.message : 'Network error');
    } finally {
      clearTimeout(timeout);
    }
  }

  async function configure(options) {
    const opts = options || {};
    demoMode = Boolean(opts.demo) || forcedDemo;
    if (opts.serverUrl) baseUrl = C.withDefaultPort(opts.serverUrl) || String(opts.serverUrl).replace(/\/+$/, '');
    if (opts.token != null) token = opts.token;
    if (!baseUrl && !isNative()) {
      let port = DEFAULT_PORT;
      try {
        if (global.electronAPI && global.electronAPI.getServerPort) {
          port = (await global.electronAPI.getServerPort()) || port;
        }
      } catch (e) {}
      baseUrl = 'http://127.0.0.1:' + port;
    }
    online = demoMode ? false : await probe();
    initialized = true;
    return { baseUrl, online, token: Boolean(token), demo: demoMode };
  }

  /** Pair with a Riff server. Returns the probe result without persisting anything. */
  async function connect(opts) {
    const next = C.normalizeServerUrl(opts && opts.serverUrl);
    if (!next) throw new ApiError('Enter an address like http://192.168.1.20:38472');
    const nextToken = String((opts && opts.token) || '').trim();
    if (!nextToken) throw new ApiError('Enter the pairing code from Riff on your computer');
    const previous = { baseUrl: baseUrl, token: token, demo: demoMode };
    baseUrl = next;
    token = nextToken;
    demoMode = false;
    const ok = await probe();
    if (!ok) {
      baseUrl = previous.baseUrl;
      token = previous.token;
      demoMode = previous.demo;
      throw new ApiError('Could not reach Riff at ' + next + '. Check the address, the pairing code and that Riff is running with LAN sharing.');
    }
    online = true;
    initialized = true;
    return { baseUrl: baseUrl, token: Boolean(token) };
  }

  function useDemo(enabled) {
    demoMode = Boolean(enabled);
    online = false;
    initialized = true;
  }

  function resetConnection() {
    baseUrl = '';
    token = '';
    demoMode = false;
    online = false;
  }

  async function probe() {
    if (demo() || !baseUrl) return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2600);
      const headers = token ? { 'X-Riff-Token': token } : {};
      const res = await fetch(url('/api/tools-status'), { headers, signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- demo implementations ---------------- */

  const demoApi = {
    search(query, platform, limit) {
      const results = global.RiffDemo.searchTracks(query).slice(0, limit || 20);
      return global.RiffDemo.delay({ success: results.length > 0, tracks: results }, 320);
    },
    hot(limit) {
      return global.RiffDemo.delay({ success: true, title: 'Hot picks 2026', tracks: global.RiffDemo.hot.slice(0, limit || 12) }, 420);
    },
    albums(query) {
      const q = String(query || '').toLowerCase();
      const list = global.RiffDemo.albums.filter((a) => (a.title + ' ' + a.artist).toLowerCase().includes(q));
      return global.RiffDemo.delay({ success: true, albums: list }, 360);
    },
    albumTracks(id) {
      const album = global.RiffDemo.albums.find((a) => a.id === id);
      if (!album) return Promise.reject(new ApiError('Album not found', 404));
      return global.RiffDemo.delay({
        success: true,
        album: { id: album.id, title: album.title, artist: album.artist, year: album.year, trackCount: album.trackCount, cover: '' },
        tracks: album.tracks.map((t, i) => ({ no: i + 1, disc: 1, title: t.title, artist: t.artist, durationMs: t.duration * 1000 }))
      }, 300);
    },
    artistAlbums(name) {
      const list = global.RiffDemo.albums.filter((a) => a.artist.toLowerCase() === String(name).toLowerCase());
      return global.RiffDemo.delay({ success: true, albums: list }, 300);
    },
    artistInfo(name) {
      const artist = global.RiffDemo.artists.find((a) => a.name.toLowerCase() === String(name).toLowerCase());
      const artistTracks = global.RiffDemo.tracks.filter((t) => t.artist.toLowerCase() === String(name).toLowerCase());
      return global.RiffDemo.delay({
        success: true,
        artist: {
          name: name,
          avatar: '',
          bio: 'Demo artist profile. Connect Riff to load real artist data.',
          isVerified: true,
          tracks: artistTracks
        },
        albums: artist ? artist.albums : []
      }, 300);
    },
    lyrics() {
      return global.RiffDemo.delay({ success: true, lyrics: global.RiffDemo.lyrics }, 420);
    },
    streamInfo() {
      return Promise.reject(new ApiError('Demo mode: connect the Riff app to play audio'));
    },
    library() {
      return global.RiffDemo.delay(global.RiffDemo.localTracks, 300);
    },
    offlineLibrary() {
      const tracks = global.RiffDemo.offlineTracks;
      const totalBytes = tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0);
      return global.RiffDemo.delay({ success: true, count: tracks.length, totalBytes, tracks }, 300);
    },
    offlineDelete(id) {
      const index = global.RiffDemo.offlineTracks.findIndex((t) => t.id === id || t.cleanId === id);
      if (index >= 0) global.RiffDemo.offlineTracks.splice(index, 1);
      return global.RiffDemo.delay({ success: true }, 240);
    },
    clearOffline() {
      global.RiffDemo.offlineTracks.length = 0;
      return global.RiffDemo.delay({ success: true }, 400);
    },
    libraryRemove(id) {
      const index = global.RiffDemo.localTracks.findIndex((t) => t.id === id);
      if (index >= 0) global.RiffDemo.localTracks.splice(index, 1);
      return global.RiffDemo.delay({ success: true }, 240);
    },
    libraryAdd(items) {
      return global.RiffDemo.delay({ success: true, count: (items || []).length }, 240);
    },
    download(track) {
      return global.RiffDemo.delay({ success: true, filename: (track.artist || 'artist') + ' - ' + (track.title || 'track') + '.mp3' }, 1400);
    },
    translate(texts) {
      return global.RiffDemo.delay({ success: true, translations: texts }, 500);
    },
    playlistImport() {
      return Promise.reject(new ApiError('Playlist import needs the Riff backend'));
    },
    appleImport() {
      return Promise.reject(new ApiError('Playlist import needs the Riff backend'));
    },
    saveCustomLyrics() {
      return Promise.reject(new ApiError('Saving lyrics needs the Riff backend'));
    },
    toolsStatus() {
      return global.RiffDemo.delay({ ytDlp: false, ffmpeg: false }, 100);
    }
  };

  /* ---------------- public API ---------------- */

  const API = {
    get baseUrl() { return baseUrl; },
    get online() { return online && !forcedDemo; },
    get isDemo() { return demo(); },
    get forcedDemo() { return forcedDemo; },
    get isNative() { return isNative(); },
    get configured() { return Boolean(baseUrl); },
    connect,
    useDemo,
    resetConnection,
    get token() { return token; },
    get initialized() { return initialized; },
    configure,
    probe,
    url: url,
    ApiError,

    async search(queryText, platform, limit) {
      const q = (queryText || '').trim();
      if (!q) return { success: true, tracks: [] };
      if (demo()) return demoApi.search(q, platform, limit);
      return request('/api/search' + query({ q: q, platform: platform || 'youtube', limit: limit || 20 }), { timeout: 45000 });
    },

    async hot(limit) {
      if (demo()) return demoApi.hot(limit);
      return request('/api/hot' + query({ limit: limit || 12 }), { timeout: 45000 });
    },

    async albums(text) {
      if (!String(text || '').trim()) return { success: true, albums: [] };
      if (demo()) return demoApi.albums(text);
      return request('/api/albums/search' + query({ q: text }), { timeout: 30000 });
    },

    async albumTracks(id) {
      if (demo()) return demoApi.albumTracks(id);
      return request('/api/albums/tracks' + query({ id: id }), { timeout: 30000 });
    },

    async artistAlbums(name) {
      if (demo()) return demoApi.artistAlbums(name);
      return request('/api/artist-albums' + query({ name: name }), { timeout: 30000 });
    },

    async artistInfo(name) {
      if (demo()) return demoApi.artistInfo(name);
      return request('/api/artist' + query({ name: name }), { timeout: 30000 });
    },

    async lyrics(title, artist, allowOnline) {
      if (demo()) return demoApi.lyrics();
      return request('/api/lyrics' + query({ title: title, artist: artist, online: allowOnline === false ? '0' : '1' }), { timeout: 25000 });
    },

    async streamInfo(track) {
      if (demo()) return demoApi.streamInfo(track);
      return request('/api/stream-info' + query({
        url: track.url || '',
        id: track.id || '',
        platform: track.platform || 'youtube',
        title: track.title || '',
        artist: track.artist || '',
        duration: track.duration || 0,
        thumbnail: track.thumbnail || ''
      }), { timeout: 70000 });
    },

    async checkCache(trackId) {
      if (demo()) return { cached: false, streamUrl: null };
      return request('/api/check-cache' + query({ id: trackId }), { timeout: 12000 });
    },

    async library() {
      if (demo()) return demoApi.library();
      return request('/api/library', { timeout: 20000 });
    },

    async libraryRemove(id) {
      if (demo()) return demoApi.libraryRemove(id);
      return request('/api/library-remove', { method: 'POST', body: { id: id } });
    },

    async libraryAdd(items) {
      if (demo()) return demoApi.libraryAdd(items);
      return request('/api/library-add', { method: 'POST', body: { items: items }, timeout: 30000 });
    },

    async offlineLibrary() {
      if (demo()) return demoApi.offlineLibrary();
      return request('/api/offline-library', { timeout: 25000 });
    },

    async offlineDelete(id) {
      if (demo()) return demoApi.offlineDelete(id);
      return request('/api/offline-delete' + query({ id: id }), { method: 'POST' });
    },

    async clearOffline() {
      if (demo()) return demoApi.clearOffline();
      return request('/api/clear-offline-library', { method: 'POST' });
    },

    async download(track, options) {
      const opts = options || {};
      if (demo()) return demoApi.download(track, opts);
      return request('/api/download' + query({
        url: track.url || '',
        id: track.id || '',
        streamUrl: opts.streamUrl || '',
        title: track.title || '',
        artist: track.artist || '',
        format: opts.format || 'mp3',
        quality: opts.quality || '0',
        start: opts.start != null ? opts.start : '',
        end: opts.end != null ? opts.end : ''
      }), { timeout: 240000 });
    },

    async translate(texts, targetLang) {
      if (demo()) return demoApi.translate(texts, targetLang);
      return request('/api/translate', { method: 'POST', body: { texts: texts, targetLang: targetLang || 'en' }, timeout: 30000 });
    },

    async playlistImport(link) {
      if (demo()) return demoApi.playlistImport(link);
      return request('/api/playlist-import' + query({ url: link }), { timeout: 180000 });
    },

    async appleImport(link) {
      if (demo()) return demoApi.appleImport(link);
      return request('/api/apple-import' + query({ url: link }), { timeout: 180000 });
    },

    async saveCustomLyrics(title, artist, lyrics) {
      if (demo()) return demoApi.saveCustomLyrics(title, artist, lyrics);
      return request('/api/save-custom-lyrics' + query({ title: title, artist: artist }), {
        method: 'POST',
        body: { lyrics: lyrics },
        timeout: 20000
      });
    },

    async toolsStatus() {
      if (demo()) return demoApi.toolsStatus();
      return request('/api/tools-status', { timeout: 8000 });
    },

    fileUrl(id) {
      return mediaUrl('/api/library-file' + query({ id: id }));
    },

    downloadedUrl(name) {
      return mediaUrl('/api/downloaded-track' + query({ name: name }));
    },

    localTrackUrl(id) {
      return mediaUrl('/api/local-track' + query({ id: id }));
    },

    cacheTrackUrl(id) {
      return mediaUrl('/api/local-track' + query({ id: id }));
    }
  };

  global.RiffAPI = API;
})(window);
