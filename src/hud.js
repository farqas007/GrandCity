// GrandCity - lightweight on-screen HUD (M1.1).
// Shows FPS, renderer draw-call / triangle counts, position, and the active
// quality settings. Text updates are throttled so this costs almost nothing.

export function createHud() {
  const el = document.createElement('div');
  el.id = 'hud';

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
  add('quality', 'Quality');
  add('shadows', 'Shadows');
  add('resolution', 'Resolution');

  document.body.appendChild(el);

  let frames = 0;
  let acc = 0;
  let fps = 0;
  let sinceRefresh = 0;

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
        values.quality.textContent = info.quality;
        values.shadows.textContent = info.shadows;
        values.resolution.textContent = info.resolution;
      }
    },

    dispose() {
      el.remove();
    },
  };
}
