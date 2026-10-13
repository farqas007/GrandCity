// GrandCity - procedural city generator (M1).
// Builds a small grid city out of a ground plane, instanced sidewalk pads and
// instanced building boxes. Everything is original, generated at runtime.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Small deterministic PRNG (mulberry32). Same seed -> same city every load.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDING_PALETTE = [
  '#8d99ae',
  '#7b8794',
  '#9aa5b1',
  '#6b7683',
  '#a7b0ba',
  '#5c6672',
];

export function createCity(scene) {
  const c = CONFIG.city;
  const pitch = c.blockSize + c.roadWidth; // centre-to-centre block spacing
  const extent = c.grid * pitch;
  const half = extent / 2;
  const rand = mulberry32(c.seed);

  const group = new THREE.Group();
  group.name = 'city';

  // Shared transform scratches (avoid per-instance allocation).
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const colour = new THREE.Color();

  // --- Ground / road base -------------------------------------------------
  const groundGeo = new THREE.PlaneGeometry(extent * 2, extent * 2);
  const groundMat = new THREE.MeshLambertMaterial({ color: c.roadColor });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  group.add(ground);

  // --- Sidewalk pads (one per block), instanced ---------------------------
  const padGeo = new THREE.BoxGeometry(c.blockSize, 0.3, c.blockSize);
  const padMat = new THREE.MeshLambertMaterial({ color: c.padColor });
  const padCount = c.grid * c.grid;
  const pads = new THREE.InstancedMesh(padGeo, padMat, padCount);
  pads.name = 'pads';

  let padIndex = 0;
  for (let ix = 0; ix < c.grid; ix++) {
    for (let iz = 0; iz < c.grid; iz++) {
      const bx = (ix - (c.grid - 1) / 2) * pitch;
      const bz = (iz - (c.grid - 1) / 2) * pitch;
      p.set(bx, -0.15, bz); // top face sits at y = 0
      m4.compose(p, quat, s);
      pads.setMatrixAt(padIndex++, m4);
    }
  }
  pads.instanceMatrix.needsUpdate = true;
  group.add(pads);

  // --- Buildings (instanced), generated per lot ---------------------------
  const lotSize = c.blockSize / c.lotsPerSide;
  const maxFoot = lotSize - c.lotMargin * 2;
  const layout = []; // { x, z, w, d, h }

  for (let ix = 0; ix < c.grid; ix++) {
    for (let iz = 0; iz < c.grid; iz++) {
      const bx = (ix - (c.grid - 1) / 2) * pitch;
      const bz = (iz - (c.grid - 1) / 2) * pitch;
      for (let lx = 0; lx < c.lotsPerSide; lx++) {
        for (let lz = 0; lz < c.lotsPerSide; lz++) {
          if (rand() < c.emptyLotChance) continue; // park / vacant lot

          const ox = (lx - (c.lotsPerSide - 1) / 2) * lotSize;
          const oz = (lz - (c.lotsPerSide - 1) / 2) * lotSize;
          const w = maxFoot * (0.6 + rand() * 0.4);
          const d = maxFoot * (0.6 + rand() * 0.4);
          let h = c.minHeight + rand() * (c.maxHeight - c.minHeight);

          // Bias height towards the block centre so the skyline reads as
          // "downtown" rather than random noise.
          const edge = Math.max(
            Math.abs(ix - (c.grid - 1) / 2),
            Math.abs(iz - (c.grid - 1) / 2)
          );
          const centreN = 1 - edge / ((c.grid - 1) / 2 || 1);
          h *= 0.55 + 0.45 * centreN;

          layout.push({ x: bx + ox, z: bz + oz, w, d, h });
        }
      }
    }
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshLambertMaterial();
  const buildings = new THREE.InstancedMesh(boxGeo, boxMat, layout.length);
  buildings.name = 'buildings';

  const aabbs = []; // axis-aligned footprints for simple collision
  for (let i = 0; i < layout.length; i++) {
    const b = layout[i];
    p.set(b.x, b.h / 2, b.z); // base sits on the pad top (y = 0)
    s.set(b.w, b.h, b.d);
    m4.compose(p, quat, s);
    buildings.setMatrixAt(i, m4);

    colour.set(BUILDING_PALETTE[Math.floor(rand() * BUILDING_PALETTE.length)]);
    buildings.setColorAt(i, colour);

    aabbs.push({
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
    });
  }
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  group.add(buildings);

  scene.add(group);

  const bounds = {
    min: -half + CONFIG.player.margin,
    max: half - CONFIG.player.margin,
  };

  // Push a point (with radius) out of any building footprint it overlaps, then
  // clamp it inside the world bounds. Returns true when a push-out happened.
  function resolveCollision(point, radius) {
    let hit = false;
    for (let i = 0; i < aabbs.length; i++) {
      const a = aabbs[i];
      const minX = a.minX - radius;
      const maxX = a.maxX + radius;
      const minZ = a.minZ - radius;
      const maxZ = a.maxZ + radius;
      if (point.x > minX && point.x < maxX && point.z > minZ && point.z < maxZ) {
        const dxLeft = point.x - minX;
        const dxRight = maxX - point.x;
        const dzLeft = point.z - minZ;
        const dzRight = maxZ - point.z;
        const m = Math.min(dxLeft, dxRight, dzLeft, dzRight);
        if (m === dxLeft) point.x = minX;
        else if (m === dxRight) point.x = maxX;
        else if (m === dzLeft) point.z = minZ;
        else point.z = maxZ;
        hit = true;
      }
    }

    if (point.x < bounds.min) point.x = bounds.min;
    if (point.x > bounds.max) point.x = bounds.max;
    if (point.z < bounds.min) point.z = bounds.min;
    if (point.z > bounds.max) point.z = bounds.max;

    return hit;
  }

  return {
    group,
    bounds,
    buildingCount: layout.length,
    resolveCollision,
  };
}
