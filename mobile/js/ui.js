/* Riff Mobile — tiny DOM toolkit and Material 3 components (no framework). */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const Icons = global.RiffIcons;

  const overlayRoot = document.getElementById('overlay-root');
  const snackbarHost = document.getElementById('snackbar-host');
  const openLayers = [];

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (value === undefined || value === null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') {
          node[key] = Boolean(value);
        } else {
          node.setAttribute(key, value === true ? '' : value);
        }
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === undefined || children === null) return node;
    if (Array.isArray(children)) {
      children.forEach((child) => append(node, child));
      return node;
    }
    if (children instanceof Node) {
      node.appendChild(children);
      return node;
    }
    node.appendChild(document.createTextNode(String(children)));
    return node;
  }

  function frag(children) {
    const fragment = document.createDocumentFragment();
    append(fragment, children);
    return fragment;
  }

  function icon(name, size) {
    const span = el('span', { class: 'i' });
    span.innerHTML = Icons.svg(name, size);
    return span;
  }

  function iconButton(name, options) {
    const opts = options || {};
    return el('button', {
      class: 'icon-btn' + (opts.small ? ' icon-btn--small' : '') + (opts.className ? ' ' + opts.className : ''),
      type: 'button',
      'aria-label': opts.label || name,
      title: opts.label || '',
      onclick: opts.onClick
    }, icon(name, opts.size));
  }

  function isPlayable(track) {
    return Boolean(track && (track.id || track.url || track.needsResolve));
  }

  function trackHue(track) {
    if (track && track.hue != null) return track.hue;
    return C.hashHue((track && (track.id || track.title)) || 'riff');
  }

  function art(item, sizeClass, options) {
    const opts = options || {};
    const source = item && (item.thumbnail || item.localThumbnail || item.cover || item.artwork || item.avatar);
    const wrap = el('span', { class: 'art ' + (sizeClass || 'art--s') });
    wrap.style.setProperty('--art-h', trackHue(item));
    if (source && !opts.placeholder) {
      const img = el('img', {
        src: source,
        alt: '',
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
        decoding: 'async'
      });
      img.addEventListener('error', () => {
        img.remove();
        if (!wrap.querySelector('.i')) wrap.appendChild(icon(opts.fallbackIcon || 'music_note'));
      });
      wrap.appendChild(img);
    } else {
      wrap.appendChild(icon(opts.fallbackIcon || 'music_note'));
    }
    return wrap;
  }

  function eqBars() {
    return el('span', { class: 'eq-bars', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]);
  }

  function trackRow(track, options) {
    const opts = options || {};
    const metaBits = [];
    if (opts.showArtist !== false && track.artist) metaBits.push(el('span', { text: track.artist }));
    if (track.duration) {
      if (metaBits.length) metaBits.push(el('span', { class: 'dot' }));
      metaBits.push(el('span', { text: C.formatTime(track.duration), style: { fontVariantNumeric: 'tabular-nums' } }));
    }
    if (track.isCached) {
      if (metaBits.length) metaBits.push(el('span', { class: 'dot' }));
      metaBits.push(el('span', { text: 'Offline' }));
    }

    const row = el('button', {
      class: 'track-row' + (opts.current ? ' is-current' : ''),
      type: 'button',
      onclick: opts.onActivate,
      oncontextmenu: opts.onMenu ? (event) => { event.preventDefault(); opts.onMenu(event.currentTarget); } : undefined
    }, [
      opts.index != null
        ? el('span', { class: 'queue-row__index', text: String(opts.index) })
        : art(track, opts.artSize || 'art--s'),
      el('span', { class: 'track-row__body' }, [
        el('span', { class: 'track-row__title', text: track.title }),
        el('span', { class: 'track-row__meta' }, metaBits)
      ]),
      el('span', { class: 'track-row__trailing' }, opts.current
        ? eqBars()
        : (opts.badge ? el('span', { class: 'track-row__badge' }, [opts.badge]) : null))
    ]);

    if (opts.onMenu) {
      row.appendChild(iconButton('more_vert', {
        label: 'More options for ' + track.title,
        className: 'track-row__more',
        onClick: (event) => {
          event.stopPropagation();
          opts.onMenu(event.currentTarget);
        }
      }));
    }
    return row;
  }

  function sectionHeader(title, options) {
    const opts = options || {};
    return el('div', { class: 'section-head' }, [
      el('div', {}, [
        el('div', { class: 'section-head__title', text: title }),
        opts.sub ? el('div', { class: 'section-head__sub', text: opts.sub }) : null
      ]),
      opts.actionLabel
        ? el('button', { class: 'btn btn--text btn--small', type: 'button', onclick: opts.onAction }, opts.actionLabel)
        : null
    ]);
  }

  function emptyState(options) {
    const opts = options || {};
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon' }, icon(opts.icon || 'music_note')),
      el('div', { class: 'empty__title', text: opts.title || 'Nothing here yet' }),
      opts.text ? el('div', { class: 'empty__text', text: opts.text }) : null,
      opts.actionLabel
        ? el('button', { class: 'btn btn--tonal', type: 'button', onclick: opts.onAction }, [
            opts.actionIcon ? icon(opts.actionIcon) : null,
            opts.actionLabel
          ])
        : null
    ]);
  }

  function skeletonRows(count) {
    const rows = [];
    for (let i = 0; i < (count || 6); i++) {
      rows.push(el('div', { class: 'skeleton-row' }, [
        el('div', { class: 'skeleton skeleton-row__art' }),
        el('div', { class: 'skeleton-row__lines' }, [
          el('div', { class: 'skeleton skeleton-row__line', style: { width: (46 + (i % 3) * 14) + '%' } }),
          el('div', { class: 'skeleton skeleton-row__line', style: { width: (28 + (i % 4) * 9) + '%', height: '9px' } })
        ])
      ]));
    }
    return el('div', { style: { padding: '6px 8px' } }, rows);
  }

  function loader(center) {
    return el('div', { style: { display: 'flex', justifyContent: 'center', padding: center || '28px 0' } }, el('div', { class: 'spinner' }));
  }

  /* ---------------- theming ---------------- */

  const schemeCache = new Map();

  function applyScheme(colors) {
    const root = document.documentElement;
    Object.keys(colors).forEach((key) => {
      if (key.startsWith('--')) root.style.setProperty(key, colors[key]);
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && colors['--md-sys-color-background']) meta.setAttribute('content', colors['--md-sys-color-background']);
  }

  function schemeFor(seedHex, mode) {
    const key = String(seedHex) + '|' + mode;
    if (schemeCache.has(key)) return schemeCache.get(key);
    const scheme = C.generateScheme(seedHex, mode);
    schemeCache.set(key, scheme);
    if (schemeCache.size > 48) {
      const first = schemeCache.keys().next().value;
      schemeCache.delete(first);
    }
    return scheme;
  }

  function prefersLight() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches;
  }

  function resolveMode(themeMode) {
    if (themeMode === 'auto') return prefersLight() ? 'light' : 'dark';
    return themeMode === 'light' ? 'light' : 'dark';
  }

  let currentSeed = null;
  let currentMode = 'dark';

  function applyTheme(options) {
    const opts = options || {};
    const mode = opts.mode || 'dark';
    const seed = opts.seed || '#d0bcff';
    currentSeed = seed;
    currentMode = mode;
    document.documentElement.dataset.theme = mode;
    applyScheme(schemeFor(seed, mode));
  }

  function themeSeed() {
    return currentSeed;
  }

  function themeMode() {
    return currentMode;
  }

  /* Artwork-driven dynamic color. Falls back to a deterministic hue when the
     image cannot be sampled (CORS, offline, missing art). */
  async function dynamicThemeFor(track, settings) {
    const opts = settings || {};
    const mode = resolveMode(opts.themeMode || 'dark');
    if (!opts.dynamicColor || !track) {
      applyTheme({ mode, seed: opts.accent || '#d0bcff' });
      return;
    }
    const source = track && (track.thumbnail || track.localThumbnail);
    if (source) {
      const cached = schemeCache.get('art|' + source + '|' + mode);
      if (cached) {
        document.documentElement.dataset.theme = mode;
        applyScheme(cached);
        return;
      }
      const sampled = await C.extractArtworkColor(source);
      if (sampled) {
        const scheme = C.generateScheme(sampled, mode);
        schemeCache.set('art|' + source + '|' + mode, scheme);
        document.documentElement.dataset.theme = mode;
        applyScheme(scheme);
        return;
      }
    }
    const fallback = C.hslToHex(trackHue(track), 46, mode === 'dark' ? 78 : 42);
    applyTheme({ mode, seed: fallback });
  }

  /* ---------------- snackbar ---------------- */

  function snackbar(message, options) {
    const opts = options || {};
    const node = el('div', { class: 'snackbar' }, [
      el('span', { class: 'snackbar__text', text: message }),
      opts.actionLabel
        ? el('button', {
            class: 'snackbar__action',
            type: 'button',
            onclick: () => {
              dismiss();
              if (opts.onAction) opts.onAction();
            }
          }, opts.actionLabel)
        : null
    ]);
    let timer = null;
    let closed = false;

    function dismiss() {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 200);
    }

    function setText(value) {
      const text = node.querySelector('.snackbar__text');
      if (text) text.textContent = value;
    }

    snackbarHost.appendChild(node);
    timer = setTimeout(dismiss, opts.duration || 3400);
    while (snackbarHost.children.length > 2) {
      snackbarHost.firstElementChild.remove();
    }
    return { dismiss, setText };
  }

  /* ---------------- layers: scrim/sheet/dialog ---------------- */

  function raiseLayer(layer) {
    openLayers.push(layer);
    return layer;
  }

  function popLayer(layer) {
    const index = openLayers.indexOf(layer);
    if (index >= 0) openLayers.splice(index, 1);
  }

  function closeTopLayer() {
    const layer = openLayers[openLayers.length - 1];
    if (!layer) return false;
    layer.close();
    return true;
  }

  function sheet(options) {
    const opts = options || {};
    const scrim = el('div', { class: 'scrim', onclick: () => controller.close() });
    const grabber = el('div', { class: 'sheet__grabber' });
    const head = el('div', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__title', text: opts.title || '' }),
      opts.headAction || null,
      iconButton('close', { label: 'Close', onClick: () => controller.close() })
    ]);
    const body = el('div', { class: 'sheet__body' + (opts.flush ? '' : ' sheet__body--pad') });
    append(body, opts.content);
    const sheetEl = el('div', {
      class: 'sheet' + (opts.full ? ' sheet--full' : ''),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': opts.title || 'Sheet'
    }, [
      opts.hideGrabber ? null : grabber,
      opts.title ? head : null,
      body
    ]);

    let closed = false;
    const controller = {
      body,
      root: sheetEl,
      close() {
        if (closed) return;
        closed = true;
        sheetEl.classList.remove('is-open');
        scrim.classList.remove('is-open');
        popLayer(controller);
        setTimeout(() => {
          sheetEl.remove();
          scrim.remove();
        }, 360);
        if (opts.onClose) opts.onClose();
      },
      setTitle(text) {
        const title = head.querySelector('.sheet__title');
        if (title) title.textContent = text;
      }
    };

    overlayRoot.appendChild(scrim);
    overlayRoot.appendChild(sheetEl);
    raiseLayer(controller);
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      sheetEl.classList.add('is-open');
    });

    if (!opts.hideGrabber) {
      let startY = 0;
      let delta = 0;
      let dragging = false;
      grabber.addEventListener('pointerdown', (event) => {
        dragging = true;
        startY = event.clientY;
        sheetEl.style.transition = 'none';
        grabber.setPointerCapture(event.pointerId);
      });
      grabber.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        delta = Math.max(0, event.clientY - startY);
        sheetEl.style.transform = 'translateY(' + delta + 'px)';
      });
      const finish = () => {
        if (!dragging) return;
        dragging = false;
        sheetEl.style.transition = '';
        sheetEl.style.transform = '';
        if (delta > 90) controller.close();
        delta = 0;
      };
      grabber.addEventListener('pointerup', finish);
      grabber.addEventListener('pointercancel', finish);
    }

    return controller;
  }

  function menu(options) {
    const opts = options || {};
    const items = (opts.items || []).filter(Boolean);
    const list = el('div', { class: 'list', style: { margin: '0 0 8px' } });
    const controller = sheet({
      title: opts.title || 'Options',
      content: list,
      onClose: opts.onClose
    });
    items.forEach((item) => {
      list.appendChild(el('button', {
        class: 'menu__item' + (item.danger ? ' menu__item--danger' : ''),
        type: 'button',
        onclick: () => {
          controller.close();
          if (item.onClick) setTimeout(() => item.onClick(), 60);
        }
      }, [item.icon ? icon(item.icon) : null, el('span', { text: item.label })]));
    });
    return controller;
  }

  function dialog(options) {
    const opts = options || {};
    return new Promise((resolve) => {
      let settled = false;
      const scrim = el('div', { class: 'scrim', onclick: () => finish(opts.cancelValue === undefined ? null : opts.cancelValue) });
      const input = opts.field
        ? el('input', {
            type: opts.fieldType || 'text',
            value: opts.value || '',
            placeholder: opts.placeholder || '',
            inputmode: opts.inputMode || undefined,
            maxlength: '400'
          })
        : null;
      const content = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, [
        opts.icon ? el('div', { class: 'dialog__icon' }, icon(opts.icon)) : null,
        el('div', { class: 'dialog__title', text: opts.title || '' }),
        opts.text ? el('div', { class: 'dialog__text', text: opts.text }) : null,
        input ? el('div', { class: 'dialog__field' }, input) : null,
        el('div', { class: 'dialog__actions' }, [
          el('button', {
            class: 'btn btn--text',
            type: 'button',
            onclick: () => finish(opts.cancelValue === undefined ? null : opts.cancelValue)
          }, opts.cancelLabel || 'Cancel'),
          el('button', {
            class: 'btn ' + (opts.danger ? 'btn--danger' : 'btn--filled'),
            type: 'button',
            onclick: () => finish(opts.field ? (input.value || '') : true)
          }, opts.confirmLabel || 'OK')
        ])
      ]);

      const layer = {
        close() { finish(opts.cancelValue === undefined ? null : opts.cancelValue); }
      };

      function finish(value) {
        if (settled) return;
        settled = true;
        popLayer(layer);
        content.classList.remove('is-open');
        scrim.classList.remove('is-open');
        setTimeout(() => {
          content.remove();
          scrim.remove();
        }, 220);
        resolve(value);
      }

      overlayRoot.appendChild(scrim);
      overlayRoot.appendChild(content);
      raiseLayer(layer);
      requestAnimationFrame(() => {
        scrim.classList.add('is-open');
        content.classList.add('is-open');
        if (input) {
          setTimeout(() => input.focus(), 120);
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') finish(opts.field ? (input.value || '') : true);
          });
        }
      });
    });
  }

  function confirm(options) {
    const opts = options || {};
    return dialog({
      icon: opts.icon || 'warning',
      title: opts.title || 'Are you sure?',
      text: opts.text || '',
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
      danger: opts.danger
    }).then((value) => Boolean(value));
  }

  function prompt(options) {
    const opts = options || {};
    return dialog({
      icon: opts.icon || 'edit',
      title: opts.title || '',
      text: opts.text || '',
      field: true,
      value: opts.value || '',
      placeholder: opts.placeholder || '',
      inputMode: opts.inputMode,
      fieldType: opts.fieldType,
      confirmLabel: opts.confirmLabel || 'Save',
      cancelLabel: opts.cancelLabel || 'Cancel'
    });
  }

  /* ---------------- form controls ---------------- */

  function chip(label, options) {
    const opts = options || {};
    return el('button', {
      class: 'chip' + (opts.selected ? ' is-selected' : ''),
      type: 'button',
      onclick: opts.onClick
    }, [opts.icon ? icon(opts.icon, 16) : null, label]);
  }

  function segmented(items, selectedId, onChange) {
    const wrap = el('div', { class: 'segmented', role: 'tablist' });
    let selected = selectedId;
    items.forEach((item) => {
      const button = el('button', {
        class: 'segmented__item' + (item.id === selected ? ' is-selected' : ''),
        type: 'button',
        role: 'tab',
        'aria-selected': item.id === selected ? 'true' : 'false'
      }, [
        icon('check', 16),
        el('span', { text: item.label })
      ]);
      button.querySelector('.i').classList.add('segmented__check');
      button.addEventListener('click', () => {
        if (item.id === selected) return;
        selected = item.id;
        wrap.querySelectorAll('.segmented__item').forEach((node) => {
          const isSelected = node === button;
          node.classList.toggle('is-selected', isSelected);
          node.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
        if (onChange) onChange(item.id);
      });
      wrap.appendChild(button);
    });
    return wrap;
  }

  function switchControl(checked, onChange, label) {
    const node = el('button', {
      class: 'switch',
      type: 'button',
      role: 'switch',
      'aria-checked': checked ? 'true' : 'false',
      'aria-label': label || 'Toggle'
    });
    node.addEventListener('click', () => {
      const next = node.getAttribute('aria-checked') !== 'true';
      node.setAttribute('aria-checked', next ? 'true' : 'false');
      if (onChange) onChange(next);
    });
    return node;
  }

  function slider(options) {
    const opts = options || {};
    const input = el('input', {
      class: 'slider' + (opts.thin ? ' slider--thin' : ''),
      type: 'range',
      min: opts.min != null ? opts.min : 0,
      max: opts.max != null ? opts.max : 100,
      step: opts.step != null ? opts.step : 1,
      value: opts.value != null ? opts.value : 0,
      'aria-label': opts.label || ''
    });
    setSlider(input);
    if (opts.onInput) input.addEventListener('input', () => { setSlider(input); opts.onInput(Number(input.value)); });
    if (opts.onChange) input.addEventListener('change', () => opts.onChange(Number(input.value)));
    return input;
  }

  function setSlider(input, value) {
    if (value != null) input.value = value;
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const current = Number(input.value) || 0;
    const percent = max === min ? 0 : ((current - min) / (max - min)) * 100;
    input.style.setProperty('--slider-value', percent + '%');
  }

  function sliderRow(label, options) {
    const opts = options || {};
    const valueLabel = el('span', { class: 'control-block__value', text: opts.format ? opts.format(opts.value) : String(opts.value) });
    const input = slider({
      min: opts.min,
      max: opts.max,
      step: opts.step,
      value: opts.value,
      label: label,
      onInput: (value) => {
        if (valueLabel) valueLabel.textContent = opts.format ? opts.format(value) : String(value);
        if (opts.onInput) opts.onInput(value);
      },
      onChange: opts.onChange
    });
    return el('div', { class: 'control-block' }, [
      el('div', { class: 'control-block__head' }, [
        el('span', { class: 'control-block__label', text: label }),
        valueLabel
      ]),
      input
    ]);
  }

  function listItem(options) {
    const opts = options || {};
    return el('button', { class: 'list-item', type: 'button', onclick: opts.onClick }, [
      opts.art || (opts.icon ? el('span', { class: 'list-item__icon' }, icon(opts.icon)) : null),
      el('div', { class: 'list-item__body' }, [
        el('div', { class: 'list-item__title', text: opts.title }),
        opts.sub ? el('div', { class: 'list-item__sub', text: opts.sub }) : null
      ]),
      opts.trailing || null
    ]);
  }

  function fieldRow(placeholder, value, options) {
    const opts = options || {};
    const input = el('input', {
      type: opts.type || 'text',
      placeholder: placeholder || '',
      value: value || '',
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      inputmode: opts.inputMode || undefined
    });
    const row = el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, input),
      el('button', { class: 'btn btn--filled', type: 'button', onclick: () => opts.onSubmit && opts.onSubmit(input.value.trim()) }, opts.actionLabel || 'Go')
    ]);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && opts.onSubmit) opts.onSubmit(input.value.trim());
    });
    return { row, input };
  }

  /* ---------------- interactions ---------------- */

  function haptic(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms || 8);
    } catch (e) {}
  }

  const rippleSelector = '.btn, .icon-btn, .chip, .list-item, .track-row, .nav-item, .fab, .menu__item, .segmented__item, .quick-card, .album-card, .media-card, .circle-card';

  function installRipple() {
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.addEventListener('pointerdown', (event) => {
      const target = event.target.closest(rippleSelector);
      if (!target || target.disabled) return;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.15;
      const ripple = el('span', {
        class: 'ripple',
        style: {
          width: size + 'px',
          height: size + 'px',
          left: (event.clientX - rect.left - size / 2) + 'px',
          top: (event.clientY - rect.top - size / 2) + 'px'
        }
      });
      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 560);
    }, { passive: true });
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  installRipple();

  global.RiffUI = {
    el,
    frag,
    append,
    icon,
    iconButton,
    art,
    trackRow,
    sectionHeader,
    emptyState,
    skeletonRows,
    loader,
    eqBars,
    snackbar,
    sheet,
    menu,
    dialog,
    confirm,
    prompt,
    chip,
    segmented,
    switchControl,
    slider,
    sliderRow,
    setSlider,
    listItem,
    fieldRow,
    haptic,
    applyTheme,
    applyScheme,
    dynamicThemeFor,
    resolveMode,
    themeSeed,
    themeMode,
    closeTopLayer,
    escapeHtml,
    isPlayable
  };
})(window);
