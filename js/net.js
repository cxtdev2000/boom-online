/* WebSocket client for online play, plus a renderer-compatible view rebuilt from server snapshots. */
(function () {
  const C = BOOM.CONFIG;
  const DIRS = { d: 'down', l: 'left', r: 'right', u: 'up' };
  const STATES = { a: 'alive', t: 'trapped', d: 'dead' };
  const ITEMS = Object.fromEntries(BOOM.ITEMS.map((it) => [it.type[0], it.type]));

  const DEFAULT_ONLINE_SERVER = (typeof BOOM !== 'undefined' && BOOM.CONFIG && BOOM.CONFIG.DEFAULT_SERVER)
    ? BOOM.CONFIG.DEFAULT_SERVER
    : 'boom-online-t8cx.onrender.com';

  /** Default server: configured render server in BOOM.CONFIG, or local host if developing locally. */
  function defaultUrl() {
    const configured = (typeof BOOM !== 'undefined' && BOOM.CONFIG && BOOM.CONFIG.DEFAULT_SERVER) || DEFAULT_ONLINE_SERVER;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return location.host;
    }
    if (location.host && location.host.includes('onrender.com')) {
      return location.host;
    }
    const saved = BOOM.Settings && BOOM.Settings.data && BOOM.Settings.data.server;
    if (saved && saved !== 'boom.maverick.io.vn' && saved !== 'loquacious-crisp-0510b6.netlify.app' && !saved.includes('netlify.app')) {
      return saved;
    }
    return configured;
  }

  function toWsUrl(address) {
    const a = address.trim();
    if (/^wss?:\/\//.test(a)) return a;
    if (/^https?:\/\//.test(a)) return a.replace(/^http/, 'ws').replace(/\/?$/, '/ws');
    const secure = location.protocol === 'https:';
    return `${secure ? 'wss' : 'ws'}://${a.replace(/\/+$/, '')}/ws`;
  }

  let ws = null;
  let handlers = {};

  BOOM.Net = {
    defaultUrl,
    get connected() {
      return !!ws && ws.readyState === 1;
    },

    connect(address, on) {
      this.close();
      handlers = on;
      return new Promise((resolve, reject) => {
        let opened = false;
        try {
          ws = new WebSocket(toWsUrl(address));
        } catch (err) {
          reject(err);
          return;
        }
        const sock = ws;
        sock.onopen = () => {
          opened = true;
          resolve();
        };
        sock.onmessage = (e) => {
          let msg;
          try {
            msg = JSON.parse(e.data);
          } catch {
            return;
          }
          if (sock === ws && handlers.message) handlers.message(msg);
        };
        sock.onclose = () => {
          if (!opened) reject(new Error('connect failed'));
          else if (sock === ws) {
            ws = null;
            if (handlers.close) handlers.close();
          }
        };
      });
    },

    send(msg) {
      if (this.connected) ws.send(JSON.stringify(msg));
    },

    close() {
      if (!ws) return;
      const sock = ws;
      ws = null;
      sock.close();
    },
  };

  /** Mirrors BOOM.Game's drawable state from snapshots, smoothing positions between them. */
  BOOM.NetView = class {
    constructor(setup, youId) {
      const map = BOOM.createMap(setup.map);
      this.map = { key: setup.map, tiles: map.tiles, items: map.items.map(() => null) };
      this.youId = youId;
      this.players = setup.players.map((def, id) => {
        const [sc, sr] = BOOM.SPAWNS[def.slot];
        return {
          id,
          slot: def.slot,
          name: def.name,
          char: def.char,
          team: def.team,
          x: sc + 0.5,
          y: sr + 0.5,
          tx: sc + 0.5,
          ty: sr + 0.5,
          dir: 'down',
          moving: false,
          state: 'alive',
          trapTimer: 0,
          deadTimer: 0,
          invuln: 0,
          maxBombs: C.START_BOMBS,
          power: C.START_POWER,
          speedLevel: 0,
          animT: 0,
        };
      });
      this.bombs = [];
      this.flames = [];
      this.breaking = new Map();
      this.phase = 'ready';
      this.phaseTimer = C.READY_TIME;
      this.roundTime = C.ROUND_TIME;
      this.winnerTeam = null;
      this.time = 0;
    }

    /** Apply a snapshot; returns the events it carried. */
    apply(s) {
      if (Math.abs(this.time - s.t) > 0.15) this.time = s.t;
      this.phase = s.ph;
      this.phaseTimer = s.pt;
      this.roundTime = s.rt;
      this.winnerTeam = s.w;
      s.p.forEach((a, i) => {
        const p = this.players[i];
        if (!p) return;
        [p.tx, p.ty] = a;
        if (Math.hypot(p.tx - p.x, p.ty - p.y) > 1.5) {
          p.x = p.tx;
          p.y = p.ty;
        }
        p.dir = DIRS[a[2]] || 'down';
        p.moving = !!a[3];
        p.state = STATES[a[4]] || 'alive';
        p.trapTimer = a[5];
        p.deadTimer = a[6];
        p.invuln = a[7];
        p.maxBombs = a[8];
        p.power = a[9];
        p.speedLevel = a[10];
      });
      this.bombs = s.b.map(([c, r, owner, born]) => ({ c, r, owner, born }));
      this.flames = s.f.map(([c, r, t]) => ({ c, r, t }));
      this.breaking = new Map(s.k);
      if (s.tiles) {
        for (let i = 0; i < s.tiles.length; i++) this.map.tiles[i] = s.tiles.charCodeAt(i) - 48;
        for (let i = 0; i < s.items.length; i++) this.map.items[i] = ITEMS[s.items[i]] || null;
      }
      return s.e || [];
    }

    /** Advance local clocks and ease players toward their latest server position. */
    tick(dt) {
      this.time += dt;
      const k = Math.min(1, dt * 18);
      for (const p of this.players) {
        p.animT += dt;
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        if (p.state === 'dead') p.deadTimer += dt;
        if (p.state === 'trapped') p.trapTimer = Math.max(0, p.trapTimer - dt);
      }
      for (const f of this.flames) f.t = Math.max(0.001, f.t - dt);
      if (this.phase === 'play') this.roundTime -= dt;
    }
  };
})();
