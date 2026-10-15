// GrandCity - M4.2 pedestrian AI foundation.
//
// A small, self-contained population of procedural pedestrians that roam the
// existing city: they spawn on sidewalk positions, walk between nearby waypoints,
// never pass through buildings or leave the world bounds (via the world's own
// collision API), keep clear of each other and the player, and vary individually
// in look, height, speed and reaction.
//
// Design notes
//  * Purely additive. main.js creates this AFTER createCity, so the city geometry
//    (and every existing regression baseline) is byte-identical with or without
//    pedestrians.
//  * All pedestrians share three InstancedMeshes (legs / torso / head): three draw
//    calls total, no per-NPC meshes, no per-frame allocations.
//  * Updates are distance-tiered: near pedestrians simulate every frame, distant
//    ones at a fixed low rate, using one small accumulator per NPC (no timers).
//  * Safe by construction: if an optional world API is missing it disables itself.
//  * M4.2.1: an optional, purely additive presentation hook (third argument) lets a
//    separate module claim ONE pedestrian for a skinned human model. It is not
//    given here by default, so the AI and behaviour are unchanged.
//  * S1: when a presentation layer replaces the WHOLE population (crowd mode),
//    the caller passes opts.showBoxes = false. The box meshes are still built (so
//    the claim logic and this module's API are unchanged) but the group is never
//    added to the scene and no matrices are written, so no box pedestrian can be
//    rendered - not on spawn, update, respawn or any other path. The caller also
//    passes opts.count so exactly the presented pedestrians are SIMULATED (no
//    extra invisible ones).

import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Deterministic PRNG, deliberately separate from the city layout stream so the
// city can never be perturbed by the pedestrian system.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Original, hand-picked palette (no copied assets).
const SHIRTS = [
  0x3f6fa3, 0x9a3f3f, 0x3f8a5c, 0x6d5aa6, 0xb98f43,
  0x2f7078, 0xa85a2f, 0x5a6472, 0x9c4f72, 0x4d4f57,
];
const PANTS = [0x2c3440, 0x3a3a3a, 0x4a4038, 0x2f3b46, 0x50535a];
const SKINS = [0xe3b98f, 0xc9905f, 0x8d5a3b, 0xf0c9a0, 0x6f4630];

function pick(list, r) {
  return list[Math.min(list.length - 1, Math.floor(r() * list.length))];
}

// Shared scratch (no allocation in the hot path).
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _color = new THREE.Color();
const _point = { x: 0, z: 0 };

// Local body dimensions (metres; scaled per person). Feet sit at y = 0.
const LEG_H = 0.78;
const TORSO_H = 0.6;
const HEAD_H = 0.28;

export function createPedestrians(scene, world, opts = {}) {
  const cfg = CONFIG.pedestrians;
  const c = CONFIG.city;

  // M4.2.1: optional presentation hook. When provided, one pedestrian may be
  // claimed by a presentation layer (e.g. a skinned human). It must return true
  // to confirm it is actually presenting; until it does, the box parts are
  // written as usual, so the box stays the visible fallback. With no hook this is
  // a no-op and the M4.2 behaviour is byte-identical.
  //
  // S0: the claimed pedestrian may now be chosen DYNAMICALLY as the nearest one
  // to the player instead of a fixed index. opts.presentIndex >= 0 pins a fixed
  // index (legacy / headless); omitting it or passing -1 selects the nearest
  // eligible pedestrian within opts.presentRadius every frame, with a small
  // hysteresis so the model does not flicker between two similar distances.
  const present = typeof opts.present === 'function' ? opts.present : null;
  // S1: how many pedestrians may be presented at once (default 1 = the S0
  // single-instance behaviour). The crowd layer asks for up to 4.
  const presentCount =
    Number.isInteger(opts.presentCount) && opts.presentCount > 0 ? opts.presentCount : 1;
  // S1: optional callback announcing the claim set each frame, so the
  // presentation layer can release an instance whose pedestrian is no longer
  // claimed. Purely additive; absent by default.
  const onClaims = typeof opts.onClaims === 'function' ? opts.onClaims : null;
  const presentFixedIndex =
    Number.isInteger(opts.presentIndex) && opts.presentIndex >= 0 ? opts.presentIndex : -1;
  const presentNearest = present !== null && presentFixedIndex < 0;
  const presentRadius =
    Number.isFinite(opts.presentRadius) && opts.presentRadius > 0 ? opts.presentRadius : Infinity;
  const presentHyst =
    Number.isFinite(opts.presentHysteresis) && opts.presentHysteresis > 0
      ? opts.presentHysteresis
      : 0;
  // The pedestrians currently presented (at most presentCount). Fixed mode pins a
  // singleton; otherwise it is re-selected each frame from the nearest eligible
  // pedestrians. A Set keeps the S0 single-claim case (size 0 or 1) intact.
  let presentClaims = presentFixedIndex >= 0 ? new Set([presentFixedIndex]) : new Set();

  // S1: the old box representation can be disabled outright. Default TRUE keeps
  // the M4.2 / M4.2.1 behaviour byte-identical; crowd mode passes false so the
  // realistic humans are the ONLY pedestrians rendered.
  const showBoxes = opts.showBoxes !== false;

  // Phase 2.4 Step 0: streaming safety gate. The endless world's streaming moves
  // the world bounds with the player and unloads distant chunks, which the
  // finite-grid, once-cached-bounds pedestrian model cannot follow (see the
  // Phase 2.4 audit). So pedestrians are disabled when the ENDLESS world is
  // active AND streaming is enabled, unless the caller explicitly opts in with
  // opts.allowStreaming === true (reserved for Phase 2.4 Step 1+ work). Purely
  // additive: the finite city and endless-without-streaming are unchanged.
  const allowStreaming = opts.allowStreaming === true;

  // S1: crowd mode passes opts.count so the number of SIMULATED pedestrians
  // equals the number of realistic human instances - there are no extra,
  // invisible pedestrians. Absent the override the M4.2 budget is used
  // unchanged (default / "?person=1" never set it).
  const rawBudget = Number.isFinite(opts.count)
    ? opts.count
    : Number.isFinite(CONFIG.graphics.pedBudget)
      ? CONFIG.graphics.pedBudget
      : cfg.count;
  const count = Math.max(0, Math.min(cfg.maxCount, Math.floor(rawBudget)));

  // Guard every optional world API: stay inert rather than throw if something is
  // missing (e.g. an older world build or a stripped test double).
  if (
    !cfg.enabled ||
    count === 0 ||
    !scene ||
    !world ||
    !world.bounds ||
    typeof world.groundHeightAt !== 'function' ||
    typeof world.resolveCollision !== 'function'
  ) {
    return null;
  }

  // Phase 2.4 Step 0: streaming safety gate (see allowStreaming above). Returning
  // null here is what keeps enabling streaming from ever stranding NPCs on
  // unloaded chunks or clamping them to the moving bounds. Opt back in with
  // opts.allowStreaming only once the streaming-aware pedestrian work (Step 1+)
  // has landed.
  if (
    CONFIG.world.endless &&
    CONFIG.world.stream &&
    CONFIG.world.stream.enabled &&
    !allowStreaming
  ) {
    return null;
  }

  const pitch = c.blockSize + c.roadWidth; // centre-to-centre block spacing
  const ringR = c.blockSize / 2 - 0.8; // sidewalk lane, clear of building footprints
  const cx0 = (c.grid - 1) / 2;
  const bounds = world.bounds;
  const rand = mulberry32(cfg.seed);

  const avoidSq = cfg.avoidRadius * cfg.avoidRadius;
  const noticeSq = cfg.noticeRadius * cfg.noticeRadius;
  const playerAvoidSq = cfg.playerAvoidRadius * cfg.playerAvoidRadius;
  const farSq = cfg.farUpdateDistance * cfg.farUpdateDistance;
  const repositionSq = cfg.repositionDistance * cfg.repositionDistance;

  // --- geometry + instanced meshes (shared, 3 draw calls) ---------------------
  const legGeo = new THREE.BoxGeometry(0.34, LEG_H, 0.24);
  const torsoGeo = new THREE.BoxGeometry(0.46, TORSO_H, 0.28);
  const headGeo = new THREE.BoxGeometry(0.26, HEAD_H, 0.26);
  const legMat = new THREE.MeshLambertMaterial();
  const torsoMat = new THREE.MeshLambertMaterial();
  const headMat = new THREE.MeshLambertMaterial();

  const legs = new THREE.InstancedMesh(legGeo, legMat, count);
  const torso = new THREE.InstancedMesh(torsoGeo, torsoMat, count);
  const head = new THREE.InstancedMesh(headGeo, headMat, count);
  legs.name = 'pedLegs';
  torso.name = 'pedTorso';
  head.name = 'pedHead';
  for (const mesh of [legs, torso, head]) {
    // Instances move every frame, so never rely on a cached bounding sphere.
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  const group = new THREE.Group();
  group.name = 'pedestrians';
  group.add(legs, torso, head);
  // S1: in crowd mode the box group is deliberately NOT part of the scene, so
  // nothing can render it (and nothing ever re-adds it).
  if (showBoxes) scene.add(group);

  // --- waypoint helpers -------------------------------------------------------
  function ringPoint(bx, bz) {
    const side = Math.floor(rand() * 4);
    const t = (rand() * 2 - 1) * ringR;
    if (side === 0) return { x: bx + ringR, z: bz + t };
    if (side === 1) return { x: bx - ringR, z: bz + t };
    if (side === 2) return { x: bx + t, z: bz + ringR };
    return { x: bx + t, z: bz - ringR };
  }

  function blockCenterX(i) {
    return (i - cx0) * pitch;
  }

  function pickTarget(p) {
    const gx = Math.min(
      c.grid - 1,
      Math.max(0, Math.round(p.x / pitch + cx0) + (Math.floor(rand() * 5) - 2))
    );
    const gz = Math.min(
      c.grid - 1,
      Math.max(0, Math.round(p.z / pitch + cx0) + (Math.floor(rand() * 5) - 2))
    );
    const t = ringPoint(blockCenterX(gx), blockCenterX(gz));
    p.targetX = t.x;
    p.targetZ = t.z;
    p.thinkTimer = cfg.minThink + rand() * (cfg.maxThink - cfg.minThink);
  }

  // A sidewalk point within [minD, maxD] of (px, pz), or a clamped fallback.
  function spawnPointNear(px, pz, minD, maxD) {
    const minSq = minD * minD;
    const maxSq = maxD * maxD;
    for (let k = 0; k < 24; k++) {
      const gx = Math.floor(rand() * c.grid);
      const gz = Math.floor(rand() * c.grid);
      const t = ringPoint(blockCenterX(gx), blockCenterX(gz));
      const dx = t.x - px;
      const dz = t.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minSq && d2 <= maxSq) return t;
    }
    const t = ringPoint(0, 0);
    t.x = Math.min(bounds.max, Math.max(bounds.min, t.x));
    t.z = Math.min(bounds.max, Math.max(bounds.min, t.z));
    return t;
  }

  // --- presentation claims (S0 single / S1 up to presentCount) ----------------
  // The nearest eligible pedestrians to the player, up to presentCount, within
  // presentRadius. Existing claims are kept while they stay eligible (sticky),
  // and a newcomer must be closer by presentHysteresis to take a slot, so the
  // selection does not flicker between pedestrians at similar distances.
  const _pd = []; // per-frame distance scratch, indexed by pedestrian index
  const _elig = []; // per-frame eligible-index scratch
  function pickPresentClaims(px, pz) {
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      _pd[i] = Math.hypot(p.x - px, p.z - pz);
    }
    _elig.length = 0;
    for (let i = 0; i < peds.length; i++) if (_pd[i] <= presentRadius) _elig.push(i);
    _elig.sort((a, b) => _pd[a] - _pd[b]);

    const next = new Set();
    // keep previous claims that are still eligible (sticky), up to the cap
    for (const idx of presentClaims) {
      if (next.size >= presentCount) break;
      if (_pd[idx] <= presentRadius) next.add(idx);
    }
    // fill remaining slots with the nearest eligible pedestrians
    for (const idx of _elig) {
      if (next.size >= presentCount) break;
      next.add(idx);
    }
    // at capacity: only swap when a newcomer is meaningfully closer
    if (next.size >= presentCount) {
      for (const cand of _elig) {
        if (next.has(cand)) continue;
        let worst = -1;
        let worstD = -Infinity;
        for (const m of next) {
          if (_pd[m] > worstD) {
            worstD = _pd[m];
            worst = m;
          }
        }
        if (worst < 0) break;
        if (_pd[cand] < worstD - presentHyst) {
          next.delete(worst);
          next.add(cand);
        } else break;
      }
    }
    return next;
  }

  // --- matrix writer ----------------------------------------------------------
  // Park the box parts out of sight for the one pedestrian shown as a model.
  function hideParts(p) {
    if (!showBoxes) return; // no box representation: nothing to hide
    _m.makeScale(0, 0, 0);
    legs.setMatrixAt(p.i, _m);
    torso.setMatrixAt(p.i, _m);
    head.setMatrixAt(p.i, _m);
  }

  function writeParts(p) {
    // M4.2.1: only once the presentation layer confirms it is showing the model
    // do we hide the boxes for this pedestrian; otherwise they remain the
    // fallback exactly as in M4.2.
    if (present && presentClaims.has(p.i) && present(p) === true) {
      hideParts(p);
      return;
    }
    if (!showBoxes) return; // S1: no box representation to write this frame

    _q.setFromAxisAngle(_Y, p.heading);
    const sc = p.scale;
    const y = p.y + p.bob;

    _s.set(sc * p.girth, sc, sc * p.girth);

    _p.set(p.x, y + (LEG_H / 2) * sc, p.z);
    _m.compose(_p, _q, _s);
    legs.setMatrixAt(p.i, _m);

    _p.set(p.x, y + (LEG_H + TORSO_H / 2) * sc, p.z);
    _m.compose(_p, _q, _s);
    torso.setMatrixAt(p.i, _m);

    _s.set(sc, sc, sc);
    _p.set(p.x, y + (LEG_H + TORSO_H + HEAD_H / 2) * sc, p.z);
    _m.compose(_p, _q, _s);
    head.setMatrixAt(p.i, _m);
  }

  // --- population -------------------------------------------------------------
  const peds = [];
  for (let i = 0; i < count; i++) {
    const sp = spawnPointNear(0, 0, cfg.spawnMinDist, cfg.spawnMaxDist);
    const p = {
      i,
      x: sp.x,
      z: sp.z,
      y: world.groundHeightAt(sp.x, sp.z),
      heading: rand() * Math.PI * 2,
      speed: 0,
      baseSpeed: cfg.speedMin + rand() * (cfg.speedMax - cfg.speedMin),
      scale: cfg.scaleMin + rand() * (cfg.scaleMax - cfg.scaleMin),
      girth: cfg.girthMin + rand() * (cfg.girthMax - cfg.girthMin),
      reaction: Math.floor(rand() * 4), // 0 ignore · 1 pause · 2 step aside · 3 keep away
      phase: rand() * Math.PI * 2,
      bob: 0,
      accum: 0,
      thinkTimer: 0,
      targetX: 0,
      targetZ: 0,
      noticed: false,
      pauseTimer: 0,
      fleeTimer: 0,
    };
    pickTarget(p);
    p.targetX = p.x;
    p.targetZ = p.z; // start still, then choose a real destination on first update
    _color.set(pick(PANTS, rand));
    legs.setColorAt(i, _color);
    _color.set(pick(SHIRTS, rand));
    torso.setColorAt(i, _color);
    _color.set(pick(SKINS, rand));
    head.setColorAt(i, _color);
    peds.push(p);
    writeParts(p);
  }
  if (legs.instanceColor) legs.instanceColor.needsUpdate = true;
  if (torso.instanceColor) torso.instanceColor.needsUpdate = true;
  if (head.instanceColor) head.instanceColor.needsUpdate = true;
  legs.instanceMatrix.needsUpdate = true;
  torso.instanceMatrix.needsUpdate = true;
  head.instanceMatrix.needsUpdate = true;

  // Relocate a pedestrian to a fresh sidewalk point near the player, preferring a
  // spot outside the camera view so respawns are not seen as popping.
  function relocate(p, px, pz, camera) {
    if (camera) camera.getWorldDirection(_fwd);
    let best = null;
    let bestScore = -Infinity;
    const minD = cfg.respawnMinDist;
    const maxD = cfg.respawnMaxDist;
    for (let k = 0; k < 8; k++) {
      const t = spawnPointNear(px, pz, minD, maxD);
      const dx = t.x - px;
      const dz = t.z - pz;
      let score = dx * dx + dz * dz;
      if (camera) {
        const fx = t.x - camera.position.x;
        const fz = t.z - camera.position.z;
        const len = Math.hypot(fx, fz) || 1;
        // Reward points behind/beside the camera (dot < 0 with forward vector).
        if ((fx / len) * _fwd.x + (fz / len) * _fwd.z < 0) score += 1e6;
      }
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    p.x = best.x;
    p.z = best.z;
    p.y = world.groundHeightAt(best.x, best.z);
    p.heading = rand() * Math.PI * 2;
    p.speed = 0;
    p.accum = 0;
    p.noticed = false;
    p.pauseTimer = 0;
    p.fleeTimer = 0;
    pickTarget(p);
    writeParts(p);
  }

  // --- simulation -------------------------------------------------------------
  function simulate(p, s, px, pz) {
    p.thinkTimer -= s;
    const tdx = p.targetX - p.x;
    const tdz = p.targetZ - p.z;
    const td2 = tdx * tdx + tdz * tdz;
    if (td2 < cfg.arrive * cfg.arrive || p.thinkTimer <= 0) pickTarget(p);

    let desiredX = 0;
    let desiredZ = 0;
    const tlen = Math.sqrt(td2) || 1;
    desiredX = tdx / tlen;
    desiredZ = tdz / tlen;

    // --- separation from nearby pedestrians ---
    let steerX = desiredX;
    let steerZ = desiredZ;
    for (let j = 0; j < peds.length; j++) {
      if (j === p.i) continue;
      const o = peds[j];
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 1e-4 && d2 < avoidSq) {
        const inv = 1 / Math.sqrt(d2);
        const w = (1 - d2 / avoidSq) * cfg.sepWeight;
        steerX += dx * inv * w;
        steerZ += dz * inv * w;
      }
    }

    // --- player awareness (varied per-person reactions) ---
    const pdx = p.x - px;
    const pdz = p.z - pz;
    const pd2 = pdx * pdx + pdz * pdz;
    if (pd2 < playerAvoidSq) {
      const inv = 1 / (Math.sqrt(pd2) || 1);
      steerX += pdx * inv * 1.8;
      steerZ += pdz * inv * 1.8;
    }
    if (pd2 < noticeSq) {
      if (!p.noticed) {
        p.noticed = true;
        if (p.reaction === 1) p.pauseTimer = 0.7 + rand() * 0.9;
        else if (p.reaction === 3) p.fleeTimer = 1.4 + rand();
      }
      const inv = 1 / (Math.sqrt(pd2) || 1);
      if (p.reaction === 2) {
        // Step aside: sidestep perpendicular to the player direction.
        steerX += -pdz * inv * 1.0;
        steerZ += pdx * inv * 1.0;
      } else if (p.reaction === 3) {
        steerX += pdx * inv * 1.6;
        steerZ += pdz * inv * 1.6;
      } else if (p.reaction === 0) {
        steerX += pdx * inv * 0.5;
        steerZ += pdz * inv * 0.5;
      }
    } else if (pd2 > noticeSq * 2.0) {
      p.noticed = false;
    }

    // --- target speed (pause / flee / arrival) ---
    let targetSpeed = p.baseSpeed;
    if (p.pauseTimer > 0) {
      targetSpeed = 0;
      p.pauseTimer -= s;
    }
    if (p.fleeTimer > 0) {
      targetSpeed = p.baseSpeed * 1.6;
      p.fleeTimer -= s;
    }
    if (td2 < 4.0) targetSpeed *= 0.6;
    p.speed += (targetSpeed - p.speed) * Math.min(1, cfg.accel * s);
    if (p.speed < 0.001) p.speed = 0;

    // --- turn towards the steering direction, then walk along the heading ---
    const slen = Math.hypot(steerX, steerZ) || 1;
    const want = Math.atan2(steerX / slen, steerZ / slen);
    let diff = want - p.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap to [-pi, pi]
    const maxTurn = cfg.turnRate * s;
    if (diff > maxTurn) diff = maxTurn;
    else if (diff < -maxTurn) diff = -maxTurn;
    p.heading += diff;

    p.x += Math.sin(p.heading) * p.speed * s;
    p.z += Math.cos(p.heading) * p.speed * s;

    // --- building / bounds collision via the world's own resolver ---
    _point.x = p.x;
    _point.z = p.z;
    const hit = world.resolveCollision(_point, cfg.radius);
    p.x = _point.x;
    p.z = _point.z;
    if (hit) {
      // Bumped a wall: re-route soon instead of grinding against it.
      if (p.thinkTimer > 0.4) p.thinkTimer = 0.2 + rand() * 0.4;
    }

    // --- terrain height (kerb steps smoothed) + walk bob ---
    const gy = world.groundHeightAt(p.x, p.z);
    p.y += (gy - p.y) * Math.min(1, 12 * s);
    p.phase += p.speed * s * 3.0;
    p.bob = Math.abs(Math.sin(p.phase)) * 0.035 * p.scale;
  }

  return {
    group,
    count,

    // S1: whether the old box representation exists in the scene at all. False in
    // crowd mode (the realistic humans replace the whole population). Exposed so
    // tests can assert the box path is truly disabled rather than just hidden.
    get boxesVisible() {
      return showBoxes;
    },

    // The pedestrians currently claimed by the presentation hook.
    // claimedIndex is the S0 compatibility view: the index when exactly one is
    // claimed, otherwise -1. claimedCount is the S1 multi-claim count.
    get claimedIndex() {
      return presentClaims.size === 1 ? presentClaims.values().next().value : -1;
    },
    get claimedCount() {
      return presentClaims.size;
    },

    // Called once per frame from the single existing render loop.
    update(dt, camera, playerPos) {
      const px = playerPos ? playerPos.x : camera ? camera.position.x : 0;
      const pz = playerPos ? playerPos.z : camera ? camera.position.z : 0;
      const camX = camera ? camera.position.x : px;
      const camZ = camera ? camera.position.z : pz;

      // S0/S1: re-select the nearest eligible pedestrians as the presentation
      // claims, then announce the set so the presentation layer can release any
      // instance whose pedestrian is no longer claimed.
      if (presentNearest) presentClaims = pickPresentClaims(px, pz);
      if (onClaims) onClaims(presentClaims);

      for (let i = 0; i < peds.length; i++) {
        const p = peds[i];
        const dx = p.x - camX;
        const dz = p.z - camZ;
        const near = dx * dx + dz * dz <= farSq;

        p.accum += dt;
        if (!near && p.accum < cfg.farStep) continue;
        const s = Math.min(near ? dt : p.accum, 0.3);
        p.accum = 0;

        simulate(p, s, px, pz);

        const rdx = p.x - px;
        const rdz = p.z - pz;
        if (rdx * rdx + rdz * rdz > repositionSq) relocate(p, px, pz, camera);
        else writeParts(p);
      }

      if (showBoxes) {
        legs.instanceMatrix.needsUpdate = true;
        torso.instanceMatrix.needsUpdate = true;
        head.instanceMatrix.needsUpdate = true;
      }
    },

    dispose() {
      scene.remove(group);
      legGeo.dispose();
      torsoGeo.dispose();
      headGeo.dispose();
      legMat.dispose();
      torsoMat.dispose();
      headMat.dispose();
      legs.dispose();
      torso.dispose();
      head.dispose();
    },
  };
}
