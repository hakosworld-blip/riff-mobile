/* Riff Mobile — Settings screen */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const V = global.RiffViews;

  const ACCENTS = ['#d0bcff', '#8edda0', '#9dcaff', '#ffb4a9', '#f6bd60', '#c6a7ff', '#7fd6c9'];

  function group(label, children) {
    const card = UI.el('div', { class: 'settings-card' }, children);
    return UI.el('div', { class: 'settings-group' }, [
      UI.el('div', { class: 'settings-group__label', text: label }),
      card
    ]);
  }

  function row(options) {
    const opts = options || {};
    const node = UI.el(opts.href ? 'a' : 'button', {
      class: 'list-item',
      type: opts.href ? undefined : 'button',
      href: opts.href,
      target: opts.href ? '_blank' : undefined,
      rel: opts.href ? 'noreferrer' : undefined,
      onclick: opts.onClick
    }, [
      opts.icon ? UI.el('span', { class: 'list-item__icon' }, UI.icon(opts.icon)) : null,
      UI.el('div', { class: 'list-item__body' }, [
        UI.el('div', { class: 'list-item__title', text: opts.title }),
        opts.sub ? UI.el('div', { class: 'list-item__sub', text: opts.sub }) : null
      ]),
      opts.trailing || null
    ]);
    if (opts.href) node.style.textDecoration = 'none';
    return node;
  }

  function switchRow(icon, title, sub, getter, setter) {
    const control = UI.switchControl(Boolean(getter()), setter, title);
    return row({
      icon: icon,
      title: title,
      sub: sub,
      trailing: control,
      onClick: () => control.click()
    });
  }

  function render() {
    const settings = Store.state.settings;
    const root = V.screen();
    root.appendChild(V.header({ title: 'Settings' }));

    /* ---- appearance ---- */
    const appearance = UI.el('div', { class: 'settings-card' });

    appearance.appendChild(UI.el('div', { class: 'list-item', style: { display: 'block', paddingBottom: '12px' } }, [
      UI.el('div', { class: 'list-item__title', text: 'Theme' }),
      UI.el('div', { class: 'list-item__sub', text: 'Light, dark, or follow the device' }),
      UI.el('div', { style: { marginTop: '12px' } }, UI.segmented([
        { id: 'auto', label: 'Auto' },
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' }
      ], settings.themeMode, (id) => {
        Store.setSetting('themeMode', id);
        if (global.RiffTheme) global.RiffTheme.apply();
      }))
    ]));

    appearance.appendChild(switchRow(
      'palette',
      'Dynamic color',
      'Build the palette from the playing artwork',
      () => settings.dynamicColor,
      (value) => {
        Store.setSetting('dynamicColor', value);
        if (global.RiffTheme) global.RiffTheme.apply();
      }
    ));

    const accentRow = UI.el('div', { class: 'preview-dot-row' });
    function paintAccents() {
      accentRow.innerHTML = '';
      ACCENTS.forEach((color) => {
        const dot = UI.el('button', {
          class: 'preview-dot' + (settings.accent === color ? ' is-selected' : ''),
          type: 'button',
          style: { background: color },
          'aria-label': 'Accent ' + color,
          onclick: () => {
            Store.setSetting('accent', color);
            Store.setSetting('dynamicColor', false);
            paintAccents();
            if (global.RiffTheme) global.RiffTheme.apply();
            UI.snackbar('Accent updated');
          }
        });
        accentRow.appendChild(dot);
      });
    }
    paintAccents();
    appearance.appendChild(UI.el('div', { class: 'list-item', style: { display: 'block' } }, [
      UI.el('div', { class: 'list-item__title', text: 'Accent' }),
      UI.el('div', { class: 'list-item__sub', text: 'Used when dynamic color is off' }),
      accentRow
    ]));

    root.appendChild(group('Appearance', appearance));

    /* ---- playback ---- */
    const playback = UI.el('div', { class: 'settings-card' });
    const platformRow = UI.el('div', { class: 'chip-row', style: { padding: '10px 12px' } });
    [
      { id: 'ytmusic', label: 'YT Music' },
      { id: 'youtube', label: 'YouTube' },
      { id: 'soundcloud', label: 'SoundCloud' }
    ].forEach((item) => {
      platformRow.appendChild(UI.chip(item.label, {
        selected: settings.platform === item.id,
        onClick: () => {
          Store.setSetting('platform', item.id);
          Array.from(platformRow.children).forEach((node) => node.classList.remove('is-selected'));
          Array.from(platformRow.children).forEach((node) => {
            if (node.textContent === item.label) node.classList.add('is-selected');
          });
          UI.snackbar('Default provider: ' + item.label);
        }
      }));
    });
    playback.appendChild(UI.el('div', { class: 'list-item', style: { display: 'block', paddingBottom: '0' } }, [
      UI.el('div', { class: 'list-item__title', text: 'Default provider' }),
      UI.el('div', { class: 'list-item__sub', text: 'Used for search and stream resolution' }),
      platformRow
    ]));

    playback.appendChild(switchRow('equalizer', 'Volume normalisation', 'Even out loud and quiet tracks', () => settings.normalize, (value) => {
      Store.setSetting('normalize', value);
      global.RiffPlayer.refreshAudio();
    }));
    playback.appendChild(switchRow('headset', 'High quality engine', 'Riff HQ compressor and air shelf', () => settings.hq, (value) => {
      Store.setSetting('hq', value);
      global.RiffPlayer.refreshAudio();
    }));
    playback.appendChild(row({
      icon: 'tune',
      title: 'Equalizer & effects',
      sub: '10 bands, speed, pitch, reverb, distortion',
      trailing: UI.icon('chevron_right'),
      onClick: () => global.RiffPlayerView.openAudio()
    }));

    root.appendChild(group('Playback', playback));

    /* ---- downloads ---- */
    const downloads = UI.el('div', { class: 'settings-card' });

    const formatRow = UI.el('div', { class: 'chip-row', style: { padding: '10px 12px' } });
    ['mp3', 'flac', 'opus', 'm4a', 'wav'].forEach((format) => {
      formatRow.appendChild(UI.chip(format.toUpperCase(), {
        selected: settings.downloadFormat === format,
        onClick: () => {
          Store.setSetting('downloadFormat', format);
          Array.from(formatRow.children).forEach((node) => node.classList.remove('is-selected'));
          Array.from(formatRow.children).forEach((node) => {
            if (node.textContent.toLowerCase() === format) node.classList.add('is-selected');
          });
        }
      }));
    });
    downloads.appendChild(UI.el('div', { class: 'list-item', style: { display: 'block', paddingBottom: '0' } }, [
      UI.el('div', { class: 'list-item__title', text: 'Download format' }),
      UI.el('div', { class: 'list-item__sub', text: 'Applied to new downloads' }),
      formatRow
    ]));

    const qualityRow = UI.el('div', { class: 'chip-row', style: { padding: '10px 12px' } });
    [
      { id: '0', label: 'Best' },
      { id: '320', label: '320k' },
      { id: '256', label: '256k' },
      { id: '192', label: '192k' },
      { id: '128', label: '128k' }
    ].forEach((item) => {
      qualityRow.appendChild(UI.chip(item.label, {
        selected: settings.downloadQuality === item.id,
        onClick: () => {
          Store.setSetting('downloadQuality', item.id);
          Array.from(qualityRow.children).forEach((node) => node.classList.remove('is-selected'));
          Array.from(qualityRow.children).forEach((node) => {
            if (node.textContent === item.label) node.classList.add('is-selected');
          });
        }
      }));
    });
    downloads.appendChild(UI.el('div', { class: 'list-item', style: { display: 'block', paddingBottom: '0' } }, [
      UI.el('div', { class: 'list-item__title', text: 'Audio quality' }),
      UI.el('div', { class: 'list-item__sub', text: 'Bitrate for lossy formats' }),
      qualityRow
    ]));

    const manageRow = row({
      icon: 'offline',
      title: 'Offline downloads',
      sub: 'Loading…',
      trailing: UI.icon('chevron_right'),
      onClick: () => global.RiffNav.go('library', { tab: 'offline' })
    });
    downloads.appendChild(manageRow);
    API.offlineLibrary().then((data) => {
      const sub = manageRow.querySelector('.list-item__sub');
      if (sub && data) {
        sub.textContent = (data.count || 0) + ' tracks · ' + C.formatBytes(data.totalBytes || 0);
      }
    }).catch(() => {
      const sub = manageRow.querySelector('.list-item__sub');
      if (sub) sub.textContent = 'Unavailable while Riff is offline';
    });

    downloads.appendChild(row({
      icon: 'delete',
      title: 'Clear all downloads',
      sub: 'Free up space on this device',
      onClick: async () => {
        const ok = await UI.confirm({
          title: 'Clear all downloads?',
          text: 'Offline copies are deleted. Streaming still works.',
          confirmLabel: 'Clear',
          danger: true
        });
        if (!ok) return;
        try {
          await API.clearOffline();
          UI.snackbar('Downloads cleared');
          V.bus.emit('offline-changed');
        } catch (e) {
          UI.snackbar(e.message || 'Could not clear downloads');
        }
      }
    }));

    root.appendChild(group('Downloads', downloads));

    /* ---- storage ---- */
    const storage = UI.el('div', { class: 'settings-card' });
    const cacheRow = row({
      icon: 'folder',
      title: 'Cache',
      sub: 'Calculating…'
    });
    storage.appendChild(cacheRow);

    if (global.electronAPI && global.electronAPI.getCacheSize) {
      global.electronAPI.getCacheSize().then((size) => {
        const sub = cacheRow.querySelector('.list-item__sub');
        if (sub) sub.textContent = C.formatBytes(size || 0) + ' of artwork, streams and web data';
      }).catch(() => {});
      storage.appendChild(row({
        icon: 'refresh',
        title: 'Clear cache',
        sub: 'Keeps your library, playlists and downloads',
        onClick: async () => {
          try {
            await global.electronAPI.clearCache();
            UI.snackbar('Cache cleared');
          } catch (e) {
            UI.snackbar('Could not clear the cache');
          }
        }
      }));
    }

    storage.appendChild(row({
      icon: 'info',
      title: 'Privacy',
      sub: 'No accounts, no telemetry. Everything stays on this device.'
    }));
    root.appendChild(group('Storage & privacy', storage));

    /* ---- connection ---- */
    const connection = UI.el('div', { class: 'settings-card' });
    const statusPill = UI.el('span', {
      class: 'status-pill' + (API.online ? ' is-online' : ' is-offline'),
      text: API.isDemo ? 'Demo mode' : (API.online ? 'Connected' : 'Offline')
    });
    connection.appendChild(row({
      icon: 'server',
      title: 'Riff service',
      sub: API.baseUrl || 'Not connected',
      trailing: statusPill,
      onClick: () => global.RiffNav.go('connect', { back: true })
    }));

    connection.appendChild(row({
      icon: 'link',
      title: 'Pair with your computer',
      sub: API.isNative
        ? 'Enter the address and pairing code from Riff on your computer'
        : 'Point this app at a different Riff server',
      onClick: () => global.RiffNav.go('connect', { back: true })
    }));

    const toolsRow = row({
      icon: 'download',
      title: 'Download tools',
      sub: 'Checking yt-dlp and ffmpeg…'
    });
    connection.appendChild(toolsRow);
    API.toolsStatus().then((status) => {
      const sub = toolsRow.querySelector('.list-item__sub');
      if (!sub) return;
      const ok = status && status.ytDlp && status.ffmpeg;
      sub.textContent = ok ? 'yt-dlp and ffmpeg are ready' : 'yt-dlp or ffmpeg missing — downloads may fail';
    }).catch(() => {
      const sub = toolsRow.querySelector('.list-item__sub');
      if (sub) sub.textContent = 'Unavailable while Riff is offline';
    });

    connection.appendChild(row({
      icon: 'refresh',
      title: 'Reconnect',
      sub: 'Check the connection to the Riff service',
      onClick: async () => {
        UI.snackbar('Checking…');
        const ok = await API.probe();
        statusPill.textContent = API.isDemo ? 'Demo mode' : (ok ? 'Connected' : 'Offline');
        statusPill.classList.toggle('is-online', ok);
        statusPill.classList.toggle('is-offline', !ok);
        UI.snackbar(ok ? 'Connected to Riff' : 'Riff is not reachable');
      }
    }));

    root.appendChild(group('Connection', connection));

    /* ---- about ---- */
    const about = UI.el('div', { class: 'settings-card' });
    const versionRow = row({
      icon: 'music_note',
      title: 'Riff Mobile',
      sub: 'Material 3 music player'
    });
    about.appendChild(versionRow);
    if (global.electronAPI && global.electronAPI.getAppVersion) {
      global.electronAPI.getAppVersion().then((version) => {
        const sub = versionRow.querySelector('.list-item__sub');
        if (sub && version) sub.textContent = 'Version ' + version + ' · Material 3';
      }).catch(() => {});
    }
    about.appendChild(row({
      icon: 'link',
      title: 'Source code',
      sub: 'github.com/rootscripts/riff',
      href: 'https://github.com/rootscripts/riff',
      trailing: UI.icon('chevron_right')
    }));
    about.appendChild(row({
      icon: 'info',
      title: 'Desktop-only features',
      sub: 'Discord presence, plugins, CSS editor and the waveform editor stay in the desktop app',
      onClick: () => UI.dialog({
        icon: 'info',
        title: 'Desktop-only features',
        text: 'Riff Mobile covers listening, search, library, downloads, playlists, lyrics, EQ and DSP. Discord Rich Presence, community plugins, the theme/CSS editor, auto-updates and the waveform audio editor are desktop-specific and remain in the Riff desktop app.',
        confirmLabel: 'Got it'
      })
    }));

    root.appendChild(group('About', about));

    root.appendChild(UI.el('div', { class: 'section', style: { marginTop: '18px' } }, [
      UI.el('button', {
        class: 'btn btn--outlined btn--wide',
        type: 'button',
        style: { color: 'var(--md-sys-color-error)' },
        onclick: async () => {
          const ok = await UI.confirm({
            title: 'Reset local data?',
            text: 'Favorites, history, playlists and preferences on this device are cleared. Downloads are kept.',
            confirmLabel: 'Reset',
            danger: true
          });
          if (!ok) return;
          Store.reset();
          if (global.RiffTheme) global.RiffTheme.apply();
          UI.snackbar('Local data reset');
          global.RiffNav.go('home');
        }
      }, 'Reset local data')
    ]));

    root.appendChild(UI.el('div', {
      class: 'empty__text',
      style: { padding: '22px 24px 10px', textAlign: 'center' },
      text: 'Riff is free and open source. No subscriptions, no ads, no tracking.'
    }));

    return root;
  }

  V.settings = { render };
})(window);
