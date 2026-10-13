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
