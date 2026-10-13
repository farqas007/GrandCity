# GrandCity

An original open-world 3D action game project. **Milestone M2 — "Walk & Drive"**
is a small, playable third-person/first-person city prototype built with
**vanilla JavaScript and Three.js ES modules**. It builds on the M1.1 graphics
upgrade by adding a drivable procedural car. No build step, no framework, no
npm dependencies.

> **Original content only.** The city, textures, and all geometry are generated
> procedurally at runtime from this repository's own code. Nothing here copies
> any third-party game's characters, story, map, assets, or branding.

---

## What M2 adds (Walk & Drive)

- A **procedurally built car** (boxy body, cabin, glass, lights, four wheels) —
  roughly 500 triangles, generated from primitives with no external assets.
- **Enter / exit** with `E`: walk up to the car (within a few metres) and press
  `E` to get in; press `E` again to step out beside it. The proximity check means
  the car can never be entered by accident from across the street.
- **Driving:** `W`/`Up` accelerates, `S`/`Down` brakes then reverses, `A`/`D`
  (or `Left`/`Right`) steer. Acceleration, braking, coasting and steering are all
  smoothed, and the car has a capped top speed (~86 km/h) and reverse speed.
- **Speed-dependent steering** (barely turns when nearly stopped, stable at top
  speed) and a **chase camera** that follows the car; the mouse can look around
  and the view eases back to centre. The normal first-person camera is restored
  on exit.
- **Collision** against building footprints using a lightweight two-circle
  ("capsule") test reusing the same collision data as the walking player, plus
  the world boundary. The car also follows the road / sidewalk height over kerbs.
- **HUD** now shows `Mode` and driving `Speed` (km/h), plus a contextual prompt
  ("Press E to enter the car" / driving controls).
- Preserved from M1.1: walking, the city, quality presets, resolution settings,
  shadows, and the FPS / debug HUD.

---

## What M1.1 contains

Building on the M1 prototype:

- **Streets & sidewalks:** two-tone sidewalk slabs with a curb lip, plus
  **road markings** — dashed centre lines and zebra **crosswalks** at
  intersections.
- **Detailed buildings:** procedurally generated **facade textures** (window
  grid + frame + floor lines) tiled per building height tier, **doors** on the
  street-facing sides, and **rooftop cornices + AC units**.
- **Street furniture:** instanced **street lamps** (glowing heads), **trees**
  (including mini-parks on vacant lots) and **bins**, all budget-capped.
- **Environment:** gradient **sky dome**, horizon-matched **fog**, hemisphere +
  directional (sun) lighting, and optional **shadows**.
- **Quality presets:** **Low / Medium / High**, selectable from the start
  overlay or via URL. They control resolution scale, fog distance, facade tiers,
  detail toggles and prop budgets.
- **Configurable resolution** with a sensible default (`0.8`) and a hard safety
  cap (`1.5`).
- Preserved from M1: WASD / arrow movement, mouse-look (Pointer Lock), Shift
  sprint, building collision + world bounds, HUD, and a centre **crosshair**.

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

### Options (URL query parameters)

| Parameter | Values | Default | Effect |
| --- | --- | --- | --- |
| `quality` | `low` \| `medium` \| `high` | `medium` | Selects the graphics preset |
| `res` | `0.4` – `1.5` | preset value | Resolution scale multiplier |
| `shadows` | `0` \| `1` | preset value | Force shadows off/on |

Examples: `http://localhost:8000/?quality=low`,
`http://localhost:8000/?quality=high&shadows=0`,
`http://localhost:8000/?res=0.6`.

The **Low / Medium / High** and **Shadows** buttons on the start overlay simply
set these URL parameters and reload.

---

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrow keys | Walk (move) |
| Mouse | Look |
| `Shift` | Sprint |
| `E` | Enter / exit the car (must be standing next to it) |
| `Esc` | Release the mouse |

While **driving**, the same keys change meaning: `W`/`Up` throttle, `S`/`Down`
brake/reverse, `A`/`D` (or `Left`/`Right`) steer, and the mouse looks around the
car (the view eases back behind the car when the mouse stops). Press `E` to get
out; the car is left parked and the first-person camera returns.

---

## Quality presets

| Setting | Low | Medium (default) | High |
| --- | --- | --- | --- |
| Resolution scale | 0.6 | 0.8 | 1.0 |
| Tone mapping | off | on | on |
| Anisotropy | 1 | 2 | 4 |
| Fog far | 300 | 400 | 480 |
| Facade tiers | 1 | 2 | 3 |
| Crosswalks | off | on | on |
| Rooftop details | off | on | on |
| Shadows | off | off | **on** |
| Lamp / tree / bin budgets | 48 / 48 / 0 | 110 / 140 / 60 | 180 / 220 / 100 |

Shadows are the most expensive feature; they are **off** except in High, and can
be toggled independently with `?shadows=`. If they hurt performance, use Low or
Medium, or add `&shadows=0`.

---

## Project structure

```
GrandCity/
├── index.html              # page shell, styles, import map, start overlay
├── .gitignore
├── README.md
├── src/
│   ├── config.js           # presets, palette, all render/city/player tunables
│   ├── main.js             # boot, renderer setup, quality handling, loop
│   ├── controls.js         # first-person controls (Pointer Lock API)
│   ├── vehicle.js          # M2: procedural car + driving controller (physics, chase cam)
│   ├── hud.js              # FPS / draw-call / position / quality / mode / speed HUD
│   ├── gfx/
│   │   └── textures.js      # procedural facade + sky canvas textures
│   └── world/
│       ├── city.js          # procedural city: roads, buildings, collision
│       ├── environment.js   # sky dome, fog, lights, optional shadows
│       └── props.js         # street furniture (lamps, trees, bins)
└── vendor/
    ├── three.module.js     # pinned Three.js build (see below)
    └── three.core.js       # required sibling module of three.module.js
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

- Geometry stays low-poly and heavily **instanced** (buildings, markings, props).
  Detail is added mostly through **small textures** rather than triangles.
- Textures are tiny (a 128×128 facade tile and a 2×256 sky gradient), generated
  once and shared; only `map` + per-instance tint are used.
- Antialiasing and post-processing are disabled; `MeshLambertMaterial` and
  `MeshBasicMaterial` avoid expensive PBR shading.
- Pixel ratio is clamped and scaled (default 0.8 of the clamped device ratio),
  with a hard cap of 1.5.
- Shadows are off by default and, when enabled, use a modest map that follows
  the player over a limited area.

Target hardware: Intel Celeron N4020, ~1 GB free RAM, software rendering.
Tune via `src/config.js` or the URL parameters.

---

## Limitations

- No audio, no NPCs, no combat, no menus beyond the start overlay.
- **One** drivable car (no traffic system); cars are not collidable while walking
  (you can walk through the parked car), and the car itself is blocked by
  buildings/bounds but not by street furniture, trees or other props.
- Car collision approximates the body with two circles, so it can clip a corner
  very slightly at speed; it cannot pass through buildings.
- Collision covers building footprints and a rectangular world boundary only;
  street furniture and trees are not collidable.
- Windows are baked into the facade texture (not individual lit geometry), so
  they do not light up individually.
- Facade window scale is consistent per height tier, not per building, so very
  small or very tall buildings can stretch slightly.
- The world is a single fixed-size grid; there is no streaming or LOD yet.
- **No automated test suite and no browser/FPS verification has been performed.**
  Only static syntax / import checks, HTTP asset checks and headless
  generation/vehicle smoke tests have been run; see the commit message for what
  was verified.

---

## License

Project code in this repository is original work; add an explicit project
license before distributing. The bundled Three.js build is MIT-licensed.
