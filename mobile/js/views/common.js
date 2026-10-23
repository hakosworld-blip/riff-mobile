/* Riff Mobile — shared building blocks for screens. */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const Player = global.RiffPlayer;
  const V = global.RiffViews = global.RiffViews || {};

  const bus = {
    handlers: new Map(),
    on(event, fn) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event).add(fn);
      return () => this.handlers.get(event).delete(fn);
    },
    emit(event, payload) {
      const set = this.handlers.get(event);
      if (set) set.forEach((fn) => { try { fn(payload); } catch (e) {} });
    }
  };

  function screen() {
    return UI.el('div', { class: 'screen' });
  }

  function header(options) {
    const opts = options || {};
    return UI.el('header', { class: 'app-bar' + (opts.flat ? ' app-bar--flat' : '') }, [
      opts.back
        ? UI.iconButton('arrow_back', { label: 'Back', onClick: () => global.RiffNav.back() })
        : (opts.leadingIcon ? UI.iconButton(opts.leadingIcon, { label: opts.leadingLabel || '', onClick: opts.onLeading }) : null),
      UI.el('div', { class: 'app-bar__title' }, [
        UI.el('span', { text: opts.title || '' }),
        opts.subtitle ? UI.el('span', { class: 'app-bar__subtitle', text: opts.subtitle }) : null
      ]),
      opts.actions ? UI.el('div', { class: 'app-bar__actions' }, opts.actions) : null
    ]);
  }

  function brandHeader(options) {
    const opts = options || {};
    return UI.el('header', { class: 'app-bar' }, [
      UI.el('div', { class: 'brand-mark' }, [
        UI.el('span', { class: 'brand-mark__dot' }, UI.icon('music_note', 18)),
        UI.el('span', { text: 'Riff' })
      ]),
      UI.el('div', { class: 'app-bar__actions' }, opts.actions || [])
    ]);
  }

  function connectionCard(onRetry, onSetup) {
    return UI.el('div', { class: 'card', style: { margin: '16px', padding: '18px' } }, [
      UI.el('div', { class: 'row', style: { gap: '12px', alignItems: 'flex-start' } }, [
        UI.el('span', { class: 'list-item__icon' }, UI.icon('wifi')),
        UI.el('div', { style: { flex: '1' } }, [
          UI.el('div', { class: 'list-item__title', text: 'Riff is not reachable' }),
          UI.el('div', { class: 'list-item__sub', text: 'Start the Riff app on your computer, then retry. Your saved library still works offline.' })
        ])
      ]),
      UI.el('div', { class: 'row', style: { gap: '8px', marginTop: '14px' } }, [
        UI.el('button', {
          class: 'btn btn--tonal',
          type: 'button',
          onclick: onRetry
        }, [UI.icon('refresh'), 'Retry']),
        onSetup
          ? UI.el('button', {
            class: 'btn btn--text',
            type: 'button',
            onclick: onSetup
          }, [UI.icon('link'), 'Connection setup'])
          : null
      ])
    ]);
  }

  function playTracks(tracks, startIndex, context) {
    const list = (tracks || []).filter(Boolean);
    if (list.length === 0) {
      UI.snackbar('Nothing to play yet');
      return;
    }
    const index = Math.max(0, Math.min(list.length - 1, Number(startIndex) || 0));
    Player.setQueue(list, index, context || '');
    UI.haptic(10);
  }

  function shuffleTracks(tracks, context) {
    const list = (tracks || []).filter(Boolean);
    if (list.length === 0) return;
    const order = C.buildShuffleOrder(list.length, 0);
    const shuffled = order.map((i) => list[i]);
    Player.setQueue(shuffled, 0, context || '');
    UI.haptic(10);
  }

  function toggleFavorite(track) {
    const active = Store.toggleFavorite(track);
    UI.haptic(8);
    UI.snackbar(active ? 'Added to favorites' : 'Removed from favorites', {
      actionLabel: 'Undo',
      onAction: () => Store.toggleFavorite(track)
    });
    bus.emit('favorites-changed', track);
    return active;
  }

  function favoriteButton(track) {
    const button = UI.iconButton(Store.isFavorite(track) ? 'heart_filled' : 'heart', {
      label: 'Favorite',
      onClick: () => {
        const active = toggleFavorite(track);
        button.innerHTML = '';
        button.appendChild(UI.icon(active ? 'heart_filled' : 'heart'));
        button.classList.toggle('is-active', active);
      }
    });
    button.classList.toggle('is-active', Store.isFavorite(track));
    return button;
  }

  function addToPlaylistSheet(track) {
    const container = UI.el('div', { class: 'list' });

    function refresh() {
      container.innerHTML = '';
      container.appendChild(UI.listItem({
        icon: 'add',
        title: 'New playlist',
        sub: 'Create a playlist with this track',
        onClick: async () => {
          const name = await UI.prompt({
            title: 'New playlist',
            placeholder: 'Playlist name',
            confirmLabel: 'Create'
          });
          if (!name) return;
          const playlist = Store.createPlaylist(name, [track]);
          UI.snackbar('Created "' + playlist.name + '"', {
            actionLabel: 'Open',
            onAction: () => global.RiffNav.go('playlist', { id: playlist.id })
          });
          bus.emit('playlists-changed');
          sheet.close();
        }
      }));

      if (Store.state.playlists.length === 0) {
        container.appendChild(UI.el('div', { class: 'empty__text', style: { padding: '14px 12px' }, text: 'You have no playlists yet.' }));
      }

      Store.state.playlists.forEach((playlist) => {
        container.appendChild(UI.listItem({
          icon: 'queue_music',
          title: playlist.name,
          sub: playlist.tracks.length + (playlist.tracks.length === 1 ? ' track' : ' tracks'),
          onClick: () => {
            const result = Store.addToPlaylist(playlist.id, [track]);
            UI.snackbar(result.added > 0 ? 'Added to ' + playlist.name : 'Already in ' + playlist.name);
            bus.emit('playlists-changed');
            sheet.close();
          }
        }));
      });
    }

    refresh();
    const sheet = UI.sheet({
      title: 'Add to playlist',
      content: container
    });
    return sheet;
  }

  function albumPlaceholder(track) {
    if (track && track.album) return track.album;
    return 'Single';
  }

  function trackMenu(track, options) {
    const opts = options || {};
    const isFav = Store.isFavorite(track);
    const items = [
      {
        icon: 'play',
        label: 'Play now',
        onClick: () => playTracks([track], 0, opts.context || track.title)
      },
      {
        icon: 'queue',
        label: 'Play next',
        onClick: () => {
          Player.addToQueue(track, true);
          UI.snackbar('Playing next');
        }
      },
      {
        icon: 'playlist_add',
        label: 'Add to queue',
        onClick: () => {
          Player.addToQueue(track, false);
          UI.snackbar('Added to queue');
        }
      },
      {
        icon: 'library_add',
        label: 'Add to playlist',
        onClick: () => addToPlaylistSheet(track)
      },
      {
        icon: isFav ? 'heart_filled' : 'heart',
        label: isFav ? 'Remove from favorites' : 'Add to favorites',
        onClick: () => toggleFavorite(track)
      }
    ];

    if (track.artist) {
      items.push({
        icon: 'person',
        label: 'Go to artist',
        onClick: () => global.RiffNav.go('artist', { name: track.artist })
      });
    }

    items.push({
      icon: 'download',
      label: 'Download',
      onClick: () => downloadSheet(track)
    });

    if (opts.playlistId) {
      items.push({
        icon: 'delete',
        label: 'Remove from playlist',
        danger: true,
        onClick: () => {
          Store.removeFromPlaylist(opts.playlistId, track);
          UI.snackbar('Removed from playlist');
          bus.emit('playlists-changed');
          if (opts.onChanged) opts.onChanged();
        }
      });
    } else if (track.isLocal) {
      items.push({
        icon: 'delete',
        label: 'Remove from library',
        danger: true,
        onClick: async () => {
          const ok = await UI.confirm({
            title: 'Remove from library?',
            text: 'This deletes the file from your Riff library.',
            confirmLabel: 'Remove',
            danger: true
          });
          if (!ok) return;
          try {
            await API.libraryRemove(track.id);
            UI.snackbar('Removed from library');
            bus.emit('library-changed');
            if (opts.onChanged) opts.onChanged();
          } catch (e) {
            UI.snackbar(e.message || 'Could not remove the track');
          }
        }
      });
    } else if (opts.offline) {
      items.push({
        icon: 'offline',
        label: 'Delete download',
        danger: true,
        onClick: async () => {
          const ok = await UI.confirm({
            title: 'Delete download?',
            text: 'The offline copy will be removed from this device.',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await API.offlineDelete(track.cleanId || track.id);
            UI.snackbar('Download deleted');
            bus.emit('offline-changed');
            if (opts.onChanged) opts.onChanged();
          } catch (e) {
            UI.snackbar(e.message || 'Could not delete the download');
          }
        }
      });
    }

    UI.menu({ title: track.title, items });
  }

  function downloadSheet(track) {
    const settings = Store.state.settings;
    const body = UI.el('div');

    let format = settings.downloadFormat || 'mp3';
    let quality = settings.downloadQuality || '0';
    let expanded = false;

    const formatRow = UI.el('div', { class: 'chip-row', style: { padding: '4px 0' } });
    ['mp3', 'flac', 'opus', 'm4a', 'wav'].forEach((value) => {
      formatRow.appendChild(UI.chip(value.toUpperCase(), {
        selected: value === format,
        onClick: () => {
          format = value;
          Array.from(formatRow.children).forEach((node) => node.classList.remove('is-selected'));
          formatRow.querySelectorAll('.chip').forEach((node) => {
            if (node.textContent.toLowerCase() === value) node.classList.add('is-selected');
          });
        }
      }));
    });

    const qualityRow = UI.el('div', { class: 'chip-row', style: { padding: '4px 0' } });
    const qualities = [
      { id: '0', label: 'Best' },
      { id: '320', label: '320k' },
      { id: '256', label: '256k' },
      { id: '192', label: '192k' },
      { id: '128', label: '128k' }
    ];
    qualities.forEach((item) => {
      qualityRow.appendChild(UI.chip(item.label, {
        selected: item.id === quality,
        onClick: () => {
          quality = item.id;
          qualityRow.querySelectorAll('.chip').forEach((node) => node.classList.remove('is-selected'));
          Array.from(qualityRow.children).forEach((node) => {
            if (node.textContent.trim() === item.label) node.classList.add('is-selected');
          });
        }
      }));
    });

    const startInput = UI.el('input', { type: 'text', inputmode: 'decimal', placeholder: '0:00' });
    const endInput = UI.el('input', { type: 'text', inputmode: 'decimal', placeholder: 'end' });
    const trimBox = UI.el('div', {
      class: 'field-row',
      style: { display: 'none' }
    }, [
      UI.el('div', { class: 'field' }, startInput),
      UI.el('div', { class: 'field' }, endInput)
    ]);

    const trackInfo = UI.el('div', { class: 'row', style: { gap: '12px', marginBottom: '14px' } }, [
      UI.art(track, 'art--m'),
      UI.el('div', { style: { minWidth: '0' } }, [
        UI.el('div', { class: 'list-item__title', text: track.title }),
        UI.el('div', { class: 'list-item__sub', text: track.artist })
      ])
    ]);

    body.appendChild(trackInfo);
    body.appendChild(UI.el('div', { class: 'settings-group__label', style: { paddingLeft: '0' }, text: 'Format' }));
    body.appendChild(formatRow);
    body.appendChild(UI.el('div', { class: 'settings-group__label', style: { paddingLeft: '0', marginTop: '12px' }, text: 'Quality' }));
    body.appendChild(qualityRow);

    const trimToggle = UI.el('button', {
      class: 'btn btn--text btn--small',
      type: 'button',
      style: { marginTop: '10px' },
      onclick: () => {
        expanded = !expanded;
        trimBox.style.display = expanded ? 'flex' : 'none';
        trimToggle.textContent = expanded ? 'Hide trim' : 'Trim clip (optional)';
      }
    }, 'Trim clip (optional)');

    body.appendChild(trimToggle);
    body.appendChild(trimBox);

    const progress = UI.el('div', { class: 'progress-bar', style: { display: 'none' } }, UI.el('span'));
    const action = UI.el('button', {
      class: 'btn btn--filled btn--wide',
      type: 'button',
      style: { marginTop: '18px' },
      onclick: async () => {
        const start = parseSeconds(startInput.value);
        const end = parseSeconds(endInput.value);
        action.disabled = true;
        action.textContent = 'Downloading…';
        progress.style.display = 'block';
        try {
          const source = Object.assign({}, track, {
            id: track.resolvedId || track.cleanId || track.id,
            url: track.resolvedUrl || track.url
          });
          const result = await API.download(source, {
            format: format,
            quality: quality,
            start: start != null ? start : undefined,
            end: end != null ? end : undefined
          });
          if (!result || !result.success) throw new Error((result && result.error) || 'Download failed');
          sheet.close();
          UI.snackbar('Saved ' + (result.filename || 'track'), { actionLabel: 'OK' });
          bus.emit('offline-changed');
        } catch (e) {
          action.disabled = false;
          action.textContent = 'Download';
          progress.style.display = 'none';
          UI.snackbar(e.message || 'Download failed');
        }
      }
    }, 'Download');

    body.appendChild(progress);
    body.appendChild(action);

    const sheet = UI.sheet({ title: 'Download', content: body });
    return sheet;
  }

  async function downloadAll(tracks, label) {
    const list = (tracks || []).filter(Boolean);
    if (list.length === 0) {
      UI.snackbar('Nothing to download');
      return;
    }
    const settings = Store.state.settings;
    const ok = await UI.confirm({
      icon: 'download',
      title: 'Download ' + list.length + (list.length === 1 ? ' track' : ' tracks') + '?',
      text: (label ? label + ' · ' : '') + 'Saved as ' + String(settings.downloadFormat || 'mp3').toUpperCase() + ' in your downloads folder.',
      confirmLabel: 'Download'
    });
    if (!ok) return;

    const progress = UI.snackbar('Downloading 1/' + list.length + ' · ' + list[0].title, { duration: 3600000 });
    let done = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      const track = list[i];
      progress.setText('Downloading ' + (i + 1) + '/' + list.length + ' · ' + track.title);
      try {
        const source = Object.assign({}, track, {
          id: track.resolvedId || track.cleanId || track.id,
          url: track.resolvedUrl || track.url
        });
        await API.download(source, {
          format: settings.downloadFormat || 'mp3',
          quality: settings.downloadQuality || '0'
        });
        done++;
      } catch (e) {
        failed++;
      }
    }
    progress.dismiss();
    UI.snackbar('Downloaded ' + done + '/' + list.length + (failed ? ' · ' + failed + ' failed' : ''));
    bus.emit('offline-changed');
  }

  function parseSeconds(text) {
    const value = String(text || '').trim();
    if (!value) return null;
    if (value.includes(':')) {
      const parts = value.split(':').map(Number);
      if (parts.some((n) => !Number.isFinite(n))) return null;
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function albumSongToTrack(song, album) {
    const track = C.normalizeTrack({
      id: '',
      title: song.title,
      artist: song.artist || album.artist,
      duration: Math.round((song.durationMs || 0) / 1000),
      thumbnail: album.cover || '',
      platform: 'youtube',
      needsResolve: true
    });
    track.album = album.title;
    track.hue = C.hashHue(album.title + song.title);
    return track;
  }

  function statLine(tracks) {
    const count = (tracks || []).length;
    const seconds = (tracks || []).reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
    return count + (count === 1 ? ' track' : ' tracks') + ' · ' + C.formatTime(seconds);
  }

  function trackList(tracks, options) {
    const opts = options || {};
    const list = UI.el('div', { class: 'stack' });
    const current = Player.state.current;
    (tracks || []).forEach((track, index) => {
      const normalized = C.normalizeTrack(track) || track;
      if (opts.album) {
        normalized.album = opts.album;
      }
      list.appendChild(UI.trackRow(normalized, {
        current: current && C.equalsTrack(current, track),
        showArtist: opts.showArtist !== false,
        onActivate: () => playTracks(tracks, index, opts.context || ''),
        onMenu: () => trackMenu(normalized, {
          playlistId: opts.playlistId,
          offline: opts.offline,
          context: opts.context,
          onChanged: opts.onChanged
        })
      }));
    });
    return list;
  }

  function openArtist(name) {
    global.RiffNav.go('artist', { name: name });
  }

  function openAlbum(album) {
    global.RiffNav.go('album', { album: album });
  }

  function openPlaylist(id) {
    global.RiffNav.go('playlist', { id: id });
  }

  Object.assign(V, {
    bus,
    screen,
    header,
    brandHeader,
    connectionCard,
    playTracks,
    shuffleTracks,
    toggleFavorite,
    favoriteButton,
    trackMenu,
    downloadSheet,
    downloadAll,
    addToPlaylistSheet,
    albumSongToTrack,
    albumPlaceholder,
    statLine,
    trackList,
    openArtist,
    openAlbum,
    openPlaylist,
    parseSeconds
  });
})(window);
