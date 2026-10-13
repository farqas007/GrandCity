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
};

// ---------------------------------------------------------------------------
// Quality presets. Each preset overrides a subset of CONFIG.render and
// CONFIG.graphics; anything it omits keeps its base value.
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
