/* Boot, the frame loop and match sessions (offline sim or online snapshot view), pause and result overlays. */
(function () {
  const C = BOOM.CONFIG;
  const UI = BOOM.UI;
  const { $, el } = UI;
  const t = (...a) => BOOM.t(...a);
  const renderer = new BOOM.Renderer($('game'));
  const OFFLINE_KEYS = { solo: ['p1', 'p2'], p1: ['p1'], p2: ['p2'] };
  const IDLE = { dx: 0, dy: 0, bomb: false };

  let session = null;

  // ---------- events -> sounds / effects ----------
  function handleEvents(view, events) {
    for (const e of events) {
      renderer.onEvent(view, e);
      if (e.type === 'explode') BOOM.Audio.play(Math.random() < 0.5 ? 'explode' : 'explode2');
      else if (e.type === 'end') {
        const localWon = e.team !== null && session.localIds.some((id) => view.players[id].team === e.team);
        BOOM.Audio.play(localWon ? 'win' : 'lose');
        session.endTimer = C.RESULT_DELAY;
        if (session.kind === 'offline') BOOM.Room.addOfflineWin(e.team);
      } else BOOM.Audio.play(e.type);
    }
  }

  function viewOf(s) {
    return s.kind === 'offline' ? s.game : s.view;
  }

  function hudOpts() {
    const room = BOOM.Room.online ? BOOM.Room.online.room : BOOM.Room.offline;
    const view = viewOf(session);
    return {
      localIds: session.localIds,
      wins: room ? room.slots.map((s) => s.wins) : [],
      subtitle: view.map.key.replace('_', ' '),
      hint: 'Esc: Pause',
    };
  }

  // ---------- sessions ----------
  function begin(s) {
    session = s;
    renderer.effects = [];
    $('pause-overlay').hidden = true;
    $('result-overlay').hidden = true;
    UI.show('game');
    BOOM.Audio.music(viewOf(s).map.key);
  }

  BOOM.Session = {
    get active() {
      return session;
    },

    startOffline() {
      const setup = BOOM.Room.offlineSetup();
      const game = new BOOM.Game(setup);
      begin({
        kind: 'offline',
        game,
        localIds: game.players.filter((p) => !p.isBot).map((p) => p.id),
        paused: false,
        endTimer: null,
      });
    },

    startOnline(setup, you) {
      begin({ kind: 'online', view: new BOOM.NetView(setup, you), localIds: [you], lastInput: '', endTimer: null });
    },

    onSnapshot(snap) {
      if (!session || session.kind !== 'online') return;
      handleEvents(session.view, session.view.apply(snap));
    },

    stop() {
      session = null;
      $('pause-overlay').hidden = true;
      $('result-overlay').hidden = true;
    },
  };

  function step(dt) {
    const paused = !$('pause-overlay').hidden;
    if (session.kind === 'offline') {
      if (paused) return;
      const game = session.game;
      game.update(dt, (p) => (p.ctrl ? BOOM.Input.command(OFFLINE_KEYS[p.ctrl]) : IDLE));
      handleEvents(game, game.events);
      game.events.length = 0;
    } else {
      session.view.tick(dt);
      const cmd = paused ? IDLE : BOOM.Input.command(['p1', 'p2']);
      const key = `${cmd.dx},${cmd.dy}`;
      if (key !== session.lastInput || cmd.bomb) {
        session.lastInput = key;
        BOOM.Net.send({ t: 'input', ...cmd });
      }
    }
    if (session.endTimer !== null) {
      session.endTimer -= dt;
      if (session.endTimer <= 0) {
        session.endTimer = null;
        showResult();
      }
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (session && UI.current === 'game') {
      step(dt);
      if (session) renderer.draw(viewOf(session), { ...hudOpts(), dt });
    }
    BOOM.Input.endFrame();
    requestAnimationFrame(frame);
  }

  // ---------- result ----------
  function showResult() {
    const view = viewOf(session);
    const team = view.winnerTeam;
    const locals = session.localIds.map((id) => view.players[id]);
    const localTeams = new Set(locals.map((p) => p.team));
    let kind;
    let title;
    let msg;
    if (team === null) {
      kind = 'draw';
      title = t('result.draw');
      msg = t('result.msg.draw');
    } else if (localTeams.size > 1) {
      // Local 2P on opposing teams: name the winners instead of "you".
      kind = 'win';
      const names = view.players.filter((p) => p.team === team).map((p) => p.name);
      title = t('result.team_win', names.join(' & '));
      msg = '';
    } else if (localTeams.has(team)) {
      kind = 'win';
      title = t('result.win');
      msg = t('result.msg.win');
    } else {
      kind = 'lose';
      title = t('result.lose');
      msg = t('result.msg.lose');
    }
    $('result-card').className = `result-card ${kind}`;
    $('result-title').textContent = title;
    $('result-msg').textContent = msg;
    $('result-players').replaceChildren(
      ...[...view.players]
        .sort((a, b) => (b.team === team) - (a.team === team) || a.slot - b.slot)
        .map((p) =>
          el(
            'li',
            { style: `--slot-color:${BOOM.PLAYER_COLORS[p.slot]}` },
            el('img', { src: BOOM.Assets.url(`player/${p.char}_avatar.png`), alt: '' }),
            el('span', { class: 'rp-name' }, p.name),
            el('span', { class: 'rp-team' }, `${t('room.team')} ${p.team + 1}`),
            el('span', { class: 'rp-mark' }, p.team === team ? '★' : '')
          )
        )
    );
    $('result-again').hidden = session.kind !== 'offline';
    $('pause-overlay').hidden = true;
    $('result-overlay').hidden = false;
  }

  UI.on('result-again', () => BOOM.Session.startOffline());
  UI.on('result-room', () => {
    const online = session && session.kind === 'online';
    BOOM.Session.stop();
    if (online && BOOM.Room.online) UI.show('room');
    else if (online) UI.show('lobby', { keepConnection: true });
    else BOOM.Room.openOffline(BOOM.Room.offline.mode);
  });
  UI.on('result-home', () => {
    if (session && session.kind === 'online') {
      BOOM.Net.close();
      BOOM.Room.leaveOnline();
    }
    BOOM.Session.stop();
    UI.show('home');
  });

  // ---------- pause (pixel-art board from the original resources) ----------
  function renderPause() {
    const d = BOOM.Settings.data;
    $('pause-music').style.setProperty('--row', d.music ? 0 : 1);
    $('pause-sfx').style.setProperty('--row', d.sfx ? 0 : 1);
    $('pause-knob').style.left = `${d.master * (172 - 22.4)}px`;
    $('pause-restart').disabled = !session || session.kind !== 'offline';
  }

  function togglePause(open = $('pause-overlay').hidden) {
    if (!session || !$('result-overlay').hidden) return;
    $('pause-overlay').hidden = !open;
    if (open) renderPause();
  }

  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && UI.current === 'game') togglePause();
  });

  $('pause-music').addEventListener('click', () => {
    BOOM.Settings.set({ music: !BOOM.Settings.data.music });
    renderPause();
  });
  $('pause-sfx').addEventListener('click', () => {
    BOOM.Settings.set({ sfx: !BOOM.Settings.data.sfx });
    renderPause();
  });

  const volume = $('pause-volume');
  function setVolumeFromPointer(e) {
    const rect = volume.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    BOOM.Settings.set({ master: Math.round(k * 100) / 100 });
    renderPause();
  }
  volume.addEventListener('pointerdown', (e) => {
    volume.setPointerCapture(e.pointerId);
    setVolumeFromPointer(e);
  });
  volume.addEventListener('pointermove', (e) => {
    if (volume.hasPointerCapture(e.pointerId)) setVolumeFromPointer(e);
  });

  UI.on('pause-resume', () => togglePause(false));
  UI.on('pause-restart', () => BOOM.Session.startOffline());
  UI.on('pause-home', () => {
    if (session && session.kind === 'online') {
      BOOM.Net.send({ t: 'leave' });
      BOOM.Room.leaveOnline();
      BOOM.Session.stop();
      UI.show('lobby', { keepConnection: true });
      return;
    }
    BOOM.Session.stop();
    UI.show('home');
  });

  // ---------- boot ----------
  BOOM.applyI18n();
  BOOM.Assets.load((done, total) => {
    $('loading-fill').style.width = `${(done / total) * 100}%`;
  }).then(() => UI.show('welcome'));
  requestAnimationFrame(frame);
})();
