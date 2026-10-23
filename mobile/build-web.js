#!/usr/bin/env node
/* Riff Mobile — native web bundle.

   The mobile client references two shared files from the project root
   (audio-engine.js and assets/hls.min.js). Capacitor can only copy a single
   webDir, so this script assembles a self-contained copy with those files
   pulled in and the HTML paths rewritten.

   Output: mobile/.web  (gitignored; consumed by `cap sync`)
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = __dirname;
const OUT = path.join(__dirname, '.web');

const SKIP = new Set([
  '.web',
  'node_modules',
  'README.md',
  'build-web.js',
  'dev-server.js',
  'pairing-page.js',
  '.DS_Store'
]);

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyTree(source, destination) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyTree(from, to);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function build() {
  rmrf(OUT);
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

  copyTree(SRC, OUT);

  // shared engine + HLS player from the project root
  fs.copyFileSync(path.join(ROOT, 'audio-engine.js'), path.join(OUT, 'audio-engine.js'));
  fs.copyFileSync(path.join(ROOT, 'assets', 'hls.min.js'), path.join(OUT, 'assets', 'hls.min.js'));

  const indexPath = path.join(OUT, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8').replace(
    /\.\.\/(audio-engine\.js|assets\/hls\.min\.js)/g,
    '$1'
  );
  fs.writeFileSync(indexPath, html);

  const leftovers = html.match(/\.\.\//g);
  if (leftovers) {
    throw new Error('native bundle still contains relative paths outside webDir');
  }

  const stats = ['index.html', 'js/app.js', 'js/player.js', 'css/app.css', 'audio-engine.js', 'assets/hls.min.js']
    .map((file) => {
      const size = fs.statSync(path.join(OUT, file)).size;
      return file + ' (' + Math.round(size / 1024) + ' kB)';
    });

  console.log('Riff Mobile web bundle written to mobile/.web');
  console.log('  ' + stats.join('\n  '));
}

build();
