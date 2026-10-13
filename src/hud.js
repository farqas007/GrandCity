// GrandCity - lightweight on-screen HUD (M2).
// Shows FPS, renderer draw-call / triangle counts, position, walk/drive mode,
// driving speed and the active quality settings, plus a contextual prompt.
// Text updates are throttled so this costs almost nothing.

export function createHud() {
  const el = document.createElement('div');
  el.id = 'hud';

  const prompt = document.createElement('div');
  prompt.id = 'prompt';
  prompt.textContent = '';

  const values = {};
  const add = (key, label) => {
    const row = document.createElement('div');
    row.className = 'hud-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'hud-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'hud-value';
    valueEl.textContent = '--';

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    el.appendChild(row);
    values[key] = valueEl;
  };

  add('fps', 'FPS');
  add('draws', 'Draw calls');
  add('tris', 'Triangles');
  add('pos', 'Position (x, z)');
  add('mode', 'Mode');
  add('speed', 'Speed');
  add('quality', 'Quality');
  add('shadows', 'Shadows');
  add('resolution', 'Target res');
  add('buffer', 'Draw buffer');
  add('caps', 'GL cap');
  add('note', 'Note');

  document.body.appendChild(el);
  document.body.appendChild(prompt);

  let frames = 0;
  let acc = 0;
  let fps = 0;
  let sinceRefresh = 0;
  let flashText = '';
  let flashTimer = 0;
  let shownPrompt = null;

  return {
    update(dt, info) {
      frames++;
      acc += dt;
      sinceRefresh += dt;

      if (acc >= 0.5) {
        fps = frames / acc;
        frames = 0;
        acc = 0;
      }

      if (sinceRefresh >= 0.25) {
        sinceRefresh = 0;
        values.fps.textContent = fps.toFixed(0);
        values.draws.textContent = String(info.calls);
        values.tris.textContent = info.triangles.toLocaleString();
        values.pos.textContent = info.position;
        values.mode.textContent = info.mode;
        values.speed.textContent = info.speed;
        values.quality.textContent = info.quality;
        values.shadows.textContent = info.shadows;
        values.resolution.textContent = info.resolution;
        values.buffer.textContent = info.buffer;
        values.caps.textContent = info.caps;
        values.note.textContent = info.note;
      }

      // Contextual prompt; a transient "flash" message takes priority briefly.
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) flashText = '';
      }
      const text = flashTimer > 0 ? flashText : info.prompt || '';
      if (text !== shownPrompt) {
        shownPrompt = text;
        prompt.textContent = text;
        prompt.classList.toggle('visible', text !== '');
      }
    },

    flash(text, seconds) {
      flashText = text;
      flashTimer = seconds || 1.6;
    },

    dispose() {
      el.remove();
      prompt.remove();
    },
  };
}
