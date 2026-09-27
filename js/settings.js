/* Persistent player preferences (audio, language, name, key bindings) stored in localStorage. */
(function () {
  const STORAGE_KEY = 'boom.settings';

  const DEFAULT_KEYS = {
    p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', bomb: 'Space' },
    p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', bomb: 'Enter' },
  };

  const DEFAULTS = {
    lang: 'vi',
    master: 0.8,
    music: true,
    musicVolume: 0.6,
    sfx: true,
    sfxVolume: 0.9,
    name: 'Guest',
    server: '',
    keys: DEFAULT_KEYS,
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      return {
        ...DEFAULTS,
        ...saved,
        keys: {
          p1: { ...DEFAULT_KEYS.p1, ...(saved.keys && saved.keys.p1) },
          p2: { ...DEFAULT_KEYS.p2, ...(saved.keys && saved.keys.p2) },
        },
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  const listeners = new Set();

  BOOM.Settings = {
    data: load(),
    DEFAULT_KEYS,
    set(patch) {
      Object.assign(this.data, patch);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch {
        // private mode / file:// quota: keep settings for this session only
      }
      listeners.forEach((fn) => fn(this.data, patch));
    },
    onChange(fn) {
      listeners.add(fn);
    },
  };
})();
