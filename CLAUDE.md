# Boom Online (Crazy Arcade clone)

- Vanilla JS classic scripts on a global `BOOM` namespace; no bundler, no build step. Script order in `index.html` matters.
- Shared simulation (`js/config.js`, `maps-data.js`, `map.js`, `game.js`, `ai.js`) must stay DOM-free: the Node server `require`s it (`server/load-shared.js`) and runs it authoritatively.
- `js/maps-data.js` is generated from `assets/map_data`; assets come from github.com/nghlong3004/boom-online (Nexon/VNG originals, personal/learning use only).
- Online: `pnpm install && pnpm start` (HTTP + WebSocket `/ws` on port 3000). Opening `index.html` via file:// is offline-only.
- Renderer draws any Game-shaped view; online clients use `BOOM.NetView` built from server snapshots.
- UI strings go through `BOOM.t` / `data-i18n` (vi + en in `js/i18n.js`); theme tokens are the CSS variables in `style.css`.
- Lint gate: `pnpm lint` (`node --check` over js/, server/, scripts/).
