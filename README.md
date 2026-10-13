# GrandCity

An original open-world 3D action game project. **Milestone M1 — "Walk a Block"**
is a small, playable first-person city prototype built with **vanilla JavaScript
and Three.js ES modules**. No build step, no framework, no npm dependencies.

> **Original content only.** The city is generated procedurally at runtime from
> this repository's own code. Nothing here copies any third-party game's
> characters, story, map, assets, or branding.

---

## What M1 contains

- A flat ground plane with a procedural **8×8 block grid** of streets and
  sidewalk pads.
- **~200 instanced buildings** (one `InstancedMesh`, per-instance scale + colour).
- **First-person movement**: WASD / arrow keys, mouse-look via Pointer Lock,
  Shift to sprint, smooth acceleration.
- Simple **collision** (axis-aligned building footprints) and world-boundary
  clamping so you cannot walk off the map.
- An **FPS / draw-call / triangle / position HUD**.
- Low-end-friendly rendering: pixel ratio capped at 1 and scaled to 0.75,
  antialiasing off, **no shadows, no post-processing**, cheap
  `MeshLambertMaterial`, and distance fog.

---

## Requirements

- A modern browser with WebGL (the browser runs on **ChromeOS Chrome**; the code
  is served from the Linux/Crostini container and reached over localhost).
- **Python 3** for a zero-dependency static server (already installed).
- Node.js is only used for optional syntax checks — it is **not** a runtime
  dependency.

---

## Run it

From this directory:

```bash
python3 -m http.server 8000
```

Then open the URL in ChromeOS Chrome:

```
http://localhost:8000
```

Click the page once to capture the mouse (pointer lock). Press `Esc` to release it.

> Why a server instead of opening `index.html` directly? ES modules and import
> maps require an `http://` origin; `file://` will not work.

---

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrow keys | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `Esc` | Release the mouse |

---

## Project structure

```
GrandCity/
├── index.html            # page shell, styles, import map, start overlay
├── .gitignore
├── README.md
├── src/
│   ├── config.js         # all render / city / player tunables
│   ├── main.js           # boot, scene/renderer setup, render loop
│   ├── controls.js       # first-person controls (Pointer Lock API)
│   ├── hud.js            # FPS / draw-call / position HUD
│   └── world/
│       └── city.js       # procedural instanced city generator
└── vendor/
    ├── three.module.js   # pinned Three.js build (see below)
    └── three.core.js     # required sibling module of three.module.js
```

---

## Pinned dependency: Three.js

- **Version:** `0.186.1` (`REVISION = '186'`)
- **Source:** the official npm package `three@0.186.1`
- The package tarball was verified against the npm registry's published
  metadata **before** extraction:

  | Algorithm | Expected (registry) | Computed | Match |
  | --- | --- | --- | --- |
  | SHA-512 (SRI) | `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==` | same | ✅ |
  | SHA-1 | `6d50f70c2c437f844179bbb56d6f5b774e1ca38a` | same | ✅ |

- The vendored files were extracted unmodified from that verified tarball
  (`build/three.module.js`, `build/three.core.js`). Their SHA-256 digests are:

  | File | SHA-256 |
  | --- | --- |
  | `vendor/three.module.js` | `9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea` |
  | `vendor/three.core.js` | `9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6` |

- **License:** Three.js is MIT-licensed; the copyright header is preserved at
  the top of each vendored file.

No CDN is required at runtime — the import map in `index.html` resolves the bare
specifier `three` to the local `vendor/three.module.js`.

---

## Performance notes

These are **design targets based on the hardware constraints, not measured
results** (no on-device browser test has been run yet):

- Renderer pixel ratio is clamped to `1` and further scaled by `0.75`, so the
  framebuffer renders ~56% of the window's pixels and the browser upscales.
- Antialiasing, shadows and post-processing are disabled.
- Buildings and sidewalk pads are drawn with `InstancedMesh`, keeping the draw
  call count low (typically a handful of calls per frame).
- `MeshLambertMaterial` avoids the cost of PBR shading; fog hides distant
  geometry and lets the camera keep a short far plane.

Target hardware: Intel Celeron N4020, ~1 GB free RAM, software rendering.
Adjust `src/config.js` (`render.pixelRatio`, `city.grid`, `city.maxHeight`) to
trade quality for speed.

---

## Limitations (M1 scope)

- No audio, no vehicles, no NPCs, no combat, no menus beyond the start overlay.
- Collision is limited to axis-aligned building boxes plus a rectangular world
  boundary — no ramps, slopes, or multi-floor interiors.
- The world is a single fixed-size grid; there is no streaming or LOD yet.
- **No automated test suite.** Only static syntax checks (`node --check`) have
  been run; see the repository history / commit message for what was verified.

---

## License

Project code in this repository is original work; add an explicit project
license before distributing. The bundled Three.js build is MIT-licensed.
