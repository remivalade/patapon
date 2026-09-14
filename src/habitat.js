import * as T from './vendor/three.module.min.js';
import { buildWater } from './water.js';
import { buildExpansion } from './expansion.js';
import { buildLandscape } from './landscape.js';
import { buildForest, fieldDistance, groveAt } from './vegetation.js';
import { placeOnGlobe } from './builders.js';
import { buildVillage } from './village.js';
import { buildSun } from './sun.js';
import { buildSunPanel } from './sunpanel.js';
import { buildMountain } from './mountain.js';
import { buildClouds } from './clouds.js';
import { buildBoat } from './boat.js';
import {
  RADIUS,
  CENTER,
  TOWER_HEIGHT,
  normalAt,
  chart,
  relief,
  streamDistance,
  smallLakeRadius,
  surface,
  surfacePoint,
  orientation,
  roadDistance,
  meadowDistance,
  bigLakeRadius,
} from './navigation.js';
// The inhabited inner face of the globe: lights, terrain, forests, rocks, lakes, village,
// tower, animals and speeder, sun, control room, tunnel, flowers and pollen.
// The construction order matters: it drives the shared random sequence.
export function buildHabitat({ world, builders, rand, collisions, camera }) {
  const { mat, mesh, box, ball, cyl, beam } = builders;
  const dummy = new T.Object3D();
  // A little flat ambient plus a hemisphere light: cool sky above, warm ground below, so
  // faces read by their orientation and shadows lean cold. world.js keeps it aligned with
  // the local up as the player walks around the globe.
  const ambient = new T.AmbientLight('#fff0d4', 0.3);
  const hemisphere = new T.HemisphereLight('#d9e6ff', '#c9b48a', 1.4);
  world.add(hemisphere);
  world.add(ambient);
  // Part of the sun's light comes from the shadow-casting directional light (world.js).
  const centralLight = new T.PointLight('#ffe3a4', 1.1, 0, 0);
  centralLight.position.copy(CENTER);
  world.add(centralLight);
  function terrainMesh() {
    // Finer than before so the hills and the mountain read; colours come from the ground
    // itself: altitude, slope, water nearby, the stream bed and the rocky summit.
    const g = new T.SphereGeometry(RADIUS, 256, 160),
      p = g.attributes.position,
      colors = [],
      color = new T.Color(),
      tint = new T.Color(),
      eps = 1.6 / RADIUS;
    const rocky = new T.Color().setHSL(0.08, 0.12, 0.42),
      summit = new T.Color().setHSL(0.1, 0.06, 0.63),
      sand = new T.Color().setHSL(0.12, 0.38, 0.6),
      lakeBed = new T.Color().setHSL(0.47, 0.32, 0.3);
    for (let i = 0; i < p.count; i++) {
      const n = new T.Vector3().fromBufferAttribute(p, i).normalize();
      const h = relief(n);
      p.setXYZ(i, n.x * (RADIUS - h), n.y * (RADIUS - h), n.z * (RADIUS - h));
      const patch = Math.sin(n.x * 17 + n.y * 5) * Math.cos(n.z * 13 - n.y * 8);
      const e1 = new T.Vector3(1, 0, 0).projectOnPlane(n).normalize(),
        e2 = n.clone().cross(e1);
      if (e1.lengthSq() < 0.5) e1.set(0, 0, 1).projectOnPlane(n).normalize();
      const dh1 = relief(n.clone().addScaledVector(e1, eps).normalize()) - h,
        dh2 = relief(n.clone().addScaledVector(e2, eps).normalize()) - h,
        slope = Math.hypot(dh1, dh2) / 1.6;
      const high = T.MathUtils.clamp(h / 12, 0, 1);
      color.setHSL(
        0.205 + patch * 0.025 - high * 0.012,
        0.33 + patch * 0.07 + high * 0.04,
        0.39 + patch * 0.06 + high * 0.04,
      );
      color.lerp(rocky, T.MathUtils.smoothstep(slope, 0.5, 1));
      color.lerp(summit, T.MathUtils.smoothstep(h, 21, 28));
      const big = bigLakeRadius(n),
        small = smallLakeRadius(n),
        shore = Math.min(big, small);
      // Sand on gentle shores only: a cliff face stays rock down to the water.
      color.lerp(
        sand,
        (1 - T.MathUtils.smoothstep(Math.abs(shore - 1.02), 0.02, 0.07)) *
          (1 - T.MathUtils.smoothstep(slope, 0.5, 1)),
      );
      color.lerp(lakeBed, 1 - T.MathUtils.smoothstep(shore, 0.94, 1));
      if (streamDistance(n) < 2.6) color.multiplyScalar(0.82);
      colors.push(color.r, color.g, color.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const o = mesh(
      g,
      new T.MeshStandardMaterial({
        vertexColors: true,
        side: T.BackSide,
        flatShading: true,
        roughness: 1,
      }),
      world,
      ...CENTER.toArray(),
    );
    o.castShadow = false;
    return o;
  }
  terrainMesh();
  // Curved disks follow the inhabited face of the globe, including their shoreline.
  function disk(cx, cz, rx, rz, h, material) {
    const positions = [],
      indices = [],
      segments = 80,
      rings = 12;
    for (let j = 0; j <= rings; j++)
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2,
          r = j / rings;
        positions.push(
          ...surfacePoint(cx + Math.cos(a) * rx * r, cz + Math.sin(a) * rz * r, h).toArray(),
        );
      }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < segments; i++) {
        const a = j * (segments + 1) + i,
          b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    material.side = T.DoubleSide;
    const o = mesh(g, material, world);
    o.castShadow = false;
    return o;
  }
  // Forests and clearings cover the entire sphere, also directly overhead.
  const trees = [];
  for (let i = 0; i < 1850; i++) {
    const u = rand() * 2 - 1,
      a = rand() * Math.PI * 2,
      n = new T.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a));
    const c = chart(n);
    if (
      Math.hypot(c.x, c.z) < 115 ||
      roadDistance(n) < 10 ||
      meadowDistance(n) < 62 ||
      bigLakeRadius(n) < 1.14 ||
      fieldDistance(n) < 8 ||
      !groveAt(n)
    )
      continue;
    trees.push({ n, s: 0.65 + rand() * 1.2 });
  }
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * 210,
      z = (rand() - 0.5) * 210;
    if (
      Math.hypot(x, z) < 20 ||
      ((x + 29) / 31) ** 2 + ((z + 15) / 40) ** 2 < 1 ||
      (x > 10 && z > -30 && z < 45) ||
      Math.hypot(x, z + 49) < 22 ||
      (Math.abs(x) < 16 && z > 35)
    )
      continue;
    const n = normalAt(x, z);
    if (
      roadDistance(n) < 10 ||
      meadowDistance(n) < 62 ||
      bigLakeRadius(n) < 1.14 ||
      fieldDistance(n) < 8 ||
      !groveAt(n)
    )
      continue;
    trees.push({ n, s: 0.8 + rand() * 0.8 });
  }
  const forest = buildForest(world, trees, collisions);
  const rocks = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), mat('#8b9a7e'), 180);
  for (let i = 0; i < 180; i++) {
    const n = new T.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const c = chart(n);
    if (Math.hypot(c.x, c.z) < 110) {
      n.y = Math.abs(n.y);
      n.normalize();
    }
    const s = 3 + rand() * 9;
    if (
      roadDistance(n) < s + 8 ||
      meadowDistance(n) < 62 ||
      bigLakeRadius(n) < 1.16 ||
      fieldDistance(n) < s + 4
    ) {
      i--;
      continue;
    }
    collisions.add(n, s, s * 0.9);
    dummy.position.copy(surface(n, 0));
    dummy.quaternion.copy(orientation(n));
    dummy.scale.set(s, s * 0.8, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = true;
  world.add(rocks);
  disk(-29, -15, 25.4, 33.5, 0.08, mat('#cbb78a'));
  const lakeWater = buildWater(world),
    distantWater = buildWater(world, true);
  for (let i = 0; i < 55; i++) {
    const a = (i / 55) * Math.PI * 2;
    const o = ball(
      world,
      -29 + Math.cos(a) * 25.7,
      0.2,
      -15 + Math.sin(a) * 33.7,
      0.5 + rand() * 0.9,
      ['#b6b795', '#dbd3a8', '#93a58b'][i % 3],
    );
    collisions.add(normalAt(o.position.x, o.position.z), o.geometry.parameters.radius * 0.65, 0.6);
    o.scale.y = 0.55;
    placeOnGlobe(o);
  }
  const { ship, animatePatapon } = buildVillage({ world, builders, rand });
  const towerNormal = normalAt(0, -49),
    towerUp = towerNormal.clone().negate(),
    towerOrigin = surface(towerNormal),
    towerQ = orientation(towerNormal),
    towerInverse = towerQ.clone().invert();
  const towerGroup = new T.Group();
  towerGroup.position.copy(towerOrigin);
  towerGroup.quaternion.copy(towerQ);
  world.add(towerGroup);
  const expansion = buildExpansion({ world, mesh, mat, box, ball, cyl, beam, rand, towerGroup });
  const landscape = buildLandscape({ world, mesh, mat, ball, cyl, beam, collisions });
  const lights = { ambient, hemisphere, centralLight };
  const sun = buildSun({ world, mesh, rand, camera, lights });
  const control = new T.Group();
  control.position.set(0, TOWER_HEIGHT, 0);
  towerGroup.add(control);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const desk = new T.Group();
    desk.position.set(Math.cos(a) * 10, 0, Math.sin(a) * 10);
    desk.rotation.y = -a - Math.PI / 2;
    box(desk, 0, 1, 0, 3, 2, 1.6, '#6c8986');
    const screen = mesh(
      new T.BoxGeometry(2.5, 0.9, 0.08),
      mat('#9ee6c4', '#497c66'),
      desk,
      0,
      1.8,
      0.85,
    );
    screen.rotation.x = -0.4;
    for (let j = 0; j < 3; j++)
      ball(desk, -0.7 + j * 0.7, 1.1, 0.86, 0.1, ['#ebd089', '#92c9b3', '#e7a280'][j]);
    control.add(desk);
  }

  // Curved tunnel section: its entrance is aligned with the spherical meadow.
  const tunnelStart = world.children.length;
  const tunnel = new T.Group();
  tunnel.position.z = 118;
  world.add(tunnel);
  const tg = new T.CylinderGeometry(13, 13, 80, 12, 1, true);
  tg.rotateX(Math.PI / 2);
  mesh(
    tg,
    new T.MeshStandardMaterial({ color: '#6f766e', side: T.BackSide, flatShading: true }),
    tunnel,
    0,
    5,
    0,
  );
  box(tunnel, 0, -0.15, 0, 20, 0.3, 80, '#8a937a');
  for (let z = -36; z < 41; z += 12) {
    const ring = mesh(new T.TorusGeometry(12.6, 0.22, 4, 16), mat('#b8b08d'), tunnel, 0, 5, z);
    for (const x of [-10, 10])
      mesh(new T.BoxGeometry(0.3, 1.5, 0.6), mat('#ffdf8f', '#c19545'), tunnel, x, 2, z);
  }

  world.children.slice(tunnelStart).forEach(placeOnGlobe);
  // Small flowers and pollen remain close to the walking surface.
  const flowers = new T.InstancedMesh(new T.IcosahedronGeometry(0.15, 0), mat('#fff0b0'), 900);
  for (let i = 0; i < 900; i++) {
    let x = (rand() - 0.5) * 220,
      z = (rand() - 0.5) * 220;
    if (((x + 29) / 25) ** 2 + ((z + 15) / 33) ** 2 < 1) x += 65;
    dummy.position.copy(surfacePoint(x, z, 0.3));
    dummy.quaternion.copy(orientation(normalAt(x, z)));
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new T.Color(['#f4d593', '#fff0b9', '#dde8b0', '#e4bd8b'][i % 4]));
  }
  world.add(flowers);
  const pollenG = new T.BufferGeometry(),
    pp = [];
  for (let i = 0; i < 300; i++) {
    pp.push(...surfacePoint((rand() - 0.5) * 220, (rand() - 0.5) * 220, 1 + rand() * 15).toArray());
  }
  pollenG.setAttribute('position', new T.Float32BufferAttribute(pp, 3));
  const pollen = new T.Points(
    pollenG,
    new T.PointsMaterial({
      color: '#ffe7a2',
      size: 0.17,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  world.add(pollen);
  // The sun control box stands beside the lift call button.
  const sunPanel = buildSunPanel({ towerGroup, builders });
  // The mountain's spring and stream, the clouds and the rowing boat.
  const mountain = buildMountain({ world, builders, collisions, rand });
  const clouds = buildClouds({ world, rand });
  const boat = buildBoat({ world, builders });
  return {
    trees,
    forest,
    sunPanel,
    lights,
    mountain,
    clouds,
    boat,
    lakeWater,
    distantWater,
    towerGroup,
    towerUp,
    towerOrigin,
    towerQ,
    towerInverse,
    expansion,
    landscape,
    sun,
    flowers,
    pollen,
    ship,
    animatePatapon,
  };
}
