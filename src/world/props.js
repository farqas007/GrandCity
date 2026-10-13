// GrandCity - street furniture (M1.1).
// Instanced lamps, trees (including mini-parks on vacant lots) and bins.
// Everything is budget-capped by the active quality preset.

import * as THREE from 'three';
import { PALETTE } from '../config.js';

// Shared scratch objects for building instance matrices.
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

// Build an InstancedMesh from a list of {x,y,z,sx,sy,sz,color?} items.
function buildInstanced(geometry, material, items, useColor) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    _p.set(it.x, it.y || 0, it.z);
    _s.set(it.sx || 1, it.sy || 1, it.sz || 1);
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

  const group = new THREE.Group();
  group.name = 'props';

  // --- Lamps: pole + glowing head ----------------------------------------
  if (lamps.length) {
    const poleItems = [];
    const headItems = [];
    for (let i = 0; i < lamps.length; i++) {
      poleItems.push({ x: lamps[i].x, y: walkTop + 2.2, z: lamps[i].z });
      headItems.push({ x: lamps[i].x, y: walkTop + 4.5, z: lamps[i].z });
    }
    const poles = buildInstanced(
      new THREE.CylinderGeometry(0.09, 0.11, 4.4, 6),
      new THREE.MeshLambertMaterial({ color: PALETTE.metal }),
      poleItems,
      false
    );
    const heads = buildInstanced(
      new THREE.BoxGeometry(0.55, 0.24, 0.55),
      new THREE.MeshBasicMaterial({ color: PALETTE.lamp }),
      headItems,
      false
    );
    group.add(poles);
    group.add(heads);
  }

  // --- Trees: trunk + low-poly foliage -----------------------------------
  if (trees.length) {
    const trunkItems = [];
    const foliageItems = [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      trunkItems.push({ x: t.x, y: walkTop + 1.1 * t.scale, z: t.z, sx: t.scale, sy: t.scale, sz: t.scale });
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
    const trunks = buildInstanced(
      new THREE.CylinderGeometry(0.13, 0.18, 2.2, 5),
      new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
      trunkItems,
      false
    );
    const foliage = buildInstanced(
      new THREE.IcosahedronGeometry(1.35, 0),
      new THREE.MeshLambertMaterial(),
      foliageItems,
      true
    );
    group.add(trunks);
    group.add(foliage);
  }

  // --- Bins ---------------------------------------------------------------
  if (bins.length) {
    const binItems = [];
    for (let i = 0; i < bins.length; i++) {
      binItems.push({ x: bins[i].x, y: walkTop + 0.45, z: bins[i].z });
    }
    const binMesh = buildInstanced(
      new THREE.BoxGeometry(0.6, 0.9, 0.6),
      new THREE.MeshLambertMaterial({ color: PALETTE.bin }),
      binItems,
      false
    );
    group.add(binMesh);
  }

  parent.add(group);

  return { group, counts: { lamps: lamps.length, trees: trees.length, bins: bins.length } };
}
