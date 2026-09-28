/* WebSocket client for online play, plus a renderer-compatible view rebuilt from server snapshots. */
(function () {
  const C = BOOM.CONFIG;
  const DIRS = { d: 'down', l: 'left', r: 'right', u: 'up' };
  const STATES = { a: 'alive', t: 'trapped', d: 'dead' };
  const ITEMS = Object.fromEntries(BOOM.ITEMS.map((it) => [it.type[0], it.type]));

  const DEFAULT_ONLINE_SERVER = (typeof BOOM !== 'undefined' && BOOM.CONFIG && BOOM.CONFIG.DEFAULT_SERVER)
    ? BOOM.CONFIG.DEFAULT_SERVER
    : 'boom-online-sg.onrender.com';

  /** Default server: configured render server in BOOM.CONFIG, or local host if developing locally. */
  function defaultUrl() {
    const configured = (typeof BOOM !== 'undefined' && BOOM.CONFIG && BOOM.CONFIG.DEFAULT_SERVER) || DEFAULT_ONLINE_SERVER;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return location.host;
    }
    if (location.host && (location.host.includes('onrender.com') || location.host === 'boom.maverick.io.vn')) {
      return location.host;
    }
    const saved = BOOM.Settings && BOOM.Settings.data && BOOM.Settings.data.server;
    if (saved && saved !== 'boom-online-t8cx.onrender.com' && !saved.includes('netlify.app')) {
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

    tryOptimisticBomb(p) {
      if (this.phase !== 'play' || p.state !== 'alive') return false;
      const c = Math.floor(p.x);
      const r = Math.floor(p.y);
      const activeBombs = this.bombs.filter((b) => b.owner === p.id && !b.exploded).length;
      if (activeBombs >= p.maxBombs || this.bombAt(c, r) || this.tileAt(c, r) !== BOOM.TILE.FLOOR) {
        return false;
      }
      const passers = new Set(
        this.players
          .filter((q) => q.state !== 'dead' && Math.floor(q.x) === c && Math.floor(q.y) === r)
          .map((q) => q.id)
      );
      this.bombs.push({
        c,
        r,
        owner: p.id,
        born: this.time,
        passers,
        exploded: false,
        optimistic: true,
      });
      BOOM.Audio.play('place');
      return true;
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
        const serverState = STATES[a[4]] || 'alive';

        if (i === this.youId) {
          // Local player reconciliation:
          p.state = serverState;
          p.trapTimer = a[5];
          p.deadTimer = a[6];
          p.invuln = a[7];
          p.maxBombs = a[8];
          p.power = a[9];
          p.speedLevel = a[10];

          // If dead/trapped, or if position diverged significantly (> 1.2 tiles), snap to server
          if (p.state !== 'alive' || Math.hypot(p.tx - p.x, p.ty - p.y) > 1.2) {
            p.x = p.tx;
            p.y = p.ty;
            p.dir = DIRS[a[2]] || 'down';
            p.moving = !!a[3];
          }
        } else {
          // Remote players:
          if (Math.hypot(p.tx - p.x, p.ty - p.y) > 1.8) {
            p.x = p.tx;
            p.y = p.ty;
          }
          p.dir = DIRS[a[2]] || 'down';
          p.moving = !!a[3];
          p.state = serverState;
          p.trapTimer = a[5];
          p.deadTimer = a[6];
          p.invuln = a[7];
          p.maxBombs = a[8];
          p.power = a[9];
          p.speedLevel = a[10];
        }
      });

      // Merge server authoritative bombs with recent local optimistic bombs
      const serverBombs = s.b.map(([c, r, owner, born]) => {
        const existing = this.bombs.find((b) => b.c === c && b.r === r);
        const passers = existing && existing.passers ? existing.passers : new Set(
          this.players
            .filter((q) => q.state !== 'dead' && Math.floor(q.x) === c && Math.floor(q.y) === r)
            .map((q) => q.id)
        );
        return { c, r, owner, born, passers, exploded: false };
      });
      const now = this.time;
      const unconfirmed = this.bombs.filter(
        (b) => b.optimistic && now - b.born < 1.2 && !serverBombs.some((sb) => sb.c === b.c && sb.r === b.r)
      );
      this.bombs = [...serverBombs, ...unconfirmed];

      this.flames = s.f.map(([c, r, t]) => ({ c, r, t }));
      this.breaking = new Map(s.k);
      if (s.tiles) {
        for (let i = 0; i < s.tiles.length; i++) this.map.tiles[i] = s.tiles.charCodeAt(i) - 48;
        for (let i = 0; i < s.items.length; i++) this.map.items[i] = ITEMS[s.items[i]] || null;
      }
      return s.e || [];
    }

    /** Advance local clocks, predict local player movement, and smooth positions. */
    tick(dt, cmd) {
      this.time += dt;
      const k = Math.min(1, dt * 26);

      // Local player client-side prediction
      const you = this.players[this.youId];
      if (you && you.state !== 'dead' && this.phase === 'play' && cmd) {
        you.animT += dt;
        if (cmd.dx || cmd.dy) {
          const dist = this.speedOf(you) * dt;
          this.movePlayer(you, cmd.dx, cmd.dy, dist);
          you.moving = true;
        } else {
          you.moving = false;
        }
        if (you.invuln > 0) you.invuln = Math.max(0, you.invuln - dt);
        if (cmd.bomb) this.tryOptimisticBomb(you);
      }

      // Solidify balloons after stepping off
      for (const b of this.bombs) {
        if (!b.passers) continue;
        for (const id of b.passers) {
          const q = this.players[id];
          if (q && (Math.floor(q.x) !== b.c || Math.floor(q.y) !== b.r)) {
            b.passers.delete(id);
          }
        }
      }

      for (const p of this.players) {
        if (p.id === this.youId) {
          if (p.state !== 'alive' || this.phase !== 'play') {
            p.x += (p.tx - p.x) * k;
            p.y += (p.ty - p.y) * k;
          } else {
            // Minor smooth reconciliation when stopping or idle
            const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
            if (dist > 1.2) {
              p.x = p.tx;
              p.y = p.ty;
            } else if (dist > 0.04 && (!cmd || (!cmd.dx && !cmd.dy))) {
              p.x += (p.tx - p.x) * Math.min(1, dt * 14);
              p.y += (p.ty - p.y) * Math.min(1, dt * 14);
            }
          }
          if (p.state === 'dead') p.deadTimer += dt;
          if (p.state === 'trapped') p.trapTimer = Math.max(0, p.trapTimer - dt);
        } else {
          p.animT += dt;
          p.x += (p.tx - p.x) * k;
          p.y += (p.ty - p.y) * k;
          if (p.state === 'dead') p.deadTimer += dt;
          if (p.state === 'trapped') p.trapTimer = Math.max(0, p.trapTimer - dt);
        }
      }

      for (const f of this.flames) f.t = Math.max(0.001, f.t - dt);
      if (this.phase === 'play') this.roundTime -= dt;
    }
  };

  // Inherit movement and map query physics from BOOM.Game
  for (const m of ['idx', 'inBounds', 'tileAt', 'isBreakable', 'bombAt', 'flameAt', 'isWalkable', 'speedOf', 'movePlayer', 'moveAxis']) {
    if (BOOM.Game && BOOM.Game.prototype[m]) {
      BOOM.NetView.prototype[m] = BOOM.Game.prototype[m];
    }
  }
})();
