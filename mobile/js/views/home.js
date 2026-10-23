/* Riff Mobile — Home screen */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const Player = global.RiffPlayer;
  const V = global.RiffViews;

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 5) return 'Still up?';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function mediaCard(options) {
    const opts = options || {};
    return UI.el('button', {
      class: 'media-card',
      type: 'button',
      onclick: opts.onClick
    }, [
      UI.el('span', { class: 'media-card__art' }, UI.art(opts.item || { title: opts.title, hue: opts.hue }, 'art--xl', {
        fallbackIcon: opts.icon || 'music_note'
      })),
      UI.el('span', { class: 'media-card__title', text: opts.title || '' }),
      UI.el('span', { class: 'media-card__sub', text: opts.sub || '' })
    ]);
  }

  function quickCard(icon, title, sub, onClick) {
    return UI.el('button', { class: 'quick-card', type: 'button', onclick: onClick }, [
      UI.el('span', { class: 'quick-card__icon' }, UI.icon(icon)),
      UI.el('span', { class: 'quick-card__text' }, [
        UI.el('span', { class: 'quick-card__title', text: title }),
        UI.el('span', { class: 'quick-card__sub', text: sub })
      ])
    ]);
  }

  function render() {
    const root = V.screen();
    const heroHost = UI.el('div');
    const quickHost = UI.el('div', { class: 'quick-grid' });
    const hotSection = UI.el('section', { class: 'section' });
    const recentSection = UI.el('section', { class: 'section' });
    const favoritesSection = UI.el('section', { class: 'section' });
    const playlistsSection = UI.el('section', { class: 'section' });
    const connectionHost = UI.el('div');

    root.appendChild(V.brandHeader({
      actions: [
        UI.iconButton('refresh', {
          label: 'Refresh',
          onClick: () => {
            UI.snackbar('Refreshing…');
            loadHot();
            refreshLocal();
          }
        })
      ]
    }));

    root.appendChild(UI.el('div', { class: 'greeting' }, [
      UI.el('h1', { class: 'greeting__title', text: greeting() }),
      UI.el('p', { class: 'greeting__sub', text: 'What do you feel like listening to?' })
    ]));

    // shimmer while hot picks resolve
    heroHost.appendChild(UI.el('div', { class: 'hero-skeleton skeleton' }));
    root.appendChild(heroHost);
    root.appendChild(quickHost);
    root.appendChild(hotSection);
    root.appendChild(recentSection);
    root.appendChild(favoritesSection);
    root.appendChild(playlistsSection);
    root.appendChild(connectionHost);

    root.appendChild(UI.el('div', {
      class: 'empty__text',
      style: { padding: '26px 24px 8px', textAlign: 'center', opacity: '.6' },
      text: 'Riff Mobile · Material 3 · no accounts, no tracking'
    }));

    let hotTracks = [];

    function renderHero() {
      heroHost.innerHTML = '';
      if (hotTracks.length === 0) {
        heroHost.appendChild(UI.el('div', { class: 'hero' }, [
          UI.el('div', { class: 'hero__eyebrow' }, [UI.icon('star', 16), 'Hot picks']),
          UI.el('div', { class: 'hero__title', text: 'Nothing loaded yet' }),
          UI.el('div', { class: 'hero__sub', text: 'Search for music or retry in a moment.' }),
          UI.el('div', { class: 'hero__actions' }, [
            UI.el('button', {
              class: 'btn btn--filled hero__play',
              type: 'button',
              onclick: () => global.RiffNav.go('search')
            }, [UI.icon('search'), 'Find music']),
            UI.el('button', {
              class: 'btn btn--text',
              type: 'button',
              style: { color: 'var(--md-sys-color-on-primary-container)' },
              onclick: loadHot
            }, 'Retry')
          ])
        ]));
        return;
      }

      const first = hotTracks[0];
      const hero = UI.el('div', { class: 'hero' }, [
        UI.el('div', { class: 'hero__eyebrow' }, [UI.icon('star', 16), 'Made for you']),
        UI.el('div', { class: 'hero__title', text: 'Hot picks ' + new Date().getFullYear() }),
        UI.el('div', { class: 'hero__sub', text: hotTracks.length + ' tracks picked for you today' }),
        UI.el('div', { class: 'hero__actions' }, [
          UI.el('button', {
            class: 'btn btn--filled hero__play',
            type: 'button',
            onclick: () => V.playTracks(hotTracks, 0, 'Hot picks')
          }, [UI.icon('play'), 'Play']),
          UI.el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Shuffle hot picks',
            style: { background: 'rgba(0,0,0,.18)' },
            onclick: () => V.shuffleTracks(hotTracks, 'Hot picks')
          }, UI.icon('shuffle'))
        ]),
        UI.el('div', { class: 'hero__art' }, UI.art(first, 'art--xl'))
      ]);
      hero.querySelector('.hero__art .art').style.borderRadius = '26px';
      heroHost.appendChild(hero);
    }

    function renderHotCards() {
      hotSection.innerHTML = '';
      if (hotTracks.length === 0) return;
      hotSection.appendChild(UI.sectionHeader('Fresh in your feed', { sub: 'Tap to play a track' }));
      const row = UI.el('div', { class: 'h-scroll' });
      hotTracks.forEach((track, index) => {
        row.appendChild(mediaCard({
          item: track,
          title: track.title,
          sub: track.artist,
          onClick: () => V.playTracks(hotTracks, index, 'Hot picks')
        }));
      });
      hotSection.appendChild(row);
    }

    async function loadHot() {
      try {
        const data = await API.hot(12);
        hotTracks = (data && data.tracks) || [];
        if (data && data.title) hotTracks.title = data.title;
      } catch (e) {
        hotTracks = [];
      }
      renderHero();
      renderHotCards();
    }

    function renderQuick() {
      quickHost.innerHTML = '';
      const favorites = Store.state.favorites;
      const history = Store.state.history;
      const playlists = Store.state.playlists;
      [
        quickCard('heart', 'Favorites', favorites.length + ' saved', () => global.RiffNav.go('favorites')),
        quickCard('history', 'History', history.length + ' played', () => global.RiffNav.go('history')),
        quickCard('queue_music', 'Playlists', playlists.length + ' lists', () => global.RiffNav.go('library', { tab: 'playlists' })),
        quickCard('offline', 'Offline', 'Downloads', () => global.RiffNav.go('library', { tab: 'offline' }))
      ].forEach((card) => quickHost.appendChild(card));
    }

    function renderRecent() {
      recentSection.innerHTML = '';
      const history = Store.state.history.slice(0, 5);
      if (history.length === 0) return;
      recentSection.appendChild(UI.sectionHeader('Jump back in', {
        actionLabel: 'See all',
        onAction: () => global.RiffNav.go('history')
      }));
      recentSection.appendChild(V.trackList(history, { context: 'Recently played' }));
    }

    function renderFavorites() {
      favoritesSection.innerHTML = '';
      const favorites = Store.state.favorites;
      if (favorites.length === 0) {
        favoritesSection.appendChild(UI.el('div', { class: 'card', style: { padding: '18px' } }, [
          UI.el('div', { class: 'row', style: { gap: '12px' } }, [
            UI.el('span', { class: 'list-item__icon' }, UI.icon('heart')),
            UI.el('div', {}, [
              UI.el('div', { class: 'list-item__title', text: 'Your favorites live here' }),
              UI.el('div', { class: 'list-item__sub', text: 'Tap the heart on any track to save it.' })
            ])
          ]),
          UI.el('button', {
            class: 'btn btn--tonal',
            type: 'button',
            style: { marginTop: '14px' },
            onclick: () => global.RiffNav.go('search')
          }, [UI.icon('search'), 'Find something'])
        ]));
        return;
      }
      favoritesSection.appendChild(UI.sectionHeader('Favorites', {
        sub: V.statLine(favorites),
        actionLabel: 'See all',
        onAction: () => global.RiffNav.go('favorites')
      }));
      favoritesSection.appendChild(V.trackList(favorites.slice(0, 5), { context: 'Favorites' }));
    }

    function renderPlaylists() {
      playlistsSection.innerHTML = '';
      const playlists = Store.state.playlists;
      playlistsSection.appendChild(UI.sectionHeader('Playlists', {
        actionLabel: playlists.length ? 'See all' : null,
        onAction: () => global.RiffNav.go('library', { tab: 'playlists' })
      }));

      const row = UI.el('div', { class: 'h-scroll' });
      if (playlists.length === 0) {
        row.appendChild(mediaCard({
          title: 'Create a playlist',
          sub: 'Start collecting',
          icon: 'add',
          hue: 280,
          onClick: async () => {
            const name = await UI.prompt({ title: 'New playlist', placeholder: 'Playlist name', confirmLabel: 'Create' });
            if (!name) return;
            const playlist = Store.createPlaylist(name);
            UI.snackbar('Created "' + playlist.name + '"', {
              actionLabel: 'Open',
              onAction: () => global.RiffNav.go('playlist', { id: playlist.id })
            });
            global.RiffNav.go('playlist', { id: playlist.id });
          }
        }));
      } else {
        playlists.slice(0, 8).forEach((playlist) => {
          row.appendChild(mediaCard({
            item: { title: playlist.name, hue: C.hashHue(playlist.name), thumbnail: playlist.tracks[0] && playlist.tracks[0].thumbnail },
            title: playlist.name,
            sub: playlist.tracks.length + ' tracks',
            icon: 'queue_music',
            onClick: () => V.openPlaylist(playlist.id)
          }));
        });
      }
      playlistsSection.appendChild(row);
    }

    function refreshLocal() {
      renderQuick();
      renderRecent();
      renderFavorites();
      renderPlaylists();
    }

    function renderConnection() {
      connectionHost.innerHTML = '';
      if (API.online || API.isDemo) return;
      connectionHost.appendChild(V.connectionCard(async () => {
        UI.snackbar('Checking connection…');
        const ok = await API.probe();
        if (ok) {
          connectionHost.innerHTML = '';
          UI.snackbar('Connected to Riff');
          loadHot();
        } else {
          UI.snackbar('Still offline — is Riff running?');
        }
      }, () => global.RiffNav.go('connect', { back: true })));
    }

    refreshLocal();
    renderConnection();
    loadHot();

    const unsubscribe = Store.subscribe((reason) => {
      if (['favorites', 'history', 'playlists', 'reset'].includes(reason)) refreshLocal();
    });
    root.__onDestroy = unsubscribe;

    // keep the "now playing" highlight fresh
    const offTrack = Player.on('track', () => {
      refreshLocal();
    });
    const previousDestroy = root.__onDestroy;
    root.__onDestroy = () => {
      if (previousDestroy) previousDestroy();
      offTrack();
    };

    return root;
  }

  V.mediaCard = mediaCard;
  V.home = { render };
})(window);
