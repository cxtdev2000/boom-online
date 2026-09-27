/* Settings screen: audio toggles/sliders, language, display name and key rebinding. */
(function () {
  const { $, el } = BOOM.UI;
  const UI = BOOM.UI;
  const S = BOOM.Settings;
  const t = (...a) => BOOM.t(...a);
  const ACTIONS = ['up', 'down', 'left', 'right', 'bomb'];

  let returnTo = 'home';
  let listening = null; // { set, action, button }

  function renderKeys() {
    const keys = S.data.keys;
    const cell = (set, action) =>
      el('td', {}, el('button', { class: 'key-btn', dataset: { set, key: action } }, BOOM.keyLabel(keys[set][action])));
    $('keys-table').replaceChildren(
      el('tr', {}, el('th', {}), el('th', {}, 'P1'), el('th', {}, 'P2')),
      ...ACTIONS.map((a) => el('tr', {}, el('th', {}, t(`key.${a}`)), cell('p1', a), cell('p2', a)))
    );
  }

  function renderAll() {
    const d = S.data;
    $('set-music').checked = d.music;
    $('set-sfx').checked = d.sfx;
    $('set-music-volume').value = Math.round(d.musicVolume * 100);
    $('set-sfx-volume').value = Math.round(d.sfxVolume * 100);
    $('set-master').value = Math.round(d.master * 100);
    $('set-name').value = d.name;
    document.querySelectorAll('#set-lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === d.lang));
    renderKeys();
  }

  UI.onEnter('settings', (from) => {
    returnTo = from || 'home';
    BOOM.Audio.music('menu');
    renderAll();
  });

  $('set-music').addEventListener('change', (e) => S.set({ music: e.target.checked }));
  $('set-sfx').addEventListener('change', (e) => S.set({ sfx: e.target.checked }));
  $('set-music-volume').addEventListener('input', (e) => S.set({ musicVolume: e.target.value / 100 }));
  $('set-sfx-volume').addEventListener('input', (e) => S.set({ sfxVolume: e.target.value / 100 }));
  $('set-master').addEventListener('input', (e) => S.set({ master: e.target.value / 100 }));
  $('set-sfx-volume').addEventListener('change', () => BOOM.Audio.play('item'));
  $('set-name').addEventListener('change', (e) => S.set({ name: e.target.value.trim().slice(0, 12) || 'Guest' }));

  $('set-lang').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    S.set({ lang: b.dataset.lang });
    BOOM.applyI18n();
    renderAll();
  });

  $('keys-table').addEventListener('click', (e) => {
    const b = e.target.closest('.key-btn');
    if (!b) return;
    if (listening) listening.button.classList.remove('listening');
    listening = { set: b.dataset.set, action: b.dataset.key, button: b };
    b.classList.add('listening');
    b.textContent = t('setting.press_key');
  });

  // Capture phase so the key never reaches the game or other handlers while rebinding.
  addEventListener(
    'keydown',
    (e) => {
      if (!listening) return;
      e.preventDefault();
      e.stopPropagation();
      const { set, action } = listening;
      listening = null;
      if (e.code !== 'Escape') {
        const keys = structuredClone(S.data.keys);
        const old = keys[set][action];
        // A key can only do one thing: swap with whichever binding already used it.
        for (const s of ['p1', 'p2']) for (const a of ACTIONS) if (keys[s][a] === e.code) keys[s][a] = old;
        keys[set][action] = e.code;
        S.set({ keys });
      }
      renderKeys();
    },
    true
  );

  UI.on('keys-reset', () => {
    S.set({ keys: structuredClone(S.DEFAULT_KEYS) });
    renderKeys();
  });
  UI.on('settings-back', () => {
    listening = null;
    UI.show(returnTo);
  });
})();
