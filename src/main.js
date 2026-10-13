// GrandCity - M2 entry point.
// Wires the renderer, environment, city, walking controls and the driving
// system together and runs the render loop. Kept deliberately small and
// dependency-free (Three.js only).

import * as THREE from 'three';
import { CONFIG, PALETTE, applyQuality } from './config.js';
import { createEnvironment } from './world/environment.js';
import { createCity } from './world/city.js';
import { FirstPersonControls } from './controls.js';
import { createVehicle, CarController } from './vehicle.js';
import { createHud } from './hud.js';

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

// --- Quality selection: ?quality=low|medium|high, ?res=0.4..1.5, ?shadows=0|1
const params = new URLSearchParams(window.location.search);
const activeQuality = applyQuality(params.get('quality') || CONFIG.quality.default);

const resParam = parseFloat(params.get('res'));
if (Number.isFinite(resParam)) {
  CONFIG.render.resolutionScale = Math.min(
    Math.max(resParam, 0.4),
    CONFIG.render.absoluteMaxPixelRatio
  );
}

const shadowParam = params.get('shadows');
if (shadowParam !== null) {
  CONFIG.graphics.shadows = shadowParam === '1' || shadowParam === 'true';
}

function applyPixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  const base = Math.min(dpr, CONFIG.render.maxPixelRatio);
  let ratio = base * CONFIG.render.resolutionScale;
  ratio = Math.min(ratio, CONFIG.render.absoluteMaxPixelRatio);
  ratio = Math.max(ratio, CONFIG.render.minPixelRatio);
  renderer.setPixelRatio(ratio);
  return ratio;
}

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
  const pixelRatio = applyPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const env = createEnvironment(scene, renderer, CONFIG.render, CONFIG.graphics, PALETTE);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.render.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.render.near,
    CONFIG.render.far
  );
  camera.position.set(0, CONFIG.player.eyeHeight, 0);
  camera.rotation.order = 'YXZ';

  const world = createCity(scene, renderer);
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

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyPixelRatio();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fatal('The WebGL context was lost. Reload the page to continue.');
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
      resolution: pixelRatio.toFixed(2),
      prompt: promptText,
    });
  }

  animate();
}

boot();
