/* Bot brain: flee danger, bomb when an escape route exists, otherwise chase items, blocks and enemies. */
(function () {
  const C = BOOM.CONFIG;
  const T = BOOM.TILE;
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const EPS = 1e-3;

  /**
   * Seconds until each cell is hit by water (0 = wet right now, Infinity = safe).
   * Bots only notice other players' balloons after their reaction time, so they can be outplayed.
   */
  function computeDanger(game, p, extra) {
    const danger = new Float32Array(C.COLS * C.ROWS).fill(Infinity);
    for (const f of game.flames) danger[game.idx(f.c, f.r)] = 0;

    const bombs = game.bombs
      .filter((b) => b.owner === p.id || game.time - b.born >= p.ai.reaction)
      .map((b) => ({ c: b.c, r: b.r, power: b.power, fuse: b.fuse }));
    if (extra) bombs.push(extra);
    const hasBomb = (c, r) => bombs.some((b) => b.c === c && b.r === r);
    const cells = bombs.map((b) => game.flameCells(b.c, b.r, b.power, hasBomb));

    // Chain reactions: a balloon hit by an earlier burst goes off at that earlier time.
    for (let changed = true, guard = 0; changed && guard < 12; guard++) {
      changed = false;
      bombs.forEach((b, bi) => {
        for (const cell of cells[bi]) {
          for (const o of bombs) {
            if (o !== b && o.c === cell.c && o.r === cell.r && o.fuse > b.fuse) {
              o.fuse = b.fuse;
              changed = true;
            }
          }
        }
      });
    }
    bombs.forEach((b, bi) => {
      for (const cell of cells[bi]) {
        const i = game.idx(cell.c, cell.r);
        danger[i] = Math.min(danger[i], Math.max(0, b.fuse));
      }
    });
    return danger;
  }

  /** Breadth-first search over walkable cells. `risky` allows crossing cells that burst later. */
  function bfs(game, p, danger, sc, sr, risky) {
    const n = C.COLS * C.ROWS;
    const dist = new Int16Array(n).fill(-1);
    const parent = new Int16Array(n).fill(-1);
    const stepTime = 1 / game.speedOf(p);
    const start = game.idx(sc, sr);
    const queue = [start];
    dist[start] = 0;
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q];
      const cc = cur % C.COLS;
      const cr = (cur - cc) / C.COLS;
      for (const [dx, dy] of DIRS) {
        const nc = cc + dx;
        const nr = cr + dy;
        if (!game.inBounds(nc, nr)) continue;
        const ni = game.idx(nc, nr);
        if (dist[ni] !== -1 || game.map.tiles[ni] !== T.FLOOR || game.bombAt(nc, nr)) continue;
        const d = danger[ni];
        if (d !== Infinity) {
          if (!risky) continue;
          if ((dist[cur] + 2) * stepTime + 0.2 >= d) continue;
        }
        dist[ni] = dist[cur] + 1;
        parent[ni] = cur;
        queue.push(ni);
      }
    }
    return { dist, parent };
  }

  function firstStep(parent, start, goal) {
    let cur = goal;
    while (parent[cur] !== start && parent[cur] !== -1) cur = parent[cur];
    return { c: cur % C.COLS, r: Math.floor(cur / C.COLS) };
  }

  function nearestSafe(res, danger, maxDist) {
    let best = -1;
    for (let i = 0; i < res.dist.length; i++) {
      const d = res.dist[i];
      if (d > 0 && d <= maxDist && danger[i] === Infinity && (best < 0 || d < res.dist[best])) best = i;
    }
    return best;
  }

  function isEnemy(p, q) {
    return q.team !== p.team && q.state === 'alive';
  }

  /** How useful a balloon dropped at (c, r) would be. */
  function bombValue(game, p, c, r) {
    let value = 0;
    for (const cell of game.flameCells(c, r, p.power)) {
      const i = game.idx(cell.c, cell.r);
      const tile = game.map.tiles[i];
      if (game.isBreakable(tile) && !game.breaking.has(i)) value += tile === T.GIFT ? 14 : 10;
      for (const q of game.players) {
        if (isEnemy(p, q) && q.invuln <= 0 && Math.floor(q.x) === cell.c && Math.floor(q.y) === cell.r) value += 30;
      }
    }
    return value * p.ai.aggro;
  }

  function decide(game, p, c, r) {
    const ai = p.ai;
    const start = game.idx(c, r);
    const danger = computeDanger(game, p);

    if (danger[start] !== Infinity) {
      const res = bfs(game, p, danger, c, r, true);
      const goal = nearestSafe(res, danger, 99);
      if (goal >= 0) ai.step = firstStep(res.parent, start, goal);
      return false;
    }

    const canBomb = game.activeBombs(p) < p.maxBombs;
    if (canBomb && ai.bombCooldown <= 0 && bombValue(game, p, c, r) > 0) {
      const danger2 = computeDanger(game, p, { c, r, power: p.power, fuse: C.BOMB_FUSE });
      const res = bfs(game, p, danger2, c, r, true);
      const reach = Math.floor((C.BOMB_FUSE - 0.5) * game.speedOf(p));
      const goal = nearestSafe(res, danger2, reach);
      if (goal >= 0) {
        ai.step = firstStep(res.parent, start, goal);
        ai.bombCooldown = 0.4;
        return true;
      }
    }

    const { dist, parent } = bfs(game, p, danger, c, r, false);
    let best = -Infinity;
    let bestI = -1;
    for (let i = 0; i < dist.length; i++) {
      const d = dist[i];
      if (d <= 0) continue;
      const ic = i % C.COLS;
      const ir = (i - ic) / C.COLS;
      let score = -Infinity;
      if (game.map.items[i]) score = 50 - d * 3;
      for (const q of game.players) {
        if (q.team === p.team || Math.floor(q.x) !== ic || Math.floor(q.y) !== ir) continue;
        if (q.state === 'trapped') score = Math.max(score, 120 - d * 2);
        else if (q.state === 'alive') score = Math.max(score, 30 - d * 1.5);
      }
      if (canBomb) {
        const v = bombValue(game, p, ic, ir);
        if (v > 0) score = Math.max(score, v - d * 2.5);
      }
      score += Math.random() * 2;
      if (score > best) {
        best = score;
        bestI = i;
      }
    }
    if (bestI >= 0) ai.step = firstStep(parent, start, bestI);
    return false;
  }

  BOOM.AI = {
    think(game, p, dt) {
      if (!p.ai) {
        p.ai = {
          step: null,
          bombCooldown: 0,
          aggro: 0.8 + Math.random() * 0.5,
          reaction: 0.2 + Math.random() * 0.25,
        };
      }
      const ai = p.ai;
      const cmd = { dx: 0, dy: 0, bomb: false, maxDist: Infinity };
      ai.bombCooldown -= dt;

      if (p.state === 'trapped') {
        ai.step = null;
        return cmd;
      }

      const c = Math.floor(p.x);
      const r = Math.floor(p.y);
      const centered = Math.abs(p.x - (c + 0.5)) < EPS && Math.abs(p.y - (r + 0.5)) < EPS;

      if (ai.step) {
        const reached = Math.abs(p.x - (ai.step.c + 0.5)) < EPS && Math.abs(p.y - (ai.step.r + 0.5)) < EPS;
        const blocked = !game.isWalkable(ai.step.c, ai.step.r, p) || (game.flameAt(ai.step.c, ai.step.r) && !(ai.step.c === c && ai.step.r === r));
        if (reached) {
          p.x = ai.step.c + 0.5;
          p.y = ai.step.r + 0.5;
          ai.step = null;
        } else if (blocked) {
          ai.step = { c, r }; // back up to the center of the current cell
        }
      }

      if (!ai.step) {
        if (centered) cmd.bomb = decide(game, p, c, r);
        else ai.step = { c, r };
      }

      if (ai.step) {
        const tx = ai.step.c + 0.5;
        const ty = ai.step.r + 0.5;
        if (Math.abs(tx - p.x) > EPS) cmd.dx = Math.sign(tx - p.x);
        if (Math.abs(ty - p.y) > EPS) cmd.dy = Math.sign(ty - p.y);
        if (cmd.dx && cmd.dy) cmd.dx = 0; // realign on the misaligned axis first
        cmd.maxDist = Math.abs(tx - p.x) + Math.abs(ty - p.y);
      }
      return cmd;
    },
  };
})();
