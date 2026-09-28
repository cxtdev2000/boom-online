/* Online lobby: connects to the Node server, lists rooms and routes server messages. */
(function () {
  const { $, el } = BOOM.UI;
  const UI = BOOM.UI;
  const t = (...a) => BOOM.t(...a);
  const PAGE_SIZE = 5;

  let rooms = [];
  let page = 0;
  let me = null; // { you, name } once the server greeted us
  let connecting = false;

  function setStatus(text, error = false) {
    const s = $('lobby-status');
    s.textContent = text;
    s.classList.toggle('error', error);
  }

  function renderRooms() {
    const pages = Math.max(1, Math.ceil(rooms.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const list = $('room-list');
    if (!rooms.length) {
      list.replaceChildren(el('li', { class: 'room-empty' }, t('lobby.empty')));
    } else {
      list.replaceChildren(
        ...rooms.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r) => {
          const playing = r.status === 'playing';
          const full = r.count >= BOOM.CONFIG.MAX_PLAYERS;
          return el(
            'li',
            { class: 'room-row' },
            el('img', { class: 'room-thumb', src: BOOM.Assets.url(`map/${r.map}_avatar.jpg`), alt: '' }),
            el(
              'div',
              { class: 'room-meta' },
              el('strong', {}, `${r.name} (${r.id})`),
              el(
                'span',
                {},
                `${t('lobby.room.host', r.host)} · ${r.map.replace('_', ' ')} · `,
                el('span', { class: playing ? 'status playing' : 'status' }, t(playing ? 'lobby.room.status.playing' : 'lobby.room.status.waiting')),
                ` · ${r.count}/${BOOM.CONFIG.MAX_PLAYERS}`
              )
            ),
            el('button', { class: 'btn btn-primary', disabled: playing || full, onclick: () => BOOM.Net.send({ t: 'join', id: r.id }) }, t('lobby.btn.join'))
          );
        })
      );
    }
    $('lobby-page').textContent = t('lobby.pagination', page + 1, pages);
  }

  function showMain(on) {
    $('lobby-main').hidden = !on;
  }

  function onMessage(msg) {
    switch (msg.t) {
      case 'welcome':
        me = { you: msg.you, name: msg.name };
        setStatus(`${t('online.connected')} · ${msg.name}`);
        showMain(true);
        break;
      case 'rooms':
        rooms = msg.rooms;
        renderRooms();
        break;
      case 'joined':
        BOOM.Room.openOnline(msg.room, msg.you, me && me.name, msg.chat);
        break;
      case 'room':
        BOOM.Room.updateOnline(msg.room);
        break;
      case 'chat':
        BOOM.Room.addChat(msg.msg);
        break;
      case 'error':
        UI.toast(t(msg.key));
        break;
      case 'start':
        BOOM.Session.startOnline(msg.setup, msg.you);
        break;
      case 'snap':
        BOOM.Session.onSnapshot(msg.s);
        break;
    }
  }

  function onClose() {
    me = null;
    showMain(false);
    setStatus(t('online.disconnected'), true);
    if (BOOM.Room.online || (BOOM.Session.active && BOOM.Session.active.kind === 'online')) {
      BOOM.Session.stop();
      BOOM.Room.leaveOnline();
      UI.toast(t('online.disconnected'));
      UI.show('lobby', { keepConnection: true });
    }
  }

  async function connect() {
    if (connecting) return;
    const nameEl = $('lobby-name');
    const name = (nameEl ? nameEl.value.trim() : '') || BOOM.Settings.data.name || 'Guest';
    const serverEl = $('lobby-server');
    const server = (serverEl && serverEl.value.trim()) || BOOM.Net.defaultUrl();
    BOOM.Settings.set({ name });
    connecting = true;
    setStatus(t('online.connecting'));
    try {
      await BOOM.Net.connect(server, { message: onMessage, close: onClose });
      BOOM.Net.send({ t: 'hello', name });
    } catch {
      showMain(false);
      setStatus(t('online.need_server'), true);
    } finally {
      connecting = false;
    }
  }

  UI.onEnter('lobby', (opts) => {
    BOOM.Audio.music('online');
    const nameEl = $('lobby-name');
    if (nameEl) nameEl.value = BOOM.Settings.data.name || 'Guest';
    const serverEl = $('lobby-server');
    if (serverEl) serverEl.value = BOOM.Net.defaultUrl();
    renderRooms();
    if (BOOM.Net.connected && me) {
      showMain(true);
      setStatus(`${t('online.connected')} · ${me.name}`);
      BOOM.Net.send({ t: 'list' });
    } else if (!(opts && opts.keepConnection)) {
      showMain(false);
      if (location.protocol.startsWith('http')) connect();
      else setStatus(t('online.need_server'));
    }
  });

  $('lobby-connect').addEventListener('submit', (e) => {
    e.preventDefault();
    connect();
  });
  $('join-code').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('join-code-input').value.trim().toUpperCase();
    if (code) BOOM.Net.send({ t: 'join', id: code });
  });

  UI.on('lobby-back', () => {
    BOOM.Net.close();
    me = null;
    UI.show('mode');
  });
  UI.on('lobby-create', () => BOOM.Net.send({ t: 'create' }));
  UI.on('lobby-refresh', () => BOOM.Net.send({ t: 'list' }));
  UI.on('lobby-prev', () => {
    page = Math.max(0, page - 1);
    renderRooms();
  });
  UI.on('lobby-next', () => {
    page++;
    renderRooms();
  });
})();
