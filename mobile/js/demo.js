/* Riff Mobile — offline demo catalogue.
   Only used with ?demo=1 (or when the UI is served as a static preview), so the
   interface can be evaluated without a running Riff backend. */

(function (global) {
  'use strict';

  const C = global.RiffCore;

  let counter = 0;
  function makeTrack(title, artist, album, duration, hue) {
    counter++;
    const track = C.normalizeTrack({
      id: 'demo' + String(counter).padStart(7, '0'),
      title: title,
      artist: artist,
      duration: duration,
      platform: 'youtube',
      thumbnail: '',
      url: 'https://www.youtube.com/watch?v=demo' + counter
    });
    track.album = album;
    track.hue = hue;
    return track;
  }

  const rawTracks = [
    ['Neon Harbour', 'Aster Vale', 'Midnight Transit', 214, 268],
    ['Glass Elevator', 'Aster Vale', 'Midnight Transit', 187, 288],
    ['Paper Moons', 'Aster Vale', 'Midnight Transit', 236, 206],
    ['Slow Static', 'Mira Chen', 'Soft Focus', 201, 320],
    ['Undertow', 'Mira Chen', 'Soft Focus', 245, 336],
    ['Copper Sky', 'The Lantern Club', 'Field Notes', 178, 24],
    ['Half Light', 'The Lantern Club', 'Field Notes', 263, 42],
    ['Riverbend', 'The Lantern Club', 'Field Notes', 192, 96],
    ['Signal Fires', 'Kite Theory', 'Long Way Home', 228, 160],
    ['Hollow Bloom', 'Kite Theory', 'Long Way Home', 207, 182],
    ['Velvet Hours', 'Nia Sol', 'Afterglow', 251, 300],
    ['Sunday Static', 'Nia Sol', 'Afterglow', 196, 348],
    ['Marble Rain', 'Owen Pike', 'Slow Weather', 233, 208],
    ['Low Tide', 'Owen Pike', 'Slow Weather', 219, 186],
    ['Electric Fern', 'Sable Coast', 'Greenhouse', 184, 128],
    ['Cascade', 'Sable Coast', 'Greenhouse', 241, 146],
    ['Night Bus', 'Lumen Field', 'City Sleep', 205, 256],
    ['Afterimage', 'Lumen Field', 'City Sleep', 232, 282]
  ];

  const tracks = rawTracks.map((r) => makeTrack(r[0], r[1], r[2], r[3], r[4]));

  const albumMeta = [
    ['Midnight Transit', 'Aster Vale', '2025', 268],
    ['Soft Focus', 'Mira Chen', '2024', 320],
    ['Field Notes', 'The Lantern Club', '2025', 36],
    ['Long Way Home', 'Kite Theory', '2023', 164],
    ['Afterglow', 'Nia Sol', '2025', 306],
    ['Slow Weather', 'Owen Pike', '2024', 200],
    ['Greenhouse', 'Sable Coast', '2025', 130],
    ['City Sleep', 'Lumen Field', '2024', 260]
  ];

  const albums = albumMeta.map((meta, index) => {
    const albumTracks = tracks.filter((t) => t.album === meta[0]);
    return {
      id: 'demo-album-' + index,
      title: meta[0],
      artist: meta[1],
      year: meta[2],
      trackCount: albumTracks.length,
      cover: '',
      hue: meta[3],
      tracks: albumTracks.map((t, i) => Object.assign({}, t, { trackNo: i + 1 }))
    };
  });

  const artists = Array.from(new Set(tracks.map((t) => t.artist))).map((name, index) => ({
    id: 'demo-artist-' + index,
    name: name,
    count: tracks.filter((t) => t.artist === name).length,
    avatar: '',
    albums: albums.filter((a) => a.artist === name)
  }));

  const playlists = [
    {
      id: 'demo-playlist-1',
      name: 'Late night drive',
      createdAt: Date.now() - 86400000 * 12,
      tracks: [tracks[0], tracks[8], tracks[16], tracks[10], tracks[4]]
    },
    {
      id: 'demo-playlist-2',
      name: 'Focus flow',
      createdAt: Date.now() - 86400000 * 5,
      tracks: [tracks[3], tracks[12], tracks[14], tracks[6], tracks[17], tracks[7]]
    },
    {
      id: 'demo-playlist-3',
      name: 'Weekend rewind',
      createdAt: Date.now() - 86400000 * 2,
      tracks: [tracks[5], tracks[1], tracks[11], tracks[15]]
    }
  ];

  const localTracks = tracks.slice(0, 5).map((t, i) =>
    C.normalizeTrack(Object.assign({}, t, {
      id: 'local-demo-' + i,
      platform: 'local',
      isLocal: true,
      thumbnail: ''
    }))
  );

  const offlineTracks = tracks.slice(6, 12).map((t, i) =>
    C.normalizeTrack(Object.assign({}, t, {
      cleanId: 'demo-offline-' + i,
      isCached: true,
      fileSize: 3800000 + i * 720000,
      thumbnail: ''
    }))
  );

  const hot = tracks.slice(0, 12);

  const lyrics = [
    '[00:00.00] Riff Mobile demo lyrics',
    '[00:12.40] Streetlights bending in the rain',
    '[00:17.20] Every window calling out your name',
    '[00:22.60] We were only passing through',
    '[00:27.90] Neon harbour, me and you',
    '[00:33.40] Hold the quiet, let it grow',
    '[00:38.60] Everything we used to know',
    '[00:44.20] Turns to colour, turns to sound',
    '[00:49.80] Spinning softly round and round',
    '[00:56.10] If the morning takes its time',
    '[01:01.50] Leave the rest of it behind',
    '[01:07.00] We were only passing through',
    '[01:12.40] Neon harbour, me and you'
  ].join('\n');

  function delay(value, ms) {
    const wait = ms == null ? 260 : ms;
    return new Promise((resolve) => setTimeout(() => resolve(value), wait));
  }

  function searchTracks(query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    return tracks.filter((t) =>
      (t.title + ' ' + t.artist + ' ' + (t.album || '')).toLowerCase().includes(q)
    );
  }

  const Demo = {
    enabled: false,
    tracks,
    albums,
    artists,
    playlists,
    localTracks,
    offlineTracks,
    hot,
    lyrics,
    delay,
    searchTracks,
    getTrack(id) {
      return tracks.find((t) => t.id === id) || null;
    }
  };

  global.RiffDemo = Demo;
})(window);
