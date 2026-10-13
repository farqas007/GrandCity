// GrandCity - M4.1 lightweight distance culling.
// Toggles `.visible` on already-built meshes according to their XZ distance from
// the camera. It NEVER creates, edits or regenerates geometry, and the per-frame
// update is allocation-free. Disabled by default (see CONFIG.graphics
// .distanceCulling) so existing presets generate byte-identical geometry.
//
// The caller registers one entry per spatially-bounded mesh (a "chunk"). Only
// props whose items have been split into chunks make sense here, since a single
// city-wide InstancedMesh cannot be culled per instance.

export function createDistanceCuller(chunkSize) {
  const entries = [];
  const size = Number.isFinite(chunkSize) && chunkSize > 0 ? chunkSize : 40;

  return {
    chunkSize: size,

    // Register a mesh with the world XZ centre of the chunk it represents.
    add(mesh, x, z) {
      entries.push({ mesh, x, z });
    },

    get count() {
      return entries.length;
    },

    // Number of registered chunks currently visible (for tests/HUD).
    visibleCount() {
      let n = 0;
      for (let i = 0; i < entries.length; i++) if (entries[i].mesh.visible) n++;
      return n;
    },

    // Show chunks within maxDistance (metres, XZ) of the camera; hide the rest.
    // Reuses only primitive maths, so there is no per-frame allocation.
    update(camera, maxDistance) {
      const cx = camera.position.x;
      const cz = camera.position.z;
      const maxSq = maxDistance * maxDistance;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const dx = e.x - cx;
        const dz = e.z - cz;
        e.mesh.visible = dx * dx + dz * dz <= maxSq;
      }
    },
  };
}
