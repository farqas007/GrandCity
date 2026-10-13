// GrandCity - S1 optional crowd presentation layer.
//
// Presents up to CONFIG.crowd.max pedestrians as skinned human instances of ONE
// CC0 model (assets/pedestrians/sam.glb), replacing the box parts for those
// pedestrians only. It is deliberately separate from the pedestrian AI: it only
// *consumes* the transform the AI already produces (position, heading, speed)
// through the additive hook in pedestrians.js and never moves the pedestrian.
//
// Design
//  * The GLB is loaded once; every instance is a SkeletonUtils.clone, which
//    REUSES the loaded geometry and materials by reference (no per-instance copy),
//    so clones are cheap in memory. Each instance owns its own AnimationMixer, so
//    the characters animate independently (staggered phase - not a lock-step row).
//  * HONEST SCOPE: these are copies of a single character. They are NOT varied
//    faces / outfits / skin tones, and no fake variety is added by tinting.
//  * present(p) returns true ONLY once the model is loaded and the instance is
//    actually placed, so the caller keeps the box visible until then and for every
//    unclaimed pedestrian. A load failure leaves ready=false and the boxes stay.
//  * Opt-in and default OFF (main.js creates this only for "?crowd=1").

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

// Dispose every GPU resource reachable from the given roots, once each. Clones
// share geometries/materials with the source, so the Sets make this safe.
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

export function createCrowd(scene, opts = {}) {
  const cfg = CONFIG.crowd;
  const max = Math.max(1, Math.floor(Number.isFinite(opts.max) && opts.max > 0 ? opts.max : cfg.max));

  const group = new THREE.Group();
  group.name = 'pedCrowd';
  group.visible = false;
  if (scene) scene.add(group);

  let source = null; // the loaded gltf.scene, kept only so it can be disposed
  let ready = false;
  let error = null;
  let active = 0; // instances presented during the last update()

  const instances = []; // { root, mixer, pedIndex, used }
  const byPed = new Map(); // pedestrian index -> instance

  // Build `max` display clones from a parsed glTF. Kept separate from the network
  // so the headless harness can exercise it without downloading anything.
  function ingest(gltf) {
    if (!gltf || !gltf.scene) {
      error = 'glTF has no scene';
      return false;
    }
    if (ready) {
      error = 'already loaded';
      return false;
    }
    source = gltf.scene;

    const clips = (gltf.animations || []).slice();
    const clip = clips.find((c) => c.name === cfg.clip) || clips[0] || null;

    for (let i = 0; i < max; i++) {
      const root = cloneSkinned(source);
      root.name = 'pedPerson' + i;
      root.visible = false;
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          // A skinned mesh deforms away from its bind pose, so a stale bounding
          // sphere would wrongly cull it (the box pedestrians opt out too).
          o.frustumCulled = false;
        }
      });
      group.add(root);

      let mixer = null;
      if (clip) {
        mixer = new THREE.AnimationMixer(root);
        const action = mixer.clipAction(clip);
        action.play();
        // Stagger the phase so the copies do not walk in lock-step. This is
        // animation timing, not appearance variety.
        action.time = (i / max) * (clip.duration || 0);
        mixer.timeScale = 0; // frozen until the hook reports a real speed
      }
      instances.push({ root, mixer, pedIndex: -1, used: false });
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
        // pedestrians stay visible as the fallback.
        if (typeof console !== 'undefined') {
          console.warn('GrandCity: crowd model failed to load - ' + error);
        }
      }
    );
  }

  function findAvailable() {
    for (const inst of instances) {
      if (inst.pedIndex === -1 && !inst.used) return inst;
    }
    return null;
  }

  function freeInstance(inst) {
    if (inst.pedIndex >= 0) byPed.delete(inst.pedIndex);
    inst.pedIndex = -1;
    inst.used = false; // released, so it is immediately available again
    inst.root.visible = false;
    if (inst.mixer) inst.mixer.timeScale = 0;
  }

  function place(inst, p) {
    inst.root.position.set(p.x, p.y + cfg.yOffset, p.z);
    inst.root.rotation.y = p.heading + cfg.facingOffset;
    inst.root.scale.setScalar(cfg.scale);
    if (inst.mixer) {
      // Sync playback to the pedestrian's speed; 0 (paused) freezes the walk.
      const ts = Math.max(0, Math.min(cfg.maxTimeScale, (p.speed || 0) / cfg.clipSpeed));
      inst.mixer.timeScale = ts;
    }
  }

  return {
    group,
    max,

    get ready() {
      return ready;
    },
    get error() {
      return error;
    },
    // How many realistic humans are currently displayed (0..max). This counts
    // human instances only, never the whole pedestrian population.
    get active() {
      return active;
    },
    // Exposed so the headless harness can supply a parsed glTF (no network).
    ingest,

    // Called once per frame (from pedestrians.js) with the current claim set, so
    // an instance whose pedestrian is no longer claimed is released and its human
    // hidden (that pedestrian's box becomes visible again on the same frame).
    onClaims(claims) {
      if (!ready || !claims) return;
      for (const inst of instances) {
        if (inst.pedIndex >= 0 && !claims.has(inst.pedIndex)) freeInstance(inst);
      }
    },

    // Called from the pedestrian hook for each claimed pedestrian. Returns true
    // ONLY when the model is loaded and this pedestrian's instance is placed.
    present(p) {
      if (!ready || !p) return false;
      let inst = byPed.get(p.i);
      if (!inst) {
        inst = findAvailable();
        if (!inst) return false; // all instances busy: box stays for this one
        inst.pedIndex = p.i;
        byPed.set(p.i, inst);
      }
      place(inst, p);
      inst.used = true;
      return true;
    },

    // Advance each displayed instance's own mixer and publish the active count.
    update(dt) {
      let count = 0;
      for (const inst of instances) {
        if (inst.used) {
          inst.root.visible = true;
          if (inst.mixer) inst.mixer.update(dt);
          count++;
        } else {
          inst.root.visible = false;
        }
        inst.used = false;
      }
      active = count;
      if (ready) group.visible = count > 0;
    },

    dispose() {
      for (const inst of instances) {
        if (inst.mixer) {
          inst.mixer.stopAllAction();
          inst.mixer.uncacheRoot(inst.root);
        }
      }
      disposeObjects(instances.map((i) => i.root).concat([source]));
      for (const inst of instances) group.remove(inst.root);
      instances.length = 0;
      byPed.clear();
      source = null;
      ready = false;
      active = 0;
      group.visible = false;
      if (scene) scene.remove(group);
    },
  };
}
