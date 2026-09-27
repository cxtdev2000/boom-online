/*
 * Room screen shared by offline (1P/2P vs bots) and online rooms. Layout follows the original
 * client's RoomPanel: 2x2 player slots, chat / how-to card, map + character pickers, start button.
 */
(function () {
  const { $, el } = BOOM.UI;
  const UI = BOOM.UI;
  const t = (...a) => BOOM.t(...a);
  const CHARS = BOOM.CHARACTERS;
  const MAPS = BOOM.MAPS;
  const cycle = (list, value, delta) => list[(list.indexOf(value) + delta + list.length) % list.length];
  const mapLabel = (key) => key.replace('_', ' ');

  let offline = null; // { mode, map, slots }
  let online = null; // { room, you, chat }

  function offlineSlots(mode) {
    const name = BOOM.Settings.data.name || 'Player 1';
    const human = (ctrl, n, i) => ({ type: 'human', ctrl, name: n, char: CHARS[i], team: i, wins: 0 });
    const bot = (i) => ({ type: 'bot', ctrl: null, name: `Bot ${i + 1}`, char: CHARS[i], team: i, wins: 0 });
    const empty = (i) => ({ type: 'empty', ctrl: null, name: '', char: CHARS[i], team: i, wins: 0 });
    return mode === '1p'
      ? [human('solo', name, 0), bot(1), bot(2), empty(3)]
      : [human('p1', name, 0), human('p2', 'Player 2', 1), bot(2), empty(3)];
  }

  /** Normalised model for rendering, whichever mode is active. */
  function model() {
    if (online) {
      const { room, you } = online;
      const amHost = room.hostId === you;
      const slots = room.slots.map((s) => {
        const isYou = s.type === 'human' && s.clientId === you;
        let badge = null;
        if (s.type === 'bot') badge = t('room.slot.bot');
        else if (s.type === 'human') {
          badge = s.clientId === room.hostId ? t('room.slot.host') : s.ready ? t('room.slot.ready') : t('room.slot.waiting');
        }
        return {
          ...s,
          name: s.type === 'bot' ? t('room.slot.bot') : s.name,
          isYou,
          badge,
          badgeOk: s.type === 'human' && (s.ready || s.clientId === room.hostId),
          editable: isYou || (amHost && s.type === 'bot'),
          canToggle: amHost && s.type !== 'human',
        };
      });
      const mine = room.slots.findIndex((s) => s.type === 'human' && s.clientId === you);
      return { title: room.name, sub: `ID: ${room.id} · ${slots.filter((s) => s.type !== 'empty').length}/4`, slots, map: room.map, canEditMap: amHost, mine, amHost };
    }
    const slots = offline.slots.map((s) => ({
      ...s,
      isYou: s.type === 'human',
      badge: s.type === 'bot' ? t('room.slot.bot') : s.ctrl === 'solo' ? t('room.slot.you') : s.ctrl ? s.ctrl.toUpperCase() : null,
      badgeOk: s.type === 'human',
      editable: s.type !== 'empty',
      canToggle: s.type !== 'human',
    }));
    return { title: t('room.default_name.offline'), sub: offline.mode.toUpperCase(), slots, map: offline.map, canEditMap: true, mine: 0, amHost: true };
  }

  function canStart(slots) {
    const taken = slots.filter((s) => s.type !== 'empty');
    return taken.length >= 2 && new Set(taken.map((s) => s.team)).size >= 2;
  }

  // ---------- edits ----------
  function editSlot(i, patch) {
    if (online) return BOOM.Net.send({ t: 'slot', slot: i, ...patch });
    Object.assign(offline.slots[i], patch);
    render();
  }
  function toggleSlot(i) {
    if (online) {
      const s = online.room.slots[i];
      return BOOM.Net.send({ t: 'slotType', slot: i, type: s.type === 'bot' ? 'empty' : 'bot' });
    }
    const s = offline.slots[i];
    s.type = s.type === 'bot' ? 'empty' : 'bot';
    s.name = s.type === 'bot' ? `Bot ${i + 1}` : '';
    render();
  }
  function setMap(key) {
    if (online) return BOOM.Net.send({ t: 'map', map: key });
    offline.map = key;
    render();
  }

  // ---------- rendering ----------
  function slotCard(s, i) {
    const color = BOOM.PLAYER_COLORS[i];
    const card = el('div', { class: `slot-card${s.isYou ? ' you' : ''}${s.type === 'empty' ? ' empty' : ''}`, style: `--slot-color:${color}` });
    const top = el(
      'div',
      { class: 'slot-top' },
      el('strong', { class: 'slot-name' }, s.type === 'empty' ? t('room.slot.empty') : s.name),
      s.badge && el('span', { class: `badge${s.badgeOk ? ' ok' : ''}` }, s.badge)
    );
    card.append(top);
    if (s.type === 'empty') {
      if (s.canToggle) card.append(el('button', { class: 'btn slot-add', onclick: () => toggleSlot(i) }, t('room.slot.add_bot')));
      return card;
    }
    const arrow = (dir, delta) =>
      s.editable ? el('button', { class: `arrow-btn ${dir} small`, 'aria-label': dir, onclick: () => editSlot(i, { char: cycle(CHARS, s.char, delta) }) }) : el('span', { class: 'arrow-space' });
    card.append(
      el('div', { class: 'slot-mid' }, arrow('left', -1), el('img', { class: 'slot-avatar', src: BOOM.Assets.url(`player/${s.char}_avatar.png`), alt: s.char }), arrow('right', 1))
    );
    const teamColor = BOOM.PLAYER_COLORS[s.team];
    card.append(
      el(
        'div',
        { class: 'slot-bottom' },
        el(
          'button',
          { class: 'team-pill', style: `--team-color:${teamColor}`, disabled: !s.editable, onclick: () => editSlot(i, { team: (s.team + 1) % 4 }) },
          `${t('room.team')} ${s.team + 1}`
        ),
        el('span', { class: 'slot-wins' }, `★ ${s.wins || 0}`),
        s.canToggle && el('button', { class: 'btn small', onclick: () => toggleSlot(i) }, t('room.slot.remove'))
      )
    );
    return card;
  }

  function renderHowTo() {
    const keys = BOOM.Settings.data.keys;
    const row = (label, k) =>
      el('tr', {}, el('th', {}, label), ...['up', 'down', 'left', 'right', 'bomb'].map((a) => el('td', {}, el('kbd', {}, BOOM.keyLabel(k[a])))));
    const head = el('tr', {}, el('th', {}), ...['up', 'down', 'left', 'right', 'bomb'].map((a) => el('th', {}, t(`key.${a}`))));
    const solo = offline && offline.mode === '1p';
    $('howto').replaceChildren(
      el('p', {}, t('room.controls.rules')),
      el(
        'div',
        { class: 'howto-keys' },
        el('table', { class: 'keys-mini' }, head, row(solo ? 'P1 / 1' : 'P1', keys.p1), row(solo ? 'P1 / 2' : 'P2', keys.p2)),
        el('span', { class: 'muted' }, 'Esc: Pause')
      )
    );
  }

  function render() {
    if (!offline && !online) return;
    const m = model();
    $('room-title').textContent = m.title;
    $('room-sub').textContent = m.sub;
    $('slot-grid').replaceChildren(...m.slots.map(slotCard));

    $('map-preview').src = BOOM.Assets.url(`map/${m.map}_avatar.jpg`);
    $('map-name').textContent = mapLabel(m.map);
    document.querySelectorAll('[data-action="map-prev"], [data-action="map-next"]').forEach((b) => (b.disabled = !m.canEditMap));

    const mine = m.mine >= 0 ? m.slots[m.mine] : null;
    $('char-preview').src = mine ? BOOM.Assets.url(`player/${mine.char}_avatar.png`) : '';
    $('char-name').textContent = mine ? mine.char.toUpperCase() : '';

    $('room-chat').hidden = !online;
    $('room-howto').hidden = !!online;
    if (!online) renderHowTo();

    const primary = $('room-primary');
    if (m.amHost) {
      primary.textContent = t('room.btn.start');
      primary.disabled = !canStart(m.slots);
      primary.title = primary.disabled ? t('room.need_teams') : '';
    } else {
      primary.textContent = mine && mine.ready ? t('room.btn.unready') : t('room.btn.ready');
      primary.disabled = false;
      primary.title = t('online.host_only');
    }
  }

  function chatLine(msg) {
    const time = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (msg.system) return el('div', { class: 'chat-system' }, t(msg.system, msg.name));
    const you = online && msg.name === online.name;
    return el(
      'div',
      { class: `chat-msg${you ? ' mine' : ''}` },
      el('div', {}, el('strong', {}, msg.name), el('small', {}, ` ${time}`)),
      el('div', { class: 'chat-text' }, msg.text)
    );
  }

  // ---------- public ----------
  BOOM.Room = {
    get offline() {
      return offline;
    },
    get online() {
      return online;
    },

    openOffline(mode) {
      online = null;
      if (!offline || offline.mode !== mode) offline = { mode, map: BOOM.MAPS[2], slots: offlineSlots(mode) };
      const me = offline.slots[0];
      if (me.type === 'human') me.name = BOOM.Settings.data.name || me.name;
      UI.show('room');
    },

    openOnline(room, you, name, chat) {
      offline = null;
      online = { room, you, name, chat: chat || [] };
      $('chat-log').replaceChildren(...online.chat.map(chatLine));
      UI.show('room');
    },

    updateOnline(room) {
      if (!online) return;
      online.room = room;
      if (UI.current === 'room') render();
    },

    addChat(msg) {
      if (!online) return;
      online.chat.push(msg);
      const log = $('chat-log');
      log.append(chatLine(msg));
      log.scrollTop = log.scrollHeight;
    },

    leaveOnline() {
      online = null;
    },

    /** Called by the session when an offline round ends. */
    addOfflineWin(team) {
      if (!offline || team === null) return;
      for (const s of offline.slots) if (s.type !== 'empty' && s.team === team) s.wins++;
    },

    offlineSetup() {
      return {
        map: offline.map,
        players: offline.slots
          .map((s, slot) => ({ ...s, slot }))
          .filter((s) => s.type !== 'empty')
          .map((s) => ({ slot: s.slot, name: s.name, char: s.char, team: s.team, kind: s.type === 'bot' ? 'bot' : 'human', ctrl: s.ctrl })),
      };
    },

    render,
  };

  UI.onEnter('room', () => {
    BOOM.Audio.music(online ? 'online' : 'menu');
    render();
    const log = $('chat-log');
    log.scrollTop = log.scrollHeight;
  });

  UI.on('room-back', () => {
    if (online) {
      BOOM.Net.send({ t: 'leave' });
      online = null;
      UI.show('lobby', { keepConnection: true });
    } else UI.show('mode');
  });
  UI.on('map-prev', () => setMap(cycle(MAPS, model().map, -1)));
  UI.on('map-next', () => setMap(cycle(MAPS, model().map, 1)));
  const stepChar = (delta) => {
    const m = model();
    if (m.mine < 0) return;
    editSlot(m.mine, { char: cycle(CHARS, m.slots[m.mine].char, delta) });
  };
  UI.on('char-prev', () => stepChar(-1));
  UI.on('char-next', () => stepChar(1));

  $('room-primary').addEventListener('click', () => {
    const m = model();
    if (online) {
      if (m.amHost) BOOM.Net.send({ t: 'start' });
      else BOOM.Net.send({ t: 'ready', ready: !(m.slots[m.mine] && m.slots[m.mine].ready) });
      return;
    }
    if (canStart(m.slots)) BOOM.Session.startOffline();
  });

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const text = input.value.trim();
    if (text) BOOM.Net.send({ t: 'chat', text });
    input.value = '';
  });
})();
