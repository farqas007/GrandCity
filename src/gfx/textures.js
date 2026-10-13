// GrandCity - procedural texture factory (M1.1).
// Generates small, original canvas textures at runtime. No external image
// assets are used or downloaded. Keep textures tiny: they are meant for a
// low-end device with software rendering.

import * as THREE from 'three';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// A single tileable facade cell: wall + framed glass window + floor line.
// Tiling it with texture.repeat gives a regular window grid on a box face.
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
