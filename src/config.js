// GrandCity - M1 configuration
// Every gameplay / render tunable lives here so the prototype can be retuned
// without touching logic. Defaults are chosen for low-end hardware
// (Intel Celeron N4020, ~1 GB free RAM, no dedicated GPU).

export const CONFIG = {
  render: {
    // Multiplier applied on top of the clamped device pixel ratio. Values < 1
    // render fewer pixels and let the browser upscale -> large win on weak
    // GPUs and software rendering. 0.75 = 56% of the pixels.
    pixelRatio: 0.75,
    minPixelRatio: 0.5,
    maxPixelRatio: 1, // never render above 1:1, even on HiDPI panels
    fov: 70,
    near: 0.1,
    far: 600,
    antialias: false, // costly, especially without a GPU
    maxDelta: 0.1, // clamp frame delta (seconds) to avoid tunnelling after stalls
    clearColor: 0x0b0e14,
    fogEnabled: true,
    fogNear: 120,
    fogFar: 420,
  },

  city: {
    grid: 8, // blocks per side (grid * grid total)
    blockSize: 40, // metres; size of each sidewalk pad
    roadWidth: 12, // metres; gap between pads (= the road)
    lotsPerSide: 2, // subdivide each block into lotsPerSide^2 lots
    lotMargin: 2.5, // metres between lot edge and building footprint
    emptyLotChance: 0.18, // chance a lot stays empty (park / vacant plot)
    minHeight: 8,
    maxHeight: 62,
    seed: 1337, // deterministic PRNG seed -> identical city every load
    groundColor: 0x3a3f4b,
    roadColor: 0x24262b,
    padColor: 0x4c4f57,
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

export default CONFIG;
