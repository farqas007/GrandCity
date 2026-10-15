// GrandCity - Phase 1: opt-in endless-world foundation (?world=endless).
//
// This is a NEW procedural layout that lives on a stable, infinite global block
// lattice. The finite city in src/world/city.js stays the default and is not
// touched. Phase 1 generated ONE chunk (the central one); Phase 2 adds the
// streaming manager (load + unload) in this file. The map UI and pedestrian
// changes remain later phases.
//
// Why a new lattice (and not the finite layout)
// ---------------------------------------------
// The finite city's layout is produced by a single sequential PRNG stream, so
// its output depends on generation order; that cannot be streamed deterministically.
// Here every value is derived from the global block/lot integer coordinates with
// the pure position hash `hash01` (from city.js) plus a per-chunk PRNG seeded
// from the chunk coordinates. As a result a chunk is identical no matter when or
// in what order it is generated.
//
// Lattice (why adjacent chunks connect exactly)
// ---------------------------------------------
// Let pitch = blockSize + roadWidth. Block b (b in Z) occupies [b*pitch,(b+1)*pitch]
// and its sidewalk pad is centred at (b + 0.5) * pitch. Road corridors are the
// block boundaries at k*pitch, so the world origin is a road intersection.
// A chunk owns chunkBlocks^2 blocks and spans chunkBlocks*pitch metres, centred
// at chunkIndex * span. Because every chunk reuses the SAME pitch and the same
// absolute origin, the road gaps and pad edges line up with no gap or overlap.
//
// Resource ownership
// ------------------
// Geometry, materials and textures are created ONCE in createChunkAssets() and
// shared by every chunk. A chunk only owns its InstancedMesh instance buffers;
// chunk.dispose() releases exactly those (via InstancedMesh.dispose()) and
// removes its group. It never disposes shared geometry/material/texture.

import * as THREE from 'three';
import { CONFIG, PALETTE } from '../config.js';
import {
  createFacadeTexture,
  createVariantFacadeTexture,
  createAsphaltTexture,
  createPavementTexture,
} from '../gfx/textures.js';
import { hash01, createCity } from './city.js';

// --- Global lattice helpers -------------------------------------------------
function pitch() {
  const c = CONFIG.city;
  return c.blockSize + c.roadWidth;
}

// World size (metres) of one chunk (square).
export function chunkSpan() {
  return CONFIG.world.chunkBlocks * pitch();
}

// World centre of the chunk at integer index ci.
export function chunkCenter(ci) {
  return ci * chunkSpan();
}

// Integer chunk index along one axis that contains world coordinate `coord`.
// A chunk spans [ci*span - span/2, ci*span + span/2]; the exact +span/2 boundary
// belongs to the higher chunk, matching the exclusive block ownership in
// blocksInChunk(). floor(x/span + 0.5) is round-half-up.
export function chunkIndexAt(coord) {
  return Math.floor(coord / chunkSpan() + 0.5);
}

// The global block indices owned by chunk index ci. Each block belongs to
// EXACTLY ONE chunk, so neighbouring chunks never generate the same block.
export function blocksInChunk(ci) {
  const k = CONFIG.world.chunkBlocks;
  const first = k * ci - k / 2;
  const out = [];
  for (let j = 0; j < k; j++) out.push(first + j);
  return out;
}

// Deterministic per-chunk PRNG seed (a pure function of the chunk coordinates).
function chunkSeed(cx, cz) {
  return Math.floor(hash01(cx, cz, CONFIG.world.seed) * 4294967296);
}

// Small deterministic PRNG (mulberry32), identical in spirit to the one used by
// city.js/pedestrians.js. Seeded per chunk above, so it never depends on order.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Shared scratch (no per-item allocation) --------------------------------
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0);

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

// ---------------------------------------------------------------------------
// Shared, cross-chunk GPU resources. Created once and reused by every chunk.
// dispose() frees them; a chunk's own dispose() must NEVER call this.
// ---------------------------------------------------------------------------
export function createChunkAssets(renderer) {
  const c = CONFIG.city;
  const g = CONFIG.graphics;
  const S = chunkSpan();
  const maxAniso = Math.min(
    CONFIG.render.anisotropy,
    renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1
  );

  const geos = [];
  const mats = [];
  const keepGeo = (x) => (geos.push(x), x);
  const keepMat = (x) => (mats.push(x), x);

  // Ground / road base. The plane's UVs are [0,1]; with a repeat of S/4 and
  // RepeatWrapping the asphalt is continuous across chunk borders because every
  // chunk min coordinate (chunkIndex*S - S/2) is a multiple of 4 m.
  const groundGeo = keepGeo(new THREE.PlaneGeometry(S, S));
  let groundMat;
  if (g.roadTextures) {
    const tex = createAsphaltTexture(PALETTE);
    tex.anisotropy = maxAniso;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(S / 4, S / 4);
    groundMat = keepMat(new THREE.MeshLambertMaterial({ map: tex }));
  } else {
    groundMat = keepMat(new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }));
  }

  // Sidewalk pads (curb slab + walk surface), matching city.js dimensions.
  const curbGeo = keepGeo(
    new THREE.BoxGeometry(c.blockSize + 1.0, c.curbHeight, c.blockSize + 1.0)
  );
  const curbMat = keepMat(new THREE.MeshLambertMaterial({ color: PALETTE.curb }));
  const walkGeo = keepGeo(
    new THREE.BoxGeometry(c.blockSize - 0.2, c.walkThickness, c.blockSize - 0.2)
  );
  let walkMat;
  if (g.roadTextures) {
    const pTex = createPavementTexture(PALETTE);
    pTex.anisotropy = maxAniso;
    pTex.repeat.set(10, 10);
    walkMat = keepMat(new THREE.MeshLambertMaterial({ map: pTex }));
  } else {
    walkMat = keepMat(new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }));
  }

  // Buildings (unit box, scaled per instance; shared facade materials).
  const box = keepGeo(new THREE.BoxGeometry(1, 1, 1));
  let facadeOfficeMat = null;
  let facadeResidentialMat = null;
  let facadeMat = null;
  if (g.facadeVariants) {
    const tOff = createVariantFacadeTexture(PALETTE, 'office');
    tOff.anisotropy = maxAniso;
    const tRes = createVariantFacadeTexture(PALETTE, 'residential');
    tRes.anisotropy = maxAniso;
    facadeOfficeMat = keepMat(new THREE.MeshLambertMaterial({ map: tOff }));
    facadeResidentialMat = keepMat(new THREE.MeshLambertMaterial({ map: tRes }));
  } else {
    const t = createFacadeTexture(PALETTE);
    t.anisotropy = maxAniso;
    facadeMat = keepMat(new THREE.MeshLambertMaterial({ map: t }));
  }

  const doorMat = keepMat(new THREE.MeshLambertMaterial({ color: PALETTE.door }));
  const markMat = keepMat(new THREE.MeshBasicMaterial({ color: PALETTE.mark }));

  // Street furniture (shared geometry/materials, matching props.js).
  const lampPoleGeo = keepGeo(new THREE.CylinderGeometry(0.09, 0.11, 4.4, 6));
  const metalMat = keepMat(new THREE.MeshLambertMaterial({ color: PALETTE.metal }));
  const lampHeadGeo = keepGeo(new THREE.BoxGeometry(0.55, 0.24, 0.55));
  const lampHeadMat = keepMat(new THREE.MeshBasicMaterial({ color: PALETTE.lamp }));
  const trunkGeo = keepGeo(new THREE.CylinderGeometry(0.13, 0.18, 2.2, 5));
  const trunkMat = keepMat(new THREE.MeshLambertMaterial({ color: PALETTE.trunk }));
  const foliageGeo = keepGeo(new THREE.IcosahedronGeometry(1.35, 0));
  const foliageMat = keepMat(new THREE.MeshLambertMaterial());
  const binGeo = keepGeo(new THREE.BoxGeometry(0.6, 0.9, 0.6));
  const binMat = keepMat(new THREE.MeshLambertMaterial({ color: PALETTE.bin }));

  function dispose() {
    const seen = new Set();
    for (const gm of geos) {
      if (!seen.has(gm)) {
        seen.add(gm);
        gm.dispose();
      }
    }
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (m.map && !seen.has(m.map)) {
        seen.add(m.map);
        m.map.dispose();
      }
      m.dispose();
    }
    geos.length = 0;
    mats.length = 0;
  }

  return {
    maxAniso,
    box,
    groundGeo,
    groundMat,
    curbGeo,
    curbMat,
    walkGeo,
    walkMat,
    facadeMat,
    facadeOfficeMat,
    facadeResidentialMat,
    doorMat,
    markMat,
    lampPoleGeo,
    lampPoleMat: metalMat,
    lampHeadGeo,
    lampHeadMat,
    trunkGeo,
    trunkMat,
    foliageGeo,
    foliageMat,
    binGeo,
    binMat,
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Deterministic generation of ONE chunk (chunkBlocks x chunkBlocks blocks).
// Adds a `chunk:<cx>:<cz>` group to `parent` and returns its handles.
// ---------------------------------------------------------------------------
export function createChunk(parent, cx, cz, assets) {
  const c = CONFIG.city;
  const g = CONFIG.graphics;
  const p = pitch();
  const S = chunkSpan();
  const groundY = -c.curbHeight;
  const walkTop = c.walkTop;
  const cx0 = chunkCenter(cx);
  const cz0 = chunkCenter(cz);

  const group = new THREE.Group();
  group.name = `chunk:${cx}:${cz}`;
  parent.add(group);

  // Chunk-owned resources that MUST be released by dispose() (instance buffers).
  const instanced = [];
  const aabbs = [];
  const emptyLots = [];

  // --- Ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(assets.groundGeo, assets.groundMat);
  ground.name = 'chunkGround';
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx0, groundY, cz0);
  ground.receiveShadow = g.shadows;
  group.add(ground);

  // --- Block pads (curb + sidewalk) ----------------------------------------
  const bx = blocksInChunk(cx);
  const bz = blocksInChunk(cz);
  const padCount = bx.length * bz.length;
  const curbs = new THREE.InstancedMesh(assets.curbGeo, assets.curbMat, padCount);
  const walks = new THREE.InstancedMesh(assets.walkGeo, assets.walkMat, padCount);
  curbs.name = 'chunkCurbs';
  walks.name = 'chunkSidewalks';
  let pi = 0;
  for (let ix = 0; ix < bx.length; ix++) {
    for (let iz = 0; iz < bz.length; iz++) {
      const px = (bx[ix] + 0.5) * p;
      const pz = (bz[iz] + 0.5) * p;
      _p.set(px, -c.curbHeight / 2, pz);
      _q.identity();
      _s.set(1, 1, 1);
      _m4.compose(_p, _q, _s);
      curbs.setMatrixAt(pi, _m4);
      _p.set(px, walkTop - c.walkThickness / 2, pz);
      _m4.compose(_p, _q, _s);
      walks.setMatrixAt(pi, _m4);
      pi++;
    }
  }
  curbs.instanceMatrix.needsUpdate = true;
  walks.instanceMatrix.needsUpdate = true;
  curbs.receiveShadow = g.shadows;
  walks.receiveShadow = g.shadows;
  group.add(curbs);
  group.add(walks);
  instanced.push(curbs, walks);

  // --- Building layout (pure function of the global lot coordinates) --------
  const lotSize = c.blockSize / c.lotsPerSide;
  const maxFoot = lotSize - c.lotMargin * 2;
  const layout = [];
  for (let ix = 0; ix < bx.length; ix++) {
    for (let iz = 0; iz < bz.length; iz++) {
      const gx = bx[ix];
      const gz = bz[iz];
      for (let lx = 0; lx < c.lotsPerSide; lx++) {
        for (let lz = 0; lz < c.lotsPerSide; lz++) {
          const ox = (lx - (c.lotsPerSide - 1) / 2) * lotSize;
          const oz = (lz - (c.lotsPerSide - 1) / 2) * lotSize;
          const x = (gx + 0.5) * p + ox;
          const z = (gz + 0.5) * p + oz;
          const LX = gx * c.lotsPerSide + lx;
          const LZ = gz * c.lotsPerSide + lz;

          if (hash01(LX, LZ, 101) < c.emptyLotChance) {
            emptyLots.push({ x, z, size: lotSize });
            continue;
          }

          const w = maxFoot * (0.6 + hash01(LX, LZ, 102) * 0.4);
          const d = maxFoot * (0.6 + hash01(LX, LZ, 103) * 0.4);
          let h = c.minHeight + hash01(LX, LZ, 104) * (c.maxHeight - c.minHeight);
          // Coarse "district" scale so the skyline varies over long distances
          // while remaining a pure function of the global coordinate.
          const district = 0.55 + 0.45 * hash01(Math.floor(LX / 8), Math.floor(LZ / 8), 200);
          h *= district;

          const variant = hash01(LX, LZ, 7) < 0.5 ? 'office' : 'residential';
          const tint =
            PALETTE.wallTints[
              Math.min(
                PALETTE.wallTints.length - 1,
                Math.floor(hash01(LX, LZ, 201) * PALETTE.wallTints.length)
              )
            ];

          layout.push({ x, z, w, d, h, variant, tint, dirX: Math.sign(ox), dirZ: Math.sign(oz) });
          aabbs.push({
            minX: x - w / 2,
            maxX: x + w / 2,
            minZ: z - d / 2,
            maxZ: z + d / 2,
          });
        }
      }
    }
  }

  // --- Building bodies ------------------------------------------------------
  const officeItems = [];
  const resItems = [];
  for (let i = 0; i < layout.length; i++) {
    const b = layout[i];
    const item = { x: b.x, y: walkTop + b.h / 2, z: b.z, sx: b.w, sy: b.h, sz: b.d, color: b.tint };
    if (g.facadeVariants) {
      if (b.variant === 'office') officeItems.push(item);
      else resItems.push(item);
    } else {
      officeItems.push(item);
    }
  }
  if (g.facadeVariants) {
    if (officeItems.length) {
      const m = buildInstanced(assets.box, assets.facadeOfficeMat, officeItems, true);
      m.name = 'chunkBuildingsOffice';
      m.castShadow = g.shadows;
      m.receiveShadow = g.shadows;
      group.add(m);
      instanced.push(m);
    }
    if (resItems.length) {
      const m = buildInstanced(assets.box, assets.facadeResidentialMat, resItems, true);
      m.name = 'chunkBuildingsResidential';
      m.castShadow = g.shadows;
      m.receiveShadow = g.shadows;
      group.add(m);
      instanced.push(m);
    }
  } else if (officeItems.length) {
    const m = buildInstanced(assets.box, assets.facadeMat, officeItems, true);
    m.name = 'chunkBuildings';
    m.castShadow = g.shadows;
    m.receiveShadow = g.shadows;
    group.add(m);
    instanced.push(m);
  }

  // --- Doors ----------------------------------------------------------------
  if (g.doors) {
    const doorItems = [];
    const dh = 3.0;
    for (let i = 0; i < layout.length; i++) {
      const b = layout[i];
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
      const m = buildInstanced(assets.box, assets.doorMat, doorItems, false);
      m.name = 'chunkDoors';
      group.add(m);
      instanced.push(m);
    }
  }

  // --- Road markings (globally phased dashed centre lines) ------------------
  // Each chunk OWNS the road lines at x = (2cx-1)*pitch and x = 2cx*pitch (and
  // the z equivalents); the right/bottom borders belong to the +1 neighbour, so
  // no two chunks emit the same marking. Dashes start on global multiples of
  // `step`, so the phase is continuous across chunk borders too.
  if (g.roadMarkings) {
    const marks = [];
    const y = groundY + 0.02;
    const step = 6;
    const dash = 3;
    const lim = c.roadWidth * 0.9;
    const vx = [(2 * cx - 1) * p, 2 * cx * p];
    const hz = [(2 * cz - 1) * p, 2 * cz * p];
    const allX = [vx[0], vx[1], (2 * cx + 1) * p];
    const allZ = [hz[0], hz[1], (2 * cz + 1) * p];
    const xmin = cx0 - S / 2;
    const xmax = cx0 + S / 2;
    const zmin = cz0 - S / 2;
    const zmax = cz0 + S / 2;

    const nearRoad = (v, arr) => {
      for (let i = 0; i < arr.length; i++) if (Math.abs(v - arr[i]) < lim) return true;
      return false;
    };

    for (let r = 0; r < vx.length; r++) {
      const rx = vx[r];
      for (let z0 = Math.ceil(zmin / step) * step; z0 + dash <= zmax; z0 += step) {
        const zc = z0 + dash / 2;
        if (nearRoad(zc, allZ)) continue;
        marks.push({ x: rx, y, z: zc, sx: c.markWidth, sy: 0.02, sz: dash });
      }
    }
    for (let r = 0; r < hz.length; r++) {
      const rz = hz[r];
      for (let x0 = Math.ceil(xmin / step) * step; x0 + dash <= xmax; x0 += step) {
        const xc = x0 + dash / 2;
        if (nearRoad(xc, allX)) continue;
        marks.push({ x: xc, y, z: rz, sx: dash, sy: 0.02, sz: c.markWidth });
      }
    }

    if (marks.length) {
      const m = buildInstanced(assets.box, assets.markMat, marks, false);
      m.name = 'chunkRoadMarkings';
      group.add(m);
      instanced.push(m);
    }
  }

  // --- Street furniture (deterministic per chunk, no shared stream) ---------
  // Budgets are scaled from the finite-city budgets by this chunk's share of
  // blocks, so furniture density matches the finite city.
  const propCounts = { lamps: 0, trees: 0, bins: 0 };
  {
    const rand = mulberry32(chunkSeed(cx, cz));
    const inner = c.blockSize / 2 - 1.6;
    const finiteBlocks = c.grid * c.grid;
    const share = finiteBlocks > 0 ? padCount / finiteBlocks : 0;
    const lampBudget = Math.max(0, Math.round((g.lampBudget || 0) * share));
    const treeBudget = Math.max(0, Math.round((g.treeBudget || 0) * share));
    const binBudget = Math.max(0, Math.round((g.binBudget || 0) * share));
    const lamps = [];
    const trees = [];
    const bins = [];

    for (let ix = 0; ix < bx.length; ix++) {
      for (let iz = 0; iz < bz.length; iz++) {
        const bxp = (bx[ix] + 0.5) * p;
        const bzp = (bz[iz] + 0.5) * p;
        const corners = [
          [bxp - inner, bzp - inner],
          [bxp + inner, bzp - inner],
          [bxp - inner, bzp + inner],
          [bxp + inner, bzp + inner],
        ];
        for (let ci = 0; ci < corners.length; ci++) {
          const ccx = corners[ci][0];
          const ccz = corners[ci][1];
          const r = rand();
          if (r < 0.16 && lamps.length < lampBudget) lamps.push({ x: ccx, z: ccz });
          else if (r < 0.34 && trees.length < treeBudget)
            trees.push({ x: ccx, z: ccz, scale: 0.8 + rand() * 0.7 });
          else if (r < 0.4 && bins.length < binBudget) bins.push({ x: ccx, z: ccz });
        }
      }
    }

    if (lamps.length) {
      const poles = [];
      const heads = [];
      for (let i = 0; i < lamps.length; i++) {
        const l = lamps[i];
        poles.push({ x: l.x, y: walkTop + 2.2, z: l.z });
        heads.push(
          g.detailedProps
            ? { x: l.x + 1.2, y: walkTop + 4.34, z: l.z, sx: 0.68, sy: 0.3, sz: 0.68 }
            : { x: l.x, y: walkTop + 4.5, z: l.z }
        );
      }
      const poleMesh = buildInstanced(assets.lampPoleGeo, assets.lampPoleMat, poles, false);
      poleMesh.name = 'chunkLampPoles';
      group.add(poleMesh);
      instanced.push(poleMesh);
      const headMesh = buildInstanced(assets.lampHeadGeo, assets.lampHeadMat, heads, false);
      headMesh.name = 'chunkLampHeads';
      group.add(headMesh);
      instanced.push(headMesh);
      if (g.detailedProps) {
        const arms = [];
        const caps = [];
        for (let i = 0; i < lamps.length; i++) {
          const l = lamps[i];
          arms.push({ x: l.x + 0.62, y: walkTop + 4.28, z: l.z, sx: 1.12, sy: 0.1, sz: 0.14 });
          caps.push({ x: l.x + 1.2, y: walkTop + 4.56, z: l.z, sx: 0.8, sy: 0.16, sz: 0.8 });
        }
        const armMesh = buildInstanced(assets.box, assets.lampPoleMat, arms, false);
        armMesh.name = 'chunkLampArms';
        group.add(armMesh);
        instanced.push(armMesh);
        const capMesh = buildInstanced(assets.box, assets.lampPoleMat, caps, false);
        capMesh.name = 'chunkLampCaps';
        group.add(capMesh);
        instanced.push(capMesh);
      }
    }

    if (trees.length) {
      const trunks = [];
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        trunks.push({ x: t.x, y: walkTop + 1.1 * t.scale, z: t.z, sx: t.scale, sy: t.scale, sz: t.scale });
      }
      const trunkMesh = buildInstanced(assets.trunkGeo, assets.trunkMat, trunks, false);
      trunkMesh.name = 'chunkTreeTrunks';
      group.add(trunkMesh);
      instanced.push(trunkMesh);

      const twoLayer = !!g.detailedProps;
      const foliage = [];
      const tops = [];
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        if (twoLayer) {
          foliage.push({
            x: t.x,
            y: walkTop + 2.0 * t.scale,
            z: t.z,
            sx: t.scale * 1.2,
            sy: t.scale * 0.95,
            sz: t.scale * 1.2,
            color: PALETTE.foliage[i % PALETTE.foliage.length],
          });
          tops.push({
            x: t.x,
            y: walkTop + 3.0 * t.scale,
            z: t.z,
            sx: t.scale * 0.82,
            sy: t.scale * 0.82,
            sz: t.scale * 0.82,
            color: PALETTE.foliage[(i + 2) % PALETTE.foliage.length],
          });
        } else {
          foliage.push({
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
      const folMesh = buildInstanced(assets.foliageGeo, assets.foliageMat, foliage, true);
      folMesh.name = 'chunkTreeFoliage';
      group.add(folMesh);
      instanced.push(folMesh);
      if (twoLayer && tops.length) {
        const topMesh = buildInstanced(assets.foliageGeo, assets.foliageMat, tops, true);
        topMesh.name = 'chunkTreeTops';
        group.add(topMesh);
        instanced.push(topMesh);
      }
    }

    if (bins.length) {
      const items = [];
      for (let i = 0; i < bins.length; i++) items.push({ x: bins[i].x, y: walkTop + 0.45, z: bins[i].z });
      const binMesh = buildInstanced(assets.binGeo, assets.binMat, items, false);
      binMesh.name = 'chunkBins';
      group.add(binMesh);
      instanced.push(binMesh);
    }

    propCounts.lamps = lamps.length;
    propCounts.trees = trees.length;
    propCounts.bins = bins.length;
  }

  const half = S / 2;
  return {
    group,
    cx,
    cz,
    aabbs,
    emptyLots,
    buildingCount: layout.length,
    propCounts,
    meshes: instanced,
    bounds: { min: cx0 - half, max: cx0 + half },
    // Release EXACTLY the chunk-owned instance buffers and un-parent the group.
    // Shared geometry/materials/textures are intentionally left alone.
    dispose() {
      parent.remove(group);
      for (let i = 0; i < instanced.length; i++) instanced[i].dispose();
      instanced.length = 0;
      group.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// The endless world object. It exposes the same API the finite city does
// (bounds / groundHeightAt / resolveCollision / updateCulling) so controls,
// vehicles and pedestrians work unchanged. There is no map UI.
// Phase 2: accepts optional initialChunks, stores chunks in a Map, computes
// dynamic bounds from all loaded chunks, and collides against every loaded
// chunk. Stage 0 adds guarded add/remove helpers that keep the Map, the chunks
// array, the aggregate counts and the bounds consistent, and removes the
// per-call AABB aggregation. Initial generation routes through addChunk() (so
// duplicate coordinates are ignored) and removeChunk() refuses to empty the
// loaded set. Phase 2.1/2.2.1b add automatic streaming (load + unload) in
// _streamUpdate(), gated by CONFIG.world.stream.enabled (default false).
// ---------------------------------------------------------------------------
export function createEndlessWorld(scene, renderer, initialChunks = [[0, 0]]) {
  const c = CONFIG.city;
  const S = chunkSpan();
  const assets = createChunkAssets(renderer);

  const group = new THREE.Group();
  group.name = 'endless';
  scene.add(group);

  // Chunks stored in a Map keyed by "cx,cz" for O(1) lookup and iteration.
  const chunks = new Map();
  let totalBuildingCount = 0;
  let totalPropCounts = { lamps: 0, trees: 0, bins: 0 };

  // Generate all initial chunks through addChunk(), which is duplicate-safe:
  // repeated coordinates are ignored, so they can never create duplicate scene
  // geometry or desynchronise the Map, chunks array, building/prop counts and
  // bounds. (addChunk/computeBounds/refreshBounds are hoisted declarations.)
  const chunksArray = []; // backward-compatible array for existing tests
  let bounds; // recomputed by the refreshBounds() call below
  for (const [cx, cz] of initialChunks) addChunk(cx, cz);
  refreshBounds();

  // Compute dynamic bounds as the union of all loaded chunk bounds + player
  // margin. X and Z are kept INDEPENDENT so a non-square set of chunks is
  // bounded correctly on each axis. `min`/`max` are retained as the
  // conservative enclosing square (identical to the old values for square
  // unions) so existing callers that read `bounds.min`/`bounds.max` keep working.
  function computeBounds() {
    const half = S / 2;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const chunk of chunks.values()) {
      // Derive each axis from its OWN chunk coordinate (chunkCenter(cx)/cz), not
      // from a shared square: a chunk at (cx, cz) spans
      // [cx0-half, cx0+half] x [cz0-half, cz0+half]. Using one axis for both
      // produced wrong Z bounds for asymmetric (non-diagonal) chunk sets.
      const x0 = chunkCenter(chunk.cx);
      const z0 = chunkCenter(chunk.cz);
      if (x0 - half < minX) minX = x0 - half;
      if (x0 + half > maxX) maxX = x0 + half;
      if (z0 - half < minZ) minZ = z0 - half;
      if (z0 + half > maxZ) maxZ = z0 + half;
    }
    // If no chunks (shouldn't happen), fall back to central chunk bounds.
    if (!Number.isFinite(minX)) {
      minX = -half; maxX = half; minZ = -half; maxZ = half;
    }
    const margin = CONFIG.player.margin;
    // apply the margin independently to each axis
    minX += margin; maxX -= margin;
    minZ += margin; maxZ -= margin;
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      // Legacy enclosing square for callers that still read min/max.
      min: Math.min(minX, minZ),
      max: Math.max(maxX, maxZ),
    };
  }

  // --- Chunk set management (Stage 0 streaming foundation) -------------------
  // Guarded lookup/add/remove that keep the Map, the backward-compatible array,
  // the aggregate counts and the dynamic bounds consistent. addChunk never
  // generates a duplicate (an existing "cx,cz" key is returned unchanged), and
  // removeChunk disposes the chunk's OWN instance buffers via chunk.dispose()
  // only - the shared geometry/material/texture assets are never touched.
  function hasChunk(cx, cz) {
    return chunks.has(`${cx},${cz}`);
  }

  function addChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const existing = chunks.get(key);
    if (existing) return existing; // guarded: never generate the same chunk twice
    const chunk = createChunk(group, cx, cz, assets);
    chunks.set(key, chunk);
    chunksArray.push(chunk);
    totalBuildingCount += chunk.buildingCount;
    totalPropCounts.lamps += chunk.propCounts.lamps;
    totalPropCounts.trees += chunk.propCounts.trees;
    totalPropCounts.bins += chunk.propCounts.bins;
    refreshBounds();
    return chunk;
  }

  function removeChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const chunk = chunks.get(key);
    if (!chunk) return false;
    // Safety guard: never let the loaded set become empty. With no chunks there
    // is no ground, no building collision and an effectively invisible world,
    // so the final loaded chunk is never removed.
    // Player-chunk protection lives in the streaming caller: _streamUpdate()
    // only removes chunks with Chebyshev distance > keepR, so the player's own
    // chunk and its protected neighbours are never removal candidates.
    if (chunks.size <= 1) return false;
    chunks.delete(key);
    const ai = chunksArray.indexOf(chunk);
    if (ai !== -1) chunksArray.splice(ai, 1);
    totalBuildingCount -= chunk.buildingCount;
    totalPropCounts.lamps -= chunk.propCounts.lamps;
    totalPropCounts.trees -= chunk.propCounts.trees;
    totalPropCounts.bins -= chunk.propCounts.bins;
    chunk.dispose(); // chunk-owned instance buffers + un-parent; NOT shared assets
    refreshBounds();
    return true;
  }

  // Same push-out + clamp contract as city.js resolveCollision(). Iterates the
  // loaded chunks in place so no combined AABB array is allocated per call.
  function resolveCollision(point, radius) {
    let hit = false;
    for (const chunk of chunks.values()) {
      const aabbs = chunk.aabbs;
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
    }
    // Clamp to dynamic world bounds, independently per axis.
    if (point.x < bounds.minX) point.x = bounds.minX;
    if (point.x > bounds.maxX) point.x = bounds.maxX;
    if (point.z < bounds.minZ) point.z = bounds.minZ;
    if (point.z > bounds.maxZ) point.z = bounds.maxZ;
    return hit;
  }

  // O(1) global surface lookup on the same lattice (sidewalk pad vs road).
  function groundHeightAt(x, z) {
    const p = pitch();
    const walkTop = CONFIG.city.walkTop;
    const groundY = -c.curbHeight;
    const gx = Math.floor(x / p);
    const gz = Math.floor(z / p);
    const bcx = (gx + 0.5) * p;
    const bcz = (gz + 0.5) * p;
    const halfPad = c.blockSize / 2 + 0.5;
    if (Math.abs(x - bcx) <= halfPad && Math.abs(z - bcz) <= halfPad) return walkTop;
    return groundY;
  }

  // Helper to refresh bounds after chunks are added/removed (used by streaming).
  function refreshBounds() {
    bounds = computeBounds();
  }

  // Phase 2.0+ streaming hook. When CONFIG.world.stream.enabled is true it
  // auto-loads nearby chunks and (Phase 2.2.1b) unloads distant ones; when false
  // it is a pure report. Returns a reused scratch object - read .cx/.cz
  // immediately, do not retain it.
  const _playerChunk = { cx: 0, cz: 0 };
  const _loadQueue = [];
  let _streamedPlayerKey = null;

  function _streamUpdate(pcx, pcz) {
    // Normalized streaming settings (Phase 2.2.1a/2.2.1b): read once per call and
    // clamped so the load/unload passes below can rely on the invariants
    //   unloadR >= loadR      (hysteresis: never unload what we just loaded)
    //   protectR <= unloadR   (the protected band sits inside the retention band)
    const stream = CONFIG.world.stream;
    const loadR = Math.max(0, (stream.loadRadius | 0));
    const unloadR = Math.max((stream.unloadRadius | 0), loadR);
    const protectR = Math.max(0, Math.min((stream.protectRadius | 0), unloadR));
    const cap = Math.max(1, (stream.maxLoadedChunks | 0));
    const unloadBudget = Math.max(0, (stream.maxChunkRemovalsPerFrame | 0));
    // keepR: nothing within this Chebyshev distance of the player's chunk is ever
    // unloaded. Since loadR <= keepR, the load set and the unload candidates are
    // disjoint by construction - unloading can never remove a required chunk.
    const keepR = Math.max(loadR, protectR, unloadR);

    const key = `${pcx},${pcz}`;

    // Rebuild the load queue whenever the player moves into a different chunk.
    // Neighbourhood ordering: center (r=0) first, then ring 1, 2... to prefer
    // nearer chunks.
    if (key !== _streamedPlayerKey) {
      _streamedPlayerKey = key;
      _loadQueue.length = 0;
      for (let r = 0; r <= loadR; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const cx = pcx + dx;
            const cz = pcz + dz;
            const qkey = `${cx},${cz}`;
            if (!chunks.has(qkey)) _loadQueue.push(cx, cz);
          }
        }
      }
    }

    // Load at most one new chunk per frame, never exceeding maxLoadedChunks.
    if (chunks.size < cap && _loadQueue.length >= 2) {
      const cx = _loadQueue.shift();
      const cz = _loadQueue.shift();
      const k = `${cx},${cz}`;
      if (!chunks.has(k)) {
        addChunk(cx, cz);
      }
    }

    // Phase 2.2.1b: unloading runs AFTER the load pass and only once the required
    // neighbourhood is satisfied. `canStillLoad` is false when nothing more can be
    // loaded this frame - either the queue is drained (all required chunks are
    // present) or the cap blocks further loading (so room must be freed). In both
    // cases unloading is safe/allowed, so a cap that is too small never deadlocks.
    const canStillLoad = chunks.size < cap && _loadQueue.length >= 2;
    if (!canStillLoad && unloadBudget > 0) {
      // Respect maxChunkRemovalsPerFrame exactly: select the farthest safe
      // candidate, remove it only AFTER the scan completes, then rescan before any
      // next removal (never mutate the Map while iterating it).
      for (let removed = 0; removed < unloadBudget; removed++) {
        if (chunks.size <= 1) break; // never empty the loaded set
        let victim = null;
        let victimD = -1;
        for (const chunk of chunks.values()) {
          const d = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
          if (d <= keepR) continue; // protected band: player's chunk + neighbours
          if (d > victimD) {
            victimD = d; // farthest-first; ties keep the first found (deterministic)
            victim = chunk;
          }
        }
        if (!victim) break; // nothing safe to remove
        removeChunk(victim.cx, victim.cz); // reuse existing: counts + bounds + dispose
      }
    }
  }

  function update(px, pz) {
    _playerChunk.cx = chunkIndexAt(px);
    _playerChunk.cz = chunkIndexAt(pz);
    const stream = CONFIG.world.stream;
    if (stream && stream.enabled) {
      _streamUpdate(_playerChunk.cx, _playerChunk.cz);
    }
    return _playerChunk;
  }

  return {
    group,
    assets,
    chunks: chunksArray, // backward-compatible array for existing tests
    _chunksMap: chunks, // internal Map for streaming
    get bounds() { return bounds; }, // dynamic getter (min/max + per-axis)
    // Live aggregates: getters so chunks added/removed later are reflected
    // immediately (a plain value would freeze at creation time).
    get buildingCount() { return totalBuildingCount; },
    get propCounts() { return totalPropCounts; },
    // Stage 0 streaming foundation: guarded chunk set management.
    hasChunk,
    addChunk,
    removeChunk,
    groundHeightAt,
    resolveCollision,
    culler: null,
    updateCulling() {}, // no-op: the endless world applies no distance culling
    // Phase 2.2.1b: when enabled, loads nearby chunks and unloads distant ones;
    // Phase 2.0 behaviour (report only) remains when disabled.
    update,
    refreshBounds, // exposed for streaming steps
    dispose() {
      for (const chunk of chunks.values()) chunk.dispose();
      scene.remove(group);
      assets.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Mode selection: the single opt-in branch. Default URLs keep the finite city.
// ---------------------------------------------------------------------------
export function isEndlessRequested(params) {
  return !!params && typeof params.get === 'function' && params.get('world') === 'endless';
}

export function createWorld(scene, renderer, params) {
  return isEndlessRequested(params)
    ? createEndlessWorld(scene, renderer)
    : createCity(scene, renderer);
}
