/* Loads the browser-side simulation scripts (config, maps, rules, AI) into Node's global scope. */
const path = require('path');

global.BOOM = globalThis.BOOM = {};

for (const file of ['config.js', 'maps-data.js', 'map.js', 'game.js', 'ai.js']) {
  require(path.join(__dirname, '..', 'js', file));
}

module.exports = globalThis.BOOM;
