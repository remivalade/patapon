import * as T from './vendor/three.module.min.js';
export const RADIUS = 260;
export const CENTER = new T.Vector3(0, RADIUS, 0);
export const TOWER_HEIGHT = RADIUS - 8;

export function normalAt(x, z) {
  const r = Math.hypot(x, z),
    a = r / RADIUS;
  return r < 1e-8
    ? new T.Vector3(0, -1, 0)
    : new T.Vector3((Math.sin(a) * x) / r, -Math.cos(a), (Math.sin(a) * z) / r);
}
export function chart(n) {
  const a = Math.acos(T.MathUtils.clamp(-n.y, -1, 1)),
    s = Math.hypot(n.x, n.z);
  return s < 1e-8 ? { x: 0, z: 0 } : { x: (n.x / s) * a * RADIUS, z: (n.z / s) * a * RADIUS };
}
// Height of the ground above the bare sphere (positive = towards the centre).
// Flat around the village, the meadow lakes and the tunnel; rolling hills elsewhere; the
// mountain above the big lake with its spring and stream bed; lakes dug below.
export function relief(n) {
  const distance = Math.acos(T.MathUtils.clamp(-n.y, -1, 1)) * RADIUS;
  let blend = T.MathUtils.smoothstep(distance, 115, 220);
  if (distance < 200) {
    // Keep the tunnel and its approach flat.
    const c = chart(n),
      dz = c.z < 70 ? 70 - c.z : c.z > 165 ? c.z - 165 : 0,
      tunnel = Math.hypot(c.x, dz);
    blend *= T.MathUtils.smoothstep(tunnel, 18, 42);
  }
  const hills =
    blend *
    (4 +
      3 * Math.sin(n.x * 7 + n.z * 3) * Math.cos(n.y * 6) +
      1.5 * Math.sin(n.z * 11 + n.y * 5) +
      0.8 * Math.sin(n.x * 23 - n.z * 17));
  const r = bigLakeRadius(n),
    island = islandDistance(n);
  const land =
    (hills + mountainHeight(n)) * T.MathUtils.smoothstep(r, 1, 1.14) +
    2.2 * (1 - T.MathUtils.smoothstep(island, 10, 19));
  return land - lakeDepth(n) - streamBed(n);
}
export function surface(n, height = 0) {
  return n
    .clone()
    .multiplyScalar(RADIUS - relief(n) - height)
    .add(CENTER);
}
export function surfacePoint(x, z, height = 0) {
  return surface(normalAt(x, z), height);
}
export function orientation(n) {
  return new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), n.clone().negate());
}
// Parallel transport preserves a straight course through every pole and seam.
export function advanceFrame(normal, forward, side, ahead, distance) {
  const up = normal.clone().negate(),
    right = forward.clone().cross(up).normalize();
  const tangent = forward.clone().multiplyScalar(ahead).addScaledVector(right, side);
  const length = tangent.length();
  if (length < 1e-8) return { normal: normal.clone(), forward: forward.clone() };
  tangent.divideScalar(length);
  const axis = normal.clone().cross(tangent).normalize();
  const q = new T.Quaternion().setFromAxisAngle(axis, (distance * Math.min(1, length)) / RADIUS);
  return {
    normal: normal.clone().applyQuaternion(q).normalize(),
    forward: forward.clone().applyQuaternion(q).normalize(),
  };
}
export function smallLakeRadius(n) {
  if (n.y > -0.85) return 10;
  const { x, z } = chart(n);
  return Math.sqrt(((x + 29) / 24) ** 2 + ((z + 15) / 32) ** 2);
}
export function lakeDepth(n) {
  const r = smallLakeRadius(n),
    big = bigLakeRadius(n);
  return (
    (r < 1 ? 4 * T.MathUtils.smoothstep(1 - r, 0, 0.65) : 0) +
    (big < 1
      ? 10 *
        T.MathUtils.smoothstep(1 - big, 0, 0.2) *
        T.MathUtils.smoothstep(islandDistance(n), 17, 25)
      : 0)
  );
}
export function surfaceBlocked(n, padding = 0) {
  if (n.y > -0.8) return false;
  const { x, z } = chart(n);
  if (x > 21 - padding && x < 38 + padding && z > -13 - padding && z < 5 + padding) return true;
  return ((x - 49) / (12 + padding)) ** 2 + ((z - 20) / (10 + padding)) ** 2 < 1;
}
export const ROAD_A = normalAt(73, 32);
export const ROAD_B = new T.Vector3(0, 0, -1).projectOnPlane(ROAD_A).normalize();
export const ROAD_AXIS = ROAD_A.clone().cross(ROAD_B).normalize();
export function roadNormal(t) {
  return ROAD_A.clone()
    .multiplyScalar(Math.cos(t))
    .addScaledVector(ROAD_B, Math.sin(t))
    .normalize();
}
export const MEADOW = roadNormal(0.69).addScaledVector(ROAD_AXIS, 0.085).normalize();
export function roadDistance(n) {
  return Math.asin(Math.min(1, Math.abs(n.dot(ROAD_AXIS)))) * RADIUS;
}
export function meadowDistance(n) {
  return Math.acos(T.MathUtils.clamp(n.dot(MEADOW), -1, 1)) * RADIUS;
}
// Index obstacle footprints on the sphere; movement uses short swept substeps.
export class SurfaceCollisions {
  constructor() {
    this.cells = new Map();
    this.objects = [];
    this.cellSize = 20;
  }
  add(n, radius, height) {
    const c = { n: n.clone(), radius, height };
    this.objects.push(c);
    const p = n.clone().multiplyScalar(RADIUS),
      d = radius + 3;
    for (let x = Math.floor((p.x - d) / 20); x <= Math.floor((p.x + d) / 20); x++)
      for (let y = Math.floor((p.y - d) / 20); y <= Math.floor((p.y + d) / 20); y++)
        for (let z = Math.floor((p.z - d) / 20); z <= Math.floor((p.z + d) / 20); z++) {
          const key = x + ',' + y + ',' + z;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(c);
        }
    return c;
  }
  nearby(n) {
    const p = n.clone().multiplyScalar(RADIUS);
    return (
      this.cells.get(
        Math.floor(p.x / 20) + ',' + Math.floor(p.y / 20) + ',' + Math.floor(p.z / 20),
      ) || []
    );
  }
  resolve(n, radius = 0.6, height = 0) {
    const result = n.clone();
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (const c of this.nearby(result)) {
        if (height > c.height + 0.2) continue;
        const distance = result.distanceTo(c.n) * RADIUS,
          min = c.radius + radius;
        if (distance >= min) continue;
        let away = result.clone().addScaledVector(c.n, -result.dot(c.n));
        if (away.lengthSq() < 1e-12) away = new T.Vector3(1, 0, 0).projectOnPlane(c.n);
        if (away.lengthSq() < 1e-12) away.set(0, 0, 1);
        away.normalize();
        result
          .copy(c.n)
          .multiplyScalar(Math.cos((min + 0.025) / RADIUS))
          .addScaledVector(away, Math.sin((min + 0.025) / RADIUS))
          .normalize();
        changed = true;
      }
      if (!changed) break;
    }
    return result;
  }
}

// The second lake is centred exactly opposite the cabin, away from chart seams.
export const BIG_LAKE = normalAt(29, -4).negate();
export const LAKE_X = ROAD_AXIS.clone().projectOnPlane(BIG_LAKE).normalize();
export const LAKE_Z = BIG_LAKE.clone().cross(LAKE_X).normalize();
export function bigLakeNormal(x, z) {
  const d = Math.hypot(x, z),
    a = d / RADIUS;
  return d < 1e-8
    ? BIG_LAKE.clone()
    : BIG_LAKE.clone()
        .multiplyScalar(Math.cos(a))
        .addScaledVector(LAKE_X, (Math.sin(a) * x) / d)
        .addScaledVector(LAKE_Z, (Math.sin(a) * z) / d)
        .normalize();
}
export function bigLakeChart(n) {
  const dot = T.MathUtils.clamp(n.dot(BIG_LAKE), -1, 1),
    a = Math.acos(dot),
    d = Math.hypot(n.dot(LAKE_X), n.dot(LAKE_Z));
  return d < 1e-8
    ? { x: dot > 0 ? 0 : 2000, z: 0 }
    : { x: (n.dot(LAKE_X) / d) * a * RADIUS, z: (n.dot(LAKE_Z) / d) * a * RADIUS };
}
// The big lake is wide enough to row across; the road crosses it on a long causeway.
export const LAKE_RX = 175,
  LAKE_RZ = 135;
export function bigLakeRadius(n) {
  if (n.dot(BIG_LAKE) < 0.6) return 10;
  const p = bigLakeChart(n);
  return Math.hypot(p.x / LAKE_RX, p.z / LAKE_RZ);
}
export const ISLAND_CHART = { x: 58, z: 14 };
export const ISLAND = bigLakeNormal(ISLAND_CHART.x, ISLAND_CHART.z);
// The mountain rises beside the far shore, off the road, with a spring at its top.
export const MOUNTAIN_CHART = { x: 62, z: -180 };
export const MOUNTAIN = bigLakeNormal(MOUNTAIN_CHART.x, MOUNTAIN_CHART.z);
export const MOUNTAIN_RADIUS = 52,
  MOUNTAIN_HEIGHT = 30;
export function mountainDistance(n) {
  return Math.acos(T.MathUtils.clamp(n.dot(MOUNTAIN), -1, 1)) * RADIUS;
}
export function mountainHeight(n) {
  const d = mountainDistance(n);
  if (d > MOUNTAIN_RADIUS) return 0;
  const shape = Math.pow(T.MathUtils.smoothstep(1 - d / MOUNTAIN_RADIUS, 0, 1), 1.5);
  const ridges = (1 - shape) * shape * 9 * Math.sin(n.x * 41 + n.z * 37) * Math.cos(n.y * 29);
  const basin = 1.3 * (1 - T.MathUtils.smoothstep(d, 2.6, 4.6));
  return MOUNTAIN_HEIGHT * shape + ridges - basin;
}
// The stream runs from the spring down to the shore along a gentle S; t goes 0 → 1.
export const STREAM_LENGTH = 62;
export function streamPoint(t) {
  const shoreX = 45,
    shoreZ = -127;
  const x = MOUNTAIN_CHART.x + (shoreX - MOUNTAIN_CHART.x) * t + 4 * Math.sin(t * Math.PI * 1.4),
    z = MOUNTAIN_CHART.z + 3 + (shoreZ - MOUNTAIN_CHART.z - 3) * t;
  return bigLakeNormal(x, z);
}
export function streamDistance(n) {
  if (n.dot(MOUNTAIN) < 0.9) return 1000;
  let best = 1000;
  for (let i = 0; i <= 24; i++) {
    const d = Math.acos(T.MathUtils.clamp(n.dot(streamPoint(i / 24)), -1, 1)) * RADIUS;
    if (d < best) best = d;
  }
  return best;
}
export function streamBed(n) {
  const d = streamDistance(n);
  return d > 3.2 ? 0 : 1.1 * (1 - T.MathUtils.smoothstep(d, 1.1, 3.2));
}
export function islandDistance(n) {
  return Math.acos(T.MathUtils.clamp(n.dot(ISLAND), -1, 1)) * RADIUS;
}
export function lakeRadius(n) {
  return Math.min(smallLakeRadius(n), bigLakeRadius(n));
}
export function bridgeHeight(n) {
  const r = bigLakeRadius(n);
  return roadDistance(n) < 5.8 && r < 1.1
    ? T.MathUtils.smoothstep(1.1 - r, 0, 0.22) * (4 + 5 * Math.max(0, 1 - r))
    : 0;
}
export function roadOffset(n) {
  return bridgeHeight(n) > 0 ? lakeDepth(n) + bridgeHeight(n) : 0;
}
