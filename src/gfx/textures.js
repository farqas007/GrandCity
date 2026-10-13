// GrandCity - procedural texture factory (M3.1).
// Generates small, original canvas textures at runtime. No external image
// assets are used or downloaded. Keep textures tiny: they are meant for a
// low-end device with software rendering, yet small enough to stay crisp at
// high render resolutions (variants are palette-driven, not photographic).

import * as THREE from 'three';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// PALETTE mixes numeric 0xRRGGBB hex ints (used for materials) with CSS colour
// strings (used for canvas). Canvas APIs (addColorStop, fillStyle, ...) require
// a CSS colour string, so convert numeric hex to '#rrggbb' at this boundary and
// pass strings through unchanged. This keeps the intended original colours.
function cssColor(value) {
  return typeof value === 'number'
    ? '#' + (value & 0xffffff).toString(16).padStart(6, '0')
    : value;
}

// Deterministic integer hash -> fraction in [0, 1). Used so textures repeat
// identically every load without a shared PRNG stream.
function hash01(x, y, salt) {
  let h =
    (Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 668265263) +
      Math.imul(salt | 0, 1440662683)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// A single tileable facade cell: wall + framed glass window + floor line.
// Tiling it with texture.repeat gives a regular window grid on a box face.
// Kept for the Low preset, which keeps the exact M1/M1.1 look.
export function createFacadeTexture(palette) {
  const w = 128;
  const h = 128;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // Wall.
  ctx.fillStyle = palette.wallBase;
  ctx.fillRect(0, 0, w, h);

  // Subtle top shading so each floor reads as a separate band.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  ctx.fillRect(0, 0, w, h * 0.08);

  // Window frame.
  const wx = w * 0.2;
  const wy = h * 0.16;
  const ww = w * 0.6;
  const wh = h * 0.5;
  ctx.fillStyle = palette.wallFrame;
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

  // Glass.
  const grad = ctx.createLinearGradient(0, wy, 0, wy + wh);
  grad.addColorStop(0, palette.wallGlassTop);
  grad.addColorStop(1, palette.wallGlassBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(wx, wy, ww, wh);

  // Mullions (cross bars).
  ctx.fillStyle = palette.wallFrame;
  const bar = Math.max(2, w * 0.02);
  ctx.fillRect(wx + ww / 2 - bar / 2, wy, bar, wh); // vertical
  ctx.fillRect(wx, wy + wh / 2 - bar / 2, ww, bar); // horizontal

  // Floor separation line near the bottom edge (tiles into a slab line).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.fillRect(0, h - h * 0.06, w, h * 0.04);

  return toTileTexture(canvas);
}

// Per-building facade variants (Medium/High).
// "office": lighter wall, generous windows, strong mullions.
// "residential": warm brick wall, smaller windows with sills + curtain shade.
export function createVariantFacadeTexture(palette, kind) {
  const w = 128;
  const h = 128;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  if (kind === 'office') {
    ctx.fillStyle = '#b9bec6';
    ctx.fillRect(0, 0, w, h);
    // floor band
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, 0, w, h * 0.06);
    // big ribbed glass band
    const wy = h * 0.08;
    const ww = w * 0.84;
    const wh = h * 0.72;
    const grad = ctx.createLinearGradient(0, wy, 0, wy + wh);
    grad.addColorStop(0, '#93a7bb');
    grad.addColorStop(1, '#3a4a5c');
    ctx.fillStyle = palette.wallFrame;
    ctx.fillRect(w * 0.04, wy - 3, ww + 6, wh + 6);
    ctx.fillStyle = grad;
    ctx.fillRect(w * 0.04, wy, ww, wh);
    // mullions: 2 vertical + 1 horizontal
    ctx.fillStyle = palette.wallFrame;
    for (let c = 1; c < 3; c++) {
      const mx = w * 0.04 + (ww * c) / 3;
      ctx.fillRect(mx - 2, wy, 4, wh);
    }
    ctx.fillRect(w * 0.04, wy + wh / 2 - 2, ww, 4);
    // sill line
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, h - h * 0.06, w, h * 0.05);
  } else {
    // residential: brick courses + smaller paired windows
    ctx.fillStyle = palette.wallBase;
    ctx.fillRect(0, 0, w, h);
    // brick course lines
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // two windows per cell
    const wx = w * 0.10;
    const wy = h * 0.12;
    const ww = w * 0.36;
    const wh = h * 0.62;
    for (let i = 0; i < 2; i++) {
      const x = wx + i * (w * 0.46);
      // frame
      ctx.fillStyle = palette.wallFrame;
      ctx.fillRect(x - 3, wy - 3, ww + 6, wh + 6);
      // glass
      const grad = ctx.createLinearGradient(0, wy, 0, wy + wh);
      grad.addColorStop(0, palette.wallGlassTop);
      grad.addColorStop(1, palette.wallGlassBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(x, wy, ww, wh);
      // curtain shade (deterministic variation)
      if (hash01(Math.round(x), kind === 'office' ? 0 : 1, 3) < 0.5) {
        ctx.fillStyle = 'rgba(30, 34, 40, 0.35)';
        ctx.fillRect(x, wy + wh * 0.3, ww, wh * 0.7);
      }
      // sill
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x - 4, wy + wh, ww + 8, 4);
    }
    // floor band
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, h - h * 0.05, w, h * 0.05);
  }

  return toTileTexture(canvas);
}

// Ground-floor shopfront band: glass panels, frame columns, a door and a strip
// awning across the top. Tiled horizontally; repeat.y = 1.
export function createShopfrontTexture(palette) {
  const w = 256;
  const h = 128;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // Base wall behind everything.
  ctx.fillStyle = '#6f6a63';
  ctx.fillRect(0, 0, w, h);

  // Awning band across the top (striped, colour is baked).
  const awningH = h * 0.24;
  ctx.fillStyle = cssColor(palette.awning);
  ctx.fillRect(0, 0, w, awningH);
  ctx.fillStyle = '#e8d9bf';
  for (let x = 0; x < w; x += 32) {
    ctx.fillRect(x, 0, 12, awningH);
  }
  // scalloped awning bottom edge
  ctx.fillStyle = cssColor(palette.awning);
  for (let x = 0; x < w; x += 16) {
    ctx.beginPath();
    ctx.arc(x + 8, awningH, 8, 0, Math.PI);
    ctx.fill();
  }

  // Glass display band between awning and sidewalk.
  const gy = awningH + 8;
  const gh = h - gy - 10;
  ctx.fillStyle = cssColor(palette.shopFrame);
  ctx.fillRect(4, gy - 3, w - 8, gh + 6);

  // Panel columns.
  const cols = 6;
  const pad = 8;
  const pw = (w - pad * 2 - (cols - 1) * 4) / cols;
  const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
  grad.addColorStop(0, '#5d7286');
  grad.addColorStop(1, cssColor(palette.shopGlass));
  ctx.fillStyle = grad;
  for (let c = 0; c < cols; c++) {
    const x = pad + c * (pw + 4);
    ctx.fillRect(x, gy, pw, gh);
    // reflection streak
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 7, gy + 6, 6, gh * 0.6);
  }
  // door: a darker framed slot in the last-but-one panel
  const dx = pad + 3 * (pw + 4) + 2;
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(dx, gy + 6, pw - 4, gh - 8);
  ctx.fillStyle = '#c9cdd3';
  ctx.fillRect(dx + 14, gy + 8, 3, gh - 14);
  ctx.fillRect(dx + pw - 20, gy + 8, 3, gh - 14);

  // Sidewalk shadow line at the very bottom.
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(0, h - 6, w, 6);

  return toTileTexture(canvas);
}

// Subtle asphalt tile with deterministic grain + a couple of worn streaks.
export function createAsphaltTexture(palette) {
  const w = 128;
  const h = 128;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const base = [43, 46, 52]; // matches PALETTE.asphalt
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (hash01(x, y, 5) - 0.5) * 22; // grain
      const i = (y * w + x) * 4;
      img.data[i] = base[0] + n;
      img.data[i + 1] = base[1] + n;
      img.data[i + 2] = base[2] + n;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // A couple of worn / patched streaks (drawn after, tile edges stay clean).
  ctx.fillStyle = 'rgba(20, 22, 26, 0.5)';
  ctx.fillRect(20, 44, 34, 5);
  ctx.fillRect(76, 92, 26, 4);
  ctx.fillStyle = 'rgba(58, 62, 70, 0.4)';
  ctx.fillRect(48, 12, 24, 4);

  return toTileTexture(canvas);
}

// Sidewalk paving slab tile: per-slab shade variation + joint lines.
export function createPavementTexture(palette) {
  const w = 128;
  const h = 128;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const base = [154, 158, 163]; // matches PALETTE.sidewalk
  const slabs = 4;
  const step = w / slabs;
  for (let gy = 0; gy < slabs; gy++) {
    for (let gx = 0; gx < slabs; gx++) {
      const shade = (hash01(gx, gy, 9) - 0.5) * 14;
      ctx.fillStyle = `rgb(${Math.round(base[0] + shade)}, ${Math.round(
        base[1] + shade
      )}, ${Math.round(base[2] + shade)})`;
      ctx.fillRect(gx * step + 1, gy * step + 1, step - 2, step - 2);
    }
  }
  // Joints.
  ctx.strokeStyle = palette.pavingJoint;
  ctx.lineWidth = 2;
  for (let i = 0; i <= slabs; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(w, p);
    ctx.stroke();
  }

  return toTileTexture(canvas);
}

function toTileTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Vertical sky gradient. stops is an array of [positionA0..1, cssColour].
export function createSkyTexture(stops) {
  const w = 2;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i < stops.length; i++) {
    grad.addColorStop(stops[i][0], stops[i][1]);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}