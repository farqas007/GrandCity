// GrandCity - M1 entry point.
// Wires the renderer, scene, camera, city and controls together and runs the
// render loop. Kept deliberately small and dependency-free (Three.js only).

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCity } from './world/city.js';
import { FirstPersonControls } from './controls.js';
import { createHud } from './hud.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');

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

function applyPixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  const base = Math.min(dpr, CONFIG.render.maxPixelRatio);
  const ratio = Math.min(
    CONFIG.render.maxPixelRatio,
    Math.max(CONFIG.render.minPixelRatio, base * CONFIG.render.pixelRatio)
  );
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
  applyPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.render.clearColor);
  if (CONFIG.render.fogEnabled) {
    scene.fog = new THREE.Fog(
      CONFIG.render.clearColor,
      CONFIG.render.fogNear,
      CONFIG.render.fogFar
    );
  }

  // Cheap lighting: one hemisphere fill + one directional key. No shadows.
  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x2b2f36, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.render.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.render.near,
    CONFIG.render.far
  );
  camera.position.set(0, CONFIG.player.eyeHeight, 0);
  camera.rotation.order = 'YXZ';

  const world = createCity(scene);
  const controls = new FirstPersonControls(camera, renderer.domElement, world);

  controls.onLockChange = (locked, message) => {
    if (locked) {
      overlay.classList.add('hidden');
      showOverlayMessage('');
    } else {
      overlay.classList.remove('hidden');
      if (message) showOverlayMessage(message);
    }
  };

  overlay.addEventListener('click', () => controls.requestLock());
  overlay.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') controls.requestLock();
  });

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

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), CONFIG.render.maxDelta);
    controls.update(dt);

    renderer.render(scene, camera);

    positionText = `${camera.position.x.toFixed(1)}, ${camera.position.z.toFixed(1)}`;
    hud.update(dt, {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      position: positionText,
    });
  }

  animate();
}

boot();
