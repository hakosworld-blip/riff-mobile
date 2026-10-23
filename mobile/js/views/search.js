/* Riff Mobile — Search screen */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const V = global.RiffViews;

  const PLATFORMS = [
    { id: 'ytmusic', label: 'YT Music' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'soundcloud', label: 'SoundCloud' }
  ];

  function render() {
    const root = V.screen();
    const results = UI.el('div', { style: { paddingBottom: '8px' } });
    const input = UI.el('input', {
      class: 'search-bar__input',
      type: 'search',
      placeholder: 'Songs, albums or artists',
      'aria-label': 'Search music',
      autocomplete: 'off',
      autocorrect: 'off',
      spellcheck: 'false'
    });

    let platform = Store.state.settings.platform || 'ytmusic';
    let sequence = 0;
    let timer = null;
    let busy = false;
    let lastQuery = '';

    const clearButton = UI.iconButton('close', {
      label: 'Clear search',
      onClick: () => {
        input.value = '';
        clearButton.hidden = true;
        lastQuery = '';
        results.innerHTML = '';
        renderIdle();
        input.focus();
      }
    });
    clearButton.hidden = true;

    root.appendChild(V.header({ title: 'Search' }));
    root.appendChild(UI.el('div', { class: 'search-bar' }, [
      UI.icon('search'),
      input,
      clearButton
    ]));

    const platformWrap = UI.el('div', { class: 'chip-row', style: { paddingTop: '12px' } });
    PLATFORMS.forEach((item) => {
      const chip = UI.chip(item.label, {
        selected: item.id === platform,
        onClick: () => {
          platform = item.id;
          Store.setSetting('platform', item.id);
          Array.from(platformWrap.children).forEach((node) => node.classList.remove('is-selected'));
          chip.classList.add('is-selected');
          if (lastQuery) runSearch(lastQuery, true);
        }
      });
      platformWrap.appendChild(chip);
    });
    root.appendChild(platformWrap);
    root.appendChild(results);

    function renderIdle() {
      results.innerHTML = '';
      const recent = Store.state.recentSearches;
      if (recent.length > 0) {
        results.appendChild(UI.el('section', { class: 'section' }, [
          UI.sectionHeader('Recent searches', {
            actionLabel: 'Clear',
            onAction: () => {
              Store.clearRecentSearches();
              renderIdle();
            }
          }),
          UI.el('div', { class: 'chip-row', style: { padding: '0 0 4px' } }, recent.map((term) =>
            UI.chip(term, {
              icon: 'history',
              onClick: () => {
                input.value = term;
                clearButton.hidden = false;
                runSearch(term, true);
              }
            })
          ))
        ]));
      }

      results.appendChild(UI.el('section', { class: 'section' }, [
        UI.sectionHeader('Try something new'),
        UI.el('div', { class: 'chip-row', style: { padding: '0 0 4px' } }, ['Lo-fi beats', 'Synthwave', 'Jazz classics', 'Acoustic covers'].map((term) =>
          UI.chip(term, {
            icon: 'search',
            onClick: () => {
              input.value = term;
              clearButton.hidden = false;
              runSearch(term, true);
            }
          })
        ))
      ]));

      results.appendChild(UI.emptyState({
        icon: 'search',
        title: 'Find your next favorite',
        text: 'Riff searches YouTube Music, YouTube and SoundCloud without ads or accounts.'
      }));
    }

    function showLoading() {
      results.innerHTML = '';
      results.appendChild(UI.skeletonRows(7));
    }

    function albumGrid(albums) {
      const grid = UI.el('div', { class: 'album-grid', style: { padding: '0' } });
      albums.forEach((album) => {
        grid.appendChild(UI.el('button', {
          class: 'album-card',
          type: 'button',
          onclick: () => V.openAlbum(album)
        }, [
          UI.el('span', { class: 'album-card__art' }, UI.art(album, 'art--xl', { fallbackIcon: 'album' })),
          UI.el('span', { class: 'album-card__title', text: album.title }),
          UI.el('span', { class: 'album-card__sub', text: album.artist + (album.year ? ' · ' + album.year : '') })
        ]));
      });
      return grid;
    }

    function artistGrid(artists) {
      const grid = UI.el('div', { class: 'circle-grid', style: { padding: '0' } });
      artists.forEach((artist) => {
        grid.appendChild(UI.el('button', {
          class: 'circle-card',
          type: 'button',
          onclick: () => V.openArtist(artist.name)
        }, [
          UI.el('span', { class: 'circle-card__art' }, UI.art({ title: artist.name, thumbnail: artist.thumbnail, hue: C.hashHue(artist.name) }, 'art--xl', { fallbackIcon: 'person' })),
          UI.el('span', { class: 'circle-card__title', text: artist.name })
        ]));
      });
      return grid;
    }

    function renderResults(data) {
      results.innerHTML = '';
      const hasSongs = data.tracks.length > 0;
      const hasAlbums = data.albums.length > 0;
      const hasArtists = data.artists.length > 0;

      if (!hasSongs && !hasAlbums && !hasArtists) {
        results.appendChild(UI.emptyState({
          icon: 'search',
          title: 'No results for "' + lastQuery + '"',
          text: data.error || 'Try a different spelling or switch platform.'
        }));
        return;
      }

      if (hasSongs) {
        results.appendChild(UI.el('section', { class: 'section' }, [
          UI.sectionHeader('Songs', {
            sub: data.tracks.length + ' results · ' + (PLATFORMS.find((p) => p.id === platform) || {}).label,
            actionLabel: 'Play all',
            onAction: () => V.playTracks(data.tracks, 0, 'Search: ' + lastQuery)
          }),
          V.trackList(data.tracks, { context: 'Search: ' + lastQuery })
        ]));
      }

      if (hasAlbums) {
        results.appendChild(UI.el('section', { class: 'section' }, [
          UI.sectionHeader('Albums'),
          albumGrid(data.albums.slice(0, 6))
        ]));
      }

      if (hasArtists) {
        results.appendChild(UI.el('section', { class: 'section' }, [
          UI.sectionHeader('Artists'),
          artistGrid(data.artists.slice(0, 9))
        ]));
      }
    }

    async function runSearch(query, immediate) {
      const text = String(query || '').trim();
      if (!text) {
        renderIdle();
        return;
      }
      if (timer) clearTimeout(timer);
      if (!immediate) {
        timer = setTimeout(() => runSearch(text, true), 480);
        return;
      }

      lastQuery = text;
      const token = ++sequence;
      busy = true;
      showLoading();

      const songsRequest = API.search(text, platform, 25).catch((err) => ({ success: false, tracks: [], error: err.message }));
      const albumsRequest = text.length >= 3
        ? API.albums(text).catch(() => ({ success: false, albums: [] }))
        : Promise.resolve({ success: true, albums: [] });

      const songs = await songsRequest;
      if (token !== sequence) return;

      const tracks = (songs && songs.tracks) || [];
      renderResults({
        tracks: tracks,
        albums: [],
        artists: C.groupArtists(tracks),
        error: songs && songs.error
      });
      Store.addRecentSearch(text);

      const albums = await albumsRequest;
      if (token !== sequence) return;
      busy = false;
      renderResults({
        tracks: tracks,
        albums: (albums && albums.albums) || [],
        artists: C.groupArtists(tracks),
        error: songs && songs.error
      });
    }

    input.addEventListener('input', () => {
      clearButton.hidden = input.value.length === 0;
      if (!input.value.trim()) {
        sequence++;
        lastQuery = '';
        renderIdle();
        return;
      }
      runSearch(input.value);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
        runSearch(input.value, true);
      }
    });

    renderIdle();
    return root;
  }

  V.search = { render };
})(window);
