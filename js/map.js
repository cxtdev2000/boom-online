/* Builds a playable map from the embedded map data and rolls the items hidden in breakable blocks. */
(function () {
  const C = BOOM.CONFIG;
  const T = BOOM.TILE;

  function rollItem() {
    let roll = Math.random();
    for (const item of BOOM.ITEMS) {
      roll -= item.rate;
      if (roll < 0) return item.type;
    }
    return BOOM.ITEMS[0].type;
  }

  /** @returns {{key: string, tiles: Uint8Array, hidden: Array, items: Array}} */
  BOOM.createMap = function (key) {
    const rows = BOOM.MAP_DATA[key] || BOOM.MAP_DATA[BOOM.MAPS[0]];
    const n = C.COLS * C.ROWS;
    const tiles = new Uint8Array(n);
    const hidden = new Array(n).fill(null);
    for (let r = 0; r < C.ROWS; r++) {
      for (let c = 0; c < C.COLS; c++) {
        const i = r * C.COLS + c;
        tiles[i] = Number(rows[r][c]);
        if (tiles[i] === T.GIFT || (tiles[i] === T.BRICK && Math.random() < C.BRICK_ITEM_CHANCE)) hidden[i] = rollItem();
      }
    }
    return { key, tiles, hidden, items: new Array(n).fill(null) };
  };
})();
