/*
 * Music + sound effects using the original .wav files. HTMLAudio is used (not WebAudio decoding)
 * so it also works when index.html is opened straight from disk.
 */
(function () {
  const ROOT = 'assets/sounds/';
  const SFX_POOL = 4;

  const MUSIC = {
    welcome: 'background',
    menu: 'soundMenu',
    online: 'online',
    game: 'soundGame',
    desert_mode: 'desert',
    land_mode: 'land',
    town_mode: 'town',
    underwater_mode: 'underwater',
    xmas_mode: 'xmas',
  };

  // Game events and UI actions -> sound file
  const SFX = {
    place: 'set_boom',
    explode: 'boom_bang',
    explode2: 'bang_bang',
    item: 'eat_item',
    trap: 'touch',
    kill: 'die',
    rescue: 'item',
    start: 'start',
    win: 'win',
    lose: 'lose',
    click: 'click',
    hover: 'move',
    bye: 'bye_bye',
  };

  const pools = {};
  let music = null;
  let musicFile = null;
  let musicKey = null;
  let unlocked = false;

  const S = () => BOOM.Settings.data;
  const musicVolume = () => (S().music ? S().master * S().musicVolume : 0);
  const sfxVolume = () => (S().sfx ? S().master * S().sfxVolume : 0);

  function pool(name) {
    if (!pools[name]) {
      pools[name] = { i: 0, list: Array.from({ length: SFX_POOL }, () => new Audio(ROOT + name + '.wav')) };
      for (const a of pools[name].list) a.preload = 'auto';
    }
    return pools[name];
  }

  BOOM.Audio = {
    /** Must be called from a user gesture (browsers block autoplay until then). */
    unlock() {
      if (unlocked) return;
      unlocked = true;
      for (const name of Object.values(SFX)) pool(name);
      if (musicKey) this.music(musicKey, true);
    },

    music(key, force = false) {
      const file = MUSIC[key] || MUSIC.game;
      if (!force && key === musicKey && music) return;
      musicKey = key;
      if (!unlocked) return;
      if (music && musicFile === file) return;
      if (music) music.pause();
      music = new Audio(ROOT + file + '.wav');
      musicFile = file;
      music.loop = true;
      music.volume = musicVolume();
      if (music.volume > 0) music.play().catch(() => {});
    },

    stopMusic() {
      if (music) music.pause();
      music = null;
      musicFile = null;
      musicKey = null;
    },

    play(name) {
      const vol = sfxVolume();
      if (!unlocked || vol <= 0 || !SFX[name]) return;
      const p = pool(SFX[name]);
      const a = p.list[p.i++ % SFX_POOL];
      a.volume = vol;
      a.currentTime = 0;
      a.play().catch(() => {});
    },

    /** Re-apply volumes after settings change. */
    refresh() {
      if (!music) return;
      music.volume = musicVolume();
      if (music.volume > 0 && music.paused) music.play().catch(() => {});
      else if (music.volume === 0) music.pause();
    },
  };

  BOOM.Settings.onChange(() => BOOM.Audio.refresh());
})();
