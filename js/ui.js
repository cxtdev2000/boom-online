/* Screen switching, stage scaling, shared click/hover sounds and the simple menu screens. */
(function () {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const actions = {};
  const enterHooks = {};
  let toastTimer = 0;

  function fitStage() {
    const scale = Math.min(innerWidth / stage.offsetWidth, innerHeight / stage.offsetHeight);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  addEventListener('resize', fitStage);
  fitStage();

  BOOM.UI = {
    $,
    current: 'loading',

    show(name, arg) {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
      this.current = name;
      BOOM.Input.setEnabled(name === 'game');
      if (enterHooks[name]) enterHooks[name](arg);
    },
    onEnter(name, fn) {
      enterHooks[name] = fn;
    },
    on(action, fn) {
      actions[action] = fn;
    },

    toast(text, ms = 2600) {
      const el = $('toast');
      el.textContent = text;
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.hidden = true), ms);
    },

    /** Create an element with props/children in one call. */
    el(tag, props = {}, ...children) {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
      }
      node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
      return node;
    },
  };

  // Delegated clicks: play the original UI click and run the button's data-action.
  stage.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    BOOM.Audio.play('click');
    const fn = actions[btn.dataset.action];
    if (fn) fn(btn, e);
  });
  stage.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.btn-game, .mode-card, .arrow-btn, .btn-back');
    if (btn && !btn.contains(e.relatedTarget)) BOOM.Audio.play('hover');
  });

  // ---------- welcome / home / mode ----------
  const UI = BOOM.UI;
  UI.onEnter('welcome', () => BOOM.Audio.music('welcome'));
  UI.onEnter('home', () => BOOM.Audio.music('menu'));
  UI.onEnter('mode', () => BOOM.Audio.music('menu'));

  UI.on('welcome-start', () => {
    BOOM.Audio.unlock();
    UI.show('home');
  });
  UI.on('home-start', () => UI.show('mode'));
  UI.on('home-setting', () => UI.show('settings', 'home'));
  UI.on('home-quit', () => {
    BOOM.Audio.play('bye');
    UI.toast(BOOM.t('home.bye'));
    UI.show('welcome');
  });
  UI.on('go-home', () => UI.show('home'));
  UI.on('mode-1p', () => BOOM.Room.openOffline('1p'));
  UI.on('mode-2p', () => BOOM.Room.openOffline('2p'));
  UI.on('mode-online', () => UI.show('lobby'));
})();
