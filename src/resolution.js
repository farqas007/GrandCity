// GrandCity - M3.2 fixed output-resolution system.
// This module is deliberately free of DOM / Three.js / WebGL imports so the
// resolution maths can be unit-tested headlessly. The two functions that touch
// a renderer (`queryCaps`, `requestBuffer`) only use the small surface passed
// in, which keeps them testable with fakes.
//
// Design rule: a requested resolution is never silently reduced. The caller
// requests an exact size, the actual drawing buffer is *measured*, and any
// shortfall is reported through `limitationText()` / the measured values.

import { CONFIG } from './config.js';

// WebGL enum values (used as fallbacks when a bare getParameter is passed).
const GL_MAX_RENDERBUFFER_SIZE = 0x8d36;
const GL_MAX_TEXTURE_SIZE = 0x0d33;
const GL_MAX_VIEWPORT_DIMS = 0x0d2a;
const GL_VERSION = 0x1f02;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Human label for a resolution, e.g. 7680x4320 -> "8K".
export function labelFor(width, height) {
  if (width === 7680 && height === 4320) return '8K';
  if (width === 11520 && height === 6480) return '12K';
  if (width === 19200 && height === 10800) return '20K';
  return `${width}×${height}`;
}

// Decide the requested drawing-buffer size for a quality preset.
//  - default: the fixed target for that preset (Low 8K / Medium 12K / High 20K).
//  - "?res=<scale>": explicit legacy override, relative to the window size.
// The result is only a request; pass it to requestBuffer() to see what the GPU
// actually gives back.
export function pickTarget(quality, resParam, windowSize) {
  if (Number.isFinite(resParam) && resParam > 0) {
    const cfg = CONFIG.resolution;
    const scale = clamp(resParam, cfg.customMinScale, cfg.customMaxScale);
    const w = windowSize && windowSize.w > 0 ? windowSize.w : 1920;
    const h = windowSize && windowSize.h > 0 ? windowSize.h : 1080;
    return {
      mode: 'custom',
      scale,
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
    };
  }
  const targets = CONFIG.resolution.targets;
  const t = targets[quality] || targets.medium;
  return { mode: 'target', width: t[0], height: t[1] };
}

// M4.1: practical low internal-resolution profile (e.g. "perf" -> 1280x720) for
// weak GPUs. Returns null for an unknown/missing name so the caller keeps the
// existing fixed-target behaviour untouched. This is an explicit, opt-in
// request — it is never applied unless named, and never silently downscales.
export function pickProfile(name) {
  if (!name) return null;
  const profiles = CONFIG.resolution.profiles;
  const t = profiles && profiles[name];
  if (!t) return null;
  return { mode: 'profile', profile: name, width: t[0], height: t[1] };
}

// Read the WebGL limits that bound the default framebuffer. Returns
// available:false when there is no usable context, so the caller can still
// render and report "unknown" rather than guessing.
export function queryCaps(gl) {
  const caps = {
    available: false,
    isWebGL2: false,
    maxRenderbuffer: 0,
    maxTexture: 0,
    maxViewportW: 0,
    maxViewportH: 0,
  };
  if (!gl || typeof gl.getParameter !== 'function') return caps;

  const read = (name, fallbackEnum) => {
    try {
      const e = gl[name] !== undefined ? gl[name] : fallbackEnum;
      return gl.getParameter(e);
    } catch (err) {
      return 0;
    }
  };

  caps.available = true;
  const view = read('MAX_VIEWPORT_DIMS', GL_MAX_VIEWPORT_DIMS);
  const version = read('VERSION', GL_VERSION);
  caps.maxRenderbuffer = read('MAX_RENDERBUFFER_SIZE', GL_MAX_RENDERBUFFER_SIZE) || 0;
  caps.maxTexture = read('MAX_TEXTURE_SIZE', GL_MAX_TEXTURE_SIZE) || 0;
  caps.maxViewportW = view && view[0] ? view[0] : 0;
  caps.maxViewportH = view && view[1] ? view[1] : 0;
  caps.isWebGL2 = typeof version === 'string' && version.indexOf('WebGL 2') !== -1;
  return caps;
}

// Predict the drawing-buffer size the GPU can actually provide. WebGL clamps
// the buffer per-dimension to min(MAX_RENDERBUFFER_SIZE, MAX_VIEWPORT_DIMS), so
// the prediction is exact for a conforming driver (the measurement in
// requestBuffer() remains the source of truth).
export function predictDrawingBuffer(targetW, targetH, caps) {
  const available = !!(caps && caps.available && caps.maxRenderbuffer > 0);
  let capW = Infinity;
  let capH = Infinity;
  if (available) {
    capW = Math.min(caps.maxRenderbuffer, caps.maxViewportW > 0 ? caps.maxViewportW : caps.maxRenderbuffer);
    capH = Math.min(caps.maxRenderbuffer, caps.maxViewportH > 0 ? caps.maxViewportH : caps.maxRenderbuffer);
  }
  const actualW = Math.min(targetW, capW);
  const actualH = Math.min(targetH, capH);
  const clamped = actualW !== targetW || actualH !== targetH;
  return {
    available,
    clamped,
    feasible: !clamped,
    targetW,
    targetH,
    actualW,
    actualH,
    capW: available ? capW : null,
    capH: available ? capH : null,
  };
}

// A short, honest description of why the request cannot be met exactly.
export function limitationText(pred) {
  if (!pred) return '';
  if (!pred.available) return 'GPU limits unavailable — using measured draw buffer';
  if (!pred.clamped) return '';
  return `requested ${pred.targetW}×${pred.targetH} exceeds GPU limit ${pred.capW}×${pred.capH}`;
}

// --- resize policy (M3.2 fix) ---------------------------------------------
// True when the renderer's *live* drawing buffer no longer matches what we last
// measured. This lets the fixed target self-heal if it is ever reset or lost,
// while a normal window resize (which never touches the buffer) is a no-op — so
// the exact 8K/12K/20K request is never overwritten on resize or fullscreen.
export function bufferNeedsReapply(state, gl) {
  const applied = state && state.applied;
  if (!applied || !applied.ok) return true;
  if (!gl || typeof gl.drawingBufferWidth !== 'number') return false;
  return (
    gl.drawingBufferWidth !== applied.actualWidth ||
    gl.drawingBufferHeight !== applied.actualHeight
  );
}

// The aspect the camera must match. Uses the measured drawing buffer when we
// have one, otherwise the requested target — deliberately NOT the window aspect,
// so the camera and the letterboxed canvas always agree (avoids stretching when
// a buffer could not be allocated).
export function displayAspect(state) {
  if (!state) return 1;
  const applied = state.applied;
  if (applied && applied.actualWidth > 0 && applied.actualHeight > 0) {
    return applied.actualWidth / applied.actualHeight;
  }
  const target = state.target;
  if (target && target.width > 0 && target.height > 0) {
    return target.width / target.height;
  }
  return 1;
}

// Ask the renderer for an exact internal buffer size and measure what came back.
// `updateStyle` is false so the on-screen CSS size is never changed here.
// Never throws: failures are returned in `error` / `ok:false`.
export function requestBuffer(renderer, gl, width, height) {
  const result = {
    requestedWidth: width,
    requestedHeight: height,
    actualWidth: 0,
    actualHeight: 0,
    ok: false,
    error: '',
  };
  if (!renderer || typeof renderer.setSize !== 'function') {
    result.error = 'renderer unavailable';
    return result;
  }
  try {
    if (typeof renderer.setPixelRatio === 'function') renderer.setPixelRatio(1);
    renderer.setSize(width, height, false); // false => leave the CSS size alone

    const dom = renderer.domElement;
    const hasGl = !!(gl && typeof gl.drawingBufferWidth === 'number');
    result.actualWidth = hasGl ? gl.drawingBufferWidth : dom ? dom.width : 0;
    result.actualHeight = hasGl ? gl.drawingBufferHeight : dom ? dom.height : 0;
    result.ok = result.actualWidth > 0 && result.actualHeight > 0;

    // Keep Three's viewport exactly aligned with the real (possibly clamped)
    // drawing buffer so the image is neither cropped nor stretched.
    if (result.ok && typeof renderer.setViewport === 'function') {
      renderer.setViewport(0, 0, result.actualWidth, result.actualHeight);
    }
  } catch (err) {
    result.error = String((err && err.message) || err);
  }
  return result;
}

// Fit the canvas element on screen, preserving the drawing buffer's aspect
// ratio (letterboxing rather than stretching). Pure DOM-style writes only.
export function fitCanvas(canvas, contentW, contentH, viewport) {
  if (!canvas || !canvas.style || contentW <= 0 || contentH <= 0) return null;
  const vw = viewport && viewport.w > 0 ? viewport.w : contentW;
  const vh = viewport && viewport.h > 0 ? viewport.h : contentH;
  const scale = Math.min(vw / contentW, vh / contentH);
  const w = Math.max(1, Math.floor(contentW * scale));
  const h = Math.max(1, Math.floor(contentH * scale));
  canvas.style.position = 'fixed';
  canvas.style.left = '50%';
  canvas.style.top = '50%';
  canvas.style.transform = 'translate(-50%, -50%)';
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  return { w, h };
}
