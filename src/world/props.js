// GrandCity - street furniture (M1.1, M3.1).
// Instanced lamps, trees (including mini-parks on vacant lots), bins and
// benches. M3.1 adds an arm+cap to lamps, a two-layer tree canopy and benches,
// all gated by `detailedProps` / `benchBudget`; Low keeps the exact M1.1 look.
// Everything is budget-capped by the active quality preset.

import * as THREE from 'three';
import { PALETTE } from '../config.js';

// Shared scratch objects for building instance matrices.
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0);

// Build an InstancedMesh from {x,y,z,sx,sy,sz,ry?,color?} items.
function buildInstanced(geometry, material, items, useColor) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    _p.set(it.x, it.y || 0, it.z);
    _s.set(it.sx || 1, it.sy || 1, it.sz || 1);
    if (it.ry) _q.setFromAxisAngle(_Y, it.ry);
    else _q.identity();
    _m4.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m4);
    if (useColor && it.color !== undefined) {
      _c.set(it.color);
      mesh.setColorAt(i, _c);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (useColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

// ctx: { rand, blockCenter, pitch, blockSize, grid, walkTop, graphics }
export function createProps(parent, ctx) {
  const { rand, blockCenter, blockSize, grid, walkTop, graphics: g } = ctx;

  const lamps = [];
  const trees = [];
  const bins = [];
  const inner = blockSize / 2 - 1.6; // place props just inside the block edge

  // One pass over every block; sample its four corners for furniture.
  for (let ix = 0; ix < grid; ix++) {
    for (let iz = 0; iz < grid; iz++) {
      const bx = blockCenter(ix);
      const bz = blockCenter(iz);
      const corners = [
        [bx - inner, bz - inner],
        [bx + inner, bz - inner],
        [bx - inner, bz + inner],
        [bx + inner, bz + inner],
      ];
      for (let ci = 0; ci < corners.length; ci++) {
        const cx = corners[ci][0];
        const cz = corners[ci][1];
        const r = rand();
        if (r < 0.16 && lamps.length < g.lampBudget) {
          lamps.push({ x: cx, z: cz });
        } else if (r < 0.34 && trees.length < g.treeBudget) {
          trees.push({ x: cx, z: cz, scale: 0.8 + rand() * 0.7 });
        } else if (r < 0.4 && bins.length < g.binBudget) {
          bins.push({ x: cx, z: cz });
        }
      }
    }
  }

  // Mini-parks on vacant lots.
  for (let i = 0; i < ctx.emptyLots.length; i++) {
    const lot = ctx.emptyLots[i];
    const n = 3 + Math.floor(rand() * 3);
    for (let t = 0; t < n && trees.length < g.treeBudget; t++) {
      trees.push({
        x: lot.x + (rand() - 0.5) * lot.size * 0.7,
        z: lot.z + (rand() - 0.5) * lot.size * 0.7,
        scale: 0.9 + rand() * 0.8,
      });
    }
  }

  // Benches (M3.1): sampled in a separate pass so the shared-PRNG stream used
  // for lamps/trees/bins above is left untouched (identical furniture layout).
  const benches = [];
  if (g.benchBudget > 0) {
    for (let ix = 0; ix < grid && benches.length < g.benchBudget; ix++) {
      for (let iz = 0; iz < grid; iz++) {
        if (benches.length >= g.benchBudget) break;
        const bx = blockCenter(ix);
        const bz = blockCenter(iz);
        if (rand() < 0.55) continue; // only some blocks get a bench
        benches.push({
          x: bx + (rand() - 0.5) * (blockSize - 5),
          z: bz + (rand() - 0.5) * (blockSize - 5),
          rot: rand() < 0.5 ? 0 : Math.PI / 2,
        });
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'props';

  // M4.1: optional distance culling. When a culler is supplied, each category is
  // split once at load into spatial chunks (per culler.chunkSize), each its own
  // InstancedMesh sharing the same geometry + material, so distant furniture can
  // be hidden per frame. Without a culler this builds a single mesh exactly as
  // before, so disabled culling produces byte-identical geometry.
  const culler = ctx.culler || null;

  function emit(geometry, material, items, useColor) {
    if (!items.length) return;
    if (!culler) {
      group.add(buildInstanced(geometry, material, items, useColor));
      return;
    }
    const size = culler.chunkSize;
    const buckets = new Map();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = Math.floor(it.x / size) + ':' + Math.floor(it.z / size);
      let b = buckets.get(key);
      if (!b) {
        b = { sumX: 0, sumZ: 0, n: 0, items: [] };
        buckets.set(key, b);
      }
      b.items.push(it);
      b.sumX += it.x;
      b.sumZ += it.z;
      b.n++;
    }
    buckets.forEach((b) => {
      const mesh = buildInstanced(geometry, material, b.items, useColor);
      group.add(mesh);
      culler.add(mesh, b.sumX / b.n, b.sumZ / b.n);
    });
  }

  // --- Lamps: pole, arm, lantern (head) and cap ---------------------------
  if (lamps.length) {
    const poleItems = [];
    const headItems = [];
    const armItems = [];
    const capItems = [];
    for (let i = 0; i < lamps.length; i++) {
      const lx = lamps[i].x;
      const lz = lamps[i].z;
      poleItems.push({ x: lx, y: walkTop + 2.2, z: lz });
      headItems.push({ x: lx, y: walkTop + 4.5, z: lz });
      if (g.detailedProps) {
        // Lantern hangs from an arm extending toward +X with a cap on top.
        armItems.push({ x: lx + 0.62, y: walkTop + 4.28, z: lz, sx: 1.12, sy: 0.1, sz: 0.14 });
        headItems[headItems.length - 1] = { x: lx + 1.2, y: walkTop + 4.34, z: lz, sx: 0.68, sy: 0.3, sz: 0.68 };
        capItems.push({ x: lx + 1.2, y: walkTop + 4.56, z: lz, sx: 0.8, sy: 0.16, sz: 0.8 });
      }
    }
    emit(
      new THREE.CylinderGeometry(0.09, 0.11, 4.4, 6),
      new THREE.MeshLambertMaterial({ color: PALETTE.metal }),
      poleItems,
      false
    );
    emit(
      new THREE.BoxGeometry(0.55, 0.24, 0.55),
      new THREE.MeshBasicMaterial({ color: PALETTE.lamp }),
      headItems,
      false
    );
    if (g.detailedProps) {
      emit(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: PALETTE.metal }),
        armItems,
        false
      );
      emit(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: PALETTE.metal }),
        capItems,
        false
      );
    }
  }

  // --- Trees: trunk + low-poly foliage (two layers when detailed) ----------
  if (trees.length) {
    const trunkItems = [];
    const foliageItems = [];
    const topItems = [];
    const twoLayer = g.detailedProps;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      trunkItems.push({ x: t.x, y: walkTop + 1.1 * t.scale, z: t.z, sx: t.scale, sy: t.scale, sz: t.scale });
      if (twoLayer) {
        foliageItems.push({
          x: t.x,
          y: walkTop + 2.0 * t.scale,
          z: t.z,
          sx: t.scale * 1.2,
          sy: t.scale * 0.95,
          sz: t.scale * 1.2,
          color: PALETTE.foliage[i % PALETTE.foliage.length],
        });
        topItems.push({
          x: t.x,
          y: walkTop + 3.0 * t.scale,
          z: t.z,
          sx: t.scale * 0.82,
          sy: t.scale * 0.82,
          sz: t.scale * 0.82,
          color: PALETTE.foliage[(i + 2) % PALETTE.foliage.length],
        });
      } else {
        foliageItems.push({
          x: t.x,
          y: walkTop + 2.4 * t.scale,
          z: t.z,
          sx: t.scale,
          sy: t.scale * 1.15,
          sz: t.scale,
          color: PALETTE.foliage[i % PALETTE.foliage.length],
        });
      }
    }
    emit(
      new THREE.CylinderGeometry(0.13, 0.18, 2.2, 5),
      new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
      trunkItems,
      false
    );
    emit(
      new THREE.IcosahedronGeometry(1.35, 0),
      new THREE.MeshLambertMaterial(),
      foliageItems,
      true
    );
    if (twoLayer && topItems.length) {
      emit(
        new THREE.IcosahedronGeometry(1.35, 0),
        new THREE.MeshLambertMaterial(),
        topItems,
        true
      );
    }
  }

  // --- Bins ---------------------------------------------------------------
  if (bins.length) {
    const binItems = [];
    for (let i = 0; i < bins.length; i++) {
      binItems.push({ x: bins[i].x, y: walkTop + 0.45, z: bins[i].z });
    }
    emit(
      new THREE.BoxGeometry(0.6, 0.9, 0.6),
      new THREE.MeshLambertMaterial({ color: PALETTE.bin }),
      binItems,
      false
    );
  }

  // --- Benches (M3.1): seat + backrest ------------------------------------
  if (benches.length) {
    const seatItems = [];
    const backItems = [];
    for (let i = 0; i < benches.length; i++) {
      const b = benches[i];
      seatItems.push({ x: b.x, y: walkTop + 0.5, z: b.z, sx: 1.6, sy: 0.15, sz: 0.5, ry: b.rot });
      backItems.push({ x: b.x, y: walkTop + 0.85, z: b.z - 0.22, sx: 1.6, sy: 0.55, sz: 0.1, ry: b.rot });
    }
    emit(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: PALETTE.bench }),
      seatItems,
      false
    );
    emit(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: PALETTE.benchBack }),
      backItems,
      false
    );
  }

  parent.add(group);

  return {
    group,
    counts: { lamps: lamps.length, trees: trees.length, bins: bins.length, benches: benches.length },
  };
}