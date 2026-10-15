// GrandCity - Phase A streaming pedestrian population (LOGICAL ONLY).
//
// A standalone, rendering-free controller that keeps a population of pedestrian
// *records* in step with the chunks the endless world currently has loaded. It is
// the logical half of the streaming-pedestrian plan: it owns no meshes, no
// animation and no three.js types, so it can be unit-tested in plain Node and a
// presentation layer can consume it later (Phase B) without changes here.
//
// Why a separate module
// ---------------------
// The finite-world pedestrian system (src/world/pedestrians.js) caches the world
// bounds once and works on the fixed finite grid, so it cannot follow a world
// whose bounds move with the player and whose distant chunks are unloaded. Rather
// than change that (and risk the finite city), the streaming world gets its own
// chunk-keyed population. Nothing in pedestrians.js, chunk.js or main.js is
// touched by Phase A.
//
// Contract
// --------
//  * Source of truth = the world's loaded chunk set (world._chunksMap, the Map
//    chunk.js exposes for streaming, or the legacy world.chunks array). A chunk
//    that is not loaded never has records.
//  * Placement is a PURE function of (chunkX, chunkZ, slot, seed): the same chunk
//    always produces the same positions and heading, so unloading and re-loading
//    a chunk is stable (no wandering between reloads).
//  * Every record has a stable chunk-and-slot key ("cx,cz:slot") - reloading a
//    chunk recreates the SAME keys - and a unique, never-reused integer id, so a
//    future instance pool (crowd.js keys instances by index) can never alias.
//  * A configurable per-chunk count and a strict global cap are enforced. The
//    population is added a WHOLE CHUNK at a time (never partially), so per-chunk
//    counts stay uniform and re-loading a chunk always yields the same set.
//  * sync() is idempotent: calling it repeatedly never duplicates records.
//
// Default OFF (CONFIG.pedestriansStream.enabled === false) and deliberately NOT
// wired into main.js in Phase A. Nothing runs unless a caller creates this and
// enables it.

import { CONFIG } from '../config.js';

// ---------------------------------------------------------------------------
// Deterministic helpers (local, so this module imports nothing but CONFIG).
// ---------------------------------------------------------------------------

// Small deterministic PRNG (mulberry32) - the same generator the rest of the
// project uses. Seeded per (chunk, slot) below so it never depends on call order.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pure integer mix -> 32-bit seed. Mirrors city.js hash01 in spirit (position
// dominated, salt folded in) but is local so there is no cross-module import.
function recordSeed(cx, cz, slot, salt) {
  let h =
    (Math.imul(cx | 0, 374761393) +
      Math.imul(cz | 0, 668265263) +
      Math.imul(slot | 0, 2246822519) +
      Math.imul(salt | 0, 1440662683)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}

// Coerce an option to an integer within [min, max], falling back when the value
// (or the fallback) is not a finite number.
function toInt(value, fallback, min, max) {
  let n = value;
  if (!Number.isFinite(n)) n = fallback;
  if (!Number.isFinite(n)) n = min;
  n = Math.floor(n);
  return Math.max(min, Math.min(max, n));
}

// Coerce an option to a float within [min, max], same fallback rules as toInt.
function toFloat(value, fallback, min, max) {
  let n = value;
  if (!Number.isFinite(n)) n = fallback;
  if (!Number.isFinite(n)) n = min;
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// Global lattice helpers. These MIRROR src/world/chunk.js exactly (same CONFIG
// fields, same formulas) so a record lands on the same sidewalk the chunk does.
// They are duplicated rather than imported on purpose: chunk.js pulls in three +
// textures and is browser-only, while this module must stay importable in Node.
// ---------------------------------------------------------------------------
function pitch() {
  const c = CONFIG.city;
  return c.blockSize + c.roadWidth;
}

function chunkSpan() {
  return CONFIG.world.chunkBlocks * pitch();
}

// Integer chunk index along one axis that contains world coordinate `coord`
// (round-half-up at the +span/2 boundary), matching chunk.js chunkIndexAt().
function chunkIndexAt(coord) {
  return Math.floor(coord / chunkSpan() + 0.5);
}

// The global block indices owned by chunk index ci (chunkBlocks per side),
// matching chunk.js blocksInChunk().
function blocksInChunk(ci) {
  const k = CONFIG.world.chunkBlocks;
  const first = k * ci - k / 2;
  const out = [];
  for (let j = 0; j < k; j++) out.push(first + j);
  return out;
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

// Normalize a chunk description to { cx, cz } or null. Accepts a chunk object
// (as stored in world._chunksMap / world.chunks) or a bare [cx, cz] pair.
function normalizeChunk(item) {
  if (!item) return null;
  if (Array.isArray(item)) {
    if (Number.isFinite(item[0]) && Number.isFinite(item[1])) {
      return { cx: item[0], cz: item[1] };
    }
    return null;
  }
  if (Number.isFinite(item.cx) && Number.isFinite(item.cz)) {
    return { cx: item.cx, cz: item.cz };
  }
  return null;
}

/**
 * Create a logical, chunk-keyed pedestrian population for the streaming world.
 *
 * @param {object} [world] The endless world object (createEndlessWorld). Only
 *   `world._chunksMap` / `world.chunks` and `world.groundHeightAt` are read.
 *   May be omitted when `opts.getChunks` / `opts.groundHeightAt` are supplied.
 * @param {object} [opts]
 * @param {boolean} [opts.enabled] Override CONFIG.pedestriansStream.enabled.
 * @param {number}  [opts.perChunk] Records per loaded chunk (>= 1).
 * @param {number}  [opts.maxPopulation] Strict global cap (>= 1).
 * @param {number}  [opts.maxVisible] Humans to present near the player (>= 1,
 *   clamped to maxPopulation). Used by selectNearest() / the renderer pool.
 * @param {number}  [opts.visibleRadius] Metres; only records within this range of
 *   the player are eligible for presentation.
 * @param {number}  [opts.speedMin] Min per-record walk speed (m/s).
 * @param {number}  [opts.speedMax] Max per-record walk speed (m/s).
 * @param {number}  [opts.seed] PRNG salt; defaults to CONFIG.pedestriansStream.seed.
 * @param {function} [opts.getChunks] Returns an iterable of chunks to use as the
 *   loaded set instead of reading `world` (each item `{cx,cz}` or `[cx,cz]`).
 * @param {function} [opts.groundHeightAt] Ground lookup `(x,z)=>y`, overriding
 *   `world.groundHeightAt` (defaults to 0 when neither is available).
 * @returns {object} controller API (see the returned object below).
 */
export function createStreamingPopulation(world, opts = {}) {
  const cfg = CONFIG.pedestriansStream || {};
  const perChunk = toInt(opts.perChunk, cfg.perChunk, 1, 256);
  const maxPopulation = toInt(opts.maxPopulation, cfg.maxPopulation, 1, 1000000);
  const maxVisible = toInt(opts.maxVisible, cfg.maxVisible, 1, maxPopulation);
  const visibleRadius = toFloat(opts.visibleRadius, cfg.visibleRadius, 0, 100000);
  const speedMin = toFloat(opts.speedMin, cfg.speedMin, 0, 100);
  const speedMax = toFloat(opts.speedMax, cfg.speedMax, speedMin, 100);
  const seed = toInt(opts.seed, cfg.seed, 0, 4294967295);
  let enabled =
    opts.enabled === undefined ? cfg.enabled === true : opts.enabled === true;

  const getChunks = typeof opts.getChunks === 'function' ? opts.getChunks : null;
  const groundFn =
    typeof opts.groundHeightAt === 'function'
      ? opts.groundHeightAt
      : world && typeof world.groundHeightAt === 'function'
        ? (x, z) => world.groundHeightAt(x, z)
        : null;

  // Live population. `records` is the flat list (order of addition); byKey and
  // byChunk are indexes kept in lock-step with it.
  const records = [];
  const byKey = new Map(); // "cx,cz:slot" -> record
  const byChunk = new Map(); // "cx,cz"       -> record[]
  let nextId = 1; // monotonic; ids are never reused, even across reloads

  // --- loaded-chunk source --------------------------------------------------
  function readLoadedChunks() {
    const out = [];
    if (getChunks) {
      for (const item of getChunks()) {
        const p = normalizeChunk(item);
        if (p) out.push(p);
      }
      return out;
    }
    const map = world && world._chunksMap;
    if (map && typeof map.values === 'function') {
      for (const ch of map.values()) {
        const p = normalizeChunk(ch);
        if (p) out.push(p);
      }
      return out;
    }
    const arr = world && world.chunks;
    if (Array.isArray(arr)) {
      for (const ch of arr) {
        const p = normalizeChunk(ch);
        if (p) out.push(p);
      }
    }
    return out;
  }

  // Deterministic ordering: nearest-chunk-first when a player position is given
  // (so a tight cap favours chunks around the player), otherwise by key. The key
  // tie-break keeps the result stable across engine sort differences.
  function orderChunks(list, player) {
    const withKey = list.map((c) => ({ cx: c.cx, cz: c.cz, key: chunkKey(c.cx, c.cz) }));
    if (player && Number.isFinite(player.x) && Number.isFinite(player.z)) {
      const pcx = chunkIndexAt(player.x);
      const pcz = chunkIndexAt(player.z);
      for (const c of withKey) c.d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
      withKey.sort((a, b) => (a.d !== b.d ? a.d - b.d : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    } else {
      withKey.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    }
    return withKey;
  }

  // --- record creation ------------------------------------------------------
  // Build one deterministic record on a sidewalk point inside chunk (cx, cz).
  function makeRecord(cx, cz, slot) {
    const rand = mulberry32(recordSeed(cx, cz, slot, seed));

    // Pick a block within the chunk (rand() call order is fixed for determinism).
    const bxBlocks = blocksInChunk(cx);
    const bzBlocks = blocksInChunk(cz);
    const bx = bxBlocks.length
      ? bxBlocks[Math.min(bxBlocks.length - 1, Math.floor(rand() * bxBlocks.length))]
      : 0;
    const bz = bzBlocks.length
      ? bzBlocks[Math.min(bzBlocks.length - 1, Math.floor(rand() * bzBlocks.length))]
      : 0;
    const bxC = (bx + 0.5) * pitch();
    const bzC = (bz + 0.5) * pitch();

    // Sidewalk ring point (same ringR convention as pedestrians.js: blockSize/2
    // minus a small clearance so the point sits clear of building footprints).
    const ringR = CONFIG.city.blockSize / 2 - 0.8;
    const side = Math.floor(rand() * 4);
    const t = (rand() * 2 - 1) * ringR;
    let x;
    let z;
    if (side === 0) {
      x = bxC + ringR;
      z = bzC + t;
    } else if (side === 1) {
      x = bxC - ringR;
      z = bzC + t;
    } else if (side === 2) {
      x = bxC + t;
      z = bzC + ringR;
    } else {
      x = bxC + t;
      z = bzC - ringR;
    }

    const heading = rand() * Math.PI * 2;
    // Deterministic walk speed (drawn AFTER heading so the position/heading
    // signature of every record is unchanged from Phase A). Used only to drive
    // the shared human animation's playback rate in the presentation layer.
    const speed = speedMin + rand() * (speedMax - speedMin);
    const y = groundFn ? groundFn(x, z) : 0;

    return {
      id: nextId++,
      key: `${cx},${cz}:${slot}`, // stable chunk-and-slot key
      chunkKey: `${cx},${cz}`,
      cx,
      cz,
      slot,
      x,
      y,
      z,
      heading,
      speed,
    };
  }

  // Add every record for a chunk (whole chunk at a time).
  function addChunkRecords(cx, cz) {
    const ck = chunkKey(cx, cz);
    const arr = [];
    for (let slot = 0; slot < perChunk; slot++) {
      const rec = makeRecord(cx, cz, slot);
      records.push(rec);
      byKey.set(rec.key, rec);
      arr.push(rec);
    }
    byChunk.set(ck, arr);
    return arr.length;
  }

  // Remove every record for a chunk. Returns how many were removed.
  function removeChunkRecords(ck) {
    const arr = byChunk.get(ck);
    if (!arr) return 0;
    const doomed = new Set(arr);
    for (let i = records.length - 1; i >= 0; i--) {
      if (doomed.has(records[i])) records.splice(i, 1);
    }
    for (const rec of arr) byKey.delete(rec.key);
    byChunk.delete(ck);
    return arr.length;
  }

  function clearAll() {
    const n = records.length;
    records.length = 0;
    byKey.clear();
    byChunk.clear();
    return n;
  }

  // --- reconcile ------------------------------------------------------------
  /**
   * Reconcile the population with the world's loaded chunks.
   * @param {{x:number,z:number}} [player] Optional player position; when given,
   *   chunks nearest the player are populated first under a tight cap.
   * @returns {{enabled:boolean, added:number, removed:number, total:number,
   *   chunks:number, capped:boolean}} summary (a fresh object per call).
   */
  function sync(player) {
    const summary = {
      enabled,
      added: 0,
      removed: 0,
      total: records.length,
      chunks: byChunk.size,
      capped: false,
    };

    // Disabled: the invariant is "no population", so release anything held.
    if (!enabled) {
      if (records.length) summary.removed = clearAll();
      summary.total = records.length;
      summary.chunks = byChunk.size;
      return summary;
    }

    // 1) Unload: drop records whose chunk is no longer loaded.
    const loaded = readLoadedChunks();
    const loadedKeys = new Set();
    for (const c of loaded) loadedKeys.add(chunkKey(c.cx, c.cz));
    for (const ck of Array.from(byChunk.keys())) {
      if (!loadedKeys.has(ck)) summary.removed += removeChunkRecords(ck);
    }

    // 2) Load: populate every loaded-but-unpopulated chunk until the cap. The
    //    cap is strict and whole-chunk: if a full chunk would exceed it, stop.
    for (const c of orderChunks(loaded, player)) {
      const ck = chunkKey(c.cx, c.cz);
      if (byChunk.has(ck)) continue; // already populated (dedupes + idempotent)
      if (records.length + perChunk > maxPopulation) {
        summary.capped = true;
        break;
      }
      summary.added += addChunkRecords(c.cx, c.cz);
    }

    summary.total = records.length;
    summary.chunks = byChunk.size;
    return summary;
  }

  // --- presentation selection ------------------------------------------------
  // The nearest records to the player (within visibleRadius), up to `count`,
  // sorted near-to-far with a stable id tie-break. This is pure and allocation-
  // light so the per-frame presentation layer can call it every frame. It is the
  // streaming analogue of pedestrians.js pickPresentClaims(), but far simpler:
  // records do not move, so there is no hysteresis to manage.
  function selectNearest(player, count, radius) {
    const n = toInt(count, maxVisible, 1, maxPopulation);
    const r = toFloat(radius, visibleRadius, 0, 100000);
    const r2 = r * r;
    const px = player && Number.isFinite(player.x) ? player.x : 0;
    const pz = player && Number.isFinite(player.z) ? player.z : 0;

    const candidates = [];
    for (const rec of records) {
      const dx = rec.x - px;
      const dz = rec.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) candidates.push({ rec, d2 });
    }
    candidates.sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.rec.id - b.rec.id));

    const out = [];
    for (let i = 0; i < candidates.length && i < n; i++) out.push(candidates[i].rec);
    return out;
  }

  // --- presentation bridge ---------------------------------------------------
  // Drive a renderer that speaks the crowd.js presentation contract:
  //   renderer.onClaims(Set<number>)            // release instances not claimed
  //   renderer.present({i,x,y,z,heading,speed}) // place/claim one human, returns bool
  // This is the EXACT glue the game uses to hand streaming records to the shared
  // human renderer, kept here so it can be unit-tested against a fake renderer
  // without a browser or three.js. Returns { selected, placed } (placed < selected
  // only when the renderer's pool is momentarily full, e.g. still loading).
  function presentNearest(renderer, player) {
    if (!renderer) return { selected: 0, placed: 0 };
    const selected = selectNearest(player);
    const claims = new Set();
    for (const rec of selected) claims.add(rec.id);
    renderer.onClaims(claims);
    let placed = 0;
    for (const rec of selected) {
      const ok = renderer.present({
        i: rec.id, // unique record id -> renderer instance key
        x: rec.x,
        y: rec.y,
        z: rec.z,
        heading: rec.heading,
        speed: rec.speed,
      });
      if (ok) placed++;
    }
    return { selected: selected.length, placed };
  }

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = !!value;
      return enabled;
    },

    sync,
    update: sync, // per-frame alias for a future main.js hook
    selectNearest,
    presentNearest,

    // Live views. Treat `records` as READ-ONLY; mutate through sync().
    get records() {
      return records;
    },
    get count() {
      return records.length;
    },
    get chunkCount() {
      return byChunk.size;
    },
    perChunk,
    maxPopulation,
    maxVisible,
    visibleRadius,

    hasChunk(cx, cz) {
      return byChunk.has(chunkKey(cx, cz));
    },
    recordsForChunk(cx, cz) {
      return byChunk.get(chunkKey(cx, cz)) || [];
    },
    getByKey(key) {
      return byKey.get(key) || null;
    },

    stats() {
      return {
        enabled,
        count: records.length,
        chunks: byChunk.size,
        perChunk,
        maxPopulation,
        nextId,
      };
    },

    clear() {
      return clearAll();
    },
    // No GPU/host resources are owned, so dispose == clear (API symmetry with
    // the other world layers, e.g. crowd.dispose()).
    dispose() {
      return clearAll();
    },
  };
}
