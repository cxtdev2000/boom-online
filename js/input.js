/* Keyboard state for the configurable P1/P2 key sets. The most recently pressed direction wins. */
(function () {
  const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  const held = new Set();
  const order = []; // pressed codes, newest last
  const pressed = new Set(); // codes pressed since last consume
  let enabled = false;

  function isGameKey(code) {
    const { p1, p2 } = BOOM.Settings.data.keys;
    return Object.values(p1).includes(code) || Object.values(p2).includes(code);
  }

  addEventListener('keydown', (e) => {
    if (!enabled || e.target.matches?.('input, textarea')) return;
    if (!isGameKey(e.code)) return;
    e.preventDefault();
    if (!held.has(e.code)) {
      held.add(e.code);
      order.push(e.code);
      pressed.add(e.code);
    }
  });
  addEventListener('keyup', (e) => {
    held.delete(e.code);
    const i = order.indexOf(e.code);
    if (i >= 0) order.splice(i, 1);
  });
  addEventListener('blur', () => {
    held.clear();
    order.length = 0;
  });

  BOOM.Input = {
    setEnabled(on) {
      enabled = on;
      if (!on) {
        held.clear();
        order.length = 0;
        pressed.clear();
      }
    },

    /**
     * Command for one or more key sets ('p1', 'p2'); passing both lets a solo player use either.
     * Bomb presses are consumed so each press drops one balloon.
     */
    command(sets) {
      const keys = sets.map((s) => BOOM.Settings.data.keys[s]);
      let dx = 0;
      let dy = 0;
      for (let i = order.length - 1; i >= 0; i--) {
        const code = order[i];
        const km = keys.find((k) => Object.values(k).includes(code));
        const dir = km && Object.keys(DIR_VEC).find((d) => km[d] === code);
        if (dir) {
          [dx, dy] = DIR_VEC[dir];
          break;
        }
      }
      let bomb = false;
      for (const k of keys) {
        if (pressed.has(k.bomb)) {
          bomb = true;
          pressed.delete(k.bomb);
        }
      }
      return { dx, dy, bomb };
    },

    /** Drop presses nobody consumed this frame (e.g. during the READY countdown). */
    endFrame() {
      pressed.clear();
    },
  };

  /** Readable label for a KeyboardEvent.code. */
  BOOM.keyLabel = function (code) {
    const names = { Space: 'Space', Enter: 'Enter', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    if (names[code]) return names[code];
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
  };
})();
