/* Riff Mobile — Library screen (local files, downloads, playlists) */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const Player = global.RiffPlayer;
  const V = global.RiffViews;

  const TABS = [
    { id: 'local', label: 'Local' },
    { id: 'offline', label: 'Offline' },
    { id: 'playlists', label: 'Playlists' }
  ];

  function render(params) {
    const root = V.screen();
    const actionsHost = UI.el('div', { class: 'app-bar__actions' });
    const content = UI.el('div');

    root.appendChild(V.header({ title: 'Library', actions: [actionsHost] }));
    let activeTab = (params && params.tab) || 'local';

    const tabs = UI.segmented(TABS, activeTab, (id) => {
      activeTab = id;
      renderTab();
    });
    root.appendChild(tabs);
    root.appendChild(content);

    function setActions(children) {
      actionsHost.innerHTML = '';
      children.filter(Boolean).forEach((child) => actionsHost.appendChild(child));
    }

    function renderTab() {
      content.innerHTML = '';
      if (activeTab === 'offline') renderOffline();
      else if (activeTab === 'playlists') renderPlaylists();
      else renderLocal();
    }

    function canImportFiles() {
      return Boolean(global.electronAPI && global.electronAPI.importAudioFiles) && API.online;
    }

    /* ---------------- local ---------------- */

    async function importFiles() {
      try {
        const items = await global.electronAPI.importAudioFiles();
        if (!items || items.length === 0) return;
        const result = await API.libraryAdd(items);
        const count = (result && result.count) || items.length;
        UI.snackbar('Added ' + count + (count === 1 ? ' track' : ' tracks') + ' to your library');
        V.bus.emit('library-changed');
        renderLocal();
      } catch (e) {
        UI.snackbar(e.message || 'Could not import files');
      }
    }

    async function renderLocal() {
      setActions([
        canImportFiles() ? UI.iconButton('add', { label: 'Add music files', onClick: importFiles }) : null,
        UI.iconButton('refresh', { label: 'Refresh library', onClick: renderLocal })
      ]);
      content.innerHTML = '';

      if (!API.online && !API.isDemo) {
        content.appendChild(V.connectionCard(() => renderLocal()));
        return;
      }

      content.appendChild(UI.skeletonRows(6));

      try {
        const list = await API.library();
        content.innerHTML = '';
        const tracks = (list || []).map((item) => C.normalizeTrack(item)).filter(Boolean);

        if (tracks.length === 0) {
          content.appendChild(UI.emptyState({
            icon: 'folder',
            title: 'Your local library is empty',
            text: canImportFiles()
              ? 'Add FLAC, WAV, MP3, OGG or M4A files from this device.'
              : 'Import audio files from the Riff desktop app to see them here.',
            actionLabel: canImportFiles() ? 'Add files' : null,
            actionIcon: 'add',
            onAction: importFiles
          }));
          return;
        }

        content.appendChild(UI.el('div', { class: 'section' }, [
          UI.sectionHeader(V.statLine(tracks), {
            actionLabel: 'Play all',
            onAction: () => V.playTracks(tracks, 0, 'Local library')
          }),
          UI.el('div', { class: 'chip-row', style: { padding: '0 0 8px' } }, [
            UI.chip('Shuffle', {
              icon: 'shuffle',
              onClick: () => V.shuffleTracks(tracks, 'Local library')
            }),
            UI.chip('Add files', {
              icon: 'add',
              onClick: canImportFiles() ? importFiles : null
            })
          ])
        ]));

        content.appendChild(V.trackList(tracks, {
          context: 'Local library',
          onChanged: renderLocal
        }));
      } catch (err) {
        content.innerHTML = '';
        content.appendChild(UI.emptyState({
          icon: 'warning',
          title: 'Could not load your library',
          text: err.message || 'Riff is not reachable right now.',
          actionLabel: 'Retry',
          actionIcon: 'refresh',
          onAction: renderLocal
        }));
      }
    }

    /* ---------------- offline ---------------- */

    async function renderOffline() {
      setActions([UI.iconButton('refresh', { label: 'Refresh downloads', onClick: renderOffline })]);
      content.innerHTML = '';

      if (!API.online && !API.isDemo) {
        content.appendChild(V.connectionCard(() => renderOffline()));
        return;
      }

      content.appendChild(UI.skeletonRows(5));

      try {
        const data = await API.offlineLibrary();
        content.innerHTML = '';
        const tracks = ((data && data.tracks) || []).map((item) => C.normalizeTrack(item)).filter(Boolean);

        if (tracks.length === 0) {
          content.appendChild(UI.emptyState({
            icon: 'offline',
            title: 'No offline downloads',
            text: 'Tracks you download or cache automatically are playable without a connection.',
            actionLabel: 'Find music',
            actionIcon: 'search',
            onAction: () => global.RiffNav.go('search')
          }));
          return;
        }

        content.appendChild(UI.el('div', { class: 'card', style: { margin: '12px 16px 4px', padding: '16px' } }, [
          UI.el('div', { class: 'row' }, [
            UI.el('span', { class: 'list-item__icon' }, UI.icon('offline')),
            UI.el('div', { style: { flex: '1' } }, [
              UI.el('div', { class: 'list-item__title', text: C.formatBytes(data.totalBytes) + ' offline' }),
              UI.el('div', { class: 'list-item__sub', text: tracks.length + ' tracks available without internet' })
            ])
          ]),
          UI.el('div', { class: 'row', style: { gap: '8px', marginTop: '14px' } }, [
            UI.el('button', {
              class: 'btn btn--tonal btn--small',
              type: 'button',
              onclick: () => V.playTracks(tracks, 0, 'Offline')
            }, [UI.icon('play'), 'Play all']),
            UI.el('button', {
              class: 'btn btn--text btn--small',
              type: 'button',
              style: { color: 'var(--md-sys-color-error)' },
              onclick: async () => {
                const ok = await UI.confirm({
                  title: 'Clear all downloads?',
                  text: 'Every offline copy will be deleted from this device.',
                  confirmLabel: 'Clear all',
                  danger: true
                });
                if (!ok) return;
                try {
                  await API.clearOffline();
                  UI.snackbar('Offline library cleared');
                  V.bus.emit('offline-changed');
                  renderOffline();
                } catch (e) {
                  UI.snackbar(e.message || 'Could not clear downloads');
                }
              }
            }, 'Clear all')
          ])
        ]));

        content.appendChild(UI.el('div', { class: 'section' }, [
          UI.sectionHeader('Downloads', { sub: tracks.length + ' tracks' })
        ]));

        const list = UI.el('div', { class: 'stack' });
        tracks.forEach((track, index) => {
          const row = UI.trackRow(track, {
            badge: track.fileSize ? C.formatBytes(track.fileSize) : null,
            onActivate: () => V.playTracks(tracks, index, 'Offline'),
            onMenu: () => V.trackMenu(track, {
              offline: true,
              context: 'Offline',
              onChanged: renderOffline
            })
          });
          list.appendChild(row);
        });
        content.appendChild(list);
      } catch (err) {
        content.innerHTML = '';
        content.appendChild(UI.emptyState({
          icon: 'warning',
          title: 'Could not load downloads',
          text: err.message || 'Riff is not reachable right now.',
          actionLabel: 'Retry',
          actionIcon: 'refresh',
          onAction: renderOffline
        }));
      }
    }

    /* ---------------- playlists ---------------- */

    async function createPlaylist() {
      const name = await UI.prompt({
        title: 'New playlist',
        placeholder: 'Playlist name',
        confirmLabel: 'Create'
      });
      if (!name) return;
      const playlist = Store.createPlaylist(name);
      V.bus.emit('playlists-changed');
      global.RiffNav.go('playlist', { id: playlist.id });
    }

    function renderPlaylists() {
      setActions([
        UI.iconButton('add', { label: 'New playlist', onClick: createPlaylist }),
        UI.iconButton('import', { label: 'Import playlist', onClick: importSheet })
      ]);
      content.innerHTML = '';

      const playlists = Store.state.playlists;

      content.appendChild(UI.el('div', { class: 'section' }, [
        UI.el('div', { class: 'row', style: { gap: '8px' } }, [
          UI.el('button', {
            class: 'btn btn--tonal btn--small',
            type: 'button',
            onclick: createPlaylist
          }, [UI.icon('add'), 'New playlist']),
          UI.el('button', {
            class: 'btn btn--outlined btn--small',
            type: 'button',
            onclick: importSheet
          }, [UI.icon('import'), 'Import'])
        ])
      ]));

      if (playlists.length === 0) {
        content.appendChild(UI.emptyState({
          icon: 'queue_music',
          title: 'No playlists yet',
          text: 'Create one, or import a public playlist from YouTube, SoundCloud or Apple Music.'
        }));
        return;
      }

      const list = UI.el('div', { class: 'stack', style: { marginTop: '10px' } });
      playlists.forEach((playlist) => {
        const first = playlist.tracks[0];
        const row = UI.listItem({
          art: UI.art(first || { title: playlist.name, hue: C.hashHue(playlist.name) }, 'art--m', { fallbackIcon: 'queue_music' }),
          title: playlist.name,
          sub: playlist.tracks.length + (playlist.tracks.length === 1 ? ' track' : ' tracks'),
          onClick: () => V.openPlaylist(playlist.id),
          trailing: UI.iconButton('more_vert', {
            label: 'Playlist options',
            onClick: (event) => {
              event.stopPropagation();
              UI.menu({
                title: playlist.name,
                items: [
                  {
                    icon: 'play',
                    label: 'Play playlist',
                    onClick: () => V.playTracks(playlist.tracks, 0, playlist.name)
                  },
                  {
                    icon: 'shuffle',
                    label: 'Shuffle playlist',
                    onClick: () => V.shuffleTracks(playlist.tracks, playlist.name)
                  },
                  {
                    icon: 'edit',
                    label: 'Rename',
                    onClick: async () => {
                      const next = await UI.prompt({
                        title: 'Rename playlist',
                        value: playlist.name,
                        confirmLabel: 'Rename'
                      });
                      if (!next) return;
                      Store.renamePlaylist(playlist.id, next);
                      V.bus.emit('playlists-changed');
                      renderPlaylists();
                    }
                  },
                  {
                    icon: 'delete',
                    label: 'Delete playlist',
                    danger: true,
                    onClick: async () => {
                      const ok = await UI.confirm({
                        title: 'Delete "' + playlist.name + '"?',
                        text: 'Tracks stay in your library; only the playlist is removed.',
                        confirmLabel: 'Delete',
                        danger: true
                      });
                      if (!ok) return;
                      Store.deletePlaylist(playlist.id);
                      V.bus.emit('playlists-changed');
                      renderPlaylists();
                    }
                  }
                ]
              });
            }
          })
        });
        list.appendChild(row);
      });
      content.appendChild(list);

      content.appendChild(UI.el('div', {
        class: 'empty__text',
        style: { padding: '18px 8px 0', textAlign: 'center' },
        text: 'Playlists are stored on this device.'
      }));
    }

    function importSheet() {
      const body = UI.el('div');
      const status = UI.el('div');
      const field = UI.fieldRow('https://music.youtube.com/playlist?list=…', '', {
        actionLabel: 'Import',
        async onSubmit() {
          // handled below via button rebind
        }
      });

      const input = field.input;
      const button = field.row.querySelector('.btn');

      body.appendChild(UI.el('div', { class: 'list-item__sub', style: { marginBottom: '6px' }, text: 'Paste a public playlist or album link. Riff resolves each track against your active provider.' }));
      body.appendChild(field.row);
      body.appendChild(UI.el('div', { class: 'chip-row', style: { padding: '10px 0 0' } }, [
        UI.chip('YouTube Music', { icon: 'music_note' }),
        UI.chip('YouTube', { icon: 'play_circle' }),
        UI.chip('SoundCloud', { icon: 'headset' }),
        UI.chip('Apple Music', { icon: 'album' })
      ]));
      body.appendChild(status);

      const sheet = UI.sheet({ title: 'Import playlist', content: body });

      async function runImport(link) {
        if (!link) {
          UI.snackbar('Paste a playlist link first');
          return;
        }
        let host = '';
        try {
          host = new URL(link).hostname.toLowerCase();
        } catch (e) {
          UI.snackbar('That does not look like a link');
          return;
        }

        if (host.includes('spotify.com')) {
          UI.snackbar('Spotify import needs the desktop app sign-in');
          return;
        }
        if (!host.includes('youtube') && !host.includes('youtu.be') && !host.includes('soundcloud') && !host.includes('apple.com')) {
          UI.snackbar('Supported: YouTube, SoundCloud, Apple Music');
          return;
        }

        button.disabled = true;
        input.disabled = true;
        status.innerHTML = '';
        status.appendChild(UI.el('div', { class: 'progress-bar' }, UI.el('span')));
        status.appendChild(UI.el('div', { class: 'control-block__value', style: { marginTop: '10px', textAlign: 'center' }, text: 'Reading playlist…' }));

        try {
          const result = host.includes('apple.com')
            ? await API.appleImport(link)
            : await API.playlistImport(link);
          if (!result || !result.success || !Array.isArray(result.tracks) || result.tracks.length === 0) {
            throw new Error((result && result.error) || 'No tracks found in that link');
          }
          const playlist = Store.createPlaylist(result.name || 'Imported playlist', result.tracks);
          V.bus.emit('playlists-changed');
          sheet.close();
          UI.snackbar('Imported ' + playlist.tracks.length + ' tracks', {
            actionLabel: 'Open',
            onAction: () => V.openPlaylist(playlist.id)
          });
          global.RiffNav.go('playlist', { id: playlist.id });
        } catch (e) {
          button.disabled = false;
          input.disabled = false;
          status.innerHTML = '';
          UI.snackbar(e.message || 'Import failed');
        }
      }

      button.addEventListener('click', () => runImport(input.value.trim()));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') runImport(input.value.trim());
      });
    }

    const offPlaylist = V.bus.on('playlists-changed', () => {
      if (activeTab === 'playlists') renderPlaylists();
    });
    const offLibrary = V.bus.on('library-changed', () => {
      if (activeTab === 'local') renderLocal();
    });
    const offOffline = V.bus.on('offline-changed', () => {
      if (activeTab === 'offline') renderOffline();
    });

    renderTab();

    root.__onDestroy = () => {
      offPlaylist();
      offLibrary();
      offOffline();
    };

    return root;
  }

  V.library = { render };
})(window);
