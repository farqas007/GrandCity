// GrandCity - environment: sky, fog, lighting and optional shadows (M1.1).
// Kept in one place so main.js stays a thin entry point.

import * as THREE from 'three';
import { createSkyTexture } from '../gfx/textures.js';

// Sky dome radius. Must stay well inside camera.far (config.render.far).
const SKY_RADIUS = 600;

// Direction the "sun" shines from, relative to the player.
const SUN_OFFSET = new THREE.Vector3(70, 120, 45);

// Half-extent of the shadow camera around the player. Smaller = crisper
// shadows but a smaller region receives them. Used as the fallback when
// graphics.shadowRadius is missing or invalid.
const SHADOW_RADIUS = 70;

// Map a configured shadow-map type string to a THREE constant. Missing or
// unknown values fall back to PCF (the original behaviour). PCFSoftShadowMap is
// available only via an explicit shadowType override; no preset selects it.
const SHADOW_TYPES = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  pcfsoft: THREE.PCFSoftShadowMap,
};

function shadowTypeOf(name) {
  // Note: BasicShadowMap === 0, so a nullish check (not ||) is required to keep
  // 'basic' working while still falling back to PCF for missing/unknown values.
  return SHADOW_TYPES[String(name).toLowerCase()] ?? THREE.PCFShadowMap;
}

export function createEnvironment(scene, renderer, render, graphics, palette) {
  // --- Sky dome -----------------------------------------------------------
  // A camera-following sphere with a vertical gradient. Opaque, no fog, drawn
  // first, no depth writes: cheap and always behind everything else.
  let sky = null;
  if (graphics.skyDome) {
    const skyTex = createSkyTexture(palette.skyStops);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false,
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 24, 12), skyMat);
    sky.name = 'sky';
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    scene.add(sky);
  }

  const fogColor = new THREE.Color(palette.fog);
  if (render.fogEnabled) {
    scene.fog = new THREE.Fog(fogColor, render.fogNear, render.fogFar);
  }
  scene.background = fogColor.clone();

  // --- Lights -------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(
    palette.hemiSky,
    palette.hemiGround,
    graphics.hemiIntensity ?? 1.05
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(palette.sun, graphics.sunIntensity ?? 1.5);
  sun.position.copy(SUN_OFFSET);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  // --- Optional shadows ---------------------------------------------------
  let shadowsEnabled = false;
  if (graphics.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = shadowTypeOf(graphics.shadowType);
    sun.castShadow = true;

    const size = graphics.shadowMapSize || 1024;
    sun.shadow.mapSize.set(size, size);

    const radius =
      Number.isFinite(graphics.shadowRadius) && graphics.shadowRadius > 0
        ? graphics.shadowRadius
        : SHADOW_RADIUS;
    const cam = sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 1;
    cam.far = 420;
    cam.updateProjectionMatrix();

    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;

    shadowsEnabled = true;
  }

  const _tmp = new THREE.Vector3();

  // Called every frame. The sky follows the camera so it never clips; when
  // shadows are on, the sun (and its shadow frustum) follow the player too.
  function update(camera) {
    if (sky) sky.position.copy(camera.position);
    if (shadowsEnabled) {
      _tmp.copy(camera.position).add(SUN_OFFSET);
      sun.position.copy(_tmp);
      sun.target.position.copy(camera.position);
      sun.target.updateMatrixWorld();
    }
  }

  return { sky, hemi, sun, update, shadowsEnabled };
}
