const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const C = require('../mobile/js/core.js');
const { renderPairingPage } = require('../mobile/pairing-page.js');

const ROOT = path.join(__dirname, '..');

test('normalizeServerUrl accepts typed LAN addresses', () => {
  assert.equal(C.normalizeServerUrl('192.168.1.20:38472'), 'http://192.168.1.20:38472');
  assert.equal(C.normalizeServerUrl('  http://192.168.1.20:38472/  '), 'http://192.168.1.20:38472');
  assert.equal(C.normalizeServerUrl('https://riff.local:8443/base'), 'https://riff.local:8443');
  assert.equal(C.normalizeServerUrl('localhost:38472'), 'http://localhost:38472');
  assert.equal(C.normalizeServerUrl(''), '');
  assert.equal(C.normalizeServerUrl('ftp://192.168.1.2'), '');
  assert.equal(C.normalizeServerUrl('not an address'), '');
});

test('withDefaultPort fills the Riff port for bare hosts', () => {
  assert.equal(C.withDefaultPort('192.168.1.20'), 'http://192.168.1.20:38472');
  assert.equal(C.withDefaultPort('http://192.168.1.20:4000'), 'http://192.168.1.20:4000');
  assert.equal(C.withDefaultPort('https://riff.local'), 'https://riff.local');
});

test('rewriteServerUrls moves loopback media onto the paired server', () => {
  const payload = {
    success: true,
    tracks: [
      {
        title: 'Demo',
        thumbnail: 'http://127.0.0.1:38472/api/local-thumbnail?id=abc',
        streamUrl: 'http://127.0.0.1:38472/api/audio-proxy?url=https%3A%2F%2Fexample.com%2Fa',
        remote: 'https://i.ytimg.com/vi/abc/hq.jpg'
      }
    ],
    streamUrl: 'http://localhost:4000/api/local-track?id=xyz&token=old'
  };
  const rewritten = C.rewriteServerUrls(payload, 'http://192.168.1.20:38472', 'a'.repeat(48));

  assert.equal(rewritten.tracks[0].thumbnail, 'http://192.168.1.20:38472/api/local-thumbnail?id=abc&token=' + 'a'.repeat(48));
  assert.match(rewritten.tracks[0].streamUrl, /^http:\/\/192\.168\.1\.20:38472\/api\/audio-proxy\?url=.*&token=a+$/);
  assert.equal(rewritten.tracks[0].remote, 'https://i.ytimg.com/vi/abc/hq.jpg');
  assert.equal(rewritten.streamUrl, 'http://192.168.1.20:38472/api/local-track?id=xyz&token=' + 'a'.repeat(48));
  assert.equal(payload.tracks[0].thumbnail, 'http://127.0.0.1:38472/api/local-thumbnail?id=abc', 'input is not mutated');
});

test('rewriteServerUrls ignores data that is not loopback', () => {
  const payload = { thumbnail: 'https://cdn.example.com/a.jpg', list: ['http://10.0.0.2:38472/api/x'] };
  assert.deepEqual(C.rewriteServerUrls(payload, 'http://192.168.1.20:38472', 't'), payload);
});

test('pairing page shows addresses, the code and LAN state', () => {
  const token = 'b'.repeat(48);
  const page = renderPairingPage({
    addresses: [{ name: 'wlan0', address: 'http://192.168.1.20:38472' }],
    token,
    port: 38472,
    lanEnabled: true
  });
  assert.match(page, /Pair a phone/);
  assert.match(page, /192\.168\.1\.20:38472/);
  assert.match(page, new RegExp(token));
  assert.match(page, /LAN sharing is on/);
  assert.doesNotMatch(page, /LAN sharing is off/);

  const off = renderPairingPage({ addresses: [], token, port: 38472, lanEnabled: false });
  assert.match(off, /LAN sharing is off/);
  assert.match(off, /No LAN address found/);
});

test('Capacitor project is configured for a real native build', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  assert.equal(config.appId, 'io.github.rootscripts.riff');
  assert.equal(config.appName, 'Riff');
  assert.equal(config.webDir, 'mobile/.web');
  assert.equal(config.android.allowMixedContent, true);

  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android:usesCleartextTraffic="true"/);

  const plist = fs.readFileSync(path.join(ROOT, 'ios/App/App/Info.plist'), 'utf8');
  assert.match(plist, /NSAllowsArbitraryLoadsInWebContent/);
  assert.match(plist, /NSAllowsLocalNetworking/);
  assert.match(plist, /NSLocalNetworkUsageDescription/);
  assert.match(plist, /<string>audio<\/string>/);

  const html = fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8');
  assert.ok(html.indexOf('js/views/connect.js') < html.indexOf('js/app.js'));
  assert.ok(fs.existsSync(path.join(ROOT, 'mobile/js/views/connect.js')));
  assert.ok(html.indexOf('js/player.js') < html.indexOf('js/background.js'));
  assert.ok(html.indexOf('js/background.js') < html.indexOf('js/app.js'));
  assert.match(manifest, /android:foregroundServiceType="mediaPlayback"/);
  assert.match(manifest, /FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
  assert.match(manifest, /POST_NOTIFICATIONS/);
  assert.match(manifest, /RiffPlaybackService/);

  const mainActivity = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/io/github/rootscripts/riff/MainActivity.java'), 'utf8');
  assert.match(mainActivity, /registerPlugin\(RiffBackgroundAudioPlugin\.class\)/);

  const service = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/io/github/rootscripts/riff/RiffPlaybackService.java'), 'utf8');
  assert.match(service, /MediaSession/);
  assert.match(service, /FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK/);
  assert.match(service, /ACTION_NEXT/);

  const appDelegate = fs.readFileSync(path.join(ROOT, 'ios/App/App/AppDelegate.swift'), 'utf8');
  assert.match(appDelegate, /RiffBackgroundAudioPlugin/);
  assert.match(appDelegate, /MPRemoteCommandCenter/);
  assert.match(appDelegate, /MPNowPlayingInfoCenter/);
  assert.match(appDelegate, /AVAudioSession/);
  assert.match(appDelegate, /registerPluginInstance/);

  const sceneDelegate = fs.readFileSync(path.join(ROOT, 'ios/App/App/SceneDelegate.swift'), 'utf8');
  assert.match(sceneDelegate, /RiffBridgeViewController\(\)/);
});

test('background bridge forwards native commands to the player', async () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(ROOT, 'mobile/js/background.js'), 'utf8');

  const calls = [];
  const playerCalls = [];
  let commandListener = null;
  const handlers = new Map();
  const plugin = {};
  ['enable', 'update', 'setPosition', 'disable'].forEach((method) => {
    plugin[method] = (options) => {
      calls.push([method, options]);
      return Promise.resolve();
    };
  });
  plugin.addListener = (event, handler) => {
    if (event === 'command') commandListener = handler;
    return Promise.resolve({ remove() {} });
  };

  const player = {
    state: { current: { id: 'abc', title: 'Night Drive', artist: 'Riff', album: 'Demo', thumbnail: 'https://img/a.jpg' }, playing: false },
    timeSnapshot: () => ({ currentTime: 12, duration: 200 }),
    on(event, handler) { handlers.set(event, handler); },
    play() { playerCalls.push('play'); },
    pause() { playerCalls.push('pause'); },
    toggle() { playerCalls.push('toggle'); },
    next() { playerCalls.push('next'); },
    previous() { playerCalls.push('previous'); },
    seek(position) { playerCalls.push('seek:' + position); }
  };

  const window = {
    Capacitor: { isNativePlatform: () => true, registerPlugin: () => plugin },
    RiffPlayer: player,
    document: { hidden: false, addEventListener() {} },
    console: { warn() {} }
  };
  window.window = window;
  vm.runInNewContext(source, window, { filename: 'background.js' });

  assert.equal(window.RiffBackground.available(), true);
  assert.equal(typeof commandListener, 'function');

  handlers.get('track')();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const enable = calls.find((entry) => entry[0] === 'enable');
  assert.ok(enable, 'enable is called when a track starts');
  assert.equal(enable[1].title, 'Night Drive');
  assert.equal(enable[1].artist, 'Riff');

  player.state.playing = true;
  handlers.get('state')();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const update = calls.filter((entry) => entry[0] === 'update').pop();
  assert.equal(update[1].playing, true);

  commandListener({ action: 'next' });
  commandListener({ action: 'seek', position: 42 });
  commandListener({ action: 'toggle' });
  assert.deepEqual(playerCalls, ['next', 'seek:42', 'toggle']);
});

test('background bridge is inert in a browser', () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(ROOT, 'mobile/js/background.js'), 'utf8');
  const window = {
    RiffPlayer: { state: {}, on() {}, timeSnapshot: () => ({}) },
    document: { addEventListener() {} },
    console: { warn() {} }
  };
  window.window = window;
  vm.runInNewContext(source, window, { filename: 'background.js' });
  assert.equal(window.RiffBackground.available(), false);
});

/* Starts Riff with LAN sharing in a throwaway config dir and exercises the
   remote-phone rules over real HTTP. */
test('LAN sharing requires the pairing token on every API call', { timeout: 25000 }, async () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'riff-pairing-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { RIFF_LAN: '1', XDG_CONFIG_HOME: configHome }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start: ' + output)), 12000);
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('server exited with ' + code + ': ' + output));
    });
  });

  const lanHost = { Host: '192.168.1.50:' + port };
  // fetch() forbids the Host header, so raw HTTP is required to emulate a phone.
  const request = (pathname, headers) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET', headers: headers || {} }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });

  try {
    const page = await request('/pair');
    assert.equal(page.status, 200);
    const token = (page.body.match(/id="token">([a-f0-9]{48})/) || [])[1];
    assert.ok(token, 'pairing page exposes the token');

    assert.equal((await request('/api/tools-status', lanHost)).status, 403);
    assert.equal((await request('/api/tools-status', Object.assign({ 'X-Riff-Token': token }, lanHost))).status, 200);
    assert.equal((await request('/api/tools-status?token=' + token, lanHost)).status, 200);
    assert.equal((await request('/pair', lanHost)).status, 403);
    assert.equal((await request('/mobile', lanHost)).status, 403);
    assert.equal((await request('/mobile', Object.assign({ Origin: 'capacitor://localhost' }, lanHost))).status, 403);

    const nativeOrigin = await request('/api/tools-status', {
      Host: '192.168.1.50:' + port,
      Origin: 'capacitor://localhost',
      'X-Riff-Token': token
    });
    assert.equal(nativeOrigin.status, 200);
    assert.equal(nativeOrigin.headers['access-control-allow-origin'], 'capacitor://localhost');

    const foreign = await request('/api/tools-status', {
      Origin: 'https://evil.example',
      'X-Riff-Token': token
    });
    assert.equal(foreign.status, 403);

    const loopback = await request('/mobile');
    assert.equal(loopback.status, 200);
    assert.match(loopback.body, /__RIFF_TOKEN__/);

    // The desktop renderer runs from file://, which Chromium reports as Origin: null.
    const desktop = await request('/api/tools-status', { Origin: 'null', 'X-Riff-Token': token });
    assert.equal(desktop.status, 200);
    assert.equal(desktop.headers['access-control-allow-origin'], 'null');
    const pairingFromNull = await request('/pair', { Origin: 'null' });
    assert.equal(pairingFromNull.headers['access-control-allow-origin'], undefined);
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});
