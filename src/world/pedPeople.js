// GrandCity - M4.2.1 optional human-model presentation layer.
//
// Presents ONE pedestrian as a rigged, skinned human (the CC0 "Sam" walk model)
// instead of the M4.2 box parts. This module is deliberately separate from the
// pedestrian AI: it only *consumes* the transform the AI already produces
// (position, heading, speed, pause state) through the tiny additive hook in
// pedestrians.js and never moves the pedestrian itself.
//
// The clip is authored in place (no root translation), so the world position is
// taken entirely from the AI - there is no root motion to double-apply. Playback
// speed is synced to the pedestrian's speed so the feet do not slide.
//
// Opt-in only, default OFF: main.js creates this module only when enabled, and
// the box representation stays visible as the fallback until the GLB has loaded
// (present() keeps returning false until then).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';

// Texture slots worth releasing when a material is disposed.
const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'specularMap',
  'specularColorMap',
  'specularIntensityMap',
  'emissiveMap',
  'alphaMap',
  'aoMap',
];

// Dispose every GPU resource reachable from the given roots, once each.
function disposeObjects(roots) {
  const geos = new Set();
  const mats = new Set();
  const texs = new Set();
  const skels = new Set();
  for (const root of roots) {
    if (!root) continue;
    root.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.isSkinnedMesh && o.skeleton) skels.add(o.skeleton);
      const m = o.material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        mats.add(mat);
        for (const slot of TEXTURE_SLOTS) if (mat[slot]) texs.add(mat[slot]);
      }
    });
  }
  for (const s of skels) s.dispose();
  for (const t of texs) t.dispose();
  for (const m of mats) m.dispose();
  for (const g of geos) g.dispose();
}

export function createPedPeople(scene, opts = {}) {
  const cfg = CONFIG.person;
  const group = new THREE.Group();
  group.name = 'pedPeople';
  group.visible = false;
  if (scene) scene.add(group);

  let root = null; // the displayed (cloned) skinned object
  let source = null; // the loaded gltf.scene, kept only so it can be disposed
  let mixer = null;
  let ready = false;
  let error = null;
  let active = 0; // human instances presented during the last update() (0 or 1)
  let presentedThisFrame = false;

  // Build the display object from a parsed glTF. Kept separate from the network
  // so the headless test harness can exercise it without downloading anything.
  function ingest(gltf) {
    if (!gltf || !gltf.scene) {
      error = 'glTF has no scene';
      return false;
    }
    source = gltf.scene;
    root = cloneSkinned(source);
    root.name = 'pedPerson';
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        // A skinned mesh deforms away from its bind pose, so a stale bounding
        // sphere would wrongly cull it. Opt out exactly like the box
        // pedestrians do (pedestrians.js sets frustumCulled = false too).
        o.frustumCulled = false;
      }
    });
    group.add(root);

    const clips = (gltf.animations || []).slice();
    const clip = clips.find((c) => c.name === cfg.clip) || clips[0] || null;
    if (clip) {
      mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(clip).play();
      mixer.timeScale = 0; // frozen until the hook reports a real speed
    } else {
      mixer = null;
    }

    group.visible = true;
    ready = true;
    return true;
  }

  if (!opts.noLoad) {
    const loader = new GLTFLoader();
    loader.load(
      cfg.modelUrl,
      (gltf) => ingest(gltf),
      undefined,
      (err) => {
        error = err && err.message ? err.message : String(err);
        // Leave ready=false: present() keeps returning false, so the box
        // pedestrian stays visible as the fallback.
        if (typeof console !== 'undefined') {
          console.warn('GrandCity: human model failed to load - ' + error);
        }
      }
    );
  }

  return {
    group,
    get ready() {
      return ready;
    },
    get error() {
      return error;
    },
    // How many human instances this layer is currently presenting (0 while
    // loading / not showing, 1 while a pedestrian is shown as the model). This
    // is a count of human models, NOT of the whole pedestrian population.
    get active() {
      return active;
    },
    // Exposed so the headless harness can supply a parsed glTF (no network).
    ingest,

    // Called from the pedestrian hook. Returns true ONLY when the model is
    // actually on screen, so the caller keeps the box visible until then.
    present(p) {
      if (!ready || !root || !p) return false;
      root.position.set(p.x, p.y + cfg.yOffset, p.z);
      root.rotation.y = p.heading + cfg.facingOffset;
      root.scale.setScalar(cfg.scale);
      if (mixer) {
        // Sync playback to the pedestrian's speed; 0 (paused) freezes the walk
        // (the asset has no separate idle clip).
        const ts = Math.max(0, Math.min(cfg.maxTimeScale, (p.speed || 0) / cfg.clipSpeed));
        mixer.timeScale = ts;
      }
      presentedThisFrame = true;
      return true;
    },

    // Advance the animation. Called once per frame by main.js. It also publishes
    // the active-model count and hides the model on frames when nothing claimed
    // it (so an unclaimed human never lingers as a stray stand-in).
    update(dt) {
      active = presentedThisFrame ? 1 : 0;
      presentedThisFrame = false;
      if (ready) group.visible = active > 0;
      if (mixer && active > 0) mixer.update(dt);
    },

    dispose() {
      if (mixer) {
        mixer.stopAllAction();
        if (root) mixer.uncacheRoot(root);
        mixer = null;
      }
      disposeObjects([root, source]);
      if (root) group.remove(root);
      root = null;
      source = null;
      ready = false;
      active = 0;
      presentedThisFrame = false;
      group.visible = false;
      if (scene) scene.remove(group);
    },
  };
}
