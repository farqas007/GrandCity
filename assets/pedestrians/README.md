# assets/pedestrians — third-party character model

This folder holds the **one** third-party 3D asset used by GrandCity, and it is
**optional**: nothing here is downloaded or loaded unless the human-model
presentation is explicitly enabled at runtime (`?person=1`, or the
*Human model* button on the start overlay). The default game uses only the
procedural box pedestrians from `src/world/pedestrians.js`.

## `sam.glb`

| | |
| --- | --- |
| Content | "Relaxed walk – Sam", an animated human character (walk-in-place) |
| Author / publisher | **Innerscene** (adapted by them from MakeHuman / MPFB assets) |
| License | **CC0-1.0** (public domain) — free to use, modify, and redistribute, including commercially, with no credit required |
| License text | https://creativecommons.org/publicdomain/zero/1.0/ |
| Asset page | https://www.innerscene.com/tools/library/3d-parts/relaxed-walk-sam-3d-person-animated-732f1206 |
| Viewer | https://www.innerscene.com/v/2GYDc4UtRzrJGnlWHveKCY |
| Upstream file | `relaxed-walk-sam-3d-person-animated.glb`, 21,020,972 bytes |
| Upstream SHA-256 | `3f60be756e93c75546918ba1ba90fe78fb09b434b27c7d282c96bbefff9f56ad` |
| **File here** | `sam.glb`, **10,444,888 bytes** |
| **File SHA-256** | `b20a7c710923d2c7768c9f76fbb0229929c6f43d4bf7d4ac8d889b250134612b` |

No credit is legally required under CC0; the attribution above is given
voluntarily and is kept so the provenance of the asset is always clear.

## Provenance of this (smaller) file

`sam.glb` is a **lossless-texture derivative** of the upstream CC0 file:

- All embedded textures were downscaled so that no dimension exceeds **1024 px**
  and re-encoded as **PNG** (lossless). Four textures were resized
  (one 4096×4096 and three 2048×2048); the remaining six were already ≤1024 px
  and were copied unchanged. Alpha is preserved for the alpha-masked textures.
- **Nothing else was altered**: all meshes, geometry, materials, the skin
  (56 joints), and the single `Walk_Relaxed` animation are byte-for-byte the
  upstream data.
- Verified after repacking: 12 meshes / 14 primitives / 13 materials /
  91,610 triangles / 65,056 vertices / 56 joints / one `Walk_Relaxed` clip
  (2.0 s, CUBICSPLINE, 168 channels). glTF `extensionsUsed`:
  `KHR_materials_specular` (no Draco/KTX2/Meshopt).

The repack tooling ran **offline** and is not part of the game build; the game
loads this file with the vendored `GLTFLoader` (see `vendor/addons/`).

## How it is used

`src/world/pedPeople.js` loads this file with `GLTFLoader`, clones the skinned
hierarchy once with `SkeletonUtils.clone`, and drives it from the transform of a
single pedestrian (position, heading, speed). The clip is authored in place, so
the world position comes entirely from the pedestrian AI — there is no root
motion. See `src/config.js` → `CONFIG.person`.
