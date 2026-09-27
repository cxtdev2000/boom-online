# Real assets + complete game + online

Status: done

## Goal
Rebuild Boom with the original sprites/sounds from nghlong3004/boom-online, full screen flow, and real online play.

## Phases
1. Assets: copy `client/src/main/resources` into `assets/`; embed `map_data/*.txt` as `js/maps-data.js` (file:// cannot fetch).
2. Shared sim (`config`, `map`, `game`, `ai`): 21x13 maps from data, stone/brick/gift tiles, 3 items (bomb/fire/shoe), bubble trap, event queue instead of direct sound calls. Must run in Node (no DOM).
3. Client: asset loader, audio (music per screen/map, SFX), renderer with sprite sheets + in-canvas HUD, screens: loading, welcome, home, mode, room (offline), lobby + room (online), settings (volumes, language, key bindings), pause, result.
4. Server: `server/index.js` serves static files + WebSocket (`ws`): rooms, chat, ready, host map/bots, authoritative 60Hz sim, 30Hz snapshots.

## Sprite facts (from Java client)
- player sheet 290x285: 5 cols x 4 rows of 58x71; rows down/left/right/up; idle frame 2
- bomber_deads 400x400: 100x100 bubble frames (trapped)
- explosion 1022x103: 10 frames 102x103
- custom_bubble_10x 219x84: 3 frames 73x84
- items 128x~50: 4 frames 32 wide (bomb, bombsize, shoe)
- tiles 64x89 (drawn bottom-aligned, 48 wide); floor 128x128 = 2x2 tiles

## Acceptance
- Offline 1P vs bots and 2P local work from file:// and via server
- Online: 2+ browsers join a room, chat, pick chars/map, play synced round
- Settings persist (localStorage); vi/en switch
