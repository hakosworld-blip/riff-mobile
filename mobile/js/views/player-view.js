/* Riff Mobile — full player and its sheets (queue, lyrics, audio, sleep timer) */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const Player = global.RiffPlayer;
  const V = global.RiffViews;

  let root = null;
  let els = {};
  let open = false;
  let rafId = 0;
  const lyricsCache = new Map();

  const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'hi', label: 'Hindi' }
  ];

  function build() {
    if (root) return;

    const backdrop = UI.el('div', { class: 'player__backdrop' });
    const contextLabel = UI.el('div', { class: 'player__context', text: 'Riff' });
    const artHost = UI.el('div', { class: 'player__art' });
    const artSkeleton = UI.el('div', {
      class: 'spinner',
      style: { position: 'absolute', display: 'none' }
    });
    const title = UI.el('div', { class: 'player__title', text: 'Nothing playing' });
    const artist = UI.el('div', { class: 'player__artist', text: '' });
    const favoriteHost = UI.el('div');
    const timeCurrent = UI.el('span', { text: '0:00' });
    const timeTotal = UI.el('span', { text: '0:00' });
    const seek = UI.slider({ min: 0, max: 1000, value: 0, label: 'Seek', thin: true });
    const playButton = UI.el('button', { class: 'player__play', type: 'button', 'aria-label': 'Play or pause' }, UI.icon('play'));
    const shuffleButton = UI.iconButton('shuffle', { label: 'Shuffle', onClick: () => Player.setShuffle(!Player.snapshot().shuffle) });
    const repeatButton = UI.iconButton('repeat', { label: 'Repeat', onClick: () => Player.cycleRepeat() });
    const prevButton = UI.iconButton('skip_previous', { label: 'Previous', onClick: () => Player.previous() });
    const nextButton = UI.iconButton('skip_next', { label: 'Next', onClick: () => Player.next() });
    const canvas = UI.el('canvas', { class: 'visualizer', width: '640', height: '68' });

    const lyricsTool = toolButton('lyrics', 'Lyrics', openLyrics);
    const queueTool = toolButton('queue', 'Queue', openQueue);
    const audioTool = toolButton('tune', 'Sound', openAudio);
    const moreTool = toolButton('download', 'Download', () => {
      const track = Player.state.current;
      if (track) V.downloadSheet(track);
    });

    const topBar = UI.el('div', { class: 'player__top' }, [
      UI.iconButton('chevron_down', { label: 'Close player', onClick: close }),
      contextLabel,
      UI.iconButton('more_vert', { label: 'More', onClick: openMore })
    ]);

    const artWrap = UI.el('div', { class: 'player__art-wrap' }, [
      UI.el('div', { style: { position: 'relative' } }, [artHost, artSkeleton])
    ]);

    const shell = UI.el('div', { class: 'player', id: 'riff-player' }, [
      backdrop,
      UI.el('div', { class: 'player__content' }, [
        topBar,
        artWrap,
        UI.el('div', { class: 'player__meta' }, [
          UI.el('div', { class: 'player__meta-text' }, [title, artist]),
          favoriteHost
        ]),
        canvas,
        UI.el('div', { class: 'player__seek' }, [
          seek,
          UI.el('div', { class: 'player__times' }, [timeCurrent, timeTotal])
        ]),
        UI.el('div', { class: 'player__controls' }, [shuffleButton, prevButton, playButton, nextButton, repeatButton]),
        UI.el('div', { class: 'player__tools' }, [lyricsTool, queueTool, audioTool, moreTool])
      ])
    ]);

    playButton.addEventListener('click', () => {
      Player.toggle();
      UI.haptic(8);
    });

    seek.addEventListener('input', () => {
      const duration = Player.state.duration || 0;
      timeCurrent.textContent = C.formatTime((Number(seek.value) / 1000) * duration);
    });

    seek.addEventListener('change', () => {
      const duration = Player.state.duration || 0;
      Player.seek((Number(seek.value) / 1000) * duration);
    });

    // swipe down on the artwork to dismiss
    let dragStart = 0;
    let dragging = false;
    artWrap.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      dragging = true;
      dragStart = event.clientY;
      shell.style.transition = 'none';
    });
    artWrap.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const delta = Math.max(0, event.clientY - dragStart);
      if (delta > 0) shell.style.transform = 'translateY(' + delta + 'px)';
    });
    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      shell.style.transition = '';
      shell.style.transform = '';
      const delta = event && event.clientY ? Math.max(0, event.clientY - dragStart) : 0;
      if (delta > 130) close();
    };
    artWrap.addEventListener('pointerup', endDrag);
    artWrap.addEventListener('pointercancel', endDrag);

    document.getElementById('overlay-root').appendChild(shell);
    root = shell;
    els = {
      backdrop,
      artHost,
      artSkeleton,
      title,
      artist,
      favoriteHost,
      timeCurrent,
      timeTotal,
      seek,
      playButton,
      shuffleButton,
      repeatButton,
      contextLabel,
      lyricsTool,
      queueTool,
      canvas,
      shell
    };

    Player.on('track', () => {
      renderTrack();
      if (open) startVisualizer();
    });
    Player.on('state', renderState);
    Player.on('time', renderTime);
    Player.on('sleep', () => UI.snackbar('Sleep timer finished — playback paused'));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) close();
    });
  }

  function toolButton(iconName, label, onClick) {
    const button = UI.el('button', { class: 'player__tool', type: 'button', onclick: onClick }, [
      UI.icon(iconName),
      UI.el('span', { text: label })
    ]);
    return button;
  }

  function formatCount() {
    return '';
  }

  function renderTrack() {
    if (!els.shell) return;
    const track = Player.state.current;
    if (!track) {
      els.title.textContent = 'Nothing playing';
      els.artist.textContent = 'Pick something to listen to';
      els.artHost.innerHTML = '';
      els.favoriteHost.innerHTML = '';
      els.contextLabel.textContent = 'Riff';
      return;
    }
    els.title.textContent = track.title;
    els.artist.textContent = track.artist;
    els.contextLabel.textContent = Player.state.context || track.album || 'Riff';
    els.artHost.innerHTML = '';
    els.artHost.appendChild(UI.art(track, 'art--xl'));
    els.favoriteHost.innerHTML = '';
    els.favoriteHost.appendChild(V.favoriteButton(track));
    const artwork = track.thumbnail || track.localThumbnail;
    els.backdrop.style.backgroundImage = artwork ? 'url("' + artwork.replace(/"/g, '%22') + '")' : 'none';
    els.artSkeleton.style.display = 'none';
    renderTime(Player.timeSnapshot());
  }

  function renderState() {
    if (!els.shell) return;
    const snap = Player.snapshot();
    els.playButton.innerHTML = '';
    els.playButton.appendChild(UI.icon(snap.playing ? 'pause' : 'play'));
    els.playButton.setAttribute('aria-label', snap.playing ? 'Pause' : 'Play');
    els.artSkeleton.style.display = snap.loading ? 'block' : 'none';
    els.shuffleButton.classList.toggle('is-active', Boolean(snap.shuffle));
    const repeatMode = snap.repeat || 'off';
    els.repeatButton.innerHTML = '';
    els.repeatButton.appendChild(UI.icon(repeatMode === 'one' ? 'repeat_one' : 'repeat'));
    els.repeatButton.classList.toggle('is-active', repeatMode !== 'off');
    if (snap.duration > 0) els.timeTotal.textContent = C.formatTime(snap.duration);
    if (snap.error && snap.error !== 'Playback failed') {
      els.artSkeleton.style.display = 'none';
    }
    if (open) startVisualizer();
  }

  function renderTime(time) {
    if (!els.seek) return;
    const duration = time.duration || Player.state.duration || 0;
    const current = time.currentTime || 0;
    els.timeCurrent.textContent = C.formatTime(current);
    els.timeTotal.textContent = C.formatTime(duration);
    const value = duration > 0 ? Math.round((current / duration) * 1000) : 0;
    if (document.activeElement !== els.seek) {
      els.seek.value = String(value);
      UI.setSlider(els.seek);
    }
  }

  function startVisualizer() {
    if (rafId) return;
    const canvas = els.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const buffer = new Uint8Array(48);
    let tick = 0;

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      if (!open) {
        cancelAnimationFrame(rafId);
        rafId = 0;
        return;
      }
      tick++;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      const data = Player.state.playing ? Player.analyserData(buffer) : null;
      const bars = 40;
      const gap = 5;
      const barWidth = (width - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        let magnitude;
        if (data && data.length) {
          const index = Math.floor((i / bars) * (data.length * 0.62));
          magnitude = data[index] / 255;
        } else {
          magnitude = 0.12 + 0.2 * Math.abs(Math.sin(tick / 26 + i / 3));
        }
        const barHeight = Math.max(4, magnitude * height);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.42)';
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;
        const radius = Math.min(barWidth / 2, 4);
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, radius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      }
    };
    rafId = requestAnimationFrame(draw);
  }

  function openPlayer() {
    build();
    open = true;
    renderTrack();
    renderState();
    renderTime(Player.timeSnapshot());
    requestAnimationFrame(() => {
      root.classList.add('is-open');
    });
    startVisualizer();
    UI.haptic(6);
  }

  function close() {
    if (!root) return;
    open = false;
    root.classList.remove('is-open');
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  /* ---------------- more menu ---------------- */

  function openMore() {
    const track = Player.state.current;
    const items = [];
    if (track) {
      items.push({
        icon: 'library_add',
        label: 'Add to playlist',
        onClick: () => V.addToPlaylistSheet(track)
      });
      items.push({
        icon: 'download',
        label: 'Download',
        onClick: () => V.downloadSheet(track)
      });
      items.push({
        icon: 'timer',
        label: Player.state.sleepAt ? 'Sleep timer running' : 'Sleep timer',
        onClick: () => openSleepTimer()
      });
      if (track.artist) {
        items.push({
          icon: 'person',
          label: 'Go to artist',
          onClick: () => {
            close();
            V.openArtist(track.artist);
          }
        });
      }
    }
    items.push({
      icon: 'queue',
      label: 'Clear queue',
      danger: true,
      onClick: async () => {
        const ok = await UI.confirm({
          title: 'Clear the queue?',
          text: 'Playback keeps the current track.',
          confirmLabel: 'Clear',
          danger: true
        });
        if (ok) Player.clearQueue();
      }
    });
    UI.menu({ title: track ? track.title : 'Player', items: items });
  }

  function openSleepTimer() {
    const options = [15, 30, 45, 60, 90];
    const items = options.map((minutes) => ({
      icon: 'timer',
      label: minutes + ' minutes',
      onClick: () => {
        Player.startSleepTimer(minutes);
        UI.snackbar('Sleep timer set for ' + minutes + ' minutes');
      }
    }));
    if (Player.state.sleepAt) {
      items.unshift({
        icon: 'stop',
        label: 'Turn off sleep timer',
        onClick: () => {
          Player.cancelSleepTimer();
          UI.snackbar('Sleep timer cancelled');
        }
      });
    }
    UI.menu({ title: 'Sleep timer', items: items });
  }

  /* ---------------- queue sheet ---------------- */

  function openQueue() {
    const container = UI.el('div');
    const headAction = UI.el('button', {
      class: 'btn btn--text btn--small',
      type: 'button',
      onclick: async () => {
        const ok = await UI.confirm({ title: 'Clear queue?', confirmLabel: 'Clear', danger: true });
        if (ok) Player.clearQueue();
      }
    }, 'Clear');

    const sheet = UI.sheet({
      title: 'Queue',
      content: container,
      headAction: headAction
    });

    function paint() {
      container.innerHTML = '';
      const queue = Player.state.queue;
      const index = Player.state.index;
      if (queue.length === 0) {
        container.appendChild(UI.emptyState({
          icon: 'queue',
          title: 'The queue is empty',
          text: 'Play an album or add tracks from any list.'
        }));
        return;
      }
      container.appendChild(UI.el('div', {
        class: 'list-item__sub',
        style: { padding: '0 0 8px' },
        text: (Player.state.context || 'Playing') + ' · ' + queue.length + ' tracks'
      }));

      queue.forEach((track, i) => {
        const row = UI.el('button', {
          class: 'queue-row' + (i === index ? ' is-current' : ''),
          type: 'button',
          onclick: () => Player.jumpTo(i)
        }, [
          UI.el('span', { class: 'queue-row__index', text: i === index ? '▶' : String(i + 1) }),
          UI.art(track, 'art--xs'),
          UI.el('span', { class: 'track-row__body' }, [
            UI.el('span', { class: 'queue-row__title track-row__title', text: track.title }),
            UI.el('span', { class: 'track-row__meta' }, [UI.el('span', { text: track.artist })])
          ]),
          UI.iconButton('drag', {
            label: 'Queue options',
            onClick: (event) => {
              event.stopPropagation();
              UI.menu({
                title: track.title,
                items: [
                  {
                    icon: 'play',
                    label: 'Play now',
                    onClick: () => Player.jumpTo(i)
                  },
                  i > 0 ? {
                    icon: 'expand_less',
                    label: 'Move up',
                    onClick: () => { Player.moveInQueue(i, i - 1); paint(); }
                  } : null,
                  i < queue.length - 1 ? {
                    icon: 'expand_more',
                    label: 'Move down',
                    onClick: () => { Player.moveInQueue(i, i + 1); paint(); }
                  } : null,
                  {
                    icon: 'delete',
                    label: 'Remove from queue',
                    danger: true,
                    onClick: () => {
                      Player.removeAt(i);
                      paint();
                    }
                  }
                ]
              });
            }
          })
        ]);
        container.appendChild(row);
      });
    }

    paint();
    const off = Player.on('queue', paint);
    const prevClose = sheet.close.bind(sheet);
    sheet.close = () => {
      off();
      prevClose();
    };
  }

  /* ---------------- lyrics sheet ---------------- */

  async function openLyrics() {
    const track = Player.state.current;
    if (!track) {
      UI.snackbar('Play a track to see lyrics');
      return;
    }

    const synced = UI.el('div', { class: 'lyrics' });
    const plain = UI.el('div', { class: 'lyrics-plain' });
    const offsetRow = UI.el('div', { class: 'sync-offset' });
    const statusHost = UI.el('div');
    const container = UI.el('div', {}, [statusHost, offsetRow, synced, plain]);

    let offsetSeconds = 0;
    let parsed = { synced: false, lines: [] };
    let lines = [];
    let activeIndex = -1;
    let translations = null;
    let language = null;
    let timeOff = null;

    const translateButton = UI.el('button', {
      class: 'btn btn--text btn--small',
      type: 'button',
      onclick: () => {
        UI.menu({
          title: 'Translate lyrics',
          items: (language ? [{ icon: 'close', label: 'Turn translation off', onClick: () => setLanguage(null) }] : []).concat(
            LANGUAGES.map((item) => ({
              icon: 'translate',
              label: item.label,
              onClick: () => setLanguage(item.code)
            }))
          )
        });
      }
    }, 'Translate');

    const sheet = UI.sheet({
      title: 'Lyrics',
      content: container,
      headAction: translateButton
    });

    statusHost.appendChild(UI.loader('18px 0 8px'));

    const cacheKey = (track.title || '') + '::' + (track.artist || '');
    let data = lyricsCache.get(cacheKey);
    if (!data) {
      try {
        const result = await API.lyrics(track.title, track.artist);
        data = result && result.lyrics ? result.lyrics : '';
        lyricsCache.set(cacheKey, data);
      } catch (e) {
        data = null;
      }
    }

    statusHost.innerHTML = '';

    if (data === null) {
      container.appendChild(UI.emptyState({
        icon: 'warning',
        title: 'Lyrics unavailable',
        text: 'Riff could not reach the lyrics service. Check your connection.',
        actionLabel: 'Retry',
        actionIcon: 'refresh',
        onAction: () => {
          sheet.close();
          openLyrics();
        }
      }));
      return;
    }

    if (!data || !String(data).trim()) {
      container.appendChild(UI.emptyState({
        icon: 'lyrics',
        title: 'No lyrics for this track',
        text: 'Sometimes a track has no published lyrics yet.'
      }));
      return;
    }

    parsed = C.parseLrc(data);

    function renderOffset() {
      offsetRow.innerHTML = '';
      if (!parsed.synced) return;
      offsetRow.appendChild(UI.el('button', {
        class: 'btn btn--tonal btn--small',
        type: 'button',
        onclick: () => { offsetSeconds -= 0.5; applyOffset(); }
      }, '−0.5s'));
      offsetRow.appendChild(UI.el('span', {
        text: (offsetSeconds > 0 ? '+' : '') + offsetSeconds.toFixed(1) + 's offset'
      }));
      offsetRow.appendChild(UI.el('button', {
        class: 'btn btn--tonal btn--small',
        type: 'button',
        onclick: () => { offsetSeconds += 0.5; applyOffset(); }
      }, '+0.5s'));
    }

    function applyOffset() {
      renderOffset();
      updateActive(true);
    }

    function renderLines() {
      synced.innerHTML = '';
      plain.innerHTML = '';
      lines = parsed.lines;
      if (!parsed.synced) {
        plain.textContent = data;
        return;
      }
      lines.forEach((line, index) => {
        const button = UI.el('button', {
          class: 'lyric-line',
          type: 'button',
          onclick: () => Player.seek(Math.max(0, line.time - offsetSeconds))
        }, [
          UI.el('span', { text: line.text || '♪' }),
          translations && translations[index] && translations[index] !== line.text
            ? UI.el('span', { class: 'lyric-line__translation', text: translations[index] })
            : null
        ]);
        button.dataset.index = String(index);
        synced.appendChild(button);
      });
      activeIndex = -1;
      updateActive(true);
    }

    function updateActive(force) {
      if (!parsed.synced) return;
      const time = (Player.state.currentTime || 0) - offsetSeconds;
      const next = C.activeLyricIndex(lines, time);
      if (next === activeIndex && !force) return;
      activeIndex = next;
      Array.from(synced.children).forEach((node, index) => {
        node.classList.toggle('is-active', index === activeIndex);
      });
      const active = synced.children[activeIndex];
      if (active && active.scrollIntoView) {
        try {
          active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (e) {}
      }
    }

    async function setLanguage(code) {
      if (!code) {
        language = null;
        translations = null;
        translateButton.textContent = 'Translate';
        renderLines();
        return;
      }
      const target = LANGUAGES.find((item) => item.code === code);
      if (!target) return;
      language = code;
      translateButton.textContent = target.label;
      statusHost.innerHTML = '';
      statusHost.appendChild(UI.loader('10px 0'));
      try {
        const result = await API.translate(lines.map((line) => line.text || ''), code);
        const resultLines = (result && (result.translations || result.lines || result.texts)) || [];
        translations = Array.isArray(resultLines) ? resultLines : null;
        if (!translations) throw new Error('Translation unavailable');
        UI.snackbar('Translated to ' + target.label);
      } catch (e) {
        language = null;
        translations = null;
        translateButton.textContent = 'Translate';
        UI.snackbar(e.message || 'Translation failed');
      }
      statusHost.innerHTML = '';
      renderLines();
    }

    renderOffset();
    renderLines();

    timeOff = Player.on('time', () => updateActive(false));
    const prevClose = sheet.close.bind(sheet);
    sheet.close = () => {
      if (timeOff) timeOff();
      prevClose();
    };
  }

  /* ---------------- audio sheet ---------------- */

  function openAudio() {
    const s = Store.state.settings;
    const container = UI.el('div');

    const presetRow = UI.el('div', { class: 'chip-row', style: { padding: '2px 0 6px' } });
    const bandsHost = UI.el('div', { class: 'eq-grid' });
    const bandInputs = [];

    function paintPresets() {
      presetRow.innerHTML = '';
      C.EQ_PRESETS.forEach((preset) => {
        presetRow.appendChild(UI.chip(preset.name, {
          selected: s.eqPreset === preset.id,
          onClick: () => {
            s.eqPreset = preset.id;
            s.eqBands = preset.bands.slice();
            Store.setSetting('eqBands', s.eqBands);
            Store.setSetting('eqPreset', preset.id);
            bandInputs.forEach((input, i) => {
              input.value = String(s.eqBands[i]);
              paintBandFill(input);
            });
            paintPresets();
            Player.refreshAudio();
          }
        }));
      });
    }

    function paintBandFill(input) {
      const value = Number(input.value);
      const percent = ((value + 12) / 24) * 100;
      input.style.setProperty('--fill', percent + '%');
    }

    C.EQ_FREQUENCIES.forEach((band, index) => {
      const input = UI.el('input', {
        class: 'eq-band__slider',
        type: 'range',
        min: -12,
        max: 12,
        step: 0.5,
        value: s.eqBands[index] || 0,
        'aria-label': band.label + ' hertz'
      });
      paintBandFill(input);
      input.addEventListener('input', () => {
        s.eqBands[index] = Number(input.value);
        paintBandFill(input);
        Player.refreshAudio();
      });
      input.addEventListener('change', () => {
        Store.setSetting('eqBands', s.eqBands.slice());
        s.eqPreset = 'custom';
        Store.setSetting('eqPreset', 'custom');
        paintPresets();
      });
      bandInputs.push(input);
      bandsHost.appendChild(UI.el('div', { class: 'eq-band' }, [
        input,
        UI.el('span', { class: 'eq-band__value', text: Number(input.value).toFixed(0) }),
        UI.el('span', { text: band.label })
      ]));
      input.addEventListener('input', () => {
        const valueNode = input.parentElement.querySelector('.eq-band__value');
        if (valueNode) valueNode.textContent = Number(input.value).toFixed(0);
      });
    });

    container.appendChild(UI.el('div', { class: 'settings-group__label', style: { paddingLeft: '0' }, text: 'Equalizer' }));
    container.appendChild(presetRow);
    container.appendChild(bandsHost);

    const resetRow = UI.el('div', { class: 'row', style: { justifyContent: 'flex-end', paddingTop: '6px' } }, [
      UI.el('button', {
        class: 'btn btn--text btn--small',
        type: 'button',
        onclick: () => {
          s.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          Store.setSetting('eqBands', s.eqBands.slice());
          s.eqPreset = 'flat';
          Store.setSetting('eqPreset', 'flat');
          bandInputs.forEach((input) => {
            input.value = '0';
            paintBandFill(input);
            input.parentElement.querySelector('.eq-band__value').textContent = '0';
          });
          paintPresets();
          Player.refreshAudio();
        }
      }, 'Reset EQ')
    ]);
    container.appendChild(resetRow);

    container.appendChild(UI.el('div', { class: 'divider' }));
    container.appendChild(UI.sliderRow('Speed', {
      min: 0.5,
      max: 2,
      step: 0.05,
      value: s.speed || 1,
      format: (value) => value.toFixed(2) + '×',
      onInput: (value) => {
        s.speed = value;
        Player.refreshAudio();
      },
      onChange: () => Store.setSetting('speed', s.speed)
    }));
    container.appendChild(UI.sliderRow('Pitch', {
      min: -12,
      max: 12,
      step: 1,
      value: s.pitch || 0,
      format: (value) => (value > 0 ? '+' : '') + value + ' st',
      onInput: (value) => {
        s.pitch = value;
        Player.refreshAudio();
      },
      onChange: () => Store.setSetting('pitch', s.pitch)
    }));
    container.appendChild(UI.sliderRow('Reverb', {
      min: 0,
      max: 100,
      step: 1,
      value: s.reverb || 0,
      format: (value) => value + '%',
      onInput: (value) => {
        s.reverb = value;
        Player.refreshAudio();
      },
      onChange: () => Store.setSetting('reverb', s.reverb)
    }));
    container.appendChild(UI.sliderRow('Distortion', {
      min: 0,
      max: 100,
      step: 1,
      value: s.distortion || 0,
      format: (value) => value + '%',
      onInput: (value) => {
        s.distortion = value;
        Player.refreshAudio();
      },
      onChange: () => Store.setSetting('distortion', s.distortion)
    }));

    container.appendChild(UI.el('div', { class: 'divider' }));

    container.appendChild(UI.el('div', { class: 'list-item' }, [
      UI.el('span', { class: 'list-item__icon' }, UI.icon('volume')),
      UI.el('div', { class: 'list-item__body' }, [
        UI.el('div', { class: 'list-item__title', text: 'Volume' }),
        UI.el('div', { class: 'list-item__sub', text: 'In-app output level' })
      ]),
      UI.el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Mute',
        onclick: () => Player.toggleMute()
      }, UI.icon(Store.state.playback.muted ? 'volume_off' : 'volume'))
    ]));

    const volume = UI.slider({
      min: 0,
      max: 100,
      value: Math.round((Store.state.playback.volume || 0) * 100),
      label: 'Volume',
      onInput: (value) => Player.setVolume(value / 100)
    });
    container.appendChild(UI.el('div', { style: { padding: '0 4px' } }, volume));

    const switches = UI.el('div', { class: 'list' });
    [
      {
        icon: 'equalizer',
        title: 'Volume normalisation',
        sub: 'Even out loud and quiet tracks',
        key: 'normalize'
      },
      {
        icon: 'headset',
        title: 'High quality engine',
        sub: 'Riff HQ compressor and air shelf',
        key: 'hq'
      }
    ].forEach((item) => {
      switches.appendChild(UI.el('div', { class: 'list-item' }, [
        UI.el('span', { class: 'list-item__icon' }, UI.icon(item.icon)),
        UI.el('div', { class: 'list-item__body' }, [
          UI.el('div', { class: 'list-item__title', text: item.title }),
          UI.el('div', { class: 'list-item__sub', text: item.sub })
        ]),
        UI.switchControl(Boolean(s[item.key]), (value) => {
          Store.setSetting(item.key, value);
          Player.refreshAudio();
        }, item.title)
      ]));
    });
    container.appendChild(switches);

    UI.sheet({ title: 'Sound', content: container });

    // keep preset highlights in sync with stored state
    paintPresets();
  }

  global.RiffPlayerView = {
    open: openPlayer,
    close: close,
    isOpen: () => open,
    openLyrics: openLyrics,
    openQueue: openQueue,
    openAudio: openAudio
  };
})(window);
