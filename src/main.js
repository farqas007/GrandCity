// GrandCity - M3.2 entry point.
// Wires the renderer, environment, city, walking controls, the driving system
// and the fixed output-resolution system together and runs the render loop.
// Kept deliberately small and dependency-free (Three.js only).

import * as THREE from 'three';
import { CONFIG, PALETTE, applyQuality } from './config.js';
import { createEnvironment } from './world/environment.js';
import { createWorld, isEndlessRequested } from './world/chunk.js';
import { createPedestrians } from './world/pedestrians.js';
import { createPedPeople } from './world/pedPeople.js';
import { createCrowd } from './world/crowd.js';
import { FirstPersonControls } from './controls.js';
import { createVehicle, CarController } from './vehicle.js';
import { createHud } from './hud.js';
import {
  pickTarget,
  pickProfile,
  queryCaps,
  predictDrawingBuffer,
  limitationText,
  requestBuffer,
  fitCanvas,
  labelFor,
  bufferNeedsReapply,
  displayAspect,
} from './resolution.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const crosshair = document.getElementById('crosshair');

let renderer = null;
let hud = null;

function showOverlayMessage(text) {
  if (overlayMessage) overlayMessage.textContent = text || '';
}

function fatal(message) {
  if (overlay) {
    overlay.classList.remove('hidden');
    const title = overlay.querySelector('h1');
    if (title) title.textContent = 'GrandCity';
    showOverlayMessage(message);
  }
}

function setParam(key, value) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.location.href = url.toString();
}

// Toggle a single query parameter: remove it when it already holds `value`,
// otherwise set it. Used by the overlay's on/off (profile, culling) buttons.
function toggleParam(key, value) {
  const url = new URL(window.location.href);
  if (url.searchParams.get(key) === value) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.location.href = url.toString();
}

// Show the selected quality, requested resolution and measured draw buffer on
// the start overlay too (the HUD repeats it live in-game).
function updateResolutionUI(state, caps) {
  const el = document.getElementById('res-status');
  if (!el) return;
  const applied = state.applied;
  let text =
    `${state.label} target ${state.target.width}×${state.target.height}` +
    ` → draw buffer ${applied.actualWidth}×${applied.actualHeight}` +
    (caps.available && caps.maxRenderbuffer ? ` (GPU max ${caps.maxRenderbuffer})` : '');
  if (state.limitation) text += ` · ⚠ ${state.limitation}`;
  if (applied.error) text += ` · ⚠ ${applied.error}`;
  el.textContent = text;
  el.classList.toggle('warn', !!state.limitation || !applied.ok);
}

// --- Quality selection: ?quality=low|medium|high, ?shadows=0|1.
// Resolution is configured SEPARATELY from the visual-detail presets: every
// quality maps to a fixed internal drawing buffer (CONFIG.resolution). The
// legacy "?res=<scale>" override stays available (window-relative).
const params = new URLSearchParams(window.location.search);
const activeQuality = applyQuality(params.get('quality') || CONFIG.quality.default);
const resParam = parseFloat(params.get('res'));

// M4.1: an explicit low internal-resolution profile ("?profile=perf"). The legacy
// "?res=" custom mode keeps precedence, so its meaning is unchanged; otherwise the
// fixed 8K/12K/20K target is requested exactly as before. Nothing is silently
// downscaled — a profile is only used when it is explicitly named.
const useCustomRes = Number.isFinite(resParam) && resParam > 0;
const profilePlan = useCustomRes ? null : pickProfile(params.get('profile'));
const resolutionPlan =
  profilePlan ||
  pickTarget(activeQuality, resParam, {
    w: window.innerWidth,
    h: window.innerHeight,
  });

const shadowParam = params.get('shadows');
if (shadowParam !== null) {
  CONFIG.graphics.shadows = shadowParam === '1' || shadowParam === 'true';
}

// M4.1: opt-in distance culling for street props (default off -> byte-identical
// generation). Set before boot() so createCity sees it.
const cullParam = params.get('cull');
if (cullParam !== null) {
  CONFIG.graphics.distanceCulling = cullParam === '1' || cullParam === 'true';
}

// M4.2: optional pedestrian population override ("?peds=N"). 0 disables the
// system entirely; values are clamped to the configured safety cap.
const pedsParam = params.get('peds');
if (pedsParam !== null) {
  const n = parseInt(pedsParam, 10);
  if (Number.isFinite(n)) {
    CONFIG.graphics.pedBudget = Math.max(0, Math.min(CONFIG.pedestrians.maxCount, n));
  }
}

// M4.2.1: optional human-model presentation for exactly ONE pedestrian. Opt-in
// only — "?person=1" (or "?person=sam"); the default leaves the box pedestrians
// completely unchanged.
const personParam = params.get('person');
if (personParam !== null) {
  CONFIG.person.enabled =
    personParam === '1' || personParam === 'true' || personParam === 'sam';
}

// S1: optional realistic-crowd presentation (up to CONFIG.crowd.max instances of
// the one CC0 human model). Opt-in only — "?crowd=1"; the default leaves the box
// pedestrians completely unchanged. It is a superset of the single-instance
// "?person" layer, so when both are requested the crowd takes precedence (they
// would otherwise fight over the same nearest pedestrians). "?person=1" alone is
// unchanged.
const crowdParam = params.get('crowd');
if (crowdParam !== null) {
  CONFIG.crowd.enabled = crowdParam === '1' || crowdParam === 'true';
}
if (CONFIG.crowd.enabled) CONFIG.person.enabled = false;

canvas.addEventListener('webglcontextcreationerror', (e) => {
  fatal(
    'WebGL could not create a rendering context on this device' +
      (e && e.statusMessage ? ': ' + e.statusMessage : '.')
  );
});

function boot() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: CONFIG.render.antialias,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    fatal('WebGL could not start in this browser.');
    throw err;
  }

  if (!renderer.getContext()) {
    fatal('WebGL is not available in this browser.');
    return;
  }

  renderer.setClearColor(CONFIG.render.clearColor, 1);
  renderer.toneMapping = CONFIG.render.toneMapping
    ? THREE.ACESFilmicToneMapping
    : THREE.NoToneMapping;
  renderer.toneMappingExposure = CONFIG.render.toneMappingExposure || 1.0;

  const gl = renderer.getContext();
  const caps = queryCaps(gl);

  // Request the exact target buffer and measure what the GPU actually gives
  // back. Nothing is auto-lowered; any shortfall is reported, never hidden.
  let resolutionState = applyResolution();

  const scene = new THREE.Scene();
  const env = createEnvironment(scene, renderer, CONFIG.render, CONFIG.graphics, PALETTE);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.render.fov,
    currentAspect(),
    CONFIG.render.near,
    CONFIG.render.far
  );

  function currentAspect() {
    if (resolutionState) {
      const aspect = displayAspect(resolutionState);
      if (aspect > 0) return aspect;
    }
    return window.innerWidth / Math.max(1, window.innerHeight);
  }

  function applyResolution() {
    const target =
      resolutionPlan.mode === 'custom'
        ? pickTarget(activeQuality, resParam, {
            w: window.innerWidth,
            h: window.innerHeight,
          })
        : resolutionPlan;
    const predicted = predictDrawingBuffer(target.width, target.height, caps);
    const applied = requestBuffer(renderer, gl, target.width, target.height);
    const state = {
      target,
      predicted,
      applied,
      label: labelFor(target.width, target.height),
      limitation: limitationText(predicted),
    };

    updateResolutionUI(state, caps);
    if (!applied.ok) {
      fatal(
        `Could not allocate a ${target.width}×${target.height} drawing buffer on this GPU/driver ` +
          `(reported ${applied.actualWidth}×${applied.actualHeight}). ` +
          `Choose a lower preset (Low = 7680×4320) and reload.`
      );
    } else if (predicted.clamped) {
      console.warn(
        `GrandCity: requested ${target.width}×${target.height} exceeds GPU limit ` +
          `${predicted.capW}×${predicted.capH}; drawing buffer is ` +
          `${applied.actualWidth}×${applied.actualHeight}.`
      );
    }
    fitCanvas(
      canvas,
      applied.actualWidth || target.width,
      applied.actualHeight || target.height,
      { w: window.innerWidth, h: window.innerHeight }
    );
    return state;
  }
  camera.position.set(0, CONFIG.player.eyeHeight, 0);
  camera.rotation.order = 'YXZ';

  // Phase 1: opt-in endless world (?world=endless). The default URL keeps the
  // finite city; createWorld() is the single selection point.
  CONFIG.world.endless = isEndlessRequested(params);
  const world = createWorld(scene, renderer, params);
  const controls = new FirstPersonControls(camera, renderer.domElement, world);
  controls.onLockChange = (locked, message) => {
    if (locked) {
      overlay.classList.add('hidden');
      showOverlayMessage('');
    } else {
      overlay.classList.remove('hidden');
      if (message) showOverlayMessage(message);
    }
    if (crosshair) crosshair.classList.toggle('visible', locked);
  };

  overlay.addEventListener('click', () => controls.requestLock());
  overlay.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') controls.requestLock();
  });

  // --- M2: drivable car ---------------------------------------------------
  const vehicle = createVehicle(scene);
  const car = new CarController(vehicle, world);
  let mode = 'walk';

  // M4.2: pedestrians are created here (not in createCity) so the city geometry
  // and every existing regression baseline stay byte-identical. Returns null if
  // the system is disabled (?peds=0 / pedBudget 0) or a world API is missing.
  // M4.2.1 / S1: when a human-model layer is enabled, a separate presentation
  // module is handed the transforms of some pedestrians through a tiny additive
  // hook. The hook reports "not ready" until the GLB has loaded, so a box
  // pedestrian stays the visible fallback until its human is actually displayed,
  // and remains the only representation when neither layer is enabled.
  //   * "?crowd=1" (S1): up to CONFIG.crowd.max NEAREST pedestrians, each an
  //     independent instance of the one CC0 model.
  //   * "?person=1" (M4.2.1/S0): exactly ONE nearest pedestrian (unchanged).
  let presenter = null;
  let crowd = null;
  const personHook = CONFIG.person.enabled
    ? (p) => (presenter ? presenter.present(p) : false)
    : null;
  const crowdHook = CONFIG.crowd.enabled ? (p) => (crowd ? crowd.present(p) : false) : null;
  const crowdClaims = crowdHook
    ? (claims) => {
        if (crowd) crowd.onClaims(claims);
      }
    : null;

  const pedestrians = createPedestrians(
    scene,
    world,
    crowdHook
      ? {
          present: crowdHook,
          onClaims: crowdClaims,
          presentCount: CONFIG.crowd.max,
          presentRadius: CONFIG.crowd.radius,
          presentHysteresis: CONFIG.crowd.hysteresis,
          // S1: the realistic humans replace the WHOLE population, so simulate
          // exactly as many pedestrians as there are human instances (4 by
          // default) - never the full box population with the rest left
          // invisible. A smaller explicit "?peds=N" (or a "?peds=0" disable) is
          // still respected.
          count: Math.min(CONFIG.graphics.pedBudget, CONFIG.crowd.max),
          // S1: crowd mode replaces the WHOLE population with realistic humans,
          // so the old box pedestrians must never be rendered (not on spawn,
          // update, respawn or any other path). "?person=1" keeps its boxes.
          showBoxes: false,
        }
      : personHook
        ? {
            present: personHook,
            presentIndex: CONFIG.person.index,
            presentRadius: CONFIG.person.claimRadius,
            presentHysteresis: CONFIG.person.claimHysteresis,
          }
        : undefined
  );

  if (pedestrians && personHook) presenter = createPedPeople(scene);
  if (pedestrians && crowdHook) crowd = createCrowd(scene);

  function enterCar() {
    mode = 'drive';
    car.driving = true;
    car.setSpeed(0);
    car.lookYaw = 0;
    controls.lookEnabled = false;
    controls.keys.clear();
    controls.velocity.set(0, 0, 0);
    showOverlayMessage('');
  }

  function exitCar() {
    const p = car.getExitPosition();
    camera.position.set(p.x, CONFIG.player.eyeHeight, p.z);
    controls.yaw = car.heading;
    controls.pitch = 0;
    camera.rotation.set(0, controls.yaw, 0);
    controls.velocity.set(0, 0, 0);
    controls.keys.clear();
    controls.lookEnabled = true;
    car.driving = false;
    car.setSpeed(0);
    mode = 'walk';
  }

  // E enters the car only when the player is standing next to it, so a car can
  // never be entered by accident from across the street.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat) return;
    if (mode === 'walk') {
      const d = car.distanceTo(camera.position.x, camera.position.z);
      if (d <= CONFIG.vehicle.enterRadius) enterCar();
      else if (hud) hud.flash('Walk closer to the car to get in', 1.5);
    } else {
      exitCar();
    }
  });

  // Quality / shadows controls on the start overlay.
  document.querySelectorAll('[data-quality]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.quality === activeQuality);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setParam('quality', btn.dataset.quality);
    });
  });
  const shadowBtn = document.querySelector('[data-shadows]');
  if (shadowBtn) {
    shadowBtn.textContent = 'Shadows: ' + (CONFIG.graphics.shadows ? 'On' : 'Off');
    shadowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setParam('shadows', CONFIG.graphics.shadows ? '0' : '1');
    });
  }

  // M4.1: performance profile (fixed low internal resolution) and the optional
  // prop-culling toggle. Both are purely additive URL switches.
  const profileBtn = document.querySelector('[data-profile]');
  if (profileBtn) {
    profileBtn.classList.toggle('active', resolutionPlan.mode === 'profile');
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleParam('profile', 'perf');
    });
  }
  const cullBtn = document.querySelector('[data-cull]');
  if (cullBtn) {
    cullBtn.textContent = 'Culling: ' + (CONFIG.graphics.distanceCulling ? 'On' : 'Off');
    cullBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleParam('cull', CONFIG.graphics.distanceCulling ? '0' : '1');
    });
  }

  // M4.2.1: opt-in toggle for the single human model (default Off).
  const personBtn = document.querySelector('[data-person]');
  if (personBtn) {
    personBtn.textContent = 'Human model: ' + (CONFIG.person.enabled ? 'On' : 'Off');
    personBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleParam('person', CONFIG.person.enabled ? '0' : '1');
    });
  }

  window.addEventListener('resize', () => {
    // A fixed target must survive window resizes AND fullscreen changes. The
    // exact requested buffer is only re-issued when the live buffer was reset
    // or lost (bufferNeedsReapply); a normal resize just re-fits the canvas, so
    // the fixed 8K/12K/20K request is never overwritten by a setSize() to the
    // window size. Custom (?res=) targets are window-relative, so they re-apply.
    if (resolutionPlan.mode === 'custom' || bufferNeedsReapply(resolutionState, gl)) {
      resolutionState = applyResolution();
    } else {
      const a = resolutionState.applied;
      fitCanvas(canvas, a.actualWidth, a.actualHeight, {
        w: window.innerWidth,
        h: window.innerHeight,
      });
    }
    camera.aspect = currentAspect();
    camera.updateProjectionMatrix();
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fatal(
      `The WebGL context was lost — most likely the ${labelFor(
        resolutionState.target.width,
        resolutionState.target.height
      )} drawing buffer (${resolutionState.target.width}×${resolutionState.target.height}) ` +
        `could not be kept on this GPU. Reload and choose a lower preset.`
    );
  });

  hud = createHud();

  const clock = new THREE.Clock();
  let positionText = '0.0, 0.0';
  const presetLabel = CONFIG.quality.presets[activeQuality].label;

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), CONFIG.render.maxDelta);

    let speedText = '--';
    let promptText = '';

    if (mode === 'drive') {
      const k = controls.keys;
      const throttle =
        (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) -
        (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const steer =
        (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) -
        (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
      car.update(dt, { throttle, steer }, camera);
      speedText = `${car.getSpeedKmh().toFixed(0)} km/h`;
      promptText = 'W/S drive · A/D steer · Mouse look · E exit';
    } else {
      controls.update(dt);
      const d = car.distanceTo(camera.position.x, camera.position.z);
      if (d <= CONFIG.vehicle.enterRadius) promptText = 'Press E to enter the car';
    }

    env.update(camera);

    // M4.1: distance culling for street props (no-op unless enabled).
    if (world.updateCulling) world.updateCulling(camera);

    // M4.2: pedestrians simulate from this single loop (no per-NPC timers). The
    // "player" is the car while driving, otherwise the walking camera.
    if (pedestrians) {
      const player = mode === 'drive' ? car.position : camera.position;
      pedestrians.update(dt, camera, player);
    }

    // M4.2.1: advance the optional human-model animation (no-op when disabled).
    if (presenter) presenter.update(dt);

    // S1: advance each displayed crowd instance's own mixer (no-op when disabled).
    if (crowd) crowd.update(dt);

    renderer.render(scene, camera);

    positionText = `${camera.position.x.toFixed(1)}, ${camera.position.z.toFixed(1)}`;
    hud.update(dt, {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      position: positionText,
      mode: mode === 'drive' ? 'Driving' : 'Walking',
      speed: speedText,
      quality: presetLabel,
      shadows: CONFIG.graphics.shadows ? 'On' : 'Off',
      peds: pedestrians ? pedestrians.count : 0,
      humans: presenter ? presenter.active : 0,
      crowd: crowd ? crowd.active : 0,
      resolution: `${resolutionState.label} · ${resolutionState.target.width}×${resolutionState.target.height}`,
      buffer: `${resolutionState.applied.actualWidth}×${resolutionState.applied.actualHeight}`,
      caps: caps.available && caps.maxRenderbuffer ? `GL max ${caps.maxRenderbuffer}` : 'GL max --',
      note: resolutionState.limitation || (resolutionState.applied.ok ? 'exact' : 'failed'),
      prompt: promptText,
    });
  }

  animate();
}

boot();
