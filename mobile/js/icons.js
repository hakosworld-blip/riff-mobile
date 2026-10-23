/* Riff Mobile — inline SVG icon set (Material-symbols flavoured line icons).
   No network fonts or sprite sheets, so the app works offline and from file://. */

(function (global) {
  'use strict';

  const ICONS = {
    home: '<path d="M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.6v-6.2H9.6V20H5a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="11" cy="11" r="6.4"/><path d="m15.8 15.8 4.2 4.2"/>',
    library: '<rect x="4" y="4" width="3.6" height="16" rx="1.2"/><rect x="9.8" y="4" width="3.6" height="16" rx="1.2"/><path d="M16.6 5.1 20 6l-2.6 14.1-3.4-.9z"/>',
    tune: '<path d="M4 7h8M16 7h4M4 12h3M11 12h9M4 17h10M18 17h2"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>',
    play: '<path d="M8 5.4v13.2L19 12z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="7" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none"/>',
    skip_next: '<rect x="17" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" stroke="none"/><path d="M15 6v12L5 12z" fill="currentColor" stroke="none"/>',
    skip_previous: '<rect x="4.4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" stroke="none"/><path d="M9 6v12l10-6z" fill="currentColor" stroke="none"/>',
    shuffle: '<path d="M4 7h3.2c1.7 0 2.7.9 3.8 2.4l2.3 3.4c1 1.5 2 2.3 3.7 2.3H21"/><path d="m18.4 12.3 2.8 2.8-2.8 2.8"/><path d="M4 17h3.2c1.6 0 2.6-.8 3.5-2"/><path d="M13.4 9.5c.9-1.4 1.9-2.2 3.6-2.2H21"/><path d="m18.4 4.5 2.8 2.8-2.8 2.8"/>',
    repeat: '<path d="M17 3.6 20.4 7 17 10.4"/><path d="M20.4 7H7.2A3.2 3.2 0 0 0 4 10.2v1.9"/><path d="M7 20.4 3.6 17 7 13.6"/><path d="M3.6 17h13.2a3.2 3.2 0 0 0 3.2-3.2v-1.9"/>',
    repeat_one: '<path d="M17 3.6 20.4 7 17 10.4"/><path d="M20.4 7H7.2A3.2 3.2 0 0 0 4 10.2v1.9"/><path d="M7 20.4 3.6 17 7 13.6"/><path d="M3.6 17h13.2a3.2 3.2 0 0 0 3.2-3.2v-1.9"/><path d="M11.2 9.6h1.4v4.8"/>',
    heart: '<path d="M12 20.1C9.9 18.8 4.4 15.3 4.4 10.4A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 7.6 2.9c0 4.9-5.5 8.4-7.6 9.7z"/>',
    heart_filled: '<path d="M12 20.1C9.9 18.8 4.4 15.3 4.4 10.4A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 7.6 2.9c0 4.9-5.5 8.4-7.6 9.7z" fill="currentColor"/>',
    more_vert: '<circle cx="12" cy="5.6" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="18.4" r="1.7" fill="currentColor" stroke="none"/>',
    queue: '<path d="M4 6.5h11M4 11.5h11M4 16.5h6.5"/><path d="M17.5 12.4v6"/><circle cx="15.4" cy="18.6" r="2.1"/>',
    lyrics: '<rect x="3.5" y="5" width="17" height="14" rx="3.2"/><path d="M7.5 10h9M7.5 13.6h5.6"/>',
    equalizer: '<path d="M6 19.5V10M12 19.5V4.5M18 19.5v-6.4" stroke-width="2.4"/>',
    download: '<path d="M12 4.5v10.2"/><path d="m8.2 11 3.8 3.9 3.8-3.9"/><path d="M5 19.2h14"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    arrow_back: '<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
    chevron_right: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    chevron_down: '<path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>',
    check: '<path d="m5 12.6 4.6 4.6L19 7.6"/>',
    delete: '<path d="M5 7h14M10 11v6M14 11v6"/><path d="M6.6 7 7.6 20h8.8L17.4 7"/><path d="M9.6 7V4.6h4.8V7"/>',
    edit: '<path d="M4.4 19.6h3.8L19.4 8.4a2.05 2.05 0 0 0-2.9-2.9L5.3 16.7z"/><path d="m14.6 5.5 3.9 3.9"/>',
    playlist_add: '<path d="M4 6.5h11M4 11.5h11M4 16.5h7"/><path d="M17.4 11.4v7.2M13.8 15h7.2"/>',
    music_note: '<circle cx="7.2" cy="17.8" r="2.3"/><circle cx="17.8" cy="16.2" r="2.3"/><path d="M9.5 17.8V6.4l10.6-2v9.8"/>',
    album: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.2"/>',
    person: '<circle cx="12" cy="8.4" r="3.6"/><path d="M5.2 20c0-3.4 3-5.7 6.8-5.7s6.8 2.3 6.8 5.7"/>',
    volume: '<path d="M4.5 9.6v4.8H8L13 19V5L8 9.6z"/><path d="M16.4 9.2a3.9 3.9 0 0 1 0 5.6"/><path d="M18.9 6.7a7.4 7.4 0 0 1 0 10.6"/>',
    volume_off: '<path d="M4.5 9.6v4.8H8L13 19V5L8 9.6z"/><path d="m16.4 9.6 4.6 4.8M21 9.6l-4.6 4.8"/>',
    offline: '<path d="M6.6 18.2h10a3.7 3.7 0 0 0 .5-7.3A5.5 5.5 0 0 0 7 9.7a4.3 4.3 0 0 0-.4 8.5z"/><path d="m4 4 16 16"/>',
    history: '<path d="M4.4 12a7.6 7.6 0 1 0 2.3-5.4"/><path d="M4.2 4.6v4.4h4.4"/><path d="M12 8.2v4.4l3 1.8"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.2v4.6h-4.6"/>',
    drag: '<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" stroke-width="2.8"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6v4.8l3.2 1.9"/>',
    import: '<path d="M12 15.2V4.4"/><path d="m8.2 8.2 3.8-3.8 3.8 3.8"/><path d="M5 15v4.6h14V15"/>',
    folder: '<path d="M4 7.4h5.6l2 2H20v9.2H4z"/>',
    server: '<rect x="4" y="4.6" width="16" height="6" rx="2"/><rect x="4" y="13.4" width="16" height="6" rx="2"/><path d="M7.6 7.6h.01M7.6 16.4h.01" stroke-width="2.6"/>',
    palette: '<path d="M12 3.6a8.4 8.4 0 0 0 0 16.8c1.7 0 2.1-1.2 1.5-2.2-.7-1.2.2-2.5 1.6-2.5h1.5a4 4 0 0 0 4-4A8.6 8.6 0 0 0 12 3.6z"/><circle cx="8.3" cy="9.1" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.1" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.7" cy="9.1" r="1.1" fill="currentColor" stroke="none"/>',
    translate: '<path d="M4 6.2h8M8 4.2v2M10.6 6.2c-.7 3.1-2.7 5.5-5.2 6.9"/><path d="M6.4 9.4c1.2 2 3 3.3 4.7 3.9"/><path d="m12.6 20 3.6-8.4 3.6 8.4"/><path d="M14 17.2h4.4"/>',
    warning: '<path d="M12 4.2 21 20H3z"/><path d="M12 10v4.4M12 17.3h.01"/>',
    info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11.2v5M12 8h.01"/>',
    play_circle: '<circle cx="12" cy="12" r="8.6"/><path d="M10.2 8.9v6.2l5.2-3.1z" fill="currentColor" stroke="none"/>',
    queue_music: '<path d="M4 6.5h11M4 11.5h11M4 16.5h6.5"/><path d="M17.5 12.4v6"/><circle cx="15.4" cy="18.6" r="2.1"/>',
    library_add: '<path d="M4 6.5h10M4 11.5h10M4 16.5h6"/><path d="M17.4 11.4v7.2M13.8 15h7.2"/>',
    speed: '<path d="M4.6 16.6a8.4 8.4 0 1 1 14.8 0"/><path d="m12 13.4 3.6-3.6"/><circle cx="12" cy="13.8" r="1.4" fill="currentColor" stroke="none"/>',
    timer: '<circle cx="12" cy="13.6" r="7"/><path d="M12 10v3.8l2.4 1.4M9.5 3.4h5M12 3.4v2.4"/>',
    wifi: '<path d="M4.2 9.2a12 12 0 0 1 15.6 0"/><path d="M7.4 12.6a7.4 7.4 0 0 1 9.2 0"/><path d="M10.4 16a3.2 3.2 0 0 1 3.2 0"/><circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none"/>',
    headset: '<path d="M5 13.4v-1.2a7 7 0 0 1 14 0v1.2"/><rect x="3.6" y="13" width="3.8" height="6.2" rx="1.8"/><rect x="16.6" y="13" width="3.8" height="6.2" rx="1.8"/>',
    star: '<path d="m12 4.4 2.35 4.9 5.35.7-3.95 3.7 1.05 5.3L12 16.5l-4.8 2.5 1.05-5.3-3.95-3.7 5.35-.7z"/>',
    link: '<path d="M10.2 13.8a3.8 3.8 0 0 0 5.4 0l2.6-2.6a3.8 3.8 0 0 0-5.4-5.4l-1.3 1.3"/><path d="M13.8 10.2a3.8 3.8 0 0 0-5.4 0l-2.6 2.6a3.8 3.8 0 0 0 5.4 5.4l1.3-1.3"/>',
    expand_more: '<path d="m6 9.5 6 6 6-6"/>',
    expand_less: '<path d="m6 14.5 6-6 6 6"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.4" fill="currentColor" stroke="none"/>'
  };

  function svg(name, size) {
    const markup = ICONS[name] || ICONS.music_note;
    const px = Number(size) || 24;
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" aria-hidden="true" focusable="false">' + markup + '</svg>';
  }

  function element(name, size) {
    const span = document.createElement('span');
    span.className = 'i';
    span.innerHTML = svg(name, size);
    return span;
  }

  function hydrate(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-icon]').forEach((node) => {
      if (node.dataset.iconDone === '1') return;
      node.innerHTML = svg(node.dataset.icon, node.dataset.iconSize);
      node.dataset.iconDone = '1';
    });
  }

  global.RiffIcons = { icons: ICONS, svg, element, hydrate };
})(window);
