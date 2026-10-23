/* Riff Mobile — native background playback bridge.

   The audio itself stays in the WebView (so the 10-band EQ, DSP and analyser
   keep working), while a small native plugin owns the media session:
     · Android — foreground service + MediaSession + MediaStyle notification
     · iOS     — AVAudioSession, MPNowPlayingInfoCenter, MPRemoteCommandCenter
   Native transport buttons are forwarded back here as `command` events.

   The module is inert in a browser/PWA, where the Media Session API already
   handles lock-screen controls. */

(function (global) {
  'use strict';

  const Capacitor = global.Capacitor;
  const native = Boolean(
    Capacitor &&
    typeof Capacitor.isNativePlatform === 'function' &&
    Capacitor.isNativePlatform()
  );

  function loadPlugin() {
    if (!native || !Capacitor) return null;
    try {
      if (Capacitor.Plugins && Capacitor.Plugins.RiffBackgroundAudio) {
        return Capacitor.Plugins.RiffBackgroundAudio;
      }
      if (typeof Capacitor.registerPlugin === 'function') {
        return Capacitor.registerPlugin('RiffBackgroundAudio');
      }
    } catch (e) {}
    return null;
  }

  const plugin = loadPlugin();
  const Player = global.RiffPlayer;

  let enabled = false;
  let starting = false;
  let lastPositionSent = 0;
  let lastTrackKey = '';

  function available() {
    return Boolean(plugin && native);
  }

  function call(method, options) {
    if (!available()) return Promise.resolve(null);
    try {
      return Promise.resolve(plugin[method](options || {})).catch((err) => {
        // A missing native implementation must never break playback.
        if (global.console && console.warn) console.warn('Riff background audio:', err && err.message ? err.message : err);
        return null;
      });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function trackKey(track) {
    if (!track) return '';
    return String(track.id || track.url || '') + '|' + track.title + '|' + track.artist;
  }

  function metadata(track) {
    if (!track) return {};
    return {
      title: track.title || 'Riff',
      artist: track.artist || '',
      album: track.album || '',
      artwork: track.thumbnail || track.localThumbnail || '',
      duration: Number(track.duration) || 0
    };
  }

  function snapshot() {
    const time = Player.timeSnapshot();
    return {
      playing: Boolean(Player.state.playing),
      position: Number(time.currentTime) || 0,
      duration: Number(time.duration) || 0
    };
  }

  function enable() {
    if (!available() || enabled || starting) return;
    starting = true;
    const state = snapshot();
    call('enable', Object.assign({}, metadata(Player.state.current), state)).then(() => {
      enabled = true;
      starting = false;
    });
  }

  function disable() {
    if (!available() || !enabled) return;
    enabled = false;
    lastTrackKey = '';
    call('disable');
  }

  function syncTrack() {
    const track = Player.state.current;
    if (!track) {
      disable();
      return;
    }
    lastTrackKey = trackKey(track);
    if (!enabled) enable();
    else call('update', Object.assign({}, metadata(track), snapshot()));
    lastPositionSent = snapshot().position;
  }

  function syncState() {
    const track = Player.state.current;
    if (!track) {
      disable();
      return;
    }
    if (!enabled) {
      enable();
      return;
    }
    const state = snapshot();
    call('update', Object.assign({}, metadata(track), state));
    lastPositionSent = state.position;
  }

  function syncPosition() {
    if (!available() || !enabled) return;
    if (lastTrackKey !== trackKey(Player.state.current)) {
      syncTrack();
      return;
    }
    const state = snapshot();
    // Position is extrapolated natively between updates, so 4s is plenty and
    // keeps the JS bridge quiet while the screen is off.
    if (Math.abs(state.position - lastPositionSent) < 4) return;
    lastPositionSent = state.position;
    call('setPosition', { position: state.position, duration: state.duration, playing: state.playing });
  }

  function runCommand(action, position) {
    if (!Player) return;
    if (!Player.state.current) return;
    switch (action) {
      case 'play':
        if (!Player.state.playing) Player.play();
        break;
      case 'pause':
        if (Player.state.playing) Player.pause();
        break;
      case 'toggle':
        Player.toggle();
        break;
      case 'next':
        Player.next();
        break;
      case 'previous':
        Player.previous();
        break;
      case 'seek':
        if (Number.isFinite(Number(position))) Player.seek(Number(position));
        break;
      default:
        break;
    }
  }

  function listen() {
    if (!available() || typeof plugin.addListener !== 'function') return;
    plugin.addListener('command', (event) => {
      runCommand(event && event.action, event && event.position);
    });
  }

  if (available() && Player) {
    listen();
    Player.on('track', syncTrack);
    Player.on('state', syncState);
    Player.on('time', syncPosition);
    global.document.addEventListener('visibilitychange', () => {
      // Coming back from the background: reconcile title/state with native.
      if (!global.document.hidden && Player.state.current) syncState();
    });
  }

  global.RiffBackground = {
    available,
    enable,
    disable,
    refresh: syncState,
    isNative: native
  };
})(window);
