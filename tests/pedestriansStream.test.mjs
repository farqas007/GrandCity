// GrandCity - dependency-free Node harness for the Phase A streaming pedestrian
// population (src/world/pedestriansStream.js). No framework, no npm packages.
//
// Run:  node tests/pedestriansStream.test.mjs
//
// Exits non-zero if any check fails.

import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createStreamingPopulation } from '../src/world/pedestriansStream.js';

// --- tiny runner -----------------------------------------------------------
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok   - ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL - ${name}`);
    console.error(`       ${err && err.message ? err.message : err}`);
  }
}

// --- fake endless world ----------------------------------------------------
// Mirrors the small surface the controller reads: a Map of loaded chunks keyed
// "cx,cz" (each entry exposes .cx/.cz) and a ground lookup.
function makeWorld() {
  const chunks = new Map();
  return {
    _chunksMap: chunks,
    groundHeightAt: () => 0.15,
    load(cx, cz) {
      chunks.set(`${cx},${cz}`, { cx, cz });
      return this;
    },
    unload(cx, cz) {
      chunks.delete(`${cx},${cz}`);
      return this;
    },
    loadSquare(radius) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) this.load(dx, dz);
      }
      return this;
    },
  };
}

function pos(rec) {
  // Position/heading/key signature (everything that must be deterministic).
  return `${rec.key}|${rec.x.toFixed(6)},${rec.y.toFixed(6)},${rec.z.toFixed(6)}|${rec.heading.toFixed(6)}`;
}

// ---------------------------------------------------------------------------
test('disabled by default (CONFIG) builds no population', () => {
  assert.equal(CONFIG.pedestriansStream.enabled, false, 'config default must be off');
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world); // no enabled override
  const summary = pop.sync();
  assert.equal(summary.enabled, false);
  assert.equal(pop.count, 0);
  assert.equal(pop.chunkCount, 0);
});

test('builds perChunk records for a loaded chunk', () => {
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world, { enabled: true, perChunk: 4 });
  const summary = pop.sync();
  assert.equal(summary.added, 4);
  assert.equal(pop.count, 4);
  assert.equal(pop.chunkCount, 1);
  for (const rec of pop.recordsForChunk(0, 0)) {
    assert.equal(rec.chunkKey, '0,0');
    assert.ok(Number.isFinite(rec.x) && Number.isFinite(rec.y) && Number.isFinite(rec.z));
  }
});

test('creates no records for chunks that are not loaded', () => {
  const world = makeWorld().load(0, 0).load(3, -2);
  const pop = createStreamingPopulation(world, { enabled: true, perChunk: 3 });
  pop.sync();
  assert.equal(pop.hasChunk(0, 0), true);
  assert.equal(pop.hasChunk(3, -2), true);
  assert.equal(pop.hasChunk(1, 1), false);
  assert.equal(pop.recordsForChunk(1, 1).length, 0);
  assert.equal(pop.chunkCount, 2);
});

test('placement and keys are deterministic; ids are unique', () => {
  const worldA = makeWorld().load(0, 0).load(2, -1).load(-3, 4);
  const worldB = makeWorld().load(0, 0).load(2, -1).load(-3, 4);
  const a = createStreamingPopulation(worldA, { enabled: true, perChunk: 5 });
  const b = createStreamingPopulation(worldB, { enabled: true, perChunk: 5 });
  a.sync();
  b.sync();
  assert.equal(a.count, b.count);

  const sigA = a.records.map(pos).sort();
  const sigB = b.records.map(pos).sort();
  assert.deepEqual(sigA, sigB, 'same chunks -> identical placement signatures');

  const ids = new Set(a.records.map((r) => r.id));
  assert.equal(ids.size, a.records.length, 'ids must be unique');
});

test('load order does not affect per-chunk placement', () => {
  const orderA = makeWorld().load(0, 0).load(1, 0).load(0, 1);
  const orderB = makeWorld().load(0, 1).load(1, 0).load(0, 0);
  const a = createStreamingPopulation(orderA, { enabled: true, perChunk: 4 });
  const b = createStreamingPopulation(orderB, { enabled: true, perChunk: 4 });
  a.sync();
  b.sync();
  for (const key of ['0,0', '1,0', '0,1']) {
    const [cx, cz] = key.split(',').map(Number);
    const sa = a.recordsForChunk(cx, cz).map(pos).sort();
    const sb = b.recordsForChunk(cx, cz).map(pos).sort();
    assert.deepEqual(sa, sb, `chunk ${key} independent of load order`);
  }
});

test('strict global cap is enforced (whole chunks only)', () => {
  const world = makeWorld().loadSquare(3); // 49 chunks
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 4,
    maxPopulation: 20,
  });
  const summary = pop.sync();
  assert.ok(pop.count <= 20, `count ${pop.count} must be <= cap 20`);
  assert.equal(pop.count % 4, 0, 'populated whole chunks only');
  assert.equal(summary.capped, true);
  assert.equal(pop.count, 20);
});

test('tight cap populates chunks nearest the player first', () => {
  const world = makeWorld().load(-2, 0).load(0, 0).load(2, 0);
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 4,
    maxPopulation: 4, // exactly one chunk fits
  });
  pop.sync({ x: 0, z: 0 });
  assert.equal(pop.recordsForChunk(0, 0).length, 4, 'player chunk populated');
  assert.equal(pop.recordsForChunk(-2, 0).length, 0);
  assert.equal(pop.recordsForChunk(2, 0).length, 0);
});

test('unloading a chunk removes exactly its records', () => {
  const world = makeWorld().load(0, 0).load(1, 0);
  const pop = createStreamingPopulation(world, { enabled: true, perChunk: 3 });
  pop.sync();
  assert.equal(pop.count, 6);
  const removedIds = pop.recordsForChunk(1, 0).map((r) => r.id);

  world.unload(1, 0);
  const summary = pop.sync();
  assert.equal(summary.removed, 3);
  assert.equal(pop.count, 3);
  assert.equal(pop.chunkCount, 1);
  assert.equal(pop.hasChunk(1, 0), false);
  assert.equal(pop.recordsForChunk(1, 0).length, 0);
  // No stale keys/ids survive.
  for (const id of removedIds) assert.equal(pop.records.some((r) => r.id === id), false);
});

test('reloading a chunk reproduces placement and keys (new ids)', () => {
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world, { enabled: true, perChunk: 4 });
  pop.sync();
  const first = pop.recordsForChunk(0, 0).map(pos).sort();
  const firstIds = pop.recordsForChunk(0, 0).map((r) => r.id).sort();

  world.unload(0, 0);
  pop.sync();
  assert.equal(pop.count, 0);

  world.load(0, 0);
  pop.sync();
  const second = pop.recordsForChunk(0, 0).map(pos).sort();
  const secondIds = pop.recordsForChunk(0, 0).map((r) => r.id).sort();

  assert.deepEqual(second, first, 'placement + keys stable across reload');
  assert.notDeepEqual(secondIds, firstIds, 'ids are fresh (never reused)');
});

test('sync is idempotent (no duplicates when nothing changes)', () => {
  const world = makeWorld().load(0, 0).load(1, 0);
  const pop = createStreamingPopulation(world, { enabled: true, perChunk: 4 });
  const s1 = pop.sync();
  const s2 = pop.sync();
  const s3 = pop.sync();
  assert.equal(s1.added, 8);
  assert.equal(s2.added, 0);
  assert.equal(s3.added, 0);
  assert.equal(pop.count, 8);
  const keys = new Set(pop.records.map((r) => r.key));
  assert.equal(keys.size, pop.records.length, 'keys unique (no duplicates)');
});

test('setEnabled(false) releases the population; re-enabling rebuilds', () => {
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world, { enabled: true, perChunk: 5 });
  pop.sync();
  assert.equal(pop.count, 5);
  pop.setEnabled(false);
  pop.sync();
  assert.equal(pop.count, 0);
  pop.setEnabled(true);
  pop.sync();
  assert.equal(pop.count, 5);
});

test('getChunks adapter works without a world object', () => {
  let chunks = [
    [0, 0],
    { cx: 1, cz: 1 },
  ];
  const pop = createStreamingPopulation(null, {
    enabled: true,
    perChunk: 2,
    groundHeightAt: () => 0.3,
    getChunks: () => chunks,
  });
  pop.sync();
  assert.equal(pop.count, 4);
  assert.equal(pop.chunkCount, 2);
  chunks = [[0, 0]];
  const summary = pop.sync();
  assert.equal(summary.removed, 2);
  assert.equal(pop.count, 2);
  assert.equal(pop.recordsForChunk(1, 1).length, 0);
});

test('world.chunks array fallback is honoured', () => {
  const world = { chunks: [{ cx: 0, cz: 0 }, { cx: -1, cz: 2 }] };
  const pop = createStreamingPopulation(world, { enabled: true, perChunk: 3 });
  pop.sync();
  assert.equal(pop.chunkCount, 2);
  assert.equal(pop.count, 6);
});

test('defaults come from CONFIG.pedestriansStream', () => {
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world, { enabled: true });
  assert.equal(pop.perChunk, CONFIG.pedestriansStream.perChunk);
  assert.equal(pop.maxPopulation, CONFIG.pedestriansStream.maxPopulation);
  assert.equal(pop.maxVisible, CONFIG.pedestriansStream.maxVisible);
  assert.equal(pop.visibleRadius, CONFIG.pedestriansStream.visibleRadius);
  const stats = pop.stats();
  assert.equal(stats.perChunk, CONFIG.pedestriansStream.perChunk);
  assert.equal(stats.maxPopulation, CONFIG.pedestriansStream.maxPopulation);
});

// --- Phase B: presentation selection + record speed ------------------------
test('every record carries a deterministic speed within [speedMin, speedMax]', () => {
  const world = makeWorld().load(0, 0).load(1, 0);
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 4,
    speedMin: 1.0,
    speedMax: 1.9,
  });
  pop.sync();
  for (const rec of pop.records) {
    assert.ok(Number.isFinite(rec.speed), 'speed finite');
    assert.ok(rec.speed >= 1.0 && rec.speed <= 1.9, `speed ${rec.speed} in range`);
  }
  // Determinism: a second controller reproduces the same speeds.
  const pop2 = createStreamingPopulation(makeWorld().load(0, 0).load(1, 0), {
    enabled: true,
    perChunk: 4,
    speedMin: 1.0,
    speedMax: 1.9,
  });
  pop2.sync();
  const a = pop.records.map((r) => r.speed.toFixed(6)).sort();
  const b = pop2.records.map((r) => r.speed.toFixed(6)).sort();
  assert.deepEqual(a, b);
});

test('selectNearest returns the closest records, sorted near-to-far', () => {
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 8,
    maxVisible: 8,
    visibleRadius: 1e6,
  });
  pop.sync();
  const anchor = pop.records[3];
  const picked = pop.selectNearest({ x: anchor.x, z: anchor.z }, 4);
  assert.equal(picked.length, 4);
  assert.equal(picked[0].id, anchor.id, 'exact position is nearest');
  // Sorted ascending by distance from the anchor.
  let prev = -1;
  for (const rec of picked) {
    const d = Math.hypot(rec.x - anchor.x, rec.z - anchor.z);
    assert.ok(d >= prev - 1e-9, 'distances non-decreasing');
    prev = d;
  }
});

test('selectNearest caps at maxVisible by default and excludes beyond radius', () => {
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 8,
    maxVisible: 2,
    visibleRadius: 1e6,
  });
  pop.sync();
  assert.equal(pop.selectNearest({ x: 0, z: 0 }).length, 2, 'default count = maxVisible');

  // A tiny radius around a record yields only that record.
  const anchor = pop.records[0];
  const tiny = pop.selectNearest({ x: anchor.x, z: anchor.z }, 8, 0.0001);
  assert.equal(tiny.length, 1);
  assert.equal(tiny[0].id, anchor.id);

  // A zero radius includes nothing.
  assert.equal(pop.selectNearest({ x: 0, z: 0 }, 8, 0).length, 0);
});

test('selectNearest is deterministic and stable across calls', () => {
  const world = makeWorld().load(0, 0).load(1, 0);
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 6,
    maxVisible: 6,
    visibleRadius: 1e6,
  });
  pop.sync();
  const player = { x: 5, z: -3 };
  const first = pop.selectNearest(player).map((r) => r.id);
  const second = pop.selectNearest(player).map((r) => r.id);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, first.length, 'no duplicate records selected');
});

// --- Phase B integration: presentNearest against a crowd.js-like renderer ---
// A minimal stand-in for createCrowd(): a FIXED pool of instances keyed by ped id,
// exactly like crowd.js (onClaims releases unclaimed ids; present places one and
// returns false when the pool is full).
function makeFakeCrowd(poolSize) {
  const slots = [];
  for (let i = 0; i < poolSize; i++) slots.push({ ped: -1, used: false, placed: 0 });
  const byPed = new Map();
  return {
    get active() {
      return slots.filter((s) => s.used).length;
    },
    get keys() {
      return new Set(byPed.keys());
    },
    onClaims(claims) {
      for (const s of slots) {
        if (s.ped >= 0 && !claims.has(s.ped)) {
          byPed.delete(s.ped);
          s.ped = -1;
          s.used = false;
        }
      }
    },
    present(p) {
      let s = byPed.get(p.i);
      if (!s) {
        s = slots.find((x) => x.ped === -1 && !x.used);
        if (!s) return false;
        s.ped = p.i;
        byPed.set(p.i, s);
      }
      s.used = true;
      s.placed++;
      s.last = { x: p.x, y: p.y, z: p.z, heading: p.heading, speed: p.speed };
      return true;
    },
    // Mirrors crowd.update(): used flags reset each frame.
    update() {
      for (const s of slots) s.used = false;
    },
  };
}

test('presentNearest drives a crowd-like renderer to the nearest maxVisible', () => {
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 8,
    maxVisible: 3,
    visibleRadius: 1e6,
  });
  pop.sync();
  const crowd = makeFakeCrowd(3);
  const player = { x: 0, z: 0 };
  const result = pop.presentNearest(crowd, player);
  assert.equal(result.selected, 3);
  assert.equal(result.placed, 3);
  assert.equal(crowd.keys.size, 3);
  // The presented keys are exactly the nearest 3 records.
  const nearest = pop.selectNearest(player).map((r) => r.id).sort((a, b) => a - b);
  assert.deepEqual([...crowd.keys].sort((a, b) => a - b), nearest);
});

test('presentNearest releases instances when a chunk unloads', () => {
  const world = makeWorld().load(0, 0).load(1, 0);
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 2,
    maxVisible: 4,
    visibleRadius: 1e6,
  });
  pop.sync();
  const crowd = makeFakeCrowd(4);
  const player = { x: 0, z: 0 };
  pop.presentNearest(crowd, player);
  assert.equal(crowd.keys.size, 4);

  // Remember the ids that belonged to chunk (1,0).
  const doomedIds = new Set(pop.recordsForChunk(1, 0).map((r) => r.id));
  world.unload(1, 0);
  pop.sync(player);
  crowd.update();
  pop.presentNearest(crowd, player);

  // No unloaded-chunk id may remain claimed.
  for (const id of doomedIds) assert.equal(crowd.keys.has(id), false, `id ${id} released`);
  assert.equal(crowd.keys.size, 2, 'remaining chunk still presented');
});

test('presentNearest degrades gracefully when the pool is full', () => {
  const world = makeWorld().load(0, 0);
  const pop = createStreamingPopulation(world, {
    enabled: true,
    perChunk: 6,
    maxVisible: 6,
    visibleRadius: 1e6,
  });
  pop.sync();
  const crowd = makeFakeCrowd(2); // only 2 instances
  const result = pop.presentNearest(crowd, { x: 0, z: 0 });
  assert.equal(result.selected, 6);
  assert.equal(result.placed, 2);
  assert.equal(crowd.keys.size, 2);
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
