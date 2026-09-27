/* Image preloading for the canvas renderer. Paths mirror the original client's resources folder. */
(function () {
  const ROOT = 'assets/images/';

  function manifest() {
    const list = {
      welcome: 'background/welcome.jpg',
      home: 'background/home.jpg',
      setting: 'background/setting.jpg',
      logo: 'tile_image.png',
      explosion: 'boom/explosion.png',
      bubble0: 'boom/custom_bubble_100.png',
      bubble1: 'boom/custom_bubble_101.png',
      bubble2: 'boom/custom_bubble_102.png',
      trapped: 'player/bomber_deads.png',
      sparkle: 'items/move_1.png',
      item_bombs: 'items/item_bombs.png',
      item_bombsizes: 'items/item_bombsizes.png',
      item_shoes: 'items/item_shoes.png',
      timeBorder: 'map/time_border.png',
      pauseMenu: 'buttons/pause_menu.png',
      soundButton: 'buttons/sound_button.png',
      urmButtons: 'buttons/urm_buttons.png',
      volumeButtons: 'buttons/volume_buttons.png',
    };
    for (const ch of BOOM.CHARACTERS) {
      list[`char_${ch}`] = `player/${ch}.png`;
      list[`avatar_${ch}`] = `player/${ch}_avatar.png`;
    }
    for (const m of BOOM.MAPS) {
      for (const part of ['floor', 'brick', 'gift_box', 'stone']) list[`${m}_${part}`] = `map/${m}/${part}.png`;
      list[`${m}_avatar`] = `map/${m}_avatar.jpg`;
    }
    return list;
  }

  BOOM.Assets = {
    img: {},
    url: (rel) => ROOT + rel,

    /** Loads every image; `onProgress(done, total)` drives the loading bar. Missing files are skipped. */
    load(onProgress) {
      const entries = Object.entries(manifest());
      let done = 0;
      return Promise.all(
        entries.map(
          ([key, rel]) =>
            new Promise((resolve) => {
              const img = new Image();
              const finish = () => {
                onProgress(++done, entries.length);
                resolve();
              };
              img.onload = () => {
                this.img[key] = img;
                finish();
              };
              img.onerror = finish;
              img.src = ROOT + rel;
            })
        )
      );
    },
  };
})();
