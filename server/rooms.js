/* Lobby, rooms and the authoritative game loop for online matches. */
const BOOM = require('./load-shared');

const C = BOOM.CONFIG;
const TICK = 1 / 60;
const SNAPSHOT_EVERY = 2; // ticks -> 30 snapshots/sec
const MAX_NAME = 12;
const MAX_CHAT = 120;
const CHAT_HISTORY = 40;

const clients = new Map(); // id -> client
const rooms = new Map(); // id -> room
let nextClientId = 1;

const clean = (text, max) =>
  String(text ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, max);

function send(client, msg) {
  if (client.ws.readyState === 1) client.ws.send(JSON.stringify(msg));
}

function roomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  while (rooms.has(code));
  return code;
}

const emptySlot = (i) => ({ type: 'empty', clientId: null, name: '', char: BOOM.CHARACTERS[i], team: i, ready: false, wins: 0 });

function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    map: room.map,
    status: room.status,
    slots: room.slots.map(({ type, clientId, name, char, team, ready, wins }) => ({ type, clientId, name, char, team, ready, wins })),
  };
}

function roomSummary(room) {
  const host = clients.get(room.hostId);
  return {
    id: room.id,
    name: room.name,
    host: host ? host.name : '',
    map: room.map,
    status: room.status,
    count: room.slots.filter((s) => s.type !== 'empty').length,
  };
}

function broadcastRoom(room) {
  const state = publicRoom(room);
  for (const s of room.slots) {
    if (s.type === 'human') send(clients.get(s.clientId), { t: 'room', room: state });
  }
}

function broadcastLobby() {
  const list = [...rooms.values()].map(roomSummary);
  for (const c of clients.values()) if (!c.roomId) send(c, { t: 'rooms', rooms: list });
}

function chat(room, msg) {
  const entry = { ...msg, time: Date.now() };
  room.chat.push(entry);
  if (room.chat.length > CHAT_HISTORY) room.chat.shift();
  for (const s of room.slots) if (s.type === 'human') send(clients.get(s.clientId), { t: 'chat', msg: entry });
}

function slotOf(room, clientId) {
  return room.slots.findIndex((s) => s.type === 'human' && s.clientId === clientId);
}

// ---------- room lifecycle ----------
function createRoom(client, name) {
  const room = {
    id: roomCode(),
    name: clean(name, 24) || `Room ${client.name}`,
    hostId: client.id,
    map: BOOM.MAPS[2],
    status: 'waiting',
    slots: [0, 1, 2, 3].map(emptySlot),
    chat: [],
    game: null,
    loop: null,
  };
  rooms.set(room.id, room);
  joinRoom(client, room.id);
}

function joinRoom(client, id) {
  const room = rooms.get(String(id).toUpperCase());
  if (!room) return send(client, { t: 'error', key: 'online.error.room_missing' });
  if (client.roomId === room.id) return;
  if (room.status !== 'waiting') return send(client, { t: 'error', key: 'room.join.playing' });
  const free = room.slots.findIndex((s) => s.type === 'empty');
  if (free < 0) return send(client, { t: 'error', key: 'room.join.full' });
  leaveRoom(client);
  Object.assign(room.slots[free], { type: 'human', clientId: client.id, name: client.name, ready: false, wins: 0 });
  client.roomId = room.id;
  send(client, { t: 'joined', room: publicRoom(room), you: client.id, chat: room.chat });
  chat(room, { system: 'online.chat.joined', name: client.name });
  broadcastRoom(room);
  broadcastLobby();
}

function leaveRoom(client) {
  const room = rooms.get(client.roomId);
  client.roomId = null;
  if (!room) return;
  const i = slotOf(room, client.id);
  if (i >= 0) {
    room.slots[i] = emptySlot(i);
    if (room.game) {
      const p = room.game.players.find((q) => q.ctrl === client.id);
      if (p) room.game.removePlayer(p.id);
    }
  }
  const humans = room.slots.filter((s) => s.type === 'human');
  if (!humans.length) {
    clearInterval(room.loop);
    rooms.delete(room.id);
  } else {
    if (room.hostId === client.id) room.hostId = humans[0].clientId;
    chat(room, { system: 'online.chat.left', name: client.name });
    broadcastRoom(room);
  }
  broadcastLobby();
}

function editSlot(client, room, msg) {
  const i = Number(msg.slot);
  const slot = room.slots[i];
  if (!slot || room.status !== 'waiting') return;
  const isHost = room.hostId === client.id;
  const own = slot.type === 'human' && slot.clientId === client.id;
  if (!own && !(isHost && slot.type === 'bot')) return;
  if (BOOM.CHARACTERS.includes(msg.char)) slot.char = msg.char;
  if (Number.isInteger(msg.team) && msg.team >= 0 && msg.team < C.MAX_PLAYERS) slot.team = msg.team;
  broadcastRoom(room);
}

function setSlotType(client, room, msg) {
  const slot = room.slots[Number(msg.slot)];
  if (!slot || room.hostId !== client.id || room.status !== 'waiting' || slot.type === 'human') return;
  slot.type = msg.type === 'bot' ? 'bot' : 'empty';
  slot.name = slot.type === 'bot' ? 'Bot' : '';
  broadcastRoom(room);
  broadcastLobby();
}

// ---------- matches ----------
function startGame(client, room) {
  if (room.hostId !== client.id || room.status !== 'waiting') return;
  const taken = room.slots.map((s, i) => ({ ...s, slot: i })).filter((s) => s.type !== 'empty');
  if (taken.length < 2 || new Set(taken.map((s) => s.team)).size < 2) {
    return send(client, { t: 'error', key: 'online.error.need_players' });
  }
  if (taken.some((s) => s.type === 'human' && s.clientId !== room.hostId && !s.ready)) {
    return send(client, { t: 'error', key: 'online.error.not_ready' });
  }

  const setup = {
    map: room.map,
    players: taken.map((s) => ({
      slot: s.slot,
      name: s.type === 'bot' ? `Bot ${s.slot + 1}` : s.name,
      char: s.char,
      team: s.team,
      kind: s.type === 'bot' ? 'bot' : 'human',
      ctrl: s.type === 'human' ? s.clientId : null,
    })),
  };
  const game = new BOOM.Game(setup);
  room.game = game;
  room.status = 'playing';
  room.inputs = new Map(); // clientId -> {dx, dy, bomb}
  for (const p of game.players) {
    if (!p.ctrl) continue;
    room.inputs.set(p.ctrl, { dx: 0, dy: 0, bomb: false });
    send(clients.get(p.ctrl), { t: 'start', setup, you: p.id });
  }
  broadcastRoom(room);
  broadcastLobby();

  let tick = 0;
  let sentVersion = -1;
  const getCommand = (p) => {
    const input = room.inputs.get(p.ctrl);
    if (!input) return null;
    const cmd = { dx: input.dx, dy: input.dy, bomb: input.bomb };
    input.bomb = false;
    return cmd;
  };
  room.loop = setInterval(() => {
    game.update(TICK, getCommand);
    if (++tick % SNAPSHOT_EVERY) return;
    const withMap = game.mapVersion !== sentVersion;
    sentVersion = game.mapVersion;
    const snap = JSON.stringify({ t: 'snap', s: game.snapshot(withMap) });
    game.events.length = 0;
    for (const p of game.players) {
      const c = p.ctrl && clients.get(p.ctrl);
      if (c && c.roomId === room.id && c.ws.readyState === 1) c.ws.send(snap);
    }
    if (game.phase === 'end' && game.phaseTimer > C.RESULT_DELAY) endGame(room);
  }, TICK * 1000);
}

function endGame(room) {
  clearInterval(room.loop);
  room.loop = null;
  const { game } = room;
  room.game = null;
  room.status = 'waiting';
  for (const p of game.players) {
    const slot = room.slots[p.slot];
    if (game.winnerTeam !== null && p.team === game.winnerTeam && slot.type !== 'empty') slot.wins++;
  }
  for (const s of room.slots) s.ready = false;
  broadcastRoom(room);
  broadcastLobby();
}

// ---------- message router ----------
const handlers = {
  hello(client, msg) {
    client.name = clean(msg.name, MAX_NAME) || `Guest${client.id}`;
    send(client, { t: 'welcome', you: client.id, name: client.name });
    send(client, { t: 'rooms', rooms: [...rooms.values()].map(roomSummary) });
  },
  list(client) {
    send(client, { t: 'rooms', rooms: [...rooms.values()].map(roomSummary) });
  },
  create(client, msg) {
    createRoom(client, msg.name);
  },
  join(client, msg) {
    joinRoom(client, msg.id);
  },
  leave(client) {
    leaveRoom(client);
    handlers.list(client);
  },
  slot(client, msg, room) {
    if (room) editSlot(client, room, msg);
  },
  slotType(client, msg, room) {
    if (room) setSlotType(client, room, msg);
  },
  map(client, msg, room) {
    if (!room || room.hostId !== client.id || room.status !== 'waiting' || !BOOM.MAPS.includes(msg.map)) return;
    room.map = msg.map;
    broadcastRoom(room);
    broadcastLobby();
  },
  ready(client, msg, room) {
    const i = room ? slotOf(room, client.id) : -1;
    if (i < 0 || room.status !== 'waiting') return;
    room.slots[i].ready = !!msg.ready;
    broadcastRoom(room);
  },
  chat(client, msg, room) {
    const text = clean(msg.text, MAX_CHAT);
    if (room && text) chat(room, { name: client.name, text });
  },
  start(client, msg, room) {
    if (room) startGame(client, room);
  },
  input(client, msg, room) {
    const input = room && room.inputs && room.inputs.get(client.id);
    if (!input) return;
    input.dx = Math.sign(Number(msg.dx) || 0);
    input.dy = input.dx ? 0 : Math.sign(Number(msg.dy) || 0);
    if (msg.bomb) input.bomb = true;

    if (room.game && typeof msg.x === 'number' && typeof msg.y === 'number') {
      const p = room.game.players.find((q) => q.ctrl === client.id);
      if (p && p.state === 'alive') {
        const dist = Math.hypot(p.x - msg.x, p.y - msg.y);
        if (dist < 1.1 && room.game.isWalkable(Math.floor(msg.x), Math.floor(msg.y), p)) {
          p.x = msg.x;
          p.y = msg.y;
        }
      }
    }
  },
};

function connect(ws) {
  const client = { id: nextClientId++, ws, name: 'Guest', roomId: null };
  clients.set(client.id, client);
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const handler = msg && Object.hasOwn(handlers, msg.t) && handlers[msg.t];
    if (handler) handler(client, msg, rooms.get(client.roomId));
  });
  ws.on('close', () => {
    leaveRoom(client);
    clients.delete(client.id);
  });
}

module.exports = { connect };
