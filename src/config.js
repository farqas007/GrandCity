// GrandCity - configuration (M1.1).
// Every gameplay / render tunable lives here. Quality presets (Low / Medium /
// High) let the same build target very different hardware; defaults lean
// conservative for the low-end target machine (Intel Celeron N4020, ~1 GB free
// RAM, software rendering).

// ---------------------------------------------------------------------------
// Shared colour palette (hex ints for materials, hex strings for CSS/canvas).
// ---------------------------------------------------------------------------
export const PALETTE = {
  // Sky dome gradient, sampled top (0) -> horizon (1).
  skyStops: [
    [0.0, '#2f6fc0'],
    [0.5, '#7fb0e0'],
    [0.72, '#c8dcee'],
    [0.86, '#e9e0d2'],
    [1.0, '#d9cdbd'],
  ],
  fog: 0xc3d3e2,
  hemiSky: 0xbfd8ff,
  hemiGround: 0x3b3f47,
  sun: 0xfff2dc,

  asphalt: 0x2b2e34,
  mark: 0xd7dbe0,
  sidewalk: 0x9a9ea3,
  curb: 0x767b81,

  // Facade texture colours (canvas strings).
  wallBase: '#b7b1a5',
  wallFrame: '#6f6c64',
  wallGlassTop: '#8299ae',
  wallGlassBottom: '#3f5163',
  // Per-instance tint multiplied over the facade texture (kept near-white so the
  // texture detail survives).
  wallTints: ['#d8d2c6', '#c9c3b6', '#c3cad2', '#b6bec6', '#cfc8bb', '#aeb6bd'],

  roof: 0x54585e,
  cornice: 0x6b7076,
  door: 0x2f2c28,
  ac: 0x9aa0a6,

  metal: 0x3f444a,
  lamp: 0xffe6b0,
  trunk: 0x4a3b2a,
  foliage: [0x4e7a3a, 0x5f8a44, 0x3f6b34, 0x6b9a4f],
  bin: 0x3a4046,

  // Vehicle colours.
  carBody: 0xc23b3b,
  carBodyDark: 0x7d2626,
  carGlass: 0x22303c,
  carTrim: 0x2a2f36,
  carTire: 0x1a1c1f,
  carHub: 0x9aa0a6,
  carHeadlight: 0xfff6d0,
  carTaillight: 0xd83a2a,

  // M3.1 detail colours.
  shopGlass: 0x35424f,
  shopFrame: 0x58524b,
  awning: 0xa83a2f, // baked shopfront awning stripes
  balcony: 0xa9b0b8,
  balconyRail: 0x565d66,
  roofTank: 0x6e747b,
  antenna: 0x454a51,
  bench: 0x6b5238,
  benchBack: 0x5a442e,
  pavingJoint: '#5f6368',
  asphaltLight: '#34383f',
  asphaltDark: '#22252b',
};

// ---------------------------------------------------------------------------
// Quality presets. Each preset overrides a subset of CONFIG.render and
// CONFIG.graphics; anything it omits keeps its base value.
// NOTE (M3.2): resolution is NOT configured here. The visual-detail presets
// below stay independent of the fixed output resolutions in CONFIG.resolution.
// ---------------------------------------------------------------------------
const PRESETS = {
  low: {
    label: 'Low',
    render: {
      resolutionScale: 0.6,
      maxPixelRatio: 1,
      minPixelRatio: 0.5,
      antialias: false,
      toneMapping: false,
      toneMappingExposure: 1.0,
      anisotropy: 1,
      fogNear: 80,
      fogFar: 300,
    },
    graphics: {
      shadows: false,
      shadowMapSize: 512,
      skyDome: true,
      facadeTiers: 1,
      doors: true,
      roadMarkings: true,
      crosswalks: false,
      roofDetails: false,
      lampBudget: 48,
      treeBudget: 48,
      binBudget: 0,
      acBudget: 0,
      // M3.1 detail flags: Low keeps the exact M1/M2 look.
      facadeVariants: false,
      shopfronts: false,
      balconies: false,
      balconyBudget: 0,
      roofExtras: false,
      roadTextures: false,
      edgeLines: false,
      stopBars: false,
      detailedProps: false,
      benchBudget: 0,
      // M4.2 - pedestrians are additive (created by main.js, not createCity), so
      // this budget never affects the existing city geometry baselines.
      pedBudget: 10,
    },
  },

  medium: {
    label: 'Medium',
    render: {
      resolutionScale: 0.8,
      maxPixelRatio: 1,
      minPixelRatio: 0.5,
      antialias: false,
      toneMapping: true,
      toneMappingExposure: 1.0,
      anisotropy: 2,
      fogNear: 110,
      fogFar: 400,
    },
    graphics: {
      shadows: false,
      shadowMapSize: 1024,
      skyDome: true,
      facadeTiers: 2,
      doors: true,
      roadMarkings: true,
      crosswalks: true,
      roofDetails: true,
      lampBudget: 110,
      treeBudget: 140,
      binBudget: 60,
      acBudget: 120,
      // M3.1 detail flags (Medium): balanced detail, still hardware-friendly.
      facadeVariants: true,
      shopfronts: true,
      balconies: true,
      balconyBudget: 130,
      roofExtras: true,
      roadTextures: true,
      edgeLines: true,
      stopBars: true,
      detailedProps: true,
      benchBudget: 40,
      pedBudget: 20,
    },
  },

  high: {
    label: 'High',
    render: {
      resolutionScale: 1.0,
      maxPixelRatio: 1,
      minPixelRatio: 0.5,
      antialias: false,
      toneMapping: true,
      toneMappingExposure: 1.0,
      anisotropy: 4,
      fogNear: 130,
      fogFar: 480,
    },
    graphics: {
      // Shadows are available but cost real time on weak GPUs. High enables
      // them; disable with ?shadows=0 or use Low/Medium if it is too slow.
      shadows: true,
      shadowMapSize: 1024,
      skyDome: true,
      facadeTiers: 3,
      doors: true,
      roadMarkings: true,
      crosswalks: true,
      roofDetails: true,
      lampBudget: 180,
      treeBudget: 220,
      binBudget: 100,
      acBudget: 220,
      // M3.1 detail flags (High): maximum practical M3.1 detail.
      facadeVariants: true,
      shopfronts: true,
      balconies: true,
      balconyBudget: 240,
      roofExtras: true,
      roadTextures: true,
      edgeLines: true,
      stopBars: true,
      detailedProps: true,
      benchBudget: 90,
      pedBudget: 32,
    },
  },
};

export const CONFIG = {
  quality: {
    default: 'medium',
    active: 'medium',
    presets: PRESETS,
  },

  render: {
    // Base values (not preset-driven) --------------------------------
    fov: 70,
    near: 0.1,
    far: 1000, // must comfortably contain the sky dome (radius 600)
    maxDelta: 0.1, // clamp frame delta to avoid tunnelling after stalls
    clearColor: 0x0b0e14,
    fogEnabled: true,

    // Preset-driven defaults (Medium) --------------------------------
    resolutionScale: 0.8, // multiplied onto the clamped device pixel ratio
    maxPixelRatio: 1, // never render above 1:1, even on HiDPI
    minPixelRatio: 0.5,
    absoluteMaxPixelRatio: 1.5, // hard safety cap, regardless of overrides
    antialias: false,
    toneMapping: true,
    toneMappingExposure: 1.0,
    anisotropy: 2,
    fogNear: 110,
    fogFar: 400,
  },

  // ---------------------------------------------------------------------
  // M3.2 - fixed output resolution. Deliberately SEPARATE from the visual
  // detail presets: each quality name requests one exact internal drawing
  // buffer size. These are *requests*; the real buffer is measured back from
  // WebGL and reported in the HUD / overlay (see src/resolution.js). Nothing
  // here is auto-lowered for FPS.
  // ---------------------------------------------------------------------
  resolution: {
    targets: {
      low: [7680, 4320], // 8K
      medium: [11520, 6480], // 12K
      high: [19200, 10800], // 20K
    },
    // Legacy "?res=<scale>" override range (relative to the window size).
    customMinScale: 0.4,
    customMaxScale: 1.5,
    // M4.1 - practical low internal-resolution profile for weak GPUs (e.g. the
    // 4 GB Chromebook target). OPT-IN via "?profile=perf" or the overlay; the
    // 8K/12K/20K targets above and the "?res=" custom mode are unchanged.
    profiles: {
      perf: [1280, 720], // "720p" internal buffer: ~3.7 MP vs 8K's ~33 MP
    },
  },

  graphics: {
    shadows: false,
    shadowMapSize: 1024,
    // Shadow-map type ('basic' | 'pcf'). Missing/unknown falls back to PCF in
    // environment.js. PCFSoft is never selected by a preset (opt-in only, and
    // only once on-device performance has been proven).
    shadowType: 'pcf',
    shadowRadius: 70, // shadow-camera orthographic half-extent (metres)
    skyDome: true,
    // M3.3 lighting intensities. Defaults preserve the existing look; presets
    // inherit them (no preset overrides these in Stage 2).
    hemiIntensity: 1.05,
    sunIntensity: 1.5,
    facadeTiers: 2,
    doors: true,
    roadMarkings: true,
    crosswalks: true,
    roofDetails: true,
    lampBudget: 110,
    treeBudget: 140,
    binBudget: 60,
    acBudget: 120,
    // M3.1 detail flags (defaults = Medium values; Low explicitly disables).
    facadeVariants: true,
    shopfronts: true,
    balconies: true,
    balconyBudget: 130,
    roofExtras: true,
    roadTextures: true,
    edgeLines: true,
    stopBars: true,
    detailedProps: true,
    benchBudget: 40,
    // M4.1 - lightweight distance culling for street props (lamps/trees/bins/
    // benches). OFF by default so every existing preset generates byte-identical
    // geometry; opt in with "?cull=1" (or the overlay). When on, each prop
    // category is split once at load into spatial chunks and each chunk is
    // shown/hidden per frame by XZ distance — no geometry is regenerated.
    distanceCulling: false,
    cullDistance: 160, // XZ radius (metres) kept visible
    cullChunk: 40, // spatial bucket size (metres) used when splitting
    // M4.2 - pedestrian budget (per preset). 0 disables pedestrians entirely.
    // Additive: pedestrians live outside createCity, so city geometry and the
    // established regression baselines are untouched by this value.
    pedBudget: 20,
  },

  // ---------------------------------------------------------------------
  // M4.2 - pedestrian AI foundation. All values are cheap to change and the
  // whole system is disabled by setting graphics.pedBudget = 0 (or ?peds=0).
  // ---------------------------------------------------------------------
  pedestrians: {
    enabled: true,
    seed: 24601, // pedestrian-only PRNG (never touches the city layout stream)
    count: 20, // fallback when graphics.pedBudget is absent
    maxCount: 64, // hard safety cap
    radius: 0.35, // collision radius against buildings / bounds
    scaleMin: 0.9,
    scaleMax: 1.1, // per-person height variation
    girthMin: 0.88,
    girthMax: 1.14, // per-person width variation
    speedMin: 1.0, // metres / second
    speedMax: 1.9,
    accel: 4.5, // how fast actual speed approaches the target (1 / second)
    turnRate: 3.4, // max heading change (radians / second) -> smooth turning
    minThink: 5, // seconds between destination re-picks
    maxThink: 14,
    arrive: 1.4, // metres; close enough to a waypoint to pick the next one
    avoidRadius: 2.4, // pedestrian-vs-pedestrian keep-clear radius
    noticeRadius: 7, // metres; the player is "noticed" within this range
    playerAvoidRadius: 2.0, // hard keep-clear from the player/car
    sepWeight: 1.1, // weight of the separation steering
    farUpdateDistance: 90, // beyond this, simulate at a reduced rate
    farStep: 0.1, // seconds per simulation step when far (10 Hz)
    repositionDistance: 300, // relocate an NPC this far from the player
    // Spawn rings. Measured on the real skinned model (assets/pedestrians/sam.glb):
    // it renders a believable 1.67-1.89 m across the whole walk cycle at scale
    // 1.0, so the model itself is NOT undersized. The "much too small" look is
    // purely a placement question - how far the humans are from the player.
    //   * old 18-120 m ring : nearest pedestrian 58.9 m  (~27 px on a 1080p frame)
    //   - 18-55 m ring       : nearest ~18 m              (~86 px)
    //   - 10-40 m ring (now): nearest ~10 m              (~150 px, clearly visible)
    // The ring still fills BOTH near and medium range (10-40 m), and the model
    // scale stays 1.0: enlarging it would make it wrong against a human-scale
    // city (doors are 3.0 m, floors 3.2 m, the player eye 1.7 m).
    // (Distances measured on the real spawner, seed 24601.)
    spawnMinDist: 10, // initial spawn ring around the player
    spawnMaxDist: 40, // was 55/120; see the ring note above
    respawnMinDist: 20, // relocation ring; brought in so relocated NPCs stay readable
    respawnMaxDist: 60, // a little wider than the initial ring, so relocations rarely pop in view
  },

  // ---------------------------------------------------------------------
  // M4.2.1 - optional human-model presentation (opt-in, DEFAULT OFF).
  // Shows ONE pedestrian as the rigged CC0 "Sam" walker
  // (assets/pedestrians/sam.glb) instead of the box parts, through the
  // vendored GLTFLoader + SkeletonUtils. Nothing here runs unless it is
  // enabled, so the M4.2 box population is otherwise byte-identical.
  // ---------------------------------------------------------------------
  person: {
    enabled: false, // opt in with "?person=1" (or the overlay button)
    modelUrl: './assets/pedestrians/sam.glb',
    // Which pedestrian is shown as the model:
    //   -1 = the NEAREST eligible pedestrian, re-selected dynamically each frame
    //        (S0 default); >= 0 = a fixed index (legacy / headless debugging).
    index: -1,
    claimRadius: 90, // metres; the model follows the nearest pedestrian within this range
                     // (matches the near/far update distance, so a claimed pedestrian
                     // is always refreshed every frame - no stepped/far-tier motion)
    claimHysteresis: 3, // metres; a new pedestrian must be closer by this much to take the model
    clip: 'Walk_Relaxed', // clip name inside the GLB
    clipSpeed: 1.3, // authored in-place walk speed (m/s) used to sync playback
    maxTimeScale: 1.6, // clamp so slow speeds never over-speed the walk
    scale: 1.0, // uniform model scale (1 = the model's own ~1.8 m height)
    facingOffset: 0, // radians added to heading (forward axis not yet verified)
    yOffset: 0.0, // feet offset above ground (bind pose already sits on y=0)
  },

  // ---------------------------------------------------------------------
  // S1 - crowd presentation (opt-in, DEFAULT OFF). Extends the M4.2.1 idea to
  // present up to `max` pedestrians as skinned human instances of the SAME CC0
  // model (assets/pedestrians/sam.glb), reusing the loaded geometry and
  // materials across instances (SkeletonUtils.clone shares them by reference),
  // each with its own AnimationMixer. Presentation only: it consumes the
  // transform the pedestrian AI already produces and never moves anybody.
  //
  // HONEST SCOPE: these are `max` copies of one character. They are NOT varied
  // faces, outfits or skin tones - genuinely distinct characters are a later
  // stage. Do not fake that variety with material tinting.
  //
  // Opt in with "?crowd=1". It is a superset of the single-instance "?person"
  // layer; if both are requested the crowd wins (see main.js).
  // ---------------------------------------------------------------------
  crowd: {
    enabled: false, // opt in with "?crowd=1"
    modelUrl: './assets/pedestrians/sam.glb',
    max: 4, // maximum realistic humans presented at once
    radius: 90, // metres; only pedestrians within this range are eligible
    hysteresis: 3, // metres; a newcomer must be closer by this much to take a slot
    clip: 'Walk_Relaxed', // clip name inside the GLB
    clipSpeed: 1.3, // authored in-place walk speed (m/s) used to sync playback
    maxTimeScale: 1.6, // clamp so slow speeds never over-speed the walk
    scale: 1.4, // uniform model scale (1 = the model's own ~1.8 m height)
    facingOffset: 0, // radians added to heading (forward axis not yet verified)
    yOffset: 0.0, // feet offset above ground (bind pose already sits on y=0)
  },

  city: {
    grid: 8, // blocks per side (grid * grid total)
    blockSize: 40, // metres; size of each block (sidewalk pad)
    roadWidth: 12, // metres; gap between blocks (= the road)
    lotsPerSide: 2, // subdivide each block into lotsPerSide^2 lots
    lotMargin: 2.5, // metres between lot edge and building footprint
    emptyLotChance: 0.18, // chance a lot stays empty (park / vacant plot)
    minHeight: 8,
    maxHeight: 62,
    seed: 1337, // deterministic PRNG seed -> identical city every load

    curbHeight: 0.3, // road -> curb step
    walkThickness: 0.12, // sidewalk surface thickness above the curb
    floorHeight: 3.2, // used to tile the facade texture vertically
    bayWidth: 3.4, // used to tile the facade texture horizontally
    markWidth: 0.35, // road centre-line width
  },

  // ---------------------------------------------------------------------
  // Phase 1 - opt-in endless world (?world=endless). A NEW procedural layout
  // on a stable global block lattice; the finite `city` above remains the
  // default and is completely untouched. Only the central chunk is generated
  // in Phase 1 (no streaming yet) - see src/world/chunk.js. Nothing here runs
  // unless ?world=endless is present.
  // ---------------------------------------------------------------------
  world: {
    endless: false, // set true by main.js when ?world=endless is present
    chunkBlocks: 2, // blocks per chunk side (chunk = chunkBlocks^2 blocks; even)
    seed: 90210, // salt for the per-chunk PRNG (global position still dominates)
  },

  player: {
    eyeHeight: 1.7,
    walkSpeed: 12, // metres / second
    sprintSpeed: 20,
    accel: 12, // how fast velocity approaches target (1 / second)
    lookSensitivity: 0.0022, // radians per pixel of mouse movement
    pitchLimit: Math.PI / 2 - 0.05,
    collisionRadius: 0.6,
    margin: 4, // keep the player this far inside the outer world bound
  },

  // ---------------------------------------------------------------------
  // M2 - vehicle / driving system. Arcade-style, tuned to feel responsive
  // while staying cheap enough for the low-end target machine.
  // ---------------------------------------------------------------------
  vehicle: {
    // XZ distance the player must be within to press E and enter.
    enterRadius: 4.5,
    // Where the car is parked when the world starts (on the road at x = 0).
    spawn: { x: 0, z: -14, heading: 0 },

    // Longitudinal motion (metres / second, seconds).
    maxSpeed: 24, // ~86 km/h forward
    maxReverse: 8,
    accel: 9, // throttle acceleration
    brake: 24, // S / Down while moving forward
    rollFriction: 5, // coasting deceleration with no input

    // Steering. Turning is speed-dependent: nearly stationary cars barely turn,
    // and the yaw rate eases off slightly at top speed for stability.
    steerRate: 6, // how quickly steering input ramps in (1 / second)
    turnRate: 1.7, // max yaw rate at the reference speed (radians / second)
    turnSpeedRef: 7, // speed at which full steering grip is available
    maxSteerAngle: 0.5, // visual front-wheel angle (radians)

    // Collision: the car is approximated by two circles (front + rear) so it
    // cannot be driven through building footprints.
    collisionRadius: 1.0,
    sampleOffset: 1.3,

    // How quickly the car settles onto the road / sidewalk height.
    groundLerp: 10,

    // Chase camera while driving.
    camera: {
      back: 8.5, // metres behind the car
      up: 3.6,
      lookAhead: 5, // aim this far ahead of the car
      lookUp: 1.2,
      posLerp: 6, // position smoothing rate
    },

    // Mouse look-around offset (relative to the car's heading).
    orbit: {
      sensitivity: 0.0025,
      recenter: 1.5, // rate the offset eases back to centred
      maxYaw: 2.2, // radians
    },
  },
};

// The sidewalk surface height (top of the walk slab). Buildings and props sit
// on this plane; the road surface is at -city.curbHeight.
CONFIG.city.walkTop = CONFIG.city.walkThickness;

// Apply a named preset in place. Unknown names fall back to the default.
export function applyQuality(name) {
  const q = CONFIG.quality;
  const key = q.presets[name] ? name : q.default;
  const preset = q.presets[key];
  Object.assign(CONFIG.render, preset.render);
  Object.assign(CONFIG.graphics, preset.graphics);
  q.active = key;
  return key;
}

export default CONFIG;
