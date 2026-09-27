/*
 * Canvas renderer. Draws any "view" shaped like BOOM.Game (offline game or the online snapshot view):
 * { map: {key, tiles, items}, players, bombs, flames, breaking, phase, phaseTimer, roundTime, time }.
 */
(function () {
  const C = BOOM.CONFIG;
  const T = BOOM.TILE;
  const S = C.TILE;
  const MAP_W = C.COLS * S;
  const MAP_H = C.ROWS * S;
  const BLOCK_SCALE = S / 64; // map sprites are authored for 64px tiles
  const FRAME_W = 58;
  const FRAME_H = 71;
  const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
  const ITEM_SPRITE = Object.fromEntries(BOOM.ITEMS.map((it) => [it.type, it.sprite]));
  const TILE_PART = { [T.STONE]: 'stone', [T.BRICK]: 'brick', [T.GIFT]: 'gift_box' };

  BOOM.Renderer = class {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = true;
      this.effects = []; // pickup sparkles etc.
      this.floorCache = null;
      this.floorKey = null;
    }

    get img() {
      return BOOM.Assets.img;
    }

    /** Visual reactions to game events (sounds are handled elsewhere). */
    onEvent(view, e) {
      const p = e.player != null ? view.players[e.player] : null;
      if ((e.type === 'item' || e.type === 'rescue') && p) this.effects.push({ kind: 'sparkle', x: p.x, y: p.y, t: 0 });
    }

    // ---------- helpers ----------
    floorCanvas(key) {
      if (this.floorKey === key) return this.floorCache;
      const floor = this.img[`${key}_floor`];
      const c = document.createElement('canvas');
      c.width = MAP_W;
      c.height = MAP_H;
      const g = c.getContext('2d');
      if (floor) {
        const w = floor.width * BLOCK_SCALE;
        const h = floor.height * BLOCK_SCALE;
        for (let y = 0; y < MAP_H; y += h) for (let x = 0; x < MAP_W; x += w) g.drawImage(floor, x, y, w, h);
      } else {
        g.fillStyle = '#7fb069';
        g.fillRect(0, 0, MAP_W, MAP_H);
      }
      this.floorCache = c;
      this.floorKey = key;
      return c;
    }

    drawBlock(key, tile, c, r, alpha = 1, scale = 1) {
      const img = this.img[`${key}_${TILE_PART[tile]}`];
      if (!img) return;
      const w = img.width * BLOCK_SCALE * scale;
      const h = img.height * BLOCK_SCALE * scale;
      const ctx = this.ctx;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, c * S + (S - w) / 2, (r + 1) * S - h, w, h);
      ctx.globalAlpha = 1;
    }

    drawCharacter(p, x, y, alpha = 1, forceIdle = false) {
      const sheet = this.img[`char_${p.char}`];
      if (!sheet) return;
      const moving = p.moving && !forceIdle;
      const col = moving ? Math.floor(p.animT * 10) % 5 : 2;
      const row = DIR_ROW[p.dir] ?? 0;
      const w = FRAME_W * 0.9;
      const h = FRAME_H * 0.9;
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(sheet, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, x - w / 2, y - h + 6, w, h);
      this.ctx.globalAlpha = 1;
    }

    // ---------- main draw ----------
    draw(view, opts = {}) {
      const ctx = this.ctx;
      const key = view.map.key;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, MAP_W, MAP_H);
      ctx.clip();
      ctx.drawImage(this.floorCanvas(key), 0, 0);

      this.drawItems(view);
      this.drawFlames(view);

      // Row by row so taller sprites overlap the row above (pseudo 3D).
      const byRow = Array.from({ length: C.ROWS }, () => []);
      for (const p of view.players) {
        const r = Math.min(C.ROWS - 1, Math.max(0, Math.floor(p.y)));
        byRow[r].push(p);
      }
      for (let r = 0; r < C.ROWS; r++) {
        for (let c = 0; c < C.COLS; c++) {
          const i = r * C.COLS + c;
          const tile = view.map.tiles[i];
          if (tile === T.FLOOR) continue;
          const t = view.breaking.get(i);
          if (t != null) this.drawBlock(key, tile, c, r, t / C.BREAK_TIME, 0.8 + 0.2 * (t / C.BREAK_TIME));
          else this.drawBlock(key, tile, c, r);
        }
        for (const b of view.bombs) if (b.r === r) this.drawBomb(view, b);
        byRow[r].sort((a, b) => a.y - b.y).forEach((p) => this.drawPlayer(view, p, opts));
      }

      this.drawEffects(opts.dt || 0);
      this.drawTimer(view);
      this.drawBanner(view);
      ctx.restore();
      this.drawHud(view, opts);
    }

    drawItems(view) {
      const bob = Math.sin(view.time * 5) * 3;
      const frame = Math.floor(view.time * 6) % 4;
      for (let i = 0; i < view.map.items.length; i++) {
        const type = view.map.items[i];
        if (!type) continue;
        const img = this.img[ITEM_SPRITE[type]];
        if (!img) continue;
        const c = i % C.COLS;
        const r = Math.floor(i / C.COLS);
        const fw = img.width / 4;
        const w = S * 0.6;
        const h = (img.height / fw) * w;
        const x = c * S + (S - w) / 2;
        const y = (r + 1) * S - h - 4 + bob;
        this.ctx.fillStyle = 'rgba(0,0,0,0.25)';
        this.ctx.beginPath();
        this.ctx.ellipse(c * S + S / 2, (r + 1) * S - 5, w * 0.4, 4, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.drawImage(img, frame * fw, 0, fw, img.height, x, y, w, h);
      }
    }

    drawFlames(view) {
      const img = this.img.explosion;
      if (!img) return;
      const fw = img.width / 10;
      const size = S * 1.2;
      for (const f of view.flames) {
        const frame = Math.min(9, Math.floor((1 - f.t / C.FLAME_TIME) * 10));
        this.ctx.drawImage(img, frame * fw, 0, fw, img.height, f.c * S + (S - size) / 2, f.r * S + (S - size) / 2, size, size);
      }
    }

    drawBomb(view, b) {
      const owner = view.players[b.owner];
      const img = this.img[`bubble${owner ? owner.slot % 3 : 0}`];
      if (!img) return;
      const fw = img.width / 3;
      const frame = Math.floor((view.time - b.born) * 6) % 3;
      const pulse = 1 + Math.sin((view.time - b.born) * 10) * 0.04;
      const w = S * 1.2 * pulse;
      const h = (img.height / fw) * w;
      this.ctx.drawImage(img, frame * fw, 0, fw, img.height, b.c * S + (S - w) / 2, (b.r + 1) * S - h + 6, w, h);
    }

    drawPlayer(view, p, opts) {
      const ctx = this.ctx;
      const x = p.x * S;
      const y = p.y * S + S / 2 - 4; // feet
      if (p.state === 'dead') {
        if (p.deadTimer > 1.6) return;
        const bubble = this.img.trapped;
        if (p.deadTimer < 0.35 && bubble) {
          const k = p.deadTimer / 0.35;
          const size = S * 1.5 * (1 + k * 0.6);
          ctx.globalAlpha = 1 - k;
          ctx.drawImage(bubble, 0, 0, 100, 100, x - size / 2, y - size * 0.72, size, size);
          ctx.globalAlpha = 1;
        }
        const fade = Math.max(0, 1 - Math.max(0, p.deadTimer - 0.35) / 1.2);
        ctx.save();
        ctx.filter = 'grayscale(1) brightness(1.2)';
        this.drawCharacter({ ...p, dir: 'down' }, x, y - Math.max(0, p.deadTimer - 0.35) * 30, fade * 0.8, true);
        ctx.restore();
        return;
      }

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (p.state === 'trapped') {
        const bubble = this.img.trapped;
        const blink = p.trapTimer < 1.5 && Math.floor(p.trapTimer * 8) % 2 === 0;
        this.drawCharacter(p, x, y - 6, 1, true);
        if (bubble && !blink) {
          const frame = Math.floor(p.animT * 8) % 16;
          const size = S * 1.5;
          ctx.globalAlpha = 0.85;
          ctx.drawImage(bubble, (frame % 4) * 100, Math.floor(frame / 4) * 100, 100, 100, x - size / 2, y - size * 0.95, size, size);
          ctx.globalAlpha = 1;
        }
      } else {
        const flicker = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
        this.drawCharacter(p, x, y, flicker ? 0.35 : 1);
      }

      // name tag
      const tagY = y - FRAME_H * 0.9 - 2;
      const label = opts.localIds && opts.localIds.includes(p.id) ? `▼ ${p.name}` : p.name;
      ctx.font = 'bold 11px "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(label, x, tagY);
      ctx.fillStyle = BOOM.PLAYER_COLORS[p.slot];
      ctx.fillText(label, x, tagY);
    }

    drawEffects(dt) {
      const img = this.img.sparkle;
      for (const fx of this.effects) fx.t += dt;
      this.effects = this.effects.filter((fx) => fx.t < 0.5);
      if (!img) return;
      const fw = img.width / 6;
      for (const fx of this.effects) {
        const frame = Math.min(5, Math.floor((fx.t / 0.5) * 6));
        const size = S * 1.4;
        this.ctx.drawImage(img, frame * fw, 0, fw, img.height, fx.x * S - size / 2, fx.y * S - size * 0.75, size, size);
      }
    }

    drawTimer(view) {
      const ctx = this.ctx;
      const border = this.img.timeBorder;
      const x = MAP_W / 2;
      const w = 125;
      const h = 42;
      if (border) ctx.drawImage(border, x - w / 2, 2, w, h);
      const secs = Math.max(0, Math.ceil(view.roundTime));
      const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      ctx.font = 'bold 20px "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = secs <= 30 && view.phase === 'play' ? '#ff5252' : '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(text, x, 24);
      ctx.fillText(text, x, 24);
    }

    drawBanner(view) {
      let text = null;
      let k = 0;
      if (view.phase === 'ready') {
        text = BOOM.t('game.ready');
        k = 1;
      } else if (view.phase === 'play' && C.ROUND_TIME - view.roundTime < 0.8) {
        text = BOOM.t('game.go');
        k = 1 - (C.ROUND_TIME - view.roundTime) / 0.8;
      }
      if (!text) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.translate(MAP_W / 2, MAP_H / 2);
      const s = view.phase === 'ready' ? 1 + Math.sin(view.time * 8) * 0.04 : 1 + (1 - k) * 0.5;
      ctx.scale(s, s);
      ctx.font = '900 64px "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#0d47a1';
      ctx.strokeText(text, 0, 0);
      const grad = ctx.createLinearGradient(0, -30, 0, 30);
      grad.addColorStop(0, '#fff59d');
      grad.addColorStop(1, '#ffb300');
      ctx.fillStyle = grad;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    // ---------- side HUD (original layout: 4 player cards to the right of the map) ----------
    drawHud(view, opts) {
      const ctx = this.ctx;
      const x0 = MAP_W;
      const w = C.HUD_WIDTH;
      const bg = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      bg.addColorStop(0, '#12305a');
      bg.addColorStop(1, '#0b1f3d');
      ctx.fillStyle = bg;
      ctx.fillRect(x0, 0, w, MAP_H);

      const logo = this.img.logo;
      if (logo) ctx.drawImage(logo, x0 + 8, 6, 39, 36);
      ctx.font = '900 18px "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText('BOOM ONLINE', x0 + 52, 20);
      ctx.font = '12px "Segoe UI", Tahoma, sans-serif';
      ctx.fillStyle = '#9fc3ff';
      ctx.fillText(opts.subtitle || '', x0 + 52, 36);

      const cardH = 130;
      for (let slot = 0; slot < C.MAX_PLAYERS; slot++) {
        const y = 52 + slot * (cardH + 8);
        const p = view.players.find((q) => q.slot === slot);
        this.drawCard(p, slot, x0 + 8, y, w - 16, cardH, opts);
      }

      ctx.font = '11px "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7f9cc7';
      ctx.fillText(opts.hint || 'Esc: Pause', x0 + w / 2, MAP_H - 12);
    }

    drawCard(p, slot, x, y, w, h, opts) {
      const ctx = this.ctx;
      const color = BOOM.PLAYER_COLORS[slot];
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = p ? color : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 10);
      ctx.fill();
      ctx.stroke();
      if (!p) {
        ctx.font = '13px "Segoe UI", Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText(BOOM.t('game.slot'), x + w / 2, y + h / 2);
        return;
      }

      // avatar: idle "down" frame of the character sheet
      ctx.fillStyle = color + '33';
      ctx.beginPath();
      ctx.roundRect(x + 8, y + 8, 56, 64, 8);
      ctx.fill();
      const sheet = this.img[`char_${p.char}`];
      if (sheet) {
        ctx.save();
        if (p.state === 'dead') ctx.filter = 'grayscale(1)';
        ctx.drawImage(sheet, 2 * FRAME_W, 0, FRAME_W, FRAME_H, x + 9, y + 8, 54, 66);
        ctx.restore();
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 14px "Segoe UI", Tahoma, sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(p.name.slice(0, 12), x + 72, y + 20);
      ctx.font = '11px "Segoe UI", Tahoma, sans-serif';
      ctx.fillStyle = '#b8cbe8';
      ctx.fillText(`${BOOM.t('room.team')} ${p.team + 1}`, x + 72, y + 38);
      const wins = opts.wins ? opts.wins[slot] || 0 : 0;
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(`★ ${wins}`, x + 130, y + 38);

      let status = '';
      let statusColor = '#81c784';
      if (p.state === 'trapped') {
        status = `${BOOM.t('game.trapped')} ${Math.max(0, p.trapTimer).toFixed(1)}s`;
        statusColor = '#4fc3f7';
      } else if (p.state === 'dead') {
        status = BOOM.t('game.dead');
        statusColor = '#e57373';
      }
      if (status) {
        ctx.font = 'bold 11px "Segoe UI", Tahoma, sans-serif';
        ctx.fillStyle = statusColor;
        ctx.fillText(status, x + 72, y + 56);
      }

      // item stats
      const stats = [
        ['item_bombs', p.maxBombs],
        ['item_bombsizes', p.power],
        ['item_shoes', p.speedLevel + 1],
      ];
      stats.forEach(([sprite, value], i) => {
        const sx = x + 10 + i * 56;
        const sy = y + 84;
        const img = this.img[sprite];
        if (img) {
          const fw = img.width / 4;
          const iw = 22;
          const ih = (img.height / fw) * iw;
          ctx.drawImage(img, 0, 0, fw, img.height, sx, sy + 32 - ih, iw, ih);
        }
        ctx.font = 'bold 14px "Segoe UI", Tahoma, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`×${value}`, sx + 25, sy + 20);
      });
    }
  };
})();
