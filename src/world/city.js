// GrandCity - procedural city generator (M3.1).
// Layout and collision maths are unchanged from M1; M3.1 adds higher detail
// behind new preset flags while Low keeps the exact M1/M1.1 look: facade
// variants, ground-floor shopfront bands, balconies, rooftop extras, textured
// asphalt/pavement, edge lines and stop bars. Everything is original and
// generated at runtime.

import * as THREE from 'three';
import { CONFIG, PALETTE } from '../config.js';
import {
  createFacadeTexture,
  createVariantFacadeTexture,
  createShopfrontTexture,
  createAsphaltTexture,
  createPavementTexture,
} from '../gfx/textures.js';
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

// Deterministic per-position hash -> [0, 1). Used for detail selection so the
// shared PRNG stream (which drives the world layout) is never disturbed: the
// same city geometry loads every time, regardless of M3.x flags.
export function hash01(x, z, salt) {
  let h =
    (Math.imul(x | 0, 374761393) +
      Math.imul(z | 0, 668265263) +
      Math.imul(salt | 0, 1440662683)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// M3.1 building detail metrics.
const SHOP_H = 3.4; // ground-floor shopfront band height
const SHOP_THICK = 0.4;
const BALCONY_DEPTH = 0.55;
const AXIS_Y = new THREE.Vector3(0, 1, 0);

export function createCity(scene, renderer) {
  const c = CONFIG.city;
  const g = CONFIG.graphics;
  const pitch = c.blockSize + c.roadWidth; // centre-to-centre block spacing
  const extent = c.grid * pitch;
  const half = extent / 2;
  const groundY = -c.curbHeight; // road surface height
  const walkTop = c.walkTop; // sidewalk surface height (buildings sit here)
  const rand = mulberry32(c.seed);
  const maxAniso = Math.min(
    g.shadows ? 4 : CONFIG.render.anisotropy,
    renderer ? renderer.capabilities.getMaxAnisotropy() : 1
  );

  const group = new THREE.Group();
  group.name = 'city';

  // Shared transform scratches (avoid per-item allocation).
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();

  const blockCenter = (i) => (i - (c.grid - 1) / 2) * pitch;

  // Build an InstancedMesh from {x,y,z,sx,sy,sz,ry?,color?} items.
  function buildInstanced(geometry, material, items, useColor) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      p.set(it.x, it.y || 0, it.z);
      s.set(it.sx || 1, it.sy || 1, it.sz || 1);
      if (it.ry) quat.setFromAxisAngle(AXIS_Y, it.ry);
      else quat.identity();
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
  let groundMat;
  if (g.roadTextures) {
    const tex = createAsphaltTexture(PALETTE);
    tex.anisotropy = maxAniso;
    tex.repeat.set(Math.round(extent / 4), Math.round(extent / 4));
    groundMat = new THREE.MeshLambertMaterial({ map: tex });
  } else {
    groundMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 2, extent * 2),
    groundMat
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
  let walkMat;
  if (g.roadTextures) {
    const pTex = createPavementTexture(PALETTE);
    pTex.anisotropy = maxAniso;
    pTex.repeat.set(10, 10); // ~4 m slabs per face
    walkMat = new THREE.MeshLambertMaterial({ map: pTex });
  } else {
    walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  }
  const walks = new THREE.InstancedMesh(walkGeo, walkMat, padCount);
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
          addCrosswalk(marks, rx, rz, 1, 0, c, groundY, g.stopBars); // +/- X arms
          addCrosswalk(marks, rx, rz, 0, 1, c, groundY, g.stopBars); // +/- Z arms
        }
      }
    }

    // Solid edge lines along both kerbs of every road corridor.
    if (g.edgeLines) {
      const edgeOff = c.roadWidth / 2 - 0.4;
      const ln = extent; // whole corridor length, box centred at the middle
      for (let r = 0; r < roadCenters.length; r++) {
        const rc = roadCenters[r];
        marks.push({ x: 0, y, z: rc - edgeOff, sx: ln, sy: 0.02, sz: c.markWidth });
        marks.push({ x: 0, y, z: rc + edgeOff, sx: ln, sy: 0.02, sz: c.markWidth });
        marks.push({ x: rc - edgeOff, y, z: 0, sx: c.markWidth, sy: 0.02, sz: ln });
        marks.push({ x: rc + edgeOff, y, z: 0, sx: c.markWidth, sy: 0.02, sz: ln });
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

  // --- Building bodies ---------------------------------------------------
  // Detail features are chosen with a per-position hash (never the shared
  // PRNG), so the exact city layout is identical regardless of M3 flags.
  const features = [];
  for (let i = 0; i < layout.length; i++) {
    const b = layout[i];
    features.push({
      variant: hash01(b.x, b.z, 7) < 0.5 ? 'office' : 'residential',
      shop: hash01(b.x, b.z, 13) < 0.75,
      balconies: b.h >= 11 && hash01(b.x, b.z, 17) < 0.6,
      tank: b.h >= 15 && hash01(b.x, b.z, 23) < 0.45,
      antenna: b.h >= 26 && hash01(b.x, b.z, 29) < 0.4,
    });
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const aabbs = [];

  if (g.facadeVariants) {
    const tiles = {
      office: createVariantFacadeTexture(PALETTE, 'office'),
      residential: createVariantFacadeTexture(PALETTE, 'residential'),
    };
    tiles.office.anisotropy = maxAniso;
    tiles.residential.anisotropy = maxAniso;

    // Group each variant by height into `facadeTiers` instanced meshes so the
    // facade texture tiles at a consistent window scale per tier.
    for (const v of ['office', 'residential']) {
      const subset = [];
      for (let i = 0; i < layout.length; i++) {
        if (features[i].variant === v) subset.push(layout[i]);
      }
      if (!subset.length) continue;
      subset.sort((a, b) => a.h - b.h);

      const tiers = Math.max(1, Math.min(g.facadeTiers || 1, 3));
      for (let t = 0; t < tiers; t++) {
        const start = Math.floor((t * subset.length) / tiers);
        const end = Math.floor(((t + 1) * subset.length) / tiers);
        const slice = subset.slice(start, end);
        if (!slice.length) continue;

        // Representative size for this variant + tier -> window tiling.
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

        const tex = tiles[v].clone();
        tex.needsUpdate = true;
        tex.repeat.set(bays, floors);

        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.InstancedMesh(boxGeo, mat, slice.length);
        mesh.name = 'buildings_' + v + '_' + t;

        for (let i = 0; i < slice.length; i++) {
          const b = slice[i];
          p.set(b.x, walkTop + b.h / 2, b.z);
          s.set(b.w, b.h, b.d);
          quat.identity();
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
    }
  } else {
    // Legacy single-tile path. Low preset keeps the exact M1/M1.1 look.
    const sorted = layout.slice().sort((a, b) => a.h - b.h);
    const tierCount = Math.max(1, Math.min(g.facadeTiers || 1, 3));
    const baseTex = createFacadeTexture(PALETTE);
    baseTex.anisotropy = maxAniso;

    for (let t = 0; t < tierCount; t++) {
      const start = Math.floor((t * sorted.length) / tierCount);
      const end = Math.floor(((t + 1) * sorted.length) / tierCount);
      const slice = sorted.slice(start, end);
      if (!slice.length) continue;

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
        quat.identity();
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

  // --- Ground-floor shopfronts (M3.1) ------------------------------------
  // A textured band pushed just outside the street-facing facade, on the
  // primary face of selected lots. Pure visuals: collision footprints are
  // unchanged (interiors of AABBs still stop the player and car).
  if (g.shopfronts) {
    const shopItems = [];
    for (let i = 0; i < layout.length; i++) {
      if (!features[i].shop) continue;
      const b = layout[i];
      if (b.dirX !== 0) {
        shopItems.push({
          x: b.x + b.dirX * (b.w / 2 + SHOP_THICK / 2),
          y: walkTop + SHOP_H / 2,
          z: b.z,
          sx: SHOP_THICK,
          sy: SHOP_H,
          sz: b.d * 0.92,
        });
      } else {
        shopItems.push({
          x: b.x,
          y: walkTop + SHOP_H / 2,
          z: b.z + b.dirZ * (b.d / 2 + SHOP_THICK / 2),
          sx: b.w * 0.92,
          sy: SHOP_H,
          sz: SHOP_THICK,
        });
      }
    }
    if (shopItems.length) {
      const sTex = createShopfrontTexture(PALETTE);
      sTex.anisotropy = maxAniso;
      // Average band length -> horizontal tile repeat (one tile is ~3.4 m).
      let len = 0;
      for (let i = 0; i < shopItems.length; i++) {
        len += Math.max(shopItems[i].sx, shopItems[i].sz);
      }
      len /= shopItems.length;
      sTex.repeat.set(Math.max(2, Math.round(len / 3.4)), 1);

      const shopMesh = buildInstanced(
        boxGeo,
        new THREE.MeshLambertMaterial({ map: sTex }),
        shopItems,
        false
      );
      shopMesh.name = 'shopfronts';
      shopMesh.receiveShadow = g.shadows;
      group.add(shopMesh);
    }
  }

  // --- Balconies (M3.1) ---------------------------------------------------
  // Thin protruding slabs with a front rail on a subset of taller buildings.
  if (g.balconies) {
    const slabs = [];
    const rails = [];
    for (let i = 0; i < layout.length && slabs.length < g.balconyBudget; i++) {
      if (!features[i].balconies) continue;
      const b = layout[i];
      const floorsAbove = Math.max(1, Math.floor((b.h - SHOP_H - 4) / c.floorHeight));
      if (floorsAbove < 1) continue;
      const f = 2 + Math.floor(hash01(b.x, b.z, 31) * Math.min(floorsAbove, 6));
      const y = walkTop + SHOP_H + f * c.floorHeight + 1.0; // sits above the shop band
      const width = Math.min(2.8, b.w * 0.5);
      const zoff = (hash01(b.x, b.z, 41) - 0.5) * Math.max(1.5, b.d - 2.6);
      const xoff = (hash01(b.x, b.z, 43) - 0.5) * Math.max(1.5, b.w - 2.6);

      if (hash01(b.x, b.z, 37) < 0.5 && b.dirX !== 0) {
        // Faces +X / -X.
        const cx = b.x + b.dirX * (b.w / 2 + BALCONY_DEPTH / 2 - 0.05);
        slabs.push({ x: cx, y, z: b.z + zoff, sx: BALCONY_DEPTH, sy: 0.12, sz: width });
        rails.push({
          x: cx + b.dirX * (BALCONY_DEPTH / 2 - 0.03),
          y: y + 0.62,
          z: b.z + zoff,
          sx: 0.06, sy: 0.64, sz: width,
        });
      } else {
        // Faces +Z / -Z.
        const cz = b.z + b.dirZ * (b.d / 2 + BALCONY_DEPTH / 2 - 0.05);
        slabs.push({ x: b.x + xoff, y, z: cz, sx: width, sy: 0.12, sz: BALCONY_DEPTH });
        rails.push({
          x: b.x + xoff,
          y: y + 0.62,
          z: cz + b.dirZ * (BALCONY_DEPTH / 2 - 0.03),
          sx: width, sy: 0.64, sz: 0.06,
        });
      }
    }
    if (slabs.length) {
      const slabMesh = buildInstanced(
        boxGeo,
        new THREE.MeshLambertMaterial({ color: PALETTE.balcony }),
        slabs,
        false
      );
      slabMesh.name = 'balconies';
      group.add(slabMesh);

      const railMesh = buildInstanced(
        boxGeo,
        new THREE.MeshLambertMaterial({ color: PALETTE.balconyRail }),
        rails,
        false
      );
      railMesh.name = 'balconyRails';
      group.add(railMesh);
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

    // Rooftop extras (M3.1): water tanks and radio antennas.
    if (g.roofExtras) {
      const tanks = [];
      const antennas = [];
      for (let i = 0; i < layout.length; i++) {
        const b = layout[i];
        if (features[i].tank) {
          tanks.push({
            x: b.x + (hash01(b.x, b.z, 53) - 0.5) * b.w * 0.4,
            z: b.z + (hash01(b.x, b.z, 59) - 0.5) * b.d * 0.4,
            y: walkTop + b.h + 0.55,
          });
        }
        if (features[i].antenna) {
          antennas.push({
            x: b.x + b.dirX * (b.w / 2 - 0.25),
            z: b.z + b.dirZ * (b.d / 2 - 0.25),
            y: walkTop + b.h + 2.5,
            sx: 0.14,
            sy: 4.0,
            sz: 0.14,
          });
        }
      }
      if (tanks.length) {
        const tankMesh = buildInstanced(
          new THREE.CylinderGeometry(0.9, 0.9, 1.1, 10),
          new THREE.MeshLambertMaterial({ color: PALETTE.roofTank }),
          tanks,
          false
        );
        tankMesh.name = 'roofTanks';
        group.add(tankMesh);
      }
      if (antennas.length) {
        const antennaMesh = buildInstanced(
          boxGeo,
          new THREE.MeshLambertMaterial({ color: PALETTE.antenna }),
          antennas,
          false
        );
        antennaMesh.name = 'antennas';
        group.add(antennaMesh);
      }
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
// across the X road; axisX=0 -> across the Z road. Each arm also gets an
// in-lane stop bar when stopBars is true.
function addCrosswalk(marks, rx, rz, axisX, axisZ, c, groundY, stopBars) {
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
    if (stopBars) {
      const sbO = offset + 3.1; // in-lane, just before the crosswalk
      if (axisX === 1) {
        marks.push({
          x: rx + side * sbO, y, z: rz - c.roadWidth * 0.18,
          sx: 2.0, sy: 0.02, sz: c.roadWidth * 0.36,
        });
      } else {
        marks.push({
          x: rx - c.roadWidth * 0.18, y, z: rz + side * sbO,
          sx: c.roadWidth * 0.36, sy: 0.02, sz: 2.0,
        });
      }
    }
  }
}
