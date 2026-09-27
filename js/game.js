/*
 * Core rules: grid movement, water balloons, chain bursts, bubble traps, rescues and round flow.
 * Runs unchanged in the browser (offline) and on the Node server (online). It never touches the
 * DOM or audio; noteworthy moments are pushed to `events` for the client to play.
 */
(function () {
  const C = BOOM.CONFIG;
  const T = BOOM.TILE;
  const DIRS = [
    [1, 0, 'h', 1],
    [-1, 0, 'h', -1],
    [0, 1, 'v', 1],
    [0, -1, 'v', -1],
  ];
  const IDLE = { dx: 0, dy: 0, bomb: false, maxDist: Infinity };
  const EPS = 1e-3;
  const round3 = (v) => Math.round(v * 1000) / 1000;

  BOOM.Game = class {
    /**
     * @param {{map: string, players: Array<{slot: number, name: string, char: string, team: number, kind: 'human'|'bot'}>}} setup
     */
    constructor(setup) {
      this.map = BOOM.createMap(setup.map);
      this.bombs = [];
      this.flames = [];
      this.breaking = new Map(); // tile index -> seconds until the block is gone
      this.events = [];
      this.time = 0;
      this.phase = 'ready'; // ready -> play -> end
      this.phaseTimer = C.READY_TIME;
      this.roundTime = C.ROUND_TIME;
      this.winnerTeam = null;
      this.mapVersion = 0; // bumps whenever tiles or items change (lets the server skip resending them)

      this.players = setup.players.map((def, id) => {
        const [sc, sr] = BOOM.SPAWNS[def.slot];
        return {
          id,
          slot: def.slot,
          name: def.name,
          char: def.char,
          team: def.team,
          isBot: def.kind === 'bot',
          ctrl: def.ctrl || null, // local control scheme ('p1' | 'p2') or remote client id
          x: sc + 0.5,
          y: sr + 0.5,
          dir: 'down',
          moving: false,
          speedLevel: 0,
          maxBombs: C.START_BOMBS,
          power: C.START_POWER,
          state: 'alive', // alive | trapped | dead
          trapTimer: 0,
          deadTimer: 0,
          invuln: 0,
          animT: 0,
          ai: null,
        };
      });
    }

    emit(type, data) {
      this.events.push({ type, ...data });
    }

    // ---------- queries ----------
    idx(c, r) {
      return r * C.COLS + c;
    }
    inBounds(c, r) {
      return c >= 0 && r >= 0 && c < C.COLS && r < C.ROWS;
    }
    tileAt(c, r) {
      return this.inBounds(c, r) ? this.map.tiles[this.idx(c, r)] : T.STONE;
    }
    isBreakable(tile) {
      return tile === T.BRICK || tile === T.GIFT;
    }
    bombAt(c, r) {
      return this.bombs.find((b) => !b.exploded && b.c === c && b.r === r) || null;
    }
    flameAt(c, r) {
      return this.flames.some((f) => f.c === c && f.r === r);
    }
    isWalkable(c, r, p) {
      if (this.tileAt(c, r) !== T.FLOOR) return false;
      const b = this.bombAt(c, r);
      return !b || (p && b.passers.has(p.id));
    }
    speedOf(p) {
      return p.state === 'trapped' ? C.TRAP_SPEED : C.BASE_SPEED + p.speedLevel * C.SPEED_STEP;
    }
    activeBombs(p) {
      return this.bombs.filter((b) => b.owner === p.id && !b.exploded).length;
    }

    /** Cells covered by a burst; streams stop at stone, breakable blocks and other balloons. */
    flameCells(c, r, power, hasBomb = (x, y) => !!this.bombAt(x, y)) {
      const out = [{ c, r, kind: 'center', axis: null, sign: 0 }];
      for (const [dx, dy, axis, sign] of DIRS) {
        for (let k = 1; k <= power; k++) {
          const nc = c + dx * k;
          const nr = r + dy * k;
          const tile = this.tileAt(nc, nr);
          if (tile === T.STONE) break;
          if (this.isBreakable(tile)) {
            out.push({ c: nc, r: nr, kind: 'end', axis, sign });
            break;
          }
          const blocked = hasBomb(nc, nr);
          out.push({ c: nc, r: nr, kind: k === power || blocked ? 'end' : 'arm', axis, sign });
          if (blocked) break;
        }
      }
      return out;
    }

    // ---------- movement ----------
    movePlayer(p, dx, dy, dist) {
      p.dir = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
      if (dx) this.moveAxis(p, 'x', 'y', dx, dist);
      else this.moveAxis(p, 'y', 'x', dy, dist);
    }

    /** Move along axis `a`, first sliding onto the lane center of axis `b` (with corner assist). */
    moveAxis(p, a, b, s, dist) {
      const walk = (ca, cb) => (a === 'x' ? this.isWalkable(ca, cb, p) : this.isWalkable(cb, ca, p));
      let ca = Math.floor(p[a]);
      let cb = Math.floor(p[b]);
      const off = p[b] - (cb + 0.5);

      if (Math.abs(off) > EPS) {
        let target = cb + 0.5;
        const nb = cb + Math.sign(off);
        if (!walk(ca + s, cb) && Math.abs(off) > 0.15 && walk(ca + s, nb) && walk(ca, nb)) target = nb + 0.5;
        const d = target - p[b];
        const step = Math.min(Math.abs(d), dist);
        p[b] += Math.sign(d) * step;
        dist -= step;
        if (Math.abs(target - p[b]) < EPS) p[b] = target;
        if (dist <= 0) return;
        cb = Math.floor(p[b]);
        ca = Math.floor(p[a]);
        if (Math.abs(p[b] - (cb + 0.5)) > EPS) return;
      }

      const center = ca + 0.5;
      let next = p[a] + s * dist;
      if (!walk(ca + s, cb)) {
        next = s > 0 ? Math.min(next, Math.max(p[a], center)) : Math.max(next, Math.min(p[a], center));
      }
      p[a] = next;
    }

    // ---------- actions ----------
    placeBomb(p) {
      const c = Math.floor(p.x);
      const r = Math.floor(p.y);
      if (this.activeBombs(p) >= p.maxBombs || this.bombAt(c, r) || this.tileAt(c, r) !== T.FLOOR) return false;
      const passers = new Set(
        this.players
          .filter((q) => q.state !== 'dead' && Math.floor(q.x) === c && Math.floor(q.y) === r)
          .map((q) => q.id)
      );
      this.bombs.push({ c, r, fuse: C.BOMB_FUSE, power: p.power, owner: p.id, passers, exploded: false, born: this.time });
      this.emit('place', { player: p.id });
      return true;
    }

    explode(bomb) {
      bomb.exploded = true;
      for (const cell of this.flameCells(bomb.c, bomb.r, bomb.power)) {
        const i = this.idx(cell.c, cell.r);
        if (this.isBreakable(this.map.tiles[i])) {
          if (!this.breaking.has(i)) this.breaking.set(i, C.BREAK_TIME);
        } else if (this.map.items[i]) {
          this.map.items[i] = null;
          this.mapVersion++;
        }
        const other = this.bombAt(cell.c, cell.r);
        if (other) this.explode(other);
        this.flames.push({ c: cell.c, r: cell.r, t: C.FLAME_TIME });
      }
    }

    trap(p) {
      p.state = 'trapped';
      p.trapTimer = C.TRAP_TIME;
      this.emit('trap', { player: p.id });
    }
    release(p) {
      p.state = 'alive';
      p.invuln = C.RESCUE_INVULN;
      this.emit('rescue', { player: p.id });
    }
    kill(p) {
      p.state = 'dead';
      p.deadTimer = 0;
      this.emit('kill', { player: p.id });
    }
    /** Used when an online player disconnects mid-round. */
    removePlayer(id) {
      const p = this.players[id];
      if (p && p.state !== 'dead') this.kill(p);
    }

    applyItem(p, type) {
      if (type === 'bomb') p.maxBombs = Math.min(C.MAX_BOMBS, p.maxBombs + 1);
      else if (type === 'power') p.power = Math.min(C.MAX_POWER, p.power + 1);
      else if (type === 'speed') p.speedLevel = Math.min(C.MAX_SPEED_LEVEL, p.speedLevel + 1);
      this.emit('item', { player: p.id });
    }

    // ---------- frame update ----------
    /** @param {(p: object) => object} getCommand input for non-bot players */
    update(dt, getCommand) {
      this.time += dt;
      for (const p of this.players) {
        p.animT += dt;
        if (p.state === 'dead') p.deadTimer += dt;
      }

      if (this.phase === 'ready') {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.phase = 'play';
          this.emit('start');
        }
        return;
      }
      if (this.phase === 'end') {
        this.phaseTimer += dt;
        this.updateFlames(dt, false);
        this.updateBreaking(dt);
        return;
      }

      this.roundTime -= dt;
      this.updatePlayers(dt, getCommand);
      this.updateBombs(dt);
      this.updateFlames(dt, true);
      this.updateBreaking(dt);
      this.resolveContacts();
      this.checkRoundEnd();
    }

    updatePlayers(dt, getCommand) {
      for (const p of this.players) {
        if (p.state === 'dead') continue;
        if (p.invuln > 0) p.invuln -= dt;
        const cmd = p.isBot ? BOOM.AI.think(this, p, dt) : (getCommand && getCommand(p)) || IDLE;

        if (p.state === 'trapped') {
          p.trapTimer -= dt;
          if (p.trapTimer <= 0) {
            this.kill(p);
            continue;
          }
        }

        p.moving = !!(cmd.dx || cmd.dy);
        if (p.moving) this.movePlayer(p, cmd.dx, cmd.dy, Math.min(this.speedOf(p) * dt, cmd.maxDist ?? Infinity));
        if (cmd.bomb && p.state === 'alive') this.placeBomb(p);
      }

      // A balloon becomes solid for a player once they step off its tile.
      for (const b of this.bombs) {
        for (const id of b.passers) {
          const q = this.players[id];
          if (Math.floor(q.x) !== b.c || Math.floor(q.y) !== b.r) b.passers.delete(id);
        }
      }
    }

    updateBombs(dt) {
      for (const b of this.bombs) {
        b.fuse -= dt;
        if (this.flameAt(b.c, b.r)) b.fuse = 0;
      }
      let burst = false;
      for (const b of [...this.bombs]) {
        if (!b.exploded && b.fuse <= 0) {
          this.explode(b);
          burst = true;
        }
      }
      if (burst) this.emit('explode');
      this.bombs = this.bombs.filter((b) => !b.exploded);
    }

    updateFlames(dt, harmful) {
      for (const f of this.flames) f.t -= dt;
      this.flames = this.flames.filter((f) => f.t > 0);
      if (!harmful) return;
      for (const p of this.players) {
        if (p.state !== 'alive' || p.invuln > 0) continue;
        if (this.flameAt(Math.floor(p.x), Math.floor(p.y))) this.trap(p);
      }
    }

    updateBreaking(dt) {
      for (const [i, t] of this.breaking) {
        if (t - dt > 0) {
          this.breaking.set(i, t - dt);
          continue;
        }
        this.breaking.delete(i);
        this.map.tiles[i] = T.FLOOR;
        this.map.items[i] = this.map.hidden[i];
        this.map.hidden[i] = null;
        this.mapVersion++;
      }
    }

    resolveContacts() {
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        const i = this.idx(Math.floor(p.x), Math.floor(p.y));
        const item = this.map.items[i];
        if (item) {
          this.map.items[i] = null;
          this.mapVersion++;
          this.applyItem(p, item);
        }
      }
      // Touching a bubble: teammates pop you out, opponents pop you for good.
      for (const p of this.players) {
        if (p.state !== 'trapped') continue;
        for (const q of this.players) {
          if (q === p || q.state !== 'alive') continue;
          if (Math.hypot(p.x - q.x, p.y - q.y) > 0.75) continue;
          if (q.team === p.team) this.release(p);
          else this.kill(p);
          break;
        }
      }
    }

    checkRoundEnd() {
      const teams = new Set(this.players.filter((p) => p.state !== 'dead').map((p) => p.team));
      if (teams.size <= 1) this.finish(teams.size ? [...teams][0] : null);
      else if (this.roundTime <= 0) this.finish(null);
    }

    finish(team) {
      this.phase = 'end';
      this.phaseTimer = 0;
      this.winnerTeam = team;
      this.emit('end', { team });
    }

    // ---------- network ----------
    /** Compact state for online clients; tiles/items are only included when they changed. */
    snapshot(withMap) {
      const snap = {
        t: round3(this.time),
        ph: this.phase,
        pt: round3(this.phaseTimer),
        rt: round3(this.roundTime),
        w: this.winnerTeam,
        mv: this.mapVersion,
        p: this.players.map((p) => [
          round3(p.x),
          round3(p.y),
          p.dir[0],
          p.moving ? 1 : 0,
          p.state[0],
          round3(p.trapTimer),
          round3(p.deadTimer),
          round3(p.invuln),
          p.maxBombs,
          p.power,
          p.speedLevel,
        ]),
        b: this.bombs.map((b) => [b.c, b.r, b.owner, round3(b.born)]),
        f: this.flames.map((f) => [f.c, f.r, round3(f.t)]),
        k: [...this.breaking].map(([i, t]) => [i, round3(t)]),
        e: this.events,
      };
      if (withMap) {
        snap.tiles = Array.from(this.map.tiles).join('');
        snap.items = this.map.items.map((it) => (it ? it[0] : '-')).join('');
      }
      return snap;
    }
  };
})();
