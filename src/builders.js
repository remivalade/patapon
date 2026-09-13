import * as T from './vendor/three.module.min.js';
import { normalAt, orientation, surfacePoint } from './navigation.js';
// Deterministic pseudo-random sequence: the world is rebuilt identically at every start
// as long as the construction order stays the same.
export function createRandom(seed) {
  return function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
// Small low-poly building blocks sharing one material per colour.
export function createBuilders() {
  const mats = new Map();
  function mat(color, emissive = null) {
    const key = color + '/' + emissive;
    if (!mats.has(key))
      mats.set(
        key,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.88,
          flatShading: true,
          ...(emissive ? { emissive, emissiveIntensity: 1.6 } : {}),
        }),
      );
    return mats.get(key);
  }
  function mesh(g, m, p, x = 0, y = 0, z = 0) {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    p.add(o);
    return o;
  }
  function box(p, x, y, z, a, b, c, col) {
    return mesh(new T.BoxGeometry(a, b, c), mat(col), p, x, y, z);
  }
  function ball(p, x, y, z, r, col, detail = 0) {
    return mesh(new T.IcosahedronGeometry(r, detail), mat(col), p, x, y, z);
  }
  function cyl(p, x, y, z, rt, rb, h, col, n = 8) {
    return mesh(new T.CylinderGeometry(rt, rb, h, n), mat(col), p, x, y, z);
  }
  function beam(p, a, b, r, col) {
    const va = new T.Vector3(...a),
      vb = new T.Vector3(...b),
      d = vb.clone().sub(va);
    const o = cyl(p, ...va.clone().add(vb).multiplyScalar(0.5).toArray(), r, r, d.length(), col, 6);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return o;
  }
  return { mat, mesh, box, ball, cyl, beam };
}
// Objects laid out on a flat X/Z plan are moved onto the inner face of the globe.
export function placeOnGlobe(o) {
  const x = o.position.x,
    z = o.position.z,
    h = o.position.y;
  const q = orientation(normalAt(x, z));
  o.position.copy(surfacePoint(x, z, h));
  o.quaternion.premultiply(q);
  return o;
}
