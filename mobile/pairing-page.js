/* Riff — pairing page shown at http://127.0.0.1:PORT/pair.

   Rendered by server.js and only ever served to loopback requests: it contains
   the pairing token, which is the credential phones use on the LAN. Kept as a
   separate module so the HTML is easy to test and does not bloat the client. */

'use strict';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addressRow(entry) {
  return '<li class="address">' +
    '<span class="address__name">' + escapeHtml(entry.name) + '</span>' +
    '<code class="address__value" data-copy="' + escapeHtml(entry.address) + '">' + escapeHtml(entry.address) + '</code>' +
    '<button class="copy" type="button" data-copy="' + escapeHtml(entry.address) + '">Copy</button>' +
    '</li>';
}

function renderPairingPage(options) {
  const opts = options || {};
  const addresses = Array.isArray(opts.addresses) ? opts.addresses : [];
  const token = String(opts.token || '');
  const port = Number(opts.port) || 38472;
  const lanEnabled = Boolean(opts.lanEnabled);

  const addressesHtml = addresses.length
    ? '<ul class="addresses">' + addresses.map(addressRow).join('') + '</ul>'
    : '<p class="muted">No LAN address found. Connect this computer to Wi-Fi or Ethernet, then reload this page.</p>';

  const lanNotice = lanEnabled
    ? '<div class="ok"><strong>LAN sharing is on.</strong> Devices on this Wi-Fi network can reach Riff at the addresses below.</div>'
    : '<div class="warn"><strong>LAN sharing is off.</strong> Riff is only listening on this computer. Quit Riff and start it with <code>--lan</code> (or set <code>RIFF_LAN=1</code>) to pair a phone.</div>';

  return '<!DOCTYPE html>\n' +
    '<html lang="en"><head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<meta name="color-scheme" content="dark light">\n' +
    '<meta name="robots" content="noindex">\n' +
    '<title>Pair a phone · Riff</title>\n' +
    '<style>\n' +
    ':root{color-scheme:dark;--bg:#121014;--surface:#1d1a21;--surface2:#26222b;--text:#e9e3ee;--muted:#b9b0c4;--primary:#d0bcff;--container:#4f378b;--ok:#b8e6c1;--warn:#f5c48f;--outline:#4a4453}\n' +
    '*{box-sizing:border-box}\n' +
    'body{margin:0;min-height:100vh;background:radial-gradient(120% 80% at 80% 0%,#2a1f3d 0%,var(--bg) 55%);color:var(--text);font:400 15px/1.55 "Google Sans",system-ui,-apple-system,"Segoe UI",sans-serif;padding:32px 20px 56px}\n' +
    'main{max-width:680px;margin:0 auto}\n' +
    '.brand{display:flex;align-items:center;gap:10px;margin-bottom:26px;font-weight:600;letter-spacing:.02em}\n' +
    '.brand span.dot{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:var(--container);color:var(--primary);font-size:18px}\n' +
    'h1{font-size:28px;line-height:1.2;margin:0 0 8px;font-weight:600}\n' +
    'p{margin:0 0 16px}\n' +
    '.muted{color:var(--muted)}\n' +
    '.card{background:var(--surface);border:1px solid var(--outline);border-radius:22px;padding:20px;margin:18px 0}\n' +
    '.ok,.warn{border-radius:16px;padding:14px 16px;font-size:14px;margin-bottom:18px}\n' +
    '.ok{background:rgba(70,120,85,.22);border:1px solid rgba(150,220,170,.35);color:var(--ok)}\n' +
    '.warn{background:rgba(140,95,45,.2);border:1px solid rgba(240,190,130,.35);color:var(--warn)}\n' +
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;word-break:break-all}\n' +
    '.addresses{list-style:none;margin:0;padding:0;display:grid;gap:10px}\n' +
    '.address{display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--outline);border-radius:12px;padding:10px 12px;flex-wrap:wrap}\n' +
    '.address__name{color:var(--muted);font-size:12px;min-width:74px;text-transform:uppercase;letter-spacing:.05em}\n' +
    '.address__value{flex:1;min-width:180px;color:var(--primary)}\n' +
    'h2{font-size:16px;margin:0 0 10px;font-weight:600}\n' +
    '.token{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--surface2);border:1px dashed var(--outline);border-radius:14px;padding:14px}\n' +
    '.token code{flex:1;font-size:15px;letter-spacing:.04em;color:var(--text)}\n' +
    'button.copy{background:var(--container);color:#eadcff;border:0;border-radius:999px;padding:7px 14px;font:600 12px/1 "Google Sans",system-ui,sans-serif;cursor:pointer}\n' +
    'button.copy:active{transform:scale(.97)}\n' +
    'ol.steps{margin:0;padding-left:20px;display:grid;gap:10px;color:var(--muted)}\n' +
    'ol.steps strong{color:var(--text)}\n' +
    '.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:#332d41;color:#e8def8;border-radius:999px;padding:9px 18px;font-size:13px;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}\n' +
    '.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}\n' +
    'footer{margin-top:26px;font-size:12px;color:var(--muted)}\n' +
    '</style></head><body><main>\n' +
    '<div class="brand"><span class="dot">♪</span> Riff</div>\n' +
    '<h1>Pair a phone</h1>\n' +
    '<p class="muted">Riff Mobile streams from this computer over your local network. Keep this page open while you type the details into the app.</p>\n' +
    lanNotice + '\n' +
    '<section class="card"><h2>1. Server address</h2>' + addressesHtml +
    '<p class="muted" style="margin-top:12px;font-size:13px">Same Wi-Fi required. If the address does not connect, check your firewall allows port ' + port + '.</p></section>\n' +
    '<section class="card"><h2>2. Pairing code</h2>' +
    '<div class="token"><code id="token">' + escapeHtml(token) + '</code><button class="copy" type="button" id="copy-token">Copy code</button></div>' +
    '<p class="muted" style="margin-top:12px;font-size:13px">Treat this like a password: anyone with the address and code can control this Riff library while sharing is on.</p></section>\n' +
    '<section class="card"><h2>3. In Riff Mobile</h2><ol class="steps">' +
    '<li>Open <strong>Riff Mobile → Connect to Riff</strong>.</li>' +
    '<li>Enter the <strong>server address</strong> and the <strong>pairing code</strong>.</li>' +
    '<li>Tap <strong>Connect</strong>. The app stays paired until you forget the server.</li>' +
    '</ol></section>\n' +
    '<footer>This page is only served to this computer. Turn LAN sharing off by restarting Riff without <code>--lan</code>.</footer>\n' +
    '</main><div class="toast" id="toast">Copied</div>\n' +
    '<script>\n' +
    '(function(){\n' +
    '  var toast = document.getElementById("toast");\n' +
    '  var timer = null;\n' +
    '  function flash(text) {\n' +
    '    if (!toast) return;\n' +
    '    toast.textContent = text;\n' +
    '    toast.classList.add("show");\n' +
    '    clearTimeout(timer);\n' +
    '    timer = setTimeout(function(){ toast.classList.remove("show"); }, 1400);\n' +
    '  }\n' +
    '  function copy(text, done) {\n' +
    '    if (navigator.clipboard && navigator.clipboard.writeText) {\n' +
    '      navigator.clipboard.writeText(text).then(done, function(){ fallback(text, done); });\n' +
    '    } else {\n' +
    '      fallback(text, done);\n' +
    '    }\n' +
    '  }\n' +
    '  function fallback(text, done) {\n' +
    '    var area = document.createElement("textarea");\n' +
    '    area.value = text;\n' +
    '    document.body.appendChild(area);\n' +
    '    area.select();\n' +
    '    try { document.execCommand("copy"); } catch (e) {}\n' +
    '    area.remove();\n' +
    '    done();\n' +
    '  }\n' +
    '  document.addEventListener("click", function(event){\n' +
    '    var button = event.target.closest("button[data-copy]");\n' +
    '    if (!button) return;\n' +
    '    copy(button.getAttribute("data-copy"), function(){ flash("Copied " + button.getAttribute("data-copy")); });\n' +
    '  });\n' +
    '  var tokenButton = document.getElementById("copy-token");\n' +
    '  if (tokenButton) tokenButton.addEventListener("click", function(){\n' +
    '    copy(document.getElementById("token").textContent, function(){ flash("Pairing code copied"); });\n' +
    '  });\n' +
    '})();\n' +
    '</script></body></html>';
}

module.exports = { renderPairingPage, escapeHtml };
