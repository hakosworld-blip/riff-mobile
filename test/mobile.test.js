const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../mobile/js/core.js');

const ROOT = path.join(__dirname, '..');

test('formatTime renders clock values', () => {
  assert.equal(C.formatTime(0), '0:00');
  assert.equal(C.formatTime(9), '0:09');
  assert.equal(C.formatTime(61), '1:01');
  assert.equal(C.formatTime(3661), '1:01:01');
  assert.equal(C.formatTime(-4), '0:00');
  assert.equal(C.formatTime(undefined), '0:00');
});

test('formatBytes scales units', () => {
  assert.equal(C.formatBytes(0), '0 B');
  assert.equal(C.formatBytes(1024), '1.0 KB');
  assert.equal(C.formatBytes(1536), '1.5 KB');
  assert.equal(C.formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(C.formatBytes(12 * 1024 * 1024), '12 MB');
});

test('parseLrc handles synced lyrics, metadata and offsets', () => {
  const raw = [
    '[ar:Test Artist]',
    '[ti:Test Song]',
    '[offset:100]',
    '[00:12.50]First line',
    '[00:20.00]Second line',
    '[00:25.00][00:30.00]Chorus'
  ].join('\n');
  const parsed = C.parseLrc(raw);
  assert.equal(parsed.synced, true);
  assert.equal(parsed.lines.length, 4);
  assert.equal(parsed.lines[0].text, 'First line');
  assert.equal(parsed.lines[0].time, 12.6);
  assert.equal(parsed.lines[2].time, 25.1);
  assert.equal(parsed.lines[3].time, 30.1);
  assert.deepEqual(parsed.lines.map((l) => l.time), [12.6, 20.1, 25.1, 30.1]);
});

test('parseLrc keeps plain text lyrics unsynced', () => {
  const parsed = C.parseLrc('Just a line\nAnd another');
  assert.equal(parsed.synced, false);
  assert.equal(parsed.lines.length, 2);
  assert.equal(parsed.lines[1].text, 'And another');
});

test('parseLrc returns empty structure for blank input', () => {
  const parsed = C.parseLrc('   ');
  assert.equal(parsed.synced, false);
  assert.deepEqual(parsed.lines, []);
});

test('activeLyricIndex finds the current line', () => {
  const lines = [
    { time: 10, text: 'a' },
    { time: 20, text: 'b' },
    { time: 30, text: 'c' }
  ];
  assert.equal(C.activeLyricIndex(lines, 9.9), -1);
  assert.equal(C.activeLyricIndex(lines, 10), 0);
  assert.equal(C.activeLyricIndex(lines, 19.9), 0);
  assert.equal(C.activeLyricIndex(lines, 20), 1);
  assert.equal(C.activeLyricIndex(lines, 200), 2);
  assert.equal(C.activeLyricIndex([], 5), -1);
});

test('nextIndex respects repeat modes and edges', () => {
  assert.equal(C.nextIndex({ length: 3, index: 0, repeat: 'off', direction: 1 }), 1);
  assert.equal(C.nextIndex({ length: 3, index: 2, repeat: 'off', direction: 1 }), -1);
  assert.equal(C.nextIndex({ length: 3, index: 2, repeat: 'all', direction: 1 }), 0);
  assert.equal(C.nextIndex({ length: 3, index: 0, repeat: 'off', direction: -1 }), -1);
  assert.equal(C.nextIndex({ length: 3, index: 0, repeat: 'all', direction: -1 }), 2);
  assert.equal(C.nextIndex({ length: 0, index: 0, repeat: 'all', direction: 1 }), -1);
  assert.equal(C.nextIndex({ length: 3, index: -1, repeat: 'off', direction: 1 }), 0);
});

test('buildShuffleOrder keeps every index and puts the current track first', () => {
  const order = C.buildShuffleOrder(8, 3, () => 0.42);
  assert.equal(order.length, 8);
  assert.equal(new Set(order).size, 8);
  assert.equal(order[0], 3);
  for (let i = 0; i < 8; i++) assert.ok(order.includes(i));
});

test('mergeHistory dedupes by track and keeps newest first', () => {
  const a = C.normalizeTrack({ id: 'a', title: 'A', artist: 'X' });
  const b = C.normalizeTrack({ id: 'b', title: 'B', artist: 'X' });
  let history = C.mergeHistory([], a);
  history = C.mergeHistory(history, b);
  history = C.mergeHistory(history, a);
  assert.equal(history.length, 2);
  assert.equal(history[0].id, 'a');
  assert.equal(history[1].id, 'b');
  assert.ok(history[0].playedAt >= history[1].playedAt);
});

test('normalizeTrack maps album, offline and local shapes', () => {
  const song = C.normalizeTrack({ no: 2, title: 'Song', artist: 'Artist', durationMs: 215000 });
  assert.equal(song.duration, 215);
  assert.equal(song.platform, 'youtube');
  assert.equal(song.trackNo, 2);

  const offline = C.normalizeTrack({ id: 'abc', cleanId: 'abc', isCached: true, fileSize: 12345, localThumbnail: 'x.jpg' });
  assert.equal(offline.thumbnail, 'x.jpg');
  assert.equal(offline.isCached, true);
  assert.equal(offline.fileSize, 12345);

  const local = C.normalizeTrack({ id: 'local_1', title: 'Local', platform: 'local' });
  assert.equal(local.isLocal, true);
  assert.equal(C.trackKey(local), 'local:local_1');
  assert.equal(C.normalizeTrack(null), null);
});

test('groupArtists aggregates artists by count', () => {
  const artists = C.groupArtists([
    { id: '1', title: 'a', artist: 'Mira' },
    { id: '2', title: 'b', artist: 'Mira' },
    { id: '3', title: 'c', artist: 'Owen' }
  ]);
  assert.equal(artists.length, 2);
  assert.equal(artists[0].name, 'Mira');
  assert.equal(artists[0].count, 2);
  assert.equal(artists[1].name, 'Owen');
});

test('generateScheme produces a full Material 3 token set', () => {
  const dark = C.generateScheme('#6750a4', 'dark');
  const light = C.generateScheme('#6750a4', 'light');
  const required = [
    '--md-sys-color-primary',
    '--md-sys-color-on-primary',
    '--md-sys-color-primary-container',
    '--md-sys-color-surface',
    '--md-sys-color-on-surface',
    '--md-sys-color-surface-container-high',
    '--md-sys-color-outline',
    '--md-sys-color-error'
  ];
  required.forEach((token) => {
    assert.match(dark[token], /^#[0-9a-f]{6}$/i, token + ' dark');
    assert.match(light[token], /^#[0-9a-f]{6}$/i, token + ' light');
  });
  const darkBg = C.rgbToHsl(C.hexToRgb(dark['--md-sys-color-surface']).r, C.hexToRgb(dark['--md-sys-color-surface']).g, C.hexToRgb(dark['--md-sys-color-surface']).b);
  const lightBg = C.rgbToHsl(C.hexToRgb(light['--md-sys-color-surface']).r, C.hexToRgb(light['--md-sys-color-surface']).g, C.hexToRgb(light['--md-sys-color-surface']).b);
  assert.ok(darkBg.l < 15, 'dark surface should be dark');
  assert.ok(lightBg.l > 85, 'light surface should be light');
  assert.equal(dark['--md-sys-color-primary'], C.generateScheme('#6750a4', 'dark')['--md-sys-color-primary']);
});

test('equalizer metadata is complete', () => {
  assert.equal(C.EQ_FREQUENCIES.length, 10);
  assert.equal(C.EQ_PRESETS.length >= 5, true);
  C.EQ_PRESETS.forEach((preset) => {
    assert.equal(preset.bands.length, 10, preset.name);
    preset.bands.forEach((band) => assert.ok(band >= -12 && band <= 12));
  });
});

test('mobile shell references only files that exist', () => {
  const html = fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8');
  const refs = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g))
    .map((match) => match[1])
    .filter((ref) => !/^https?:|^data:|^#/.test(ref));

  refs.forEach((ref) => {
    const resolved = ref.startsWith('../')
      ? path.join(ROOT, ref.slice(3))
      : path.join(ROOT, 'mobile', ref);
    assert.ok(fs.existsSync(resolved), 'missing asset: ' + ref);
  });

  assert.ok(html.indexOf('js/views/common.js') < html.indexOf('js/views/home.js'));
  assert.ok(html.indexOf('js/core.js') < html.indexOf('js/app.js'));
});

test('server exposes the mobile client routes', () => {
  const source = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(source, /serveMobileIndex/);
  assert.match(source, /serveMobileAsset/);
  assert.match(source, /parsedUrl\.pathname === '\/mobile'/);
  assert.match(source, /Service-Worker-Allowed/);
});
