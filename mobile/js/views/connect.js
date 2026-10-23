/* Riff Mobile — connect this phone to Riff running on your computer.

   The native app is not served by Riff, so it has no same-origin API and no
   injected token. Pairing is explicit: the desktop shows an address and a
   one-time-visible pairing code at http://127.0.0.1:38472/pair, and this screen
   stores both locally. */

(function (global) {
  'use strict';

  const C = global.RiffCore;
  const API = global.RiffAPI;
  const Store = global.RiffStore;
  const UI = global.RiffUI;
  const V = global.RiffViews;

  function textField(label, value, options) {
    const opts = options || {};
    const input = UI.el('input', {
      type: opts.type || 'text',
      value: value || '',
      placeholder: opts.placeholder || '',
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      inputmode: opts.inputMode || undefined
    });
    const field = UI.el('label', { class: 'field field--stacked' }, [
      UI.el('span', { class: 'field__label', text: label }),
      input
    ]);
    return { field, input };
  }

  function render(params) {
    const opts = params || {};
    const settings = Store.state.settings;
    const root = V.screen();
    const native = API.isNative;

    const header = V.header({
      title: 'Connect to Riff',
      back: opts.back === true,
      actions: []
    });
    root.appendChild(header);

    const hero = UI.el('div', { class: 'connect-hero' }, [
      UI.el('span', { class: 'connect-hero__badge' }, UI.icon('wifi', 30)),
      UI.el('h2', { class: 'connect-hero__title', text: 'Pair with your computer' }),
      UI.el('p', {
        class: 'connect-hero__text',
        text: native
          ? 'Riff runs on your computer. Open the pairing page there, then enter its address and code below.'
          : 'Riff runs on this computer. This copy of the app normally connects automatically — use this screen to point it somewhere else.'
      })
    ]);
    root.appendChild(hero);

    const steps = UI.el('div', { class: 'card connect-steps' }, [
      UI.el('div', { class: 'connect-step' }, [
        UI.el('span', { class: 'connect-step__num', text: '1' }),
        UI.el('div', {}, [
          UI.el('div', { class: 'list-item__title', text: 'Turn on LAN sharing' }),
          UI.el('div', { class: 'list-item__sub', text: 'Start Riff with LAN sharing (Settings → Pair a phone, or `npm start -- --lan`).' })
        ])
      ]),
      UI.el('div', { class: 'connect-step' }, [
        UI.el('span', { class: 'connect-step__num', text: '2' }),
        UI.el('div', {}, [
          UI.el('div', { class: 'list-item__title', text: 'Open the pairing page' }),
          UI.el('div', { class: 'list-item__sub', text: 'On your computer visit http://127.0.0.1:38472/pair — it lists this computer\'s address and its pairing code.' })
        ])
      ]),
      UI.el('div', { class: 'connect-step' }, [
        UI.el('span', { class: 'connect-step__num', text: '3' }),
        UI.el('div', {}, [
          UI.el('div', { class: 'list-item__title', text: 'Enter them here' }),
          UI.el('div', { class: 'list-item__sub', text: 'Both devices must be on the same Wi-Fi network.' })
        ])
      ])
    ]);
    root.appendChild(steps);

    const address = textField('Server address', settings.serverUrl || '', {
      type: 'url',
      inputMode: 'url',
      placeholder: 'http://192.168.1.20:38472'
    });
    const code = textField('Pairing code', settings.token || '', {
      placeholder: '48-character code from the pairing page'
    });

    const fields = UI.el('div', { class: 'connect-fields' }, [address.field, code.field]);
    root.appendChild(fields);

    const status = UI.el('p', { class: 'connect-status', role: 'status', 'aria-live': 'polite' });
    root.appendChild(status);

    const connectButton = UI.el('button', {
      class: 'btn btn--filled btn--wide',
      type: 'button',
      onclick: submit
    }, [UI.icon('link'), 'Connect']);

    const demoButton = UI.el('button', {
      class: 'btn btn--text btn--wide',
      type: 'button',
      style: { marginTop: '8px' },
      onclick: () => {
        Store.setSetting('demoMode', true);
        API.useDemo(true);
        UI.snackbar('Demo mode — browsing the sample catalogue');
        global.RiffNav.goTab('home');
      }
    }, 'Continue in demo mode');

    const actions = UI.el('div', { class: 'connect-actions' }, [connectButton, demoButton]);
    root.appendChild(actions);

    if (settings.serverUrl || settings.token) {
      actions.appendChild(UI.el('button', {
        class: 'btn btn--text btn--wide',
        type: 'button',
        style: { marginTop: '4px' },
        onclick: async () => {
          const ok = await UI.confirm({
            title: 'Forget this server?',
            text: 'Riff will keep your playlists, favorites and downloads, but will not connect until you pair again.',
            confirmLabel: 'Forget',
            danger: true
          });
          if (!ok) return;
          Store.setSetting('serverUrl', '');
          Store.setSetting('token', '');
          API.resetConnection();
          address.input.value = '';
          code.input.value = '';
          status.textContent = 'Server forgotten.';
          UI.snackbar('Server forgotten');
        }
      }, 'Forget this server'));
    }

    const footnote = UI.el('p', {
      class: 'connect-footnote',
      text: 'Your library, favorites and playlists never leave this device. The pairing code only allows access on your local network.'
    });
    root.appendChild(footnote);

    async function submit() {
      if (connectButton.disabled) return;
      const server = C.normalizeServerUrl(address.input.value);
      if (!server) {
        status.textContent = 'Enter an address like http://192.168.1.20:38472';
        address.input.focus();
        return;
      }
      address.input.value = server;
      const token = code.input.value.trim();
      if (!token) {
        status.textContent = 'Paste the pairing code from the pairing page.';
        code.input.focus();
        return;
      }

      connectButton.disabled = true;
      connectButton.textContent = 'Connecting…';
      status.textContent = 'Looking for Riff at ' + server + '…';
      try {
        const result = await API.connect({ serverUrl: server, token: token });
        Store.setSetting('serverUrl', result.baseUrl);
        Store.setSetting('token', token);
        Store.setSetting('demoMode', false);
        status.textContent = 'Connected';
        UI.haptic(12);
        UI.snackbar('Connected to Riff');
        global.RiffNav.goTab('home');
      } catch (e) {
        status.textContent = e && e.message ? e.message : 'Could not connect';
        UI.haptic(20);
      } finally {
        connectButton.disabled = false;
        connectButton.innerHTML = '';
        connectButton.appendChild(UI.icon('link'));
        connectButton.appendChild(document.createTextNode('Connect'));
      }
    }

    address.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') code.input.focus();
    });
    code.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    code.input.addEventListener('input', () => {
      const trimmed = code.input.value.replace(/\s+/g, '');
      if (trimmed !== code.input.value) code.input.value = trimmed;
    });

    return root;
  }

  V.connect = { render };
})(window);
