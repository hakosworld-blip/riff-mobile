# Riff Mobile

Riff Mobile is a mobile-first music client for Riff, built with its own
**Material 3 (M3 Expressive)** interface on top of Riff's existing local engine.
It reuses the desktop app's backend — streaming search, stream resolution,
lyrics, offline cache, downloads, playlist import — but has a completely separate
touch UI: bottom navigation, a docked mini player, a full-screen player with
drag-to-dismiss, rounded sheets, tonal surfaces, dynamic color from artwork and
M3 motion.

No frameworks, no build step: plain ES5/ES2020 browser JavaScript, the same
vanilla approach as the desktop renderer.

---

## Running it

### Inside the desktop app (phone-sized window)

```bash
npm install          # once, for Electron
npm run mobile       # opens Riff Mobile in a 430 × 900 window
```

The window talks to the app's own local API with the same token the desktop
renderer uses.

### In a browser on the same machine

While Riff is running:

```
http://127.0.0.1:38472/mobile
```

Riff's server binds to loopback by default and rejects foreign `Host` headers,
so `/mobile` is reachable from this machine, not the LAN. The page receives a
same-origin boot token from the server; no credentials are stored in files or
the URL. (Opt-in LAN sharing, used by the native apps, is described below.)

Chromium-based browsers can install it as a standalone app (address bar →
**Install**), thanks to `manifest.webmanifest` and the app-shell service worker.

### Preview without a backend (demo catalogue)

```bash
npm run mobile:dev        # http://localhost:3000
```

The dev server serves only the mobile client and opens the built-in demo
catalogue (`?demo=1`), so the interface can be reviewed without Riff, yt-dlp or
ffmpeg. Demo mode never pretends to stream: pressing play tells you the backend
is missing.

`PORT=8080 npm run mobile:dev` changes the port.

---

## Native apps (Android and iOS)

The same client also ships as a Capacitor project, so Riff Mobile can be built
as a real installable app that talks to the Riff server on your computer over
the local network. The UI is untouched: Capacitor bundles `mobile/` into
`mobile/.web`, copies it into each native project and serves it from the
platform WebView.

### Prerequisites

| Target | Needs |
| --- | --- |
| Both | Node.js 22+ and `npm install` at the repo root |
| Android | JDK 21, Android SDK 36, Android Studio (compileSdk/targetSdk 36, minSdk 24) |
| iOS | macOS with Xcode 16+, iOS 15.0+ deployment target |

### Build

```bash
npm run mobile:sync      # bundle mobile/ into mobile/.web, copy into android/ and ios/
npm run mobile:android   # sync, then open android/ in Android Studio
npm run mobile:ios       # sync, then open ios/ in Xcode (macOS)
```

From Android Studio: **Run ▶** on a device or emulator, or
`cd android && ./gradlew assembleDebug` for an APK at
`android/app/build/outputs/apk/debug/app-debug.apk`.

From Xcode: pick a simulator or a signing team and **Run ▶**.

`npm run mobile:sync` is the only build step the app needs; rerun it after
changing anything in `mobile/`. `capacitor.config.json` holds the app id
(`io.github.rootscripts.riff`), the display name and `webDir`.

### Pairing the phone with Riff

A native app has no same-origin server, so it pairs once:

1. Start Riff with LAN sharing: `npm run mobile:lan`, or `npm start -- --lan`
   (equivalent to `RIFF_LAN=1`). Riff then listens on `0.0.0.0` instead of
   loopback only; its console prints the pairing URL.
2. On the computer, open **http://127.0.0.1:38472/pair**. It lists this
   computer's LAN addresses and the pairing code.
3. In the app, open **Connect to Riff** (also in **Settings → Pair with your
   computer**), enter the address and code, and tap **Connect**.

The address and code are stored in the app's `localStorage`; the app keeps
working across restarts and Riff upgrades. **Forget this server** clears them,
and **Continue in demo mode** browses the sample catalogue with no backend.
Every media URL returned by the server (`thumbnail`, `streamUrl`, `proxyUrl`)
is rewritten from `127.0.0.1` to the paired address, with the token appended for
media requests that cannot send headers.

### Security model for LAN sharing

LAN sharing is opt-in and scoped:

* Only private LAN hosts are accepted (`127.0.0.1`, `10/8`, `172.16/12`,
  `192.168/16`, `169.254/16`, IPv6 ULA/link-local, `*.local`). Public hostnames
  and DNS-rebinding hosts are rejected.
* Every `/api/*` request from a non-loopback host needs the pairing code, in
  `X-Riff-Token` or a `token` query parameter (media elements cannot send
  headers).
* `/pair` and the web `/mobile` shell — both of which expose the token — are
  served to loopback only.
* CORS origins are echoed only when they match an allowed local origin
  (`file:`, `capacitor://localhost`, `https://localhost`, LAN hosts). There is
  no wildcard.
* The pairing code is a 48-character random token, persisted with `0600`
  permissions in Riff's config directory as `mobile-pairing.json`. Delete that
  file (or **Forget this server** in the app) to revoke access.
* Android builds allow cleartext HTTP (`usesCleartextTraffic`) and iOS allows
  insecure loads in web content plus local networking, because Riff talks to
  your own computer over plain HTTP. Neither target exposes Riff to the
  internet.

### Building and releasing the APK

Two GitHub Actions workflows drive the Android app; no local Android toolchain
is needed to ship a build.

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/android.yml` | push to `main`, pull requests, manual dispatch | runs the Node test suite, syncs the web bundle, builds a **debug** APK and uploads it as a workflow artifact (never a release) |
| `.github/workflows/release.yml` | push of a `vX.Y.Z` tag, or manual dispatch with a version | tests, builds and **signs** the release APK, verifies the signature, then publishes the APK plus the desktop builds as a GitHub Release |

The release pipeline fails instead of shipping something broken: it stops if the
`android/` project is missing, if the signing secrets are absent, if `apksigner`
rejects the APK, or if the APK's package id or version does not match the tag.

**Versioning.** `applicationId` stays `io.github.rootscripts.riff` forever, so a
new APK installs over the old one. `versionName` comes from the tag
(`v1.2.3` → `1.2.3`) and `versionCode` is derived from it
(`major * 10000 + minor * 100 + patch`), which Android requires to increase for
every update. Pass them manually for a local build:

```bash
npm run mobile:sync
./android/gradlew -p android assembleRelease \
  -PriffVersionName=1.2.3 -PriffVersionCode=10203
# android/app/build/outputs/apk/release/app-release.apk
```

Without `-P` flags a local build reports `1.0.0` / versionCode `1`.

**Signing.** The release APK is signed with a dedicated key. Locally it lives in:

| File | Purpose |
| --- | --- |
| `android/keystore/riff-release.jks` | 4096-bit RSA signing key, 10,000 days |
| `android/keystore.properties` | store/key passwords and alias (mode `0600`) |
| `android/app/build.gradle` | reads that file; enables APK signature schemes v2 + v3 |

Both files are gitignored. CI takes the same key from repository secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 riff-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore (store) password |
| `ANDROID_KEY_ALIAS` | `riff` |
| `ANDROID_KEY_PASSWORD` | key password |

Set them in **Settings → Secrets and variables → Actions → New repository
secret**. Never commit the keystore or paste it into a workflow file.

**Back the keystore up somewhere safe.** Android identifies an app by its signing
key; without the original key you cannot update an installed copy — a different
key requires uninstalling first. To publish a new version, push a new tag:

```bash
git tag -a v1.1.0 -m "Riff 1.1.0"
git push origin v1.1.0
```

Or, without a terminal, open **Actions → Release → Run workflow** and enter
`1.1.0`; the workflow creates the tag itself. APKs are attached to the release as
`riff-<version>-android.apk` with a `.sha256` alongside. Install one with
`adb install riff-1.1.0-android.apk`, or download it on the phone and allow
installing from that app. Android 13+ asks for notification permission the first
time playback starts, which is what shows the lock-screen/notification controls.

### Known native limitations

* **Background playback** keeps audio in the WebView (so EQ/DSP still apply)
  and adds a native media session around it: an Android foreground service with
  a MediaStyle notification, and on iOS an active `.playback` audio session with
  Now Playing / remote commands. Transport buttons (play, pause, next,
  previous, seek) are forwarded to the web player. Because the renderer is
  still WebKit, swiping the Android task away or extreme background memory
  pressure can stop playback; the foreground service keeps normal screen-off
  playback alive. Android 13+ asks once for notification permission the first
  time playback starts.
* **Downloads** still write to the Riff computer's download folder — the phone
  streams and manages the remote library; it does not copy files onto the
  device.
* **Desktop-only features** (Discord Rich Presence, plugins, theme/CSS editor,
  auto-updates, tray/launcher, waveform editor, Spotify sign-in) stay in the
  desktop app, as listed in Settings.

---

## What's inside

```
mobile/
├── index.html               app shell, nav bar, mini player
├── manifest.webmanifest     PWA manifest
├── sw.js                    app-shell cache (never caches /api)
├── dev-server.js            static preview server (demo mode)
├── build-web.js             assembles mobile/.web for Capacitor
├── pairing-page.js          loopback-only pairing page (rendered by server.js)
├── css/
│   ├── tokens.css           M3 color / type / shape / motion tokens
│   └── app.css              M3 components and screens
└── js/
    ├── core.js              pure logic: formatting, queue math, LRC, M3 palettes
    ├── icons.js             inline SVG icon set (offline-safe)
    ├── demo.js              demo catalogue for previews
    ├── api.js               Riff API client (search, stream, lyrics, library…)
    ├── store.js             favorites, history, playlists, settings (localStorage)
    ├── player.js            queue + streaming + Web Audio engine, media session
    ├── ui.js                DOM toolkit, sheets, dialogs, menus, theming
    ├── app.js               router, bottom nav, mini player, boot
    ├── background.js        native background-audio bridge (commands, metadata)
    └── views/               home, search, library, collection, player, settings, connect
```

The native media session is app-local code, not an npm plugin:

```
android/app/src/main/java/io/github/rootscripts/riff/
├── RiffBackgroundAudioPlugin.java   bridge, notification permission
└── RiffPlaybackService.java         foreground service + MediaSession

ios/App/App/AppDelegate.swift
├── RiffBridgeViewController         registers the plugin
└── RiffBackgroundAudioPlugin        AVAudioSession, Now Playing, remote commands
```

Native shells live at the repository root:

```
capacitor.config.json        app id, name, webDir
android/                     Android Studio / Gradle project
ios/                         Xcode project (Swift Package Manager)
```

The shared `audio-engine.js` is loaded from the project root, so the mobile UI
gets the exact same 10-band EQ, DSP chain and HQ engine as the desktop app.

---

## Material 3 implementation

* **Color**: full token set (`primary`, `on-*`, containers, surface tones,
  outline, inverse, error) generated at runtime from the playing artwork.
  Artwork is sampled on a canvas (dominant, reasonably saturated hue) and turned
  into tonal steps for dark/light. When sampling is impossible (CORS, missing
  art, offline) the app falls back to a deterministic hue derived from the
  track, or your chosen accent.
* **Typescale**: display / headline / title / body / label roles with Google
  Sans and the same fallbacks as the desktop app.
* **Shape**: 4/8/12/16/28/full corners; sheets use the 28dp top corners, the
  now-playing artwork uses the extra-large shape.
* **Components**: navigation bar with active indicator, small app bars, filled /
  tonal / outlined / text buttons, extended FAB, chips, segmented buttons,
  filled text field, sliders with M3 thumbs, switches, list items, dialogs,
  bottom sheets with drag handle and swipe-to-dismiss, snackbars with action,
  state-layer ripples.
* **Motion**: emphasized easing for sheets and navigation, spring-ish press
  states, reduced-motion support.
* **Layout**: safe-area insets, `100dvh`, tablet/desktop framing at ≥720px,
  touch targets ≥48dp, no hover-only affordances.

---

## Feature coverage

| Capability | Mobile client |
| --- | --- |
| Search across YouTube Music, YouTube and SoundCloud | ✅ chips switch provider; songs + albums + artists |
| Hot picks / "made for you" | ✅ |
| Albums and artist pages (iTunes metadata + provider resolution) | ✅ |
| Streaming playback, queue, shuffle, repeat, seek, volume | ✅ |
| Mini player + full-screen player | ✅ |
| Local library: list, play, remove (import via the desktop app) | ✅ |
| Offline downloads: list, size, delete, clear all | ✅ |
| Download a track with format, quality and optional trim | ✅ |
| Playlists: create, rename, delete, add/remove, reorder, play/shuffle | ✅ |
| Playlist import: YouTube / YouTube Music / SoundCloud / Apple Music | ✅ (Spotify import stays on desktop, where its sign-in lives) |
| Favorites and listening history | ✅ |
| Synchronized lyrics: auto-scroll, tap-to-seek, ±0.5s offset, translation | ✅ |
| 10-band equalizer + presets | ✅ |
| DSP: speed, pitch, reverb, distortion, HQ engine, volume normalisation | ✅ |
| Visualizer (analyser-driven) | ✅ |
| Sleep timer | ✅ |
| Dynamic color, light/dark/auto, accent palettes | ✅ |
| Add to queue / play next, clear queue, reorder queue | ✅ |
| Background playback + lock-screen / notification controls | ✅ native media session on Android & iOS (web controls in the PWA) |
| **Desktop-only**: Discord Rich Presence, plugins, theme/CSS editor, auto-updates, tray/launcher, waveform editor, Spotify sign-in | stays in the desktop app |

The Settings screen lists the desktop-only features explicitly, so nothing is
silently missing.

---

## Implementation notes

* **State** lives in `localStorage` under `riff_mobile_state_v1`: favorites,
  history, playlists, recent searches, settings and playback prefs. Nothing is
  uploaded; there is no telemetry and no account.
* **Playback** resolves audio through `/api/stream-info` (which also serves the
  offline cache), prefers the server's same-origin `proxyUrl`, and retries once
  without CORS if the media element is rejected. HLS uses the bundled `hls.js`.
* **Album tracks** don't have stream ids until resolved; the mobile client
  resolves them lazily (`needsResolve`), matching the desktop flow.
* **Dynamic color** is cached per artwork URL so track changes don't re-clip the
  palette on every replay.
* **Theming** re-applies instantly on theme/accent changes and on OS
  light/dark changes while in `Auto`.
* **Security**: the mobile page is served by Riff's loopback server and receives
  its request token inline; all API calls still need `X-Riff-Token`. Native
  builds pair explicitly (see above); without LAN sharing the server keeps
  rejecting non-loopback hosts and foreign origins.
* **Native**: the client detects Capacitor (`window.Capacitor`, or a
  `capacitor:`/`https://localhost` WebView origin) and skips the automatic
  loopback default, showing the pairing screen on a fresh install instead.

## Tests

`test/mobile.test.js` covers the shared logic — time/byte formatting, LRC
parsing, active lyric lookup, queue/repeat/shuffle maths, history merging, track
normalisation, artist grouping, palette generation, EQ preset integrity — and
verifies that every asset referenced by `mobile/index.html` exists and that the
server still exposes the mobile routes.

`test/mobile-native.test.js` covers the native shell: server-address
normalisation, loopback media rewriting, the pairing page, Capacitor/Android/iOS
configuration, and a real HTTP run of the LAN rules (token required on every
remote API call, pairing page and PWA shell loopback-only, allowed native
origins, rejected foreign origins).

```bash
npm test
```
