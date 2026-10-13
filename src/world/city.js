// GrandCity - procedural city generator (M1.1).
// Layout and collision maths are unchanged from M1; the visuals were upgraded
// with two-tone sidewalks, road markings, textured tiered buildings, doors and
// rooftop details. Everything is original, generated at runtime.

import * as THREE from 'three';
import { CONFIG, PALETTE } from '../config.js';
import { createFacadeTexture } from '../gfx/textures.js';
import { createProps } from './props.js';

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

export function createCity(scene, renderer) {
  const c = CONFIG.city;
  const g = CONFIG.graphics;
  const pitch = c.blockSize + c.roadWidth; // centre-to-centre block spacing
  const extent = c.grid * pitch;
  const half = extent / 2;
  const groundY = -c.curbHeight; // road surface height
  const walkTop = c.walkTop; // sidewalk surface height (buildings sit here)
  const rand = mulberry32(c.seed);

  const group = new THREE.Group();
  group.name = 'city';

  // Shared transform scratches (avoid per-item allocation).
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();

  const blockCenter = (i) => (i - (c.grid - 1) / 2) * pitch;

  // Build an InstancedMesh from {x,y,z,sx,sy,sz,color?} items.
  function buildInstanced(geometry, material, items, useColor) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      p.set(it.x, it.y || 0, it.z);
      s.set(it.sx || 1, it.sy || 1, it.sz || 1);
      m4.compose(p, quat, s);
      mesh.setMatrixAt(i, m4);
      if (useColor && it.color !== undefined) {
        col.set(it.color);
        mesh.setColorAt(i, col);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (useColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  // --- Ground / road base -------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 2, extent * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.asphalt })
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = g.shadows;
  group.add(ground);

  // --- Sidewalks: curb slab + lighter walk surface ------------------------
  const padCount = c.grid * c.grid;

  const curbGeo = new THREE.BoxGeometry(c.blockSize + 1.0, c.curbHeight, c.blockSize + 1.0);
  const curbs = new THREE.InstancedMesh(
    curbGeo,
    new THREE.MeshLambertMaterial({ color: PALETTE.curb }),
    padCount
  );
  curbs.name = 'curbs';

  const walkGeo = new THREE.BoxGeometry(c.blockSize - 0.2, c.walkThickness, c.blockSize - 0.2);
  const walks = new THREE.InstancedMesh(
    walkGeo,
    new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
    padCount
  );
  walks.name = 'sidewalks';

  let padIndex = 0;
  for (let ix = 0; ix < c.grid; ix++) {
    for (let iz = 0; iz < c.grid; iz++) {
      const bx = blockCenter(ix);
      const bz = blockCenter(iz);
      p.set(bx, -c.curbHeight / 2, bz); // curb top at y = 0
      m4.compose(p, quat, s);
      curbs.setMatrixAt(padIndex, m4);
      p.set(bx, walkTop - c.walkThickness / 2, bz); // walk top at y = walkTop
      m4.compose(p, quat, s);
      walks.setMatrixAt(padIndex, m4);
      padIndex++;
    }
  }
  curbs.instanceMatrix.needsUpdate = true;
  walks.instanceMatrix.needsUpdate = true;
  curbs.receiveShadow = g.shadows;
  walks.receiveShadow = g.shadows;
  group.add(curbs);
  group.add(walks);

  // --- Road markings: dashed centre lines + crosswalks --------------------
  const roadCenters = [];
  for (let i = 0; i < c.grid - 1; i++) roadCenters.push(blockCenter(i) + pitch / 2);

  if (g.roadMarkings && roadCenters.length) {
    const marks = [];
    const y = groundY + 0.02;
    const lineStart = -half + c.roadWidth;
    const lineEnd = half - c.roadWidth;
    const step = 6; // dash + gap
    const dash = 3;

    for (let r = 0; r < roadCenters.length; r++) {
      const rc = roadCenters[r];
      for (let d = lineStart; d < lineEnd; d += step) {
        const mid = d + dash / 2;
        // Dashes along the X corridors (skip near intersections).
        if (!nearIntersection(mid, roadCenters, c.roadWidth)) {
          marks.push({ x: mid, y, z: rc, sx: dash, sy: 0.02, sz: c.markWidth });
          marks.push({ x: rc, y, z: mid, sx: c.markWidth, sy: 0.02, sz: dash });
        }
      }
    }

    if (g.crosswalks) {
      for (let a = 0; a < roadCenters.length; a++) {
        for (let b = 0; b < roadCenters.length; b++) {
          const rx = roadCenters[a];
          const rz = roadCenters[b];
          addCrosswalk(marks, rx, rz, 1, 0, c, groundY); // +/- X arms
          addCrosswalk(marks, rx, rz, 0, 1, c, groundY); // +/- Z arms
        }
      }
    }

    if (marks.length) {
      const markMesh = buildInstanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: PALETTE.mark }),
        marks,
        false
      );
      markMesh.name = 'roadMarkings';
      group.add(markMesh);
    }
  }

  // --- Buildings ----------------------------------------------------------
  const lotSize = c.blockSize / c.lotsPerSide;
  const maxFoot = lotSize - c.lotMargin * 2;
  const layout = []; // { x, z, w, d, h, dirX, dirZ }
  const emptyLots = [];

  for (let ix = 0; ix < c.grid; ix++) {
    for (let iz = 0; iz < c.grid; iz++) {
      const bx = blockCenter(ix);
      const bz = blockCenter(iz);
      for (let lx = 0; lx < c.lotsPerSide; lx++) {
        for (let lz = 0; lz < c.lotsPerSide; lz++) {
          const ox = (lx - (c.lotsPerSide - 1) / 2) * lotSize;
          const oz = (lz - (c.lotsPerSide - 1) / 2) * lotSize;
          if (rand() < c.emptyLotChance) {
            emptyLots.push({ x: bx + ox, z: bz + oz, size: lotSize });
            continue;
          }

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

          layout.push({
            x: bx + ox,
            z: bz + oz,
            w,
            d,
            h,
            dirX: Math.sign(ox), // outward face towards the road
            dirZ: Math.sign(oz),
          });
        }
      }
    }
  }

  // Group buildings by height into up to `facadeTiers` instanced meshes so the
  // facade texture can be tiled at a consistent window scale per tier.
  const sorted = layout.slice().sort((a, b) => a.h - b.h);
  const tierCount = Math.max(1, Math.min(g.facadeTiers || 1, 3));
  const baseTex = createFacadeTexture(PALETTE);
  baseTex.anisotropy = Math.min(
    g.shadows ? 4 : CONFIG.render.anisotropy,
    renderer ? renderer.capabilities.getMaxAnisotropy() : 1
  );

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const aabbs = [];

  for (let t = 0; t < tierCount; t++) {
    const start = Math.floor((t * sorted.length) / tierCount);
    const end = Math.floor(((t + 1) * sorted.length) / tierCount);
    const slice = sorted.slice(start, end);
    if (!slice.length) continue;

    // Representative size for this tier -> window tiling.
    let avgW = 0;
    let avgH = 0;
    for (let i = 0; i < slice.length; i++) {
      avgW += slice[i].w;
      avgH += slice[i].h;
    }
    avgW /= slice.length;
    avgH /= slice.length;
    const bays = Math.max(2, Math.round(avgW / c.bayWidth));
    const floors = Math.max(2, Math.round(avgH / c.floorHeight));

    const tex = baseTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(bays, floors);

    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, slice.length);
    mesh.name = 'buildings_' + t;

    for (let i = 0; i < slice.length; i++) {
      const b = slice[i];
      p.set(b.x, walkTop + b.h / 2, b.z);
      s.set(b.w, b.h, b.d);
      m4.compose(p, quat, s);
      mesh.setMatrixAt(i, m4);
      col.set(PALETTE.wallTints[(start + i) % PALETTE.wallTints.length]);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = g.shadows;
    mesh.receiveShadow = g.shadows;
    group.add(mesh);
  }

  // Collision footprints (unchanged from M1).
  for (let i = 0; i < layout.length; i++) {
    const b = layout[i];
    aabbs.push({
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
    });
  }

  // --- Doors --------------------------------------------------------------
  if (g.doors) {
    const doorItems = [];
    for (let i = 0; i < layout.length; i++) {
      const b = layout[i];
      const dh = 3.0;
      if (b.dirX !== 0) {
        doorItems.push({
          x: b.x + b.dirX * (b.w / 2 + 0.06),
          y: walkTop + dh / 2,
          z: b.z,
          sx: 0.16,
          sy: dh,
          sz: Math.min(2.2, b.d * 0.5),
        });
      }
      if (b.dirZ !== 0) {
        doorItems.push({
          x: b.x,
          y: walkTop + dh / 2,
          z: b.z + b.dirZ * (b.d / 2 + 0.06),
          sx: Math.min(2.2, b.w * 0.5),
          sy: dh,
          sz: 0.16,
        });
      }
    }
    if (doorItems.length) {
      const doors = buildInstanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: PALETTE.door }),
        doorItems,
        false
      );
      doors.name = 'doors';
      group.add(doors);
    }
  }

  // --- Rooftop details: cornice + a few AC units --------------------------
  if (g.roofDetails) {
    const cornices = [];
    const acs = [];
    for (let i = 0; i < layout.length; i++) {
      const b = layout[i];
      cornices.push({
        x: b.x,
        y: walkTop + b.h, // straddles the roof edge
        z: b.z,
        sx: b.w + 0.7,
        sy: 0.5,
        sz: b.d + 0.7,
      });
      if (b.h > 18 && acs.length < g.acBudget && rand() < 0.5) {
        const ax = b.x + (rand() - 0.5) * b.w * 0.5;
        const az = b.z + (rand() - 0.5) * b.d * 0.5;
        acs.push({ x: ax, y: walkTop + b.h + 0.6, z: az, sx: 1.4, sy: 1.0, sz: 1.0 });
      }
    }
    if (cornices.length) {
      const corniceMesh = buildInstanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: PALETTE.cornice }),
        cornices,
        false
      );
      corniceMesh.name = 'cornices';
      corniceMesh.castShadow = g.shadows;
      group.add(corniceMesh);
    }
    if (acs.length) {
      const acMesh = buildInstanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: PALETTE.ac }),
        acs,
        false
      );
      acMesh.name = 'acUnits';
      group.add(acMesh);
    }
  }

  // --- Street furniture ---------------------------------------------------
  const props = createProps(group, {
    rand,
    blockCenter,
    pitch,
    blockSize: c.blockSize,
    grid: c.grid,
    walkTop,
    graphics: g,
    emptyLots,
  });

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

  // Height of the drivable / walkable surface at (x, z): the sidewalk slab when
  // the point sits on top of a block, otherwise the road. The city is a regular
  // grid, so this is a cheap O(1) lookup (used by the vehicle to ride kerbs).
  function groundHeightAt(x, z) {
    const gx = Math.round(x / pitch + (c.grid - 1) / 2);
    const gz = Math.round(z / pitch + (c.grid - 1) / 2);
    if (gx >= 0 && gx < c.grid && gz >= 0 && gz < c.grid) {
      const bx = blockCenter(gx);
      const bz = blockCenter(gz);
      const halfPad = c.blockSize / 2 + 0.5; // matches the curb slab size
      if (Math.abs(x - bx) <= halfPad && Math.abs(z - bz) <= halfPad) return walkTop;
    }
    return groundY;
  }

  return {
    group,
    bounds,
    buildingCount: layout.length,
    propCounts: props.counts,
    resolveCollision,
    groundHeightAt,
  };
}

// True when a point along a road axis sits inside an intersection zone.
function nearIntersection(value, roadCenters, roadWidth) {
  const lim = roadWidth * 0.9;
  for (let i = 0; i < roadCenters.length; i++) {
    if (Math.abs(value - roadCenters[i]) < lim) return true;
  }
  return false;
}

// Add a zebra crosswalk on the +/- arms of an intersection. axisX=1 -> stripes
// across the X road; axisX=0 -> across the Z road.
function addCrosswalk(marks, rx, rz, axisX, axisZ, c, groundY) {
  const y = groundY + 0.02;
  const offset = c.roadWidth / 2 + 1.6; // just outside the intersection square
  const barCount = 4;
  for (let side = -1; side <= 1; side += 2) {
    if (axisX === 1) {
      const x = rx + side * offset;
      for (let b = 0; b < barCount; b++) {
        const z = rz - c.roadWidth * 0.35 + b * (c.roadWidth * 0.7) / (barCount - 1);
        marks.push({ x, y, z, sx: 2.2, sy: 0.02, sz: 0.8 });
      }
    } else {
      const z = rz + side * offset;
      for (let b = 0; b < barCount; b++) {
        const x = rx - c.roadWidth * 0.35 + b * (c.roadWidth * 0.7) / (barCount - 1);
        marks.push({ x, y, z, sx: 0.8, sy: 0.02, sz: 2.2 });
      }
    }
  }
}
