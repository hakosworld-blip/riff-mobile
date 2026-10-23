/* Riff Mobile — collection screens: playlist, album, artist, favorites, history */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const Player = global.RiffPlayer;
  const V = global.RiffViews;

  function actionRow(primaryLabel, onPrimary, onShuffle, extra) {
    return UI.el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, [
      UI.el('button', {
        class: 'btn btn--filled',
        type: 'button',
        onclick: onPrimary
      }, [UI.icon('play'), primaryLabel]),
      UI.el('button', {
        class: 'btn btn--tonal',
        type: 'button',
        onclick: onShuffle
      }, [UI.icon('shuffle'), 'Shuffle']),
      extra || null
    ]);
  }

  function hero(options) {
    const opts = options || {};
    const artEl = UI.el('div', {
      class: 'art',
      style: {
        width: '116px',
        height: '116px',
        borderRadius: 'var(--md-shape-xl)',
        boxShadow: 'var(--md-elevation-2)'
      }
    }, [
      opts.thumbnail
        ? UI.el('img', { src: opts.thumbnail, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
        : UI.icon(opts.icon || 'music_note')
    ]);
    artEl.style.setProperty('--art-h', opts.hue != null ? opts.hue : C.hashHue(opts.title || 'riff'));
    return UI.el('div', { style: { padding: '4px 16px 0' } }, [
      UI.el('div', { class: 'row', style: { gap: '16px', alignItems: 'flex-end' } }, [
        artEl,
        UI.el('div', { style: { flex: '1', minWidth: '0' } }, [
          UI.el('div', { class: 'list-item__sub', text: opts.kicker || '' }),
          UI.el('div', {
            style: {
              font: 'var(--md-type-headline-xs)',
              letterSpacing: '-0.02em',
              marginTop: '2px',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: '2',
              WebkitBoxOrient: 'vertical'
            },
            text: opts.title || ''
          }),
          UI.el('div', { class: 'list-item__sub', style: { marginTop: '6px' }, text: opts.subtitle || '' })
        ])
      ]),
      UI.el('div', { style: { marginTop: '18px' } }, opts.actions)
    ]);
  }

  /* ---------------- playlist ---------------- */

  function playlistView(params) {
    const id = params && params.id;
    const root = V.screen();
    let playlist = Store.findPlaylist(id);

    if (!playlist) {
      root.appendChild(V.header({ title: 'Playlist', back: true }));
      root.appendChild(UI.emptyState({
        icon: 'warning',
        title: 'Playlist not found',
        text: 'It may have been deleted.',
        actionLabel: 'Back to library',
        onAction: () => global.RiffNav.go('library', { tab: 'playlists' })
      }));
      return root;
    }

    const body = UI.el('div');
    root.appendChild(V.header({
      title: playlist.name,
      back: true,
      actions: [
        UI.iconButton('more_vert', {
          label: 'Playlist options',
          onClick: () => playlistMenu(playlist, () => rerender())
        })
      ]
    }));
    root.appendChild(body);

    function playlistMenu(target, reload) {
      UI.menu({
        title: target.name,
        items: [
          {
            icon: 'edit',
            label: 'Rename playlist',
            onClick: async () => {
              const name = await UI.prompt({ title: 'Rename playlist', value: target.name, confirmLabel: 'Rename' });
              if (!name) return;
              Store.renamePlaylist(target.id, name);
              V.bus.emit('playlists-changed');
              reload();
            }
          },
          {
            icon: 'search',
            label: 'Find tracks to add',
            onClick: () => global.RiffNav.go('search')
          },
          {
            icon: 'download',
            label: 'Download playlist',
            onClick: () => V.downloadAll(target.tracks, target.name)
          },
          {
            icon: 'delete',
            label: 'Delete playlist',
            danger: true,
            onClick: async () => {
              const ok = await UI.confirm({
                title: 'Delete "' + target.name + '" ?',
                text: 'The playlist is removed. Downloaded tracks stay available.',
                confirmLabel: 'Delete',
                danger: true
              });
              if (!ok) return;
              Store.deletePlaylist(target.id);
              V.bus.emit('playlists-changed');
              global.RiffNav.go('library', { tab: 'playlists' });
            }
          }
        ]
      });
    }

    function buildList() {
      const list = UI.el('div', { class: 'stack', style: { marginTop: '18px' } });
      playlist.tracks.forEach((track, index) => {
        list.appendChild(UI.trackRow(track, {
          onActivate: () => V.playTracks(playlist.tracks, index, playlist.name),
          onMenu: () => UI.menu({
            title: track.title,
            items: [
              {
                icon: 'play',
                label: 'Play now',
                onClick: () => V.playTracks(playlist.tracks, index, playlist.name)
              },
              {
                icon: 'queue',
                label: 'Play next',
                onClick: () => { Player.addToQueue(track, true); UI.snackbar('Playing next'); }
              },
              {
                icon: 'playlist_add',
                label: 'Add to queue',
                onClick: () => { Player.addToQueue(track, false); UI.snackbar('Added to queue'); }
              },
              {
                icon: Store.isFavorite(track) ? 'heart_filled' : 'heart',
                label: Store.isFavorite(track) ? 'Remove from favorites' : 'Add to favorites',
                onClick: () => V.toggleFavorite(track)
              },
              index > 0 ? {
                icon: 'expand_less',
                label: 'Move up',
                onClick: () => {
                  Store.reorderPlaylist(playlist.id, index, index - 1);
                  rerender();
                }
              } : null,
              index < playlist.tracks.length - 1 ? {
                icon: 'expand_more',
                label: 'Move down',
                onClick: () => {
                  Store.reorderPlaylist(playlist.id, index, index + 1);
                  rerender();
                }
              } : null,
              {
                icon: 'delete',
                label: 'Remove from playlist',
                danger: true,
                onClick: () => {
                  Store.removeFromPlaylist(playlist.id, track);
                  V.bus.emit('playlists-changed');
                  rerender();
                }
              }
            ]
          })
        }));
      });
      return list;
    }

    function rerender() {
      playlist = Store.findPlaylist(id);
      if (!playlist) return;
      body.innerHTML = '';
      const first = playlist.tracks[0];
      body.appendChild(hero({
        title: playlist.name,
        kicker: 'Playlist',
        subtitle: V.statLine(playlist.tracks),
        thumbnail: first && first.thumbnail,
        hue: C.hashHue(playlist.name),
        icon: 'queue_music',
        actions: actionRow('Play', () => V.playTracks(playlist.tracks, 0, playlist.name), () => V.shuffleTracks(playlist.tracks, playlist.name))
      }));

      if (playlist.tracks.length === 0) {
        body.appendChild(UI.emptyState({
          icon: 'playlist_add',
          title: 'This playlist is empty',
          text: 'Search for a track and add it with the ⋮ menu.',
          actionLabel: 'Search music',
          actionIcon: 'search',
          onAction: () => global.RiffNav.go('search')
        }));
        return;
      }

      body.appendChild(buildList());
      body.appendChild(UI.el('div', {
        class: 'empty__text',
        style: { padding: '18px 16px 0', textAlign: 'center' },
        text: playlist.tracks.length + ' tracks · ' + C.formatTime(playlist.tracks.reduce((sum, t) => sum + (t.duration || 0), 0))
      }));
    }

    rerender();
    return root;
  }

  /* ---------------- album ---------------- */

  function albumView(params) {
    const album = (params && params.album) || null;
    const root = V.screen();
    root.appendChild(V.header({ title: 'Album', back: true, subtitle: album ? album.artist : '' }));
    const body = UI.el('div');
    root.appendChild(body);

    if (!album) {
      body.appendChild(UI.emptyState({ icon: 'warning', title: 'Album unavailable' }));
      return root;
    }

    body.appendChild(UI.skeletonRows(6));

    (async () => {
      let detail = null;
      let error = null;
      try {
        detail = await API.albumTracks(album.id);
      } catch (e) {
        error = e.message;
      }

      const info = (detail && detail.album) || album;
      const songs = (detail && detail.tracks) || [];
      const tracks = songs.map((song) => V.albumSongToTrack(song, info));

      body.innerHTML = '';
      body.appendChild(hero({
        title: info.title,
        kicker: 'Album',
        subtitle: [info.artist, info.year, songs.length ? songs.length + ' tracks' : (album.trackCount ? album.trackCount + ' tracks' : '')].filter(Boolean).join(' · '),
        thumbnail: info.cover || album.cover,
        hue: C.hashHue(info.title + info.artist),
        icon: 'album',
        actions: tracks.length
          ? actionRow('Play', () => V.playTracks(tracks, 0, info.title), () => V.shuffleTracks(tracks, info.title))
          : null
      }));

      body.appendChild(UI.el('div', {
        class: 'chip-row',
        style: { paddingTop: '14px' }
      }, [
        UI.chip('Go to artist', {
          icon: 'person',
          onClick: () => V.openArtist(info.artist)
        }),
        UI.chip('Download all', {
          icon: 'download',
          onClick: () => V.downloadAll(tracks, info.title)
        })
      ]));

      if (error) {
        body.appendChild(UI.emptyState({
          icon: 'warning',
          title: 'Could not load the album',
          text: error,
          actionLabel: 'Retry',
          actionIcon: 'refresh',
          onAction: () => global.RiffNav.replace('album', { album: album })
        }));
        return;
      }

      if (tracks.length === 0) {
        body.appendChild(UI.emptyState({ icon: 'album', title: 'No tracks found for this album' }));
        return;
      }

      body.appendChild(UI.el('div', {
        class: 'list-item__sub',
        style: { padding: '18px 16px 2px' },
        text: 'Tracks stream from your active provider when you press play.'
      }));

      const list = UI.el('div', { class: 'stack', style: { marginTop: '4px' } });
      tracks.forEach((track, index) => {
        list.appendChild(UI.trackRow(track, {
          index: index + 1,
          showArtist: false,
          onActivate: () => V.playTracks(tracks, index, info.title),
          onMenu: () => UI.menu({
            title: track.title,
            items: [
              { icon: 'play', label: 'Play now', onClick: () => V.playTracks(tracks, index, info.title) },
              { icon: 'queue', label: 'Play next', onClick: () => { Player.addToQueue(track, true); UI.snackbar('Playing next'); } },
              { icon: 'playlist_add', label: 'Add to queue', onClick: () => { Player.addToQueue(track, false); UI.snackbar('Added to queue'); } },
              { icon: 'library_add', label: 'Add to playlist', onClick: () => V.addToPlaylistSheet(track) },
              { icon: Store.isFavorite(track) ? 'heart_filled' : 'heart', label: Store.isFavorite(track) ? 'Remove from favorites' : 'Add to favorites', onClick: () => V.toggleFavorite(track) },
              { icon: 'download', label: 'Download', onClick: () => V.downloadSheet(track) }
            ]
          })
        }));
      });
      body.appendChild(list);
    })();

    return root;
  }

  /* ---------------- artist ---------------- */

  function artistView(params) {
    const name = (params && params.name) || '';
    const root = V.screen();
    root.appendChild(V.header({ title: name || 'Artist', back: true }));
    const body = UI.el('div');
    root.appendChild(body);
    body.appendChild(UI.skeletonRows(6));

    (async () => {
      const platform = Store.state.settings.platform || 'ytmusic';
      const [searchResult, albumResult, infoResult] = await Promise.all([
        API.search(name, platform, 25).catch(() => null),
        API.artistAlbums(name).catch(() => null),
        API.artistInfo(name).catch(() => null)
      ]);

      const info = (infoResult && infoResult.artist) || {};
      const songs = ((searchResult && searchResult.tracks) || []).filter((track) =>
        String(track.artist || '').toLowerCase().includes(String(name).toLowerCase()) ||
        String(name).toLowerCase().includes(String(track.artist || '').toLowerCase())
      );
      const fallbackSongs = ((searchResult && searchResult.tracks) || []).slice(0, 10);
      const topSongs = (songs.length > 0 ? songs : fallbackSongs).slice(0, 10);
      const albums = (albumResult && albumResult.albums) || [];

      body.innerHTML = '';
      const avatarEl = UI.el('div', {
        class: 'art',
        style: {
          width: '112px',
          height: '112px',
          borderRadius: '50%',
          margin: '0 auto',
          boxShadow: 'var(--md-elevation-2)'
        }
      }, info.avatar
        ? UI.el('img', { src: info.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
        : UI.icon('person'));
      avatarEl.style.setProperty('--art-h', C.hashHue(name));
      body.appendChild(UI.el('div', { style: { padding: '8px 16px 0', textAlign: 'center' } }, [
        avatarEl,
        UI.el('div', {
          style: { font: 'var(--md-type-headline-s)', letterSpacing: '-0.02em', marginTop: '14px' },
          text: info.name || name
        }),
        UI.el('div', { class: 'list-item__sub', text: (info.isVerified ? 'Verified artist · ' : '') + topSongs.length + ' top songs' }),
        UI.el('div', { style: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' } }, [
          UI.el('button', {
            class: 'btn btn--filled',
            type: 'button',
            onclick: () => V.playTracks(topSongs, 0, name)
          }, [UI.icon('play'), 'Play']),
          UI.el('button', {
            class: 'btn btn--tonal',
            type: 'button',
            onclick: () => V.shuffleTracks(topSongs, name)
          }, [UI.icon('shuffle'), 'Shuffle'])
        ])
      ]));

      if (info.bio) {
        body.appendChild(UI.el('div', {
          class: 'empty__text',
          style: { padding: '16px 24px 0', textAlign: 'center' },
          text: info.bio.slice(0, 220)
        }));
      }

      if (topSongs.length > 0) {
        body.appendChild(UI.el('div', { class: 'section', style: { marginTop: '22px' } }, [
          UI.sectionHeader('Top songs'),
          V.trackList(topSongs, { context: name })
        ]));
      }

      if (albums.length > 0) {
        const grid = UI.el('div', { class: 'album-grid', style: { padding: '0' } });
        albums.slice(0, 8).forEach((album) => {
          grid.appendChild(UI.el('button', {
            class: 'album-card',
            type: 'button',
            onclick: () => V.openAlbum(album)
          }, [
            UI.el('span', { class: 'album-card__art' }, UI.art(album, 'art--xl', { fallbackIcon: 'album' })),
            UI.el('span', { class: 'album-card__title', text: album.title }),
            UI.el('span', { class: 'album-card__sub', text: album.year || '' })
          ]));
        });
        body.appendChild(UI.el('div', { class: 'section' }, [
          UI.sectionHeader('Albums'),
          grid
        ]));
      }

      if (topSongs.length === 0 && albums.length === 0) {
        body.appendChild(UI.emptyState({
          icon: 'person',
          title: 'Nothing found for ' + name,
          text: 'Check the spelling or search for this artist instead.',
          actionLabel: 'Search',
          actionIcon: 'search',
          onAction: () => global.RiffNav.go('search')
        }));
      }
    })();

    return root;
  }

  /* ---------------- favorites ---------------- */

  function favoritesView() {
    const root = V.screen();
    const body = UI.el('div');
    root.appendChild(V.header({
      title: 'Favorites',
      back: true,
      actions: [
        UI.iconButton('play', {
          label: 'Play favorites',
          onClick: () => V.playTracks(Store.state.favorites, 0, 'Favorites')
        }),
        UI.iconButton('shuffle', {
          label: 'Shuffle favorites',
          onClick: () => V.shuffleTracks(Store.state.favorites, 'Favorites')
        })
      ]
    }));
    root.appendChild(body);

    function paint() {
      body.innerHTML = '';
      const favorites = Store.state.favorites;
      if (favorites.length === 0) {
        body.appendChild(UI.emptyState({
          icon: 'heart',
          title: 'No favorites yet',
          text: 'Tap the heart on a track to keep it here.',
          actionLabel: 'Find music',
          actionIcon: 'search',
          onAction: () => global.RiffNav.go('search')
        }));
        return;
      }
      body.appendChild(UI.el('div', {
        class: 'list-item__sub',
        style: { padding: '4px 16px 10px' },
        text: V.statLine(favorites)
      }));
      body.appendChild(V.trackList(favorites, { context: 'Favorites', onChanged: paint }));
    }

    paint();
    const off = V.bus.on('favorites-changed', paint);
    const unsub = Store.subscribe((reason) => {
      if (reason === 'favorites') paint();
    });
    root.__onDestroy = () => {
      off();
      unsub();
    };
    return root;
  }

  /* ---------------- history ---------------- */

  function historyView() {
    const root = V.screen();
    const body = UI.el('div');
    root.appendChild(V.header({
      title: 'History',
      back: true,
      actions: [
        UI.iconButton('delete', {
          label: 'Clear history',
          onClick: async () => {
            const ok = await UI.confirm({
              title: 'Clear listening history?',
              text: 'This only affects this device.',
              confirmLabel: 'Clear',
              danger: true
            });
            if (!ok) return;
            Store.clearHistory();
            paint();
            UI.snackbar('History cleared');
          }
        })
      ]
    }));
    root.appendChild(body);

    function paint() {
      body.innerHTML = '';
      const history = Store.state.history;
      if (history.length === 0) {
        body.appendChild(UI.emptyState({
          icon: 'history',
          title: 'Nothing played yet',
          text: 'Tracks you listen to show up here.',
          actionLabel: 'Find music',
          actionIcon: 'search',
          onAction: () => global.RiffNav.go('search')
        }));
        return;
      }
      body.appendChild(UI.el('div', { class: 'section' }, [
        UI.sectionHeader(V.statLine(history), {
          actionLabel: 'Play all',
          onAction: () => V.playTracks(history, 0, 'History')
        })
      ]));
      body.appendChild(V.trackList(history, { context: 'History', onChanged: paint }));
    }

    paint();
    const unsub = Store.subscribe((reason) => {
      if (reason === 'history') paint();
    });
    root.__onDestroy = unsub;
    return root;
  }

  V.playlist = { render: playlistView };
  V.album = { render: albumView };
  V.artist = { render: artistView };
  V.favorites = { render: favoritesView };
  V.history = { render: historyView };
})(window);
