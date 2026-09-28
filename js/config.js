/* Global namespace and tunable constants. Shared by the browser client and the Node server. */
globalThis.BOOM = {};

BOOM.CONFIG = {
  DEFAULT_SERVER: 'boom-online-t8cx.onrender.com', // Public Render WebSocket backend
  COLS: 21,
  ROWS: 13,
  TILE: 48,
  HUD_WIDTH: 192, // right-hand player panel, 4 tiles wide like the original client
  BOMB_FUSE: 2.6, // seconds before a water balloon bursts
  FLAME_TIME: 0.6, // seconds a burst stays deadly (explosion.png plays over this time)
  BREAK_TIME: 0.35, // seconds a brick takes to vanish
  TRAP_TIME: 4.5, // seconds a player survives inside a bubble
  TRAP_SPEED: 0.7, // tiles/sec while trapped
  RESCUE_INVULN: 1.2, // seconds of protection after leaving a bubble
  BASE_SPEED: 3.0, // tiles/sec
  SPEED_STEP: 0.5,
  MAX_SPEED_LEVEL: 6,
  START_BOMBS: 1,
  MAX_BOMBS: 8,
  START_POWER: 1,
  MAX_POWER: 8,
  BRICK_ITEM_CHANCE: 0.4, // gift boxes always drop an item
  ROUND_TIME: 180,
  READY_TIME: 2,
  RESULT_DELAY: 1.2, // seconds between the last pop and the result panel
  MAX_PLAYERS: 4,
};

// Tile codes used by assets/map_data/*.txt
BOOM.TILE = { STONE: 0, FLOOR: 1, BRICK: 2, GIFT: 3 };

BOOM.ITEMS = [
  { type: 'bomb', rate: 0.4, sprite: 'item_bombs' },
  { type: 'power', rate: 0.35, sprite: 'item_bombsizes' },
  { type: 'speed', rate: 0.25, sprite: 'item_shoes' },
];

BOOM.MAPS = ['desert_mode', 'land_mode', 'town_mode', 'underwater_mode', 'xmas_mode'];
BOOM.CHARACTERS = ['boz', 'evie', 'ike', 'plunk'];

BOOM.SPAWNS = [
  [1, 1],
  [19, 11],
  [19, 1],
  [1, 11],
];

// Slot colors from the original HUD (PlayingConstant.PLAYER_COLORS)
BOOM.PLAYER_COLORS = ['#4285f4', '#ea4335', '#34a853', '#fbbc05'];
