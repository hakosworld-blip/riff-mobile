/* Riff Mobile — shared, dependency-free logic.
   Pure functions only (no DOM access except the optional artwork sampler),
   usable from the browser and from node's test runner. */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RiffCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) return hours + ':' + pad(minutes) + ':' + pad(seconds);
    return minutes + ':' + pad(seconds);
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = n / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return (value >= 10 ? Math.round(value) : value.toFixed(1)) + ' ' + units[unit];
  }

  function hashHue(input) {
    const text = String(input || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) % 100003;
    }
    return hash % 360;
  }

  /* ---------------- Material 3 color ---------------- */

  function clampByte(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function hexToRgb(hex) {
    let value = String(hex || '').trim().replace('#', '');
    if (value.length === 3) value = value.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 103, g: 80, b: 164 };
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('');
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToHex(h, s, l) {
    const hue = ((Number(h) % 360) + 360) % 360;
    const sat = clamp(s, 0, 100) / 100;
    const light = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = light - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  function tone(hue, sat, toneValue) {
    return hslToHex(hue, sat, toneValue);
  }

  function generateScheme(seedHex, mode) {
    const dark = mode !== 'light';
    const rgb = hexToRgb(seedHex);
    const seed = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const ph = seed.h;
    // keep energetic, legible accents regardless of the artwork's saturation
    const ps = clamp(seed.s < 12 ? 46 : seed.s, 34, 68);
    const sh = ph + 16;
    const th = ph + 62;
    const nh = ph;
    const nv = ph;

    const scheme = {
      '--md-sys-color-primary': tone(ph, ps, dark ? 80 : 40),
      '--md-sys-color-on-primary': tone(ph, ps * 0.55, dark ? 20 : 100),
      '--md-sys-color-primary-container': tone(ph, ps * 0.82, dark ? 32 : 90),
      '--md-sys-color-on-primary-container': tone(ph, ps * 0.5, dark ? 92 : 12),
      '--md-sys-color-secondary': tone(sh, ps * 0.32, dark ? 80 : 40),
      '--md-sys-color-on-secondary': tone(sh, ps * 0.24, dark ? 20 : 100),
      '--md-sys-color-secondary-container': tone(sh, ps * 0.34, dark ? 30 : 90),
      '--md-sys-color-on-secondary-container': tone(sh, ps * 0.26, dark ? 90 : 12),
      '--md-sys-color-tertiary': tone(th, clamp(ps * 0.58, 24, 52), dark ? 82 : 40),
      '--md-sys-color-on-tertiary': tone(th, ps * 0.3, dark ? 20 : 100),
      '--md-sys-color-tertiary-container': tone(th, clamp(ps * 0.5, 22, 46), dark ? 30 : 90),
      '--md-sys-color-on-tertiary-container': tone(th, ps * 0.32, dark ? 92 : 12),

      '--md-sys-color-background': tone(nh, dark ? 10 : 20, dark ? 6 : 98),
      '--md-sys-color-on-background': tone(nh, 10, dark ? 92 : 10),
      '--md-sys-color-surface': tone(nh, dark ? 10 : 20, dark ? 6 : 98),
      '--md-sys-color-on-surface': tone(nh, 10, dark ? 92 : 10),
      '--md-sys-color-surface-dim': tone(nh, 10, dark ? 5 : 88),
      '--md-sys-color-surface-bright': tone(nh, 10, dark ? 24 : 99),
      '--md-sys-color-surface-variant': tone(nv, 12, dark ? 30 : 90),
      '--md-sys-color-on-surface-variant': tone(nv, 12, dark ? 80 : 30),
      '--md-sys-color-surface-container-lowest': tone(nh, 10, dark ? 4 : 100),
      '--md-sys-color-surface-container-low': tone(nh, 10, dark ? 10 : 96),
      '--md-sys-color-surface-container': tone(nh, 10, dark ? 12 : 94),
      '--md-sys-color-surface-container-high': tone(nh, 10, dark ? 17 : 92),
      '--md-sys-color-surface-container-highest': tone(nh, 10, dark ? 22 : 90),
      '--md-sys-color-outline': tone(nv, 12, dark ? 60 : 50),
      '--md-sys-color-outline-variant': tone(nv, 12, dark ? 30 : 80),
      '--md-sys-color-inverse-surface': tone(nh, 10, dark ? 92 : 20),
      '--md-sys-color-inverse-on-surface': tone(nh, 10, dark ? 20 : 95),
      '--md-sys-color-inverse-primary': tone(ph, ps, dark ? 40 : 80)
    };

    scheme['--md-sys-color-error'] = dark ? '#ffb4ab' : '#b3261e';
    scheme['--md-sys-color-on-error'] = dark ? '#690005' : '#ffffff';
    scheme['--md-sys-color-error-container'] = dark ? '#93000a' : '#f9dedc';
    scheme['--md-sys-color-on-error-container'] = dark ? '#ffdad6' : '#410e0b';
    scheme['--md-sys-color-scrim'] = '#000000';
    scheme['--md-sys-color-shadow'] = '#000000';
    scheme['--riff-seed'] = rgbToHex(rgb.r, rgb.g, rgb.b);
    scheme['--riff-seed-hue'] = String(ph);
    scheme['--riff-seed-hsl'] = seed.h + ' ' + seed.s + '% ' + seed.l + '%';
    return scheme;
  }

  /* Sample a dominant color from artwork. Returns null when the image is
     tainted (CORS) or unavailable — callers fall back to a deterministic hue. */
  function extractArtworkColor(src) {
    return new Promise((resolve) => {
      if (typeof document === 'undefined' || !src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timeout = setTimeout(() => done(null), 4500);
      img.onload = () => {
        clearTimeout(timeout);
        try {
          const size = 28;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return done(null);
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          const buckets = new Map();
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 200) continue;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const hsl = rgbToHsl(r, g, b);
            if (hsl.l < 12 || hsl.l > 92 || hsl.s < 8) continue;
            const bucket = Math.round(hsl.h / 20);
            const weight = 1 + hsl.s / 42;
            const entry = buckets.get(bucket) || { weight: 0, r: 0, g: 0, b: 0 };
            entry.weight += weight;
            entry.r += r * weight;
            entry.g += g * weight;
            entry.b += b * weight;
            buckets.set(bucket, entry);
          }
          let best = null;
          buckets.forEach((entry) => {
            if (!best || entry.weight > best.weight) best = entry;
          });
          if (!best) return done(null);
          done(rgbToHex(best.r / best.weight, best.g / best.weight, best.b / best.weight));
        } catch (e) {
          done(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        done(null);
      };
      img.src = src;
    });
  }

  /* ---------------- lyrics ---------------- */

  function parseLrc(raw) {
    const text = String(raw || '');
    if (!text.trim()) return { synced: false, lines: [], offset: 0 };

    const offsetMatch = text.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
    const offset = offsetMatch ? parseInt(offsetMatch[1], 10) / 1000 : 0;
    const lines = [];
    let timed = 0;

    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const stamps = Array.from(line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g));
      const content = line.replace(/\[[^\]]*\]/g, '').trim();
      if (stamps.length === 0) {
        if (content && !/^[a-z]+:/i.test(content)) lines.push({ time: null, text: content });
        return;
      }
      if (/^\[(ar|ti|al|by|re|ve|length|offset):/i.test(line)) return;
      stamps.forEach((match) => {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const fraction = match[3] ? parseFloat('0.' + match[3].padEnd(3, '0')) : 0;
        lines.push({ time: Math.max(0, minutes * 60 + seconds + fraction + offset), text: content });
        timed++;
      });
    });

    if (timed === 0) {
      return { synced: false, lines, offset };
    }

    const timedLines = lines.filter((l) => l.time !== null).sort((a, b) => a.time - b.time);
    return { synced: true, lines: timedLines, offset };
  }

  function activeLyricIndex(lines, time) {
    if (!Array.isArray(lines) || lines.length === 0) return -1;
    if (lines[0].time === null || lines[0].time === undefined) return -1;
    let lo = 0;
    let hi = lines.length - 1;
    let found = -1;
    const t = Number(time) || 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].time <= t + 0.06) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  /* ---------------- tracks & queue ---------------- */

  function normalizeTrack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const durationMs = Number(raw.durationMs || 0);
    const platform = raw.platform || (raw.isLocal ? 'local' : 'youtube');
    const duration = Number(raw.duration != null ? raw.duration : durationMs / 1000) || 0;
    return {
      id: raw.id != null ? String(raw.id) : '',
      cleanId: raw.cleanId ? String(raw.cleanId) : '',
      title: String(raw.title || raw.name || 'Untitled'),
      artist: String(raw.artist || raw.artistName || raw.uploader || 'Unknown artist'),
      duration,
      thumbnail: raw.thumbnail || raw.localThumbnail || raw.cover || raw.artwork || '',
      url: raw.url || raw.webpage_url || '',
      platform,
      isCached: Boolean(raw.isCached),
      isLocal: platform === 'local' || Boolean(raw.isLocal),
      needsResolve: Boolean(raw.needsResolve),
      fileSize: Number(raw.fileSize || 0),
      trackNo: Number(raw.no || raw.trackNo || 0) || 0,
      addedAt: Number(raw.addedAt || 0) || 0
    };
  }

  function trackKey(track) {
    if (!track) return '';
    if (track.id) return String(track.platform || '') + ':' + String(track.id);
    return String(track.platform || '') + ':' + String(track.title) + '|' + String(track.artist);
  }

  function uniqueTracks(list) {
    const seen = new Set();
    const out = [];
    (list || []).forEach((item) => {
      const track = normalizeTrack(item);
      if (!track) return;
      const key = trackKey(track);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(track);
    });
    return out;
  }

  function nextIndex(options) {
    const length = Math.max(0, Number(options.length) || 0);
    const index = Number(options.index);
    const repeat = options.repeat || 'off';
    const direction = Number(options.direction) >= 0 ? 1 : -1;
    if (length === 0) return -1;
    if (!Number.isFinite(index) || index < 0) return direction > 0 ? 0 : length - 1;
    const candidate = index + direction;
    if (candidate >= 0 && candidate < length) return candidate;
    if (repeat === 'all') return direction > 0 ? 0 : length - 1;
    return -1;
  }

  function buildShuffleOrder(length, startIndex, rand) {
    const random = typeof rand === 'function' ? rand : Math.random;
    const order = [];
    for (let i = 0; i < length; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    if (Number.isInteger(startIndex) && startIndex >= 0 && startIndex < length) {
      const at = order.indexOf(startIndex);
      if (at > 0) {
        order.splice(at, 1);
        order.unshift(startIndex);
      }
    }
    return order;
  }

  function mergeHistory(list, track, limit) {
    const max = Number(limit) || 100;
    const entry = Object.assign({}, track, { playedAt: Date.now() });
    const key = trackKey(track);
    const rest = (list || []).filter((item) => trackKey(item) !== key);
    return [entry].concat(rest).slice(0, max);
  }

  function groupArtists(tracks) {
    const map = new Map();
    (tracks || []).forEach((raw) => {
      const track = normalizeTrack(raw);
      if (!track || !track.artist) return;
      const key = track.artist.trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        if (!existing.thumbnail && track.thumbnail) existing.thumbnail = track.thumbnail;
      } else {
        map.set(key, {
          name: track.artist.trim(),
          thumbnail: track.thumbnail || '',
          count: 1
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  function equalsTrack(a, b) {
    if (!a || !b) return false;
    return trackKey(a) === trackKey(b);
  }

  const EQ_FREQUENCIES = [
    { hz: 32, label: '32' },
    { hz: 64, label: '64' },
    { hz: 125, label: '125' },
    { hz: 250, label: '250' },
    { hz: 500, label: '500' },
    { hz: 1000, label: '1k' },
    { hz: 2000, label: '2k' },
    { hz: 4000, label: '4k' },
    { hz: 8000, label: '8k' },
    { hz: 16000, label: '16k' }
  ];

  const EQ_PRESETS = [
    { id: 'flat', name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'bass', name: 'Bass boost', bands: [7, 6, 4.5, 2.5, 0, 0, 0, 0, 0.5, 1] },
    { id: 'vocal', name: 'Vocal clarity', bands: [-1.5, -1, 0, 2, 4, 5, 3.5, 1, 0, 0] },
    { id: 'electronic', name: 'Electronic', bands: [5, 4, 1, -1, 0.5, 1, 2, 4, 5, 3] },
    { id: 'rock', name: 'Rock', bands: [4.5, 3.5, 2, -0.5, -1, 1, 3, 4.5, 5, 4] },
    { id: 'night', name: 'Late night', bands: [-3, -2, 0, 1, 2, 1.5, 0, -1.5, -2.5, -3] }
  ];

  /* ---------------- connection helpers ----------------
     The desktop server hands out media URLs on http://127.0.0.1:PORT.
     A phone can't reach that loopback address, so every response is rewritten
     onto the paired server before it reaches the player. */

  const DEFAULT_PORT = 38472;
  const LOOPBACK_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?(\/[^\s]*)?$/i;

  function normalizeServerUrl(input) {
    let text = String(input == null ? '' : input).trim();
    if (!text) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'http://' + text;
    let parsed;
    try {
      parsed = new URL(text);
    } catch (e) {
      return '';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (!parsed.hostname) return '';
    const base = parsed.protocol + '//' + parsed.hostname + (parsed.port ? ':' + parsed.port : '');
    return base.replace(/\/+$/, '');
  }

  function withDefaultPort(serverUrl) {
    const base = normalizeServerUrl(serverUrl);
    if (!base) return '';
    try {
      const parsed = new URL(base);
      if (!parsed.port && parsed.protocol === 'http:') return parsed.protocol + '//' + parsed.hostname + ':' + DEFAULT_PORT;
    } catch (e) {}
    return base;
  }

  function isLoopbackUrl(value) {
    return typeof value === 'string' && LOOPBACK_URL.test(value);
  }

  function addTokenToUrl(link, token) {
    if (!token || typeof link !== 'string') return link;
    try {
      const parsed = new URL(link);
      if (!/^\/api\//.test(parsed.pathname)) return link;
      if (parsed.searchParams.get('token') === token) return link;
      parsed.searchParams.set('token', token);
      return parsed.toString();
    } catch (e) {
      return link;
    }
  }

  function rewriteServerValue(value, serverUrl, token, depth) {
    if ((depth || 0) > 12) return value;
    if (typeof value === 'string') {
      const match = value.match(LOOPBACK_URL);
      if (!match) return value;
      const base = String(serverUrl || '').replace(/\/+$/, '');
      if (!base) return value;
      return addTokenToUrl(base + (match[2] || '/'), token);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => rewriteServerValue(entry, serverUrl, token, (depth || 0) + 1));
    }
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach((key) => {
        out[key] = rewriteServerValue(value[key], serverUrl, token, (depth || 0) + 1);
      });
      return out;
    }
    return value;
  }

  return {
    clamp,
    normalizeServerUrl,
    withDefaultPort,
    isLoopbackUrl,
    rewriteServerUrls: rewriteServerValue,
    addTokenToUrl,
    formatTime,
    formatBytes,
    hashHue,
    hexToRgb,
    rgbToHsl,
    hslToHex,
    generateScheme,
    extractArtworkColor,
    parseLrc,
    activeLyricIndex,
    normalizeTrack,
    trackKey,
    uniqueTracks,
    nextIndex,
    buildShuffleOrder,
    mergeHistory,
    groupArtists,
    equalsTrack,
    EQ_FREQUENCIES,
    EQ_PRESETS
  };
});
