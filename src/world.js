import * as T from './vendor/three.module.min.js';
import { createAmbience } from './audio.js';
import { buildExpansion } from './expansion.js';
import { buildWater } from './water.js';
import { SpeederHandling, WalkHandling, radialInput } from './handling.js';
import { TiltSteering } from './tilt.js';
import { buildLandscape, buildDayNight, daylightAt } from './landscape.js';
import {
  buildForest,
  buildFields,
  addWind,
  fieldDistance,
  groveAt,
  windTime,
} from './vegetation.js';
import { buildTrailEffects, buildNightDetails } from './effects.js';
import {
  RADIUS,
  CENTER,
  TOWER_HEIGHT,
  normalAt,
  chart,
  relief,
  surface,
  surfacePoint,
  orientation,
  advanceFrame,
  surfaceBlocked,
  lakeRadius,
  lakeDepth,
  SurfaceCollisions,
  roadDistance,
  meadowDistance,
  bigLakeRadius,
  bigLakeChart,
  bridgeHeight,
  roadOffset,
  islandDistance,
} from './navigation.js';
// The whole game lives in one function so a browser page or a test can create it
// with the renderer of its choice. `main.js` starts it in the browser.
export function createGame({ renderer }) {
  const ambience = createAmbience();
  const drive = new SpeederHandling(),
    walkHandling = new WalkHandling();
  let bikeHeading = new T.Vector3(0, 0, 1),
    brakeHeld = false,
    accelerateHeld = false,
    lastLookTime = -100;
  const collisions = new SurfaceCollisions();
  const $ = (id) => document.getElementById(id);
  const tilt = new TiltSteering(window, tiltStateChanged);
  const pedalPointers = { accelerate: new Set(), brake: new Set() };
  let noticeTimer;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  $('world').appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color('#0b1323');
  const camera = new T.PerspectiveCamera(59, innerWidth / innerHeight, 0.12, 7000);
  const world = new T.Group(),
    outside = new T.Group();
  scene.add(world, outside);
  world.visible = false;
  let seed = 4309;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
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

  const ambient = new T.AmbientLight('#fff0d4', 1.6);
  world.add(ambient);
  const centralLight = new T.PointLight('#ffe3a4', 3.8, 0, 0);
  centralLight.position.copy(CENTER);
  world.add(centralLight);
  const outerAmbient = new T.AmbientLight('#8093bb', 0.65);
  outside.add(outerAmbient);
  const outerKey = new T.DirectionalLight('#ffe0b4', 3.4);
  outerKey.position.set(-450, 650, 500);
  outside.add(outerKey);
  const outerRim = new T.DirectionalLight('#738eff', 1.7);
  outerRim.position.set(350, -60, -500);
  outside.add(outerRim);
  const dummy = new T.Object3D();
  function placeOnGlobe(o) {
    const x = o.position.x,
      z = o.position.z,
      h = o.position.y;
    const q = orientation(normalAt(x, z));
    o.position.copy(surfacePoint(x, z, h));
    o.quaternion.premultiply(q);
    return o;
  }
  function terrainMesh() {
    const g = new T.SphereGeometry(RADIUS, 144, 96),
      p = g.attributes.position,
      colors = [],
      color = new T.Color();
    for (let i = 0; i < p.count; i++) {
      const n = new T.Vector3().fromBufferAttribute(p, i).normalize();
      const h = relief(n);
      p.setXYZ(i, n.x * (RADIUS - h), n.y * (RADIUS - h), n.z * (RADIUS - h));
      const patch = Math.sin(n.x * 17 + n.y * 5) * Math.cos(n.z * 13 - n.y * 8);
      color.setHSL(0.205 + patch * 0.025, 0.33 + patch * 0.07, 0.39 + patch * 0.06);
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
  // Deep space with a subtle galactic ribbon, rendered directly in 3D.
  const skyMaterial = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    vertexShader:
      'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 d;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){vec3 p=normalize(d);float n=noise(p*5.)*.55+noise(p*13.)*.3+noise(p*33.)*.15;float ribbon=exp(-pow((p.y+.22*p.x-.12*sin(p.z*4.))/.22,2.));vec3 col=vec3(.004,.007,.018)+ribbon*n*n*vec3(.055,.064,.14);col+=pow(n,4.)*vec3(.014,.018,.055);gl_FragColor=vec4(col,1.);}`,
  });
  const sky = mesh(new T.SphereGeometry(4500, 32, 20), skyMaterial, outside);
  sky.castShadow = false;
  sky.receiveShadow = false;
  const starG = new T.BufferGeometry(),
    sp = [],
    sc = [];
  for (let i = 0; i < 5500; i++) {
    const a = rand() * Math.PI * 2,
      u = rand() * 2 - 1,
      r = 2200 + rand() * 1400;
    sp.push(Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r, Math.sqrt(1 - u * u) * Math.sin(a) * r);
    const color = new T.Color(['#a9bbef', '#e5eaff', '#ffe6bc'][i % 3]);
    color.multiplyScalar(0.5 + rand() * 0.7);
    sc.push(color.r, color.g, color.b);
  }
  starG.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
  starG.setAttribute('color', new T.Float32BufferAttribute(sc, 3));
  outside.add(
    new T.Points(
      starG,
      new T.PointsMaterial({
        vertexColors: true,
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.9,
      }),
    ),
  );
  const rock = new T.IcosahedronGeometry(275, 3),
    rp = rock.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    let x = rp.getX(i),
      y = rp.getY(i),
      z = rp.getZ(i);
    let s = 1 + 0.045 * Math.sin(x * 0.045) * Math.cos(z * 0.04) + 0.025 * Math.sin(y * 0.08);
    rp.setXYZ(i, x * s, y * s * 0.87, z * s);
  }
  rock.computeVertexNormals();
  mesh(rock, mat('#5a6268'), outside, 0, 20, 0);
  for (let i = 0; i < 42; i++) {
    const a = rand() * 6.28,
      b = rand() * 3.14,
      r = 279;
    const o = ball(
      outside,
      Math.sin(b) * Math.cos(a) * r,
      Math.cos(b) * r * 0.87 + 20,
      Math.sin(b) * Math.sin(a) * r,
      8 + rand() * 16,
      ['#697073', '#454e58', '#7f8079'][i % 3],
    );
    o.scale.set(1, 0.6, 1);
  }
  const entry = new T.Group();
  entry.position.set(0, 15, 276);
  outside.add(entry);
  const gate = mesh(new T.TorusGeometry(15, 3, 6, 16), mat('#d6b580'), entry);
  mesh(new T.CircleGeometry(13, 24), new T.MeshBasicMaterial({ color: '#091d20' }), entry, 0, 0, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ball(entry, Math.cos(a) * 15, Math.sin(a) * 15, 3, 1, '#ffe3a3');
  }

  // Uneven companion asteroids surround the home rock at several depths.
  const asteroidGeo = new T.IcosahedronGeometry(1, 1),
    ap = asteroidGeo.attributes.position;
  for (let i = 0; i < ap.count; i++) {
    const x = ap.getX(i),
      y = ap.getY(i),
      z = ap.getZ(i),
      s = 1 + 0.15 * Math.sin(x * 9 + z * 4) * Math.cos(y * 7);
    ap.setXYZ(i, x * s, y * s, z * s);
  }
  asteroidGeo.computeVertexNormals();
  const asteroids = new T.InstancedMesh(asteroidGeo, mat('#71747e'), 115);
  for (let i = 0; i < 115; i++) {
    const angle = rand() * Math.PI * 2,
      distance = 520 + rand() * 1500;
    let x = Math.cos(angle) * distance,
      z = Math.sin(angle) * distance,
      y = (rand() - 0.5) * 1000;
    if (z > 180 && Math.abs(x) < 480) x += x < 0 ? -600 : 600;
    dummy.position.set(x, y, z);
    dummy.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    const size = 18 + rand() ** 2 * 95;
    dummy.scale.set(size * (0.65 + rand() * 0.7), size * (0.7 + rand() * 0.6), size);
    dummy.updateMatrix();
    asteroids.setMatrixAt(i, dummy.matrix);
    asteroids.setColorAt(i, new T.Color(['#848587', '#696d7a', '#a49584', '#667183'][i % 4]));
  }
  outside.add(asteroids);
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
  // Every village object follows the local inward vertical.
  const villageStart = world.children.length;
  for (let i = 0; i < 12; i++) box(world, -6, 0.5, 10 - i * 0.75, 4, 0.24, 0.67, '#a78555');
  for (const z of [3, 9])
    for (const x of [-7.5, -4.5]) cyl(world, x, 0.7, z, 0.12, 0.12, 1.7, '#795a3a');
  // Winding stepping stones lead from the tunnel to Patapon's home.
  for (let i = 0; i < 43; i++) {
    const t = i / 42,
      z = 73 - t * 65,
      x = 24 * Math.sin(t * Math.PI * 0.5);
    const o = cyl(
      world,
      x,
      0.085,
      z,
      1.55 + rand() * 0.4,
      1.7,
      0.16,
      ['#c8c4a0', '#e0d4af', '#bbbda0'][i % 3],
      7,
    );
    o.rotation.y = rand() * 6;
  }
  for (let i = 0; i < 28; i++) {
    const t = i / 27;
    const o = cyl(
      world,
      23 * (1 - t) + 8 * t,
      0.08,
      4 * (1 - t) - 49 * t,
      1.25,
      1.4,
      0.16,
      '#c8c4a0',
      6,
    );
    o.rotation.y = rand() * 6;
  }
  // Log cabin: warm timber, deep roof, porch, and glowing windows.
  const house = new T.Group();
  house.position.set(29, 0, -4);
  world.add(house);
  box(house, 0, 0.4, 0, 16, 0.8, 16, '#867960');
  box(house, 0, 4.4, 0, 14, 8, 12, '#a67442');
  for (let y = 1; y < 8.8; y += 0.7) {
    for (const z of [-6.1, 6.1]) {
      const o = cyl(house, 0, y, z, 0.38, 0.38, 14.8, y % 1 > 0.5 ? '#b8874e' : '#9b693c');
      o.rotation.z = Math.PI / 2;
    }
    for (const x of [-7.1, 7.1]) {
      const o = cyl(house, x, y, 0, 0.38, 0.38, 13, '#a77846');
      o.rotation.x = Math.PI / 2;
    }
  }
  const roofG = new T.BufferGeometry();
  roofG.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      [
        -8, 8, -7, 8, 8, -7, 0, 13, -7, -8, 8, 7, 0, 13, 7, 8, 8, 7, -8, 8, -7, 0, 13, -7, 0, 13, 7,
        -8, 8, -7, 0, 13, 7, -8, 8, 7, 8, 8, -7, 8, 8, 7, 0, 13, 7, 8, 8, -7, 0, 13, 7, 0, 13, -7,
      ],
      3,
    ),
  );
  roofG.computeVertexNormals();
  mesh(roofG, mat('#405b58'), house);
  for (let z = -7; z <= 7; z += 1.4) {
    beam(house, [-8, 8.1, z], [0, 13.15, z], 0.12, '#728177');
    beam(house, [0, 13.15, z], [8, 8.1, z], 0.12, '#728177');
  }
  box(house, 0, 2.7, 6.5, 3.3, 5.4, 0.4, '#5e4938');
  ball(house, 1, 2.7, 6.8, 0.16, '#efc879');
  for (const x of [-4.7, 4.7]) {
    box(house, x, 4.9, 6.51, 2.9, 3, 0.2, '#554a36');
    mesh(new T.BoxGeometry(2.35, 2.4, 0.2), mat('#ffdf92', '#c79044'), house, x, 4.9, 6.65);
    box(house, x, 4.9, 6.8, 0.13, 2.5, 0.15, '#b78143');
    box(house, x, 4.9, 6.8, 2.4, 0.13, 0.15, '#b78143');
  }
  box(house, 0, 0.55, 8, 15, 0.3, 4, '#b49664');
  for (const x of [-6, 6]) cyl(house, x, 3.5, 9, 0.17, 0.2, 6, '#886137');
  box(house, 0, 6.4, 8, 15, 0.3, 4, '#647365');
  box(house, 4, 11, -3, 1.9, 5, 1.8, '#a29580');
  // Deck chair and Patapon, the kind-hearted, enormous teddy smuggler.
  const chair = new T.Group();
  chair.position.set(42, 0, 5);
  chair.rotation.y = -0.35;
  world.add(chair);
  box(chair, 0, 1.3, 0, 3.5, 0.24, 4.4, '#e0c796');
  const back = box(chair, 0, 2.65, -1.5, 3.5, 3.7, 0.28, '#dfc58e');
  back.rotation.x = -0.45;
  for (const x of [-1.8, 1.8]) {
    beam(chair, [x, 0, 1.7], [x, 2, -1.8], 0.12, '#74553a');
    beam(chair, [x, 0, -1.6], [x, 2, 1.4], 0.12, '#74553a');
  }
  const bear = new T.Group();
  bear.position.set(0, 1.7, -0.1);
  bear.rotation.x = -0.22;
  chair.add(bear);
  const body = ball(bear, 0, 1.3, 0, 1.9, '#a97945', 1);
  body.scale.set(0.9, 1.1, 0.7);
  const bearHead = new T.Group();
  bearHead.position.set(0, 3.35, 0.05);
  bear.add(bearHead);
  ball(bearHead, 0, 0, 0, 1.35, '#b98950', 1);
  for (const x of [-0.99, 0.99]) ball(bearHead, x, 0.8, 0, 0.52, '#af7a45', 1);
  ball(bearHead, 0, -0.36, 1.07, 0.73, '#dbc08b', 1);
  ball(bearHead, 0, -0.1, 1.63, 0.23, '#3e352c', 1);
  for (const x of [-0.47, 0.47]) {
    ball(bearHead, x, 0.27, 1.15, 0.11, '#282d26', 1);
    ball(bearHead, x - 0.025, 0.31, 1.24, 0.035, '#fff6d7');
  }
  const bearArms = [];
  for (const x of [-1.5, 1.5]) {
    const pivot = new T.Group();
    pivot.position.set(x, 2.2, 0.3);
    bear.add(pivot);
    const arm = ball(pivot, 0, -0.7, 0, 0.69, '#a97945', 1);
    arm.scale.set(0.8, 1.7, 0.85);
    bearArms.push(pivot);
    const leg = ball(bear, x * 0.6, -0.05, 1.12, 0.82, '#ad7c48', 1);
    leg.scale.set(0.8, 0.8, 1.45);
  }
  const band = box(bear, 0, 1.4, 1.29, 0.47, 3.2, 0.18, '#594a39');
  band.rotation.z = -0.5;
  for (let i = 0; i < 5; i++) {
    const o = box(bear, -0.57 + i * 0.27, 2.6 - i * 0.55, 1.43, 0.46, 0.27, 0.15, '#d3c1a0');
    o.rotation.z = -0.5;
  }
  let waveStarted = -100,
    canGreet = true;
  function animatePatapon(t, dt) {
    const distance = player.position.distanceTo(chair.position);
    if (distance > 23) canGreet = true;
    if (mode === 'walk' && distance < 16 && canGreet) {
      waveStarted = t;
      canGreet = false;
    }
    const elapsed = t - waveStarted,
      waving = elapsed >= 0 && elapsed < 5.3;
    const envelope = waving
      ? T.MathUtils.smoothstep(elapsed, 0, 0.7) * (1 - T.MathUtils.smoothstep(elapsed, 4.3, 5.3))
      : 0;
    bearArms[1].rotation.z = envelope * (2.35 + 0.28 * Math.sin(elapsed * 5));
    bearArms[1].rotation.x = -0.18 * envelope;
    bear.scale.y = 1 + Math.sin(t * 1.3) * 0.018;
    bear.updateWorldMatrix(true, false);
    const local = bear.worldToLocal(player.position.clone().addScaledVector(activeUp(), 1.8));
    const target =
      distance < 24
        ? T.MathUtils.clamp(Math.atan2(local.x, local.z), -0.6, 0.6)
        : Math.sin(t * 0.12) * 0.12;
    bearHead.rotation.y = T.MathUtils.lerp(bearHead.rotation.y, target, 1 - Math.exp(-dt * 3));
    bearHead.rotation.x = Math.sin(t * 0.65) * 0.025;
  }
  cyl(world, 46, 1, 6, 1.2, 1.2, 0.18, '#977145');
  cyl(world, 46, 0.5, 6, 0.18, 0.18, 1, '#886341');
  cyl(world, 46, 1.35, 6, 0.3, 0.26, 0.5, '#dae3cf');
  // Parked freighter: broad weathered hull, twin engines and amber cockpit.
  const ship = new T.Group();
  ship.position.set(49, 2.5, 20);
  ship.rotation.y = -0.45;
  world.add(ship);
  const hull = ball(ship, 0, 1, 0, 8, '#d8d4b5', 1);
  hull.scale.set(1.35, 0.3, 1);
  const lower = ball(ship, 0, 0.1, 0, 6.5, '#919e95', 1);
  lower.scale.set(1.4, 0.2, 1);
  box(ship, 0, 2.3, 0, 5, 1, 6, '#b5b9a2');
  for (const x of [-5, 5]) {
    box(ship, x, 1, 5, 3, 1.3, 9, '#c8c5ad');
    box(ship, x, 1.72, 5, 0.6, 0.08, 7, '#b5764e');
    const eng = cyl(ship, x, 1, -6, 1.3, 1.3, 4, '#788b87', 10);
    eng.rotation.x = Math.PI / 2;
    const glow = mesh(new T.CircleGeometry(0.91, 12), mat('#97e9ed', '#53aebf'), ship, x, 1, -8.02);
    glow.rotation.y = Math.PI;
    for (const z of [-3, 4]) {
      cyl(ship, x, -1.3, z, 0.25, 0.25, 2.1, '#71817c');
      box(ship, x, -2.25, z, 2, 0.2, 1.4, '#637774');
    }
  }
  const cockpit = ball(ship, 4, 2.2, 4, 2.3, '#508686', 1);
  cockpit.scale.set(0.8, 0.65, 1.45);
  box(ship, -2, 2.8, -1, 2, 0.15, 2, '#7f938b');
  beam(ship, [-2, 2.7, -2], [-2, 5, -3], 0.12, '#6b817d');

  world.children.slice(villageStart).forEach(placeOnGlobe);
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
  const solarMat = new T.MeshBasicMaterial({
    color: '#fff2ce',
    side: T.FrontSide,
    transparent: true,
    opacity: 0.95,
    fog: false,
    depthWrite: false,
  });
  const solar = mesh(new T.SphereGeometry(21, 32, 24), solarMat, world, ...CENTER.toArray());
  solar.castShadow = false;
  const haloMat = new T.ShaderMaterial({
    uniforms: { tint: { value: new T.Color('#ffcf77') } },
    vertexShader:
      'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:
      'varying vec3 n; varying vec3 v; uniform vec3 tint; void main(){float f=pow(1.-abs(dot(normalize(n),normalize(v))),2.5);gl_FragColor=vec4(tint,f*.22);}',
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.FrontSide,
  });
  const halo = mesh(new T.SphereGeometry(28, 32, 24), haloMat, world, ...CENTER.toArray());
  halo.castShadow = false;
  // Soft, depth-tested solar scattering: one billboard, no full-screen bloom pass.
  const glowUniforms = {
    time: { value: 0 },
    strength: { value: 1 },
    tint: { value: new T.Color('#ffd28b') },
  };
  const glowMaterial = new T.ShaderMaterial({
    uniforms: glowUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    toneMapped: false,
    vertexShader:
      'varying vec2 sunUv;void main(){sunUv=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 sunUv;uniform float time;uniform float strength;uniform vec3 tint;
void main(){float r=length(sunUv);float a=atan(sunUv.y,sunUv.x);float breathing=1.+.035*sin(time*.6);
float glow=exp(-r*r*7.5)*.32;
float corona=exp(-pow((r-.31)*10.,2.))*.10;
float rays=pow(.5+.5*sin(a*12.+sin(a*5.-time*.09)*.8),12.);
float streak=rays*exp(-r*3.7)*smoothstep(.24,.39,r)*.20;
float edge=1.-smoothstep(.76,1.,r);
float alpha=(glow+corona+streak)*edge*strength*breathing;
gl_FragColor=vec4(tint,alpha);}`,
  });
  const sunGlow = mesh(new T.PlaneGeometry(160, 160), glowMaterial, world, ...CENTER.toArray());
  sunGlow.castShadow = false;
  sunGlow.receiveShadow = false;
  sunGlow.renderOrder = 4;
  // Small luminous motes move slowly around the artificial sun.
  const solarDustGeometry = new T.BufferGeometry(),
    solarDustPositions = [];
  for (let i = 0; i < 72; i++) {
    const a = rand() * Math.PI * 2,
      u = rand() * 2 - 1,
      r = 25 + rand() * 13;
    solarDustPositions.push(
      Math.sqrt(1 - u * u) * Math.cos(a) * r,
      u * r,
      Math.sqrt(1 - u * u) * Math.sin(a) * r,
    );
  }
  solarDustGeometry.setAttribute('position', new T.Float32BufferAttribute(solarDustPositions, 3));
  const solarDustMaterial = new T.ShaderMaterial({
    uniforms: { strength: glowUniforms.strength, time: glowUniforms.time },
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
    vertexShader:
      'uniform float time;varying float sparkle;void main(){sparkle=.35+.35*sin(time*.8+position.x*.6+position.z);vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(650./max(1.,-p.z),1.,4.);}',
    fragmentShader:
      'uniform float strength;varying float sparkle;void main(){float d=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.1,1.,d))*sparkle*strength;gl_FragColor=vec4(1.,.8,.43,a);}',
  });
  const solarDust = new T.Points(solarDustGeometry, solarDustMaterial);
  solarDust.position.copy(CENTER);
  world.add(solarDust);
  function updateSunEffects(t) {
    sunInteriorUniforms.time.value = t;
    const inside = 1 - T.MathUtils.smoothstep(camera.position.distanceTo(CENTER), 18, 31);
    sunInteriorUniforms.strength.value = inside;
    cageMaterial.opacity = inside * 0.6;
    innerSun.visible = sunCage.visible = inside > 0.01;
    glowUniforms.time.value = t;
    const distance = camera.position.distanceTo(CENTER);
    glowUniforms.strength.value =
      T.MathUtils.smoothstep(distance, 30, 85) *
      (0.1 +
        0.9 *
          daylightAt(camera.position.clone().sub(CENTER).normalize(), dayNight.direction.value));
    sunGlow.visible = distance > 30;
    sunGlow.quaternion.copy(camera.quaternion);
    halo.visible = distance > 32;
    halo.scale.setScalar(1 + Math.sin(t * 0.5) * 0.018);
    solarDust.rotation.y = t * 0.025;
    solarDust.rotation.z = Math.sin(t * 0.04) * 0.08;
  }

  const sunInteriorUniforms = { time: { value: 0 }, strength: { value: 0 } };
  const innerSunMaterial = new T.ShaderMaterial({
    uniforms: sunInteriorUniforms,
    side: T.BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader:
      'varying vec3 localSun;void main(){localSun=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'varying vec3 localSun;uniform float time;uniform float strength;void main(){vec3 n=normalize(localSun);float light=.5+.5*sin(n.y*11.+n.x*7.+sin(n.z*8.+time*.22));vec3 c=mix(vec3(.62,.23,.045),vec3(1.,.72,.25),light*.65);gl_FragColor=vec4(c,(.38+.14*light)*strength);}',
  });
  const innerSun = mesh(
    new T.SphereGeometry(20.7, 32, 20),
    innerSunMaterial,
    world,
    ...CENTER.toArray(),
  );
  innerSun.castShadow = false;
  innerSun.receiveShadow = false;
  const cageMaterial = new T.LineBasicMaterial({
    color: '#ffe6aa',
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  });
  const sunCage = new T.LineSegments(
    new T.WireframeGeometry(new T.IcosahedronGeometry(20.3, 2)),
    cageMaterial,
  );
  sunCage.position.copy(CENTER);
  world.add(sunCage);
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
  // Marceau: red hair, a soft Jedi robe, boots and a little belt.
  const player = new T.Group();
  world.add(player);
  const robe = cyl(player, 0, 0.9, 0, 0.38, 0.65, 1.35, '#d4bf94', 7);
  box(player, 0, 1.08, 0.02, 0.83, 0.2, 0.73, '#77563c');
  const head = ball(player, 0, 1.96, 0, 0.4, '#f2c697', 1);
  const hair = ball(player, 0, 2.15, -0.035, 0.42, '#ba592c', 1);
  hair.scale.set(1, 0.62, 1);
  for (let i = 0; i < 7; i++)
    ball(player, (rand() - 0.5) * 0.63, 2.2 + rand() * 0.2, -0.08 + rand() * 0.3, 0.17, '#d77538');
  for (const x of [-0.15, 0.15]) ball(player, x, 1.99, 0.345, 0.028, '#464c36');
  const hood = ball(player, 0, 1.4, -0.3, 0.43, '#9a8057');
  hood.scale.set(1, 0.7, 0.55);
  const legs = [],
    arms = [];
  for (const x of [-0.23, 0.23]) {
    const leg = new T.Group();
    leg.position.set(x, 0.52, 0);
    box(leg, 0, -0.25, 0.04, 0.29, 0.55, 0.39, '#675039');
    player.add(leg);
    legs.push(leg);
    const arm = new T.Group();
    arm.position.set(x < 0 ? -0.45 : 0.45, 1.43, 0);
    cyl(arm, 0, -0.3, 0, 0.17, 0.22, 0.68, '#bda47a');
    ball(arm, 0, -0.67, 0, 0.14, '#f1c292');
    player.add(arm);
    arms.push(arm);
  }
  const saber = cyl(player, -0.48, 0.96, 0.15, 0.065, 0.065, 0.35, '#8eaca4', 6);
  saber.rotation.z = 0.15;
  const playerShadow = mesh(
    new T.CircleGeometry(0.7, 24),
    new T.MeshBasicMaterial({
      color: '#324735',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
    world,
  );
  playerShadow.rotation.x = -Math.PI / 2;

  let navNormal = normalAt(0, 71),
    forward = new T.Vector3(0, 0, -1).projectOnPlane(navNormal).normalize(),
    climb = null;
  addWind(mat('#a8b965'), { worldSpace: true });
  addWind(flowers.material, { whole: true, amount: 0.055 });
  const fields = buildFields(world, rand);
  const trailEffects = buildTrailEffects(world, trees, rand);
  const nightDetails = buildNightDetails({ world, bridgeLamps: landscape.lamps, rand });
  const dayNight = buildDayNight({
    world,
    mesh,
    mat,
    beam,
    scene,
    waters: [lakeWater, distantWater],
  });
  pollen.material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.uniforms.shadeDirection = dayNight.direction;
    shader.vertexShader =
      'uniform float windTime;uniform vec3 shadeDirection;varying float pollenDay;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vec3 pollenNormal=normalize(position-vec3(0.,260.,0.));transformed+=normalize(cross(pollenNormal,vec3(.3,.7,.2)))*sin(windTime*.5+position.x)*.5;pollenDay=1.-smoothstep(-.16,.16,dot(pollenNormal,shadeDirection));`,
    );
    shader.fragmentShader = 'varying float pollenDay;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'diffuseColor.a*=pollenDay;\n#include <opaque_fragment>',
    );
  };
  let mountedAnimal = null;
  let riding = false,
    swimming = false,
    jumpHeight = 0,
    jumpVelocity = 0;
  player.position.copy(surface(navNormal));
  player.visible = false;
  let mode = 'intro',
    startTime = 0,
    pitch = 0.12,
    moving = 0,
    walk = 0;
  const clock = new T.Clock();
  const joy = { x: 0, y: 0, id: null },
    keys = new Set();
  const viewTarget = new T.Vector3(),
    desired = new T.Vector3();
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2();
  let lookId = null,
    lastX = 0,
    lastY = 0,
    downX = 0,
    downY = 0,
    downAt = 0,
    lookMoved = false;
  function activeUp() {
    return climb ? towerUp.clone() : navNormal.clone().negate();
  }
  function turnView(angle) {
    forward.applyAxisAngle(activeUp(), angle).normalize();
  }
  function towerLocal(p) {
    return p.clone().sub(towerOrigin).applyQuaternion(towerInverse);
  }
  function towerWorld(p) {
    return new T.Vector3(p.x, p.y, p.z).applyQuaternion(towerQ).add(towerOrigin);
  }
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  function interior() {
    world.visible = true;
    outside.visible = false;
    scene.background = new T.Color('#aabca0');
    scene.fog = new T.FogExp2('#ced8c8', 0.00205);
  }
  function beginWalk() {
    mode = 'walk';
    pitch = 0.12;
    interior();
    player.visible = true;
    $('hud').hidden = false;
    $('intro').style.display = 'none';
    updateCamera(1);
    setTimeout(() => ($('lookhint').style.opacity = '.2'), 7000);
  }
  function beginReveal(t) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      beginWalk();
      return;
    }
    mode = 'reveal';
    startTime = t;
    player.visible = true;
    player.quaternion.copy(orientation(navNormal));
    $('hud').hidden = false;
    $('intro').style.display = 'none';
  }
  function clearInput() {
    trailEffects.reset();
    clearPedals();
    tilt.reset();
    drive.reset();
    walkHandling.reset();
    keys.clear();
    joy.x = joy.y = 0;
    joy.id = null;
    lookId = null;
    $('knob').style.transform = '';
    const stickElement = $('stick');
    stickElement.style.left = '';
    stickElement.style.top = '';
    stickElement.style.bottom = '';
  }
  function resetHome() {
    releaseAnimal();
    if (tilt.state === 'waiting') tilt.stop();
    if (mode === 'reveal') beginWalk();
    clearInput();
    const parked = normalAt(64, 10);
    expansion.bike.position.copy(surface(parked, 1));
    expansion.bike.quaternion.copy(orientation(parked));
    riding = false;
    climb = null;
    swimming = false;
    jumpHeight = jumpVelocity = 0;
    navNormal = normalAt(28, 12);
    forward.set(0, 0, -1).projectOnPlane(navNormal).normalize();
    player.position.copy(surface(navNormal));
    pitch = 0.12;
    updateCamera(1);
  }
  function jump() {
    if (mode === 'reveal') beginWalk();
    if (
      mode !== 'walk' ||
      (riding && !mountedAnimal) ||
      swimming ||
      jumpHeight > 0.01 ||
      (climb && expansion.lift.moving)
    )
      return;
    jumpVelocity = mountedAnimal ? 10.5 : 8.3;
  }
  function liftAction() {
    if (riding || swimming) return;
    const lift = expansion.lift;
    if (lift.moving) return;
    if (!climb && lift.height < 0.1) {
      climb = { x: 0, z: 0, y: 0, onPlatform: true };
      jumpHeight = jumpVelocity = 0;
      forward.projectOnPlane(towerUp).normalize();
      player.position.copy(towerWorld(climb));
    }
    if (climb && Math.hypot(climb.x, climb.z) < 5.7) {
      climb.onPlatform = true;
      lift.target = lift.height < TOWER_HEIGHT / 2 ? TOWER_HEIGHT : 0;
    } else lift.target = climb ? TOWER_HEIGHT : 0;
  }
  function bikeAction() {
    if (climb) return;
    if (riding) {
      const right = forward.clone().cross(activeUp()).normalize();
      for (let i = 0; i < 8; i++) {
        const offset = right.clone().applyAxisAngle(activeUp(), (i * Math.PI) / 4);
        const n = navNormal.clone().multiplyScalar(RADIUS).addScaledVector(offset, 4).normalize();
        const resolved = collisions.resolve(n, 0.65, 0);
        if (!surfaceBlocked(resolved, 0.6) && towerAllows(resolved)) {
          navNormal = resolved;
          forward.projectOnPlane(navNormal).normalize();
          releaseAnimal();
          riding = false;
          clearInput();
          if (tilt.state === 'waiting') tilt.stop();
          drive.reset();
          walkHandling.reset();
          jumpHeight = jumpVelocity = 0;
          player.position.copy(surface(navNormal));
          return;
        }
      }
      return;
    }
    if (player.position.distanceTo(expansion.bike.position) > 8) return;
    clearInput();
    riding = true;
    navNormal = expansion.bike.position.clone().sub(CENTER).normalize();
    forward
      .set(0, 0, 1)
      .applyQuaternion(expansion.bike.quaternion)
      .projectOnPlane(navNormal)
      .normalize();
    bikeHeading.copy(forward);
    drive.reset();
    walkHandling.reset();
    swimming = false;
    jumpHeight = jumpVelocity = 0;
  }
  function releaseAnimal() {
    if (!mountedAnimal) return;
    const a = mountedAnimal;
    a.ridden = false;
    a.freeRoam = true;
    const local = bikeHeading.clone().applyQuaternion(orientation(a.n).invert());
    a.angle = Math.atan2(local.x, local.z);
    mountedAnimal = null;
  }
  function mountAnimal(a) {
    if (riding || climb || player.position.distanceTo(a.root.position) > 8) return;
    clearInput();
    mountedAnimal = a;
    a.ridden = a.freeRoam = true;
    riding = true;
    swimming = false;
    jumpHeight = jumpVelocity = 0;
    navNormal = a.n.clone();
    forward.set(0, 0, 1).applyQuaternion(a.root.quaternion).projectOnPlane(navNormal).normalize();
    bikeHeading.copy(forward);
    greetAnimal(a);
  }
  function animalGround(n) {
    const road = roadOffset(n);
    return road > 0 ? road : Math.max(0, lakeDepth(n) + 0.24 - 0.6);
  }
  function greetAnimal(a) {
    if (clock.elapsedTime < a.reaction - 0.7) return;
    a.reaction = clock.elapsedTime + 1.8;
    ambience.animal(a.kind);
  }
  function contextAction() {
    if (mode === 'reveal') beginWalk();
    if (mode !== 'walk') return;
    const choice = getContext();
    if (choice?.type === 'bike') bikeAction();
    else if (choice?.type === 'lift' || choice?.type === 'call') liftAction();
    else if (choice?.animal) mountAnimal(choice.animal);
  }
  function getContext() {
    if (riding) return { type: 'bike', text: 'Descendre' };
    if (climb)
      return {
        type: 'lift',
        text: expansion.lift.moving
          ? 'En route…'
          : climb.onPlatform
            ? expansion.lift.height < 10
              ? 'Monter'
              : 'Descendre'
            : 'Appeler',
        disabled: expansion.lift.moving,
      };
    const local = towerLocal(player.position);
    if (Math.hypot(local.x, local.z) < 13 && Math.abs(local.y) < 5)
      return {
        type: 'call',
        text: expansion.lift.moving
          ? 'En route…'
          : expansion.lift.height > 1
            ? 'Appeler'
            : 'Monter',
        disabled: expansion.lift.moving,
      };
    if (player.position.distanceTo(expansion.bike.position) < 8)
      return { type: 'bike', text: 'Conduire' };
    let closest = null,
      d = 8;
    for (const a of expansion.animals) {
      const dist = player.position.distanceTo(a.root.position);
      if (dist < d) {
        closest = a;
        d = dist;
      }
    }
    return closest ? { animal: closest, text: 'Monter' } : null;
  }
  function updateHud() {
    const c = getContext();
    $('action').hidden = !c;
    $('action').disabled = !!c?.disabled;
    if (c) $('action-label').textContent = c.text;
    $('hud').classList.toggle('riding', riding);
    $('hud').classList.toggle('animal-mounted', !!mountedAnimal);
    $('accelerate').hidden = $('brake').hidden = $('tilt').hidden = !riding;
    $('recenter').hidden = !riding || !tilt.enabled;
    $('stick').hidden = riding && tilt.enabled;
    $('lookhint').hidden = riding && tilt.enabled;
    $('drive-notice').hidden = !riding || !$('drive-notice').textContent;
    $('jump').hidden = (riding && !mountedAnimal) || swimming || !!(climb && expansion.lift.moving);
  }
  function interactAt(x, y) {
    pointer.set((x / innerWidth) * 2 - 1, (-y / innerHeight) * 2 + 1);
    world.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const targets = [
      ...expansion.animals.map((a) => a.root),
      expansion.bike,
      expansion.lift.button,
      ...towerGroup.children.filter((o) => o.userData.interaction === 'call'),
    ];
    const hit = raycaster.intersectObjects(targets, true).find((h) => h.distance < 85);
    if (!hit) return;
    const a = hit.object.userData.animal;
    if (a) {
      greetAnimal(a);
      return;
    }
    const kind = hit.object.userData.interaction;
    if (kind === 'bike') bikeAction();
    else if ((kind === 'lift' || kind === 'call') && player.position.distanceTo(hit.point) < 14)
      liftAction();
  }
  $('sound').addEventListener('click', async () => {
    const muted = await ambience.toggle();
    $('sound').setAttribute('aria-pressed', String(muted));
    $('sound').setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
    $('sound').classList.toggle('muted', muted);
  });
  $('enter').addEventListener('click', () => {
    if (mode !== 'intro') return;
    ambience.start();
    mode = 'approach';
    startTime = clock.elapsedTime;
    $('intro').style.opacity = 0;
    $('intro').style.pointerEvents = 'none';
  });
  $('jump').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jump();
  });
  $('jump').addEventListener('click', (e) => {
    if (e.detail === 0) jump();
  });
  for (const id of ['accelerate', 'brake']) bindPedal(id);
  $('action').addEventListener('click', contextAction);
  $('home').addEventListener('click', resetHome);
  function clearPedals() {
    for (const id of ['accelerate', 'brake']) {
      pedalPointers[id].clear();
      $(id).classList.toggle('pressed', false);
      $(id).setAttribute('aria-pressed', 'false');
    }
    accelerateHeld = brakeHeld = false;
  }
  function updatePedals() {
    accelerateHeld = pedalPointers.accelerate.size > 0;
    brakeHeld = pedalPointers.brake.size > 0;
    for (const id of ['accelerate', 'brake']) {
      $(id).classList.toggle('pressed', pedalPointers[id].size > 0);
      $(id).setAttribute('aria-pressed', String(pedalPointers[id].size > 0));
    }
  }
  function bindPedal(id) {
    const button = $(id),
      pointers = pedalPointers[id];
    button.addEventListener('pointerdown', (e) => {
      if (!riding) return;
      e.preventDefault();
      pointers.add(e.pointerId);
      button.setPointerCapture(e.pointerId);
      updatePedals();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      button.addEventListener(type, (e) => {
        pointers.delete(e.pointerId);
        updatePedals();
      });
    button.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (riding) pointers.add('keyboard');
        updatePedals();
      }
    });
    button.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        pointers.delete('keyboard');
        updatePedals();
      }
    });
    button.addEventListener('blur', () => {
      pointers.clear();
      updatePedals();
    });
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function driveNotice(text) {
    clearTimeout(noticeTimer);
    $('drive-notice').textContent = text;
    $('drive-notice').hidden = !riding || !text;
    if (text)
      noticeTimer = setTimeout(() => {
        $('drive-notice').textContent = '';
        $('drive-notice').hidden = true;
      }, 4000);
  }
  function tiltStateChanged(state) {
    clearInput();
    $('tilt').setAttribute('aria-pressed', String(tilt.enabled));
    $('tilt-label').textContent =
      state === 'on' ? 'Inclinaison' : state === 'waiting' ? 'Un instant…' : 'Incliner';
    $('tilt').setAttribute(
      'aria-label',
      state === 'on' ? 'Revenir au joystick' : 'Diriger en inclinant le téléphone',
    );
    if (state === 'waiting') driveNotice('Tiens ton téléphone confortablement, écran face à toi.');
    else if (state === 'on') driveNotice('Incline pour tourner !');
    else if (state === 'denied' || state === 'unavailable')
      driveNotice('Inclinaison indisponible. Tu peux conduire au joystick.');
    else driveNotice('');
  }
  $('tilt').addEventListener('click', () => {
    if (!riding) return;
    if (tilt.enabled || tilt.state === 'waiting') tilt.stop();
    else tilt.start();
  });
  $('recenter').addEventListener('click', () => {
    clearInput();
    driveNotice('Position recentrée');
  });
  function orientationChanged() {
    clearInput();
    if (riding && tilt.enabled)
      driveNotice('Nouvelle position : tiens le téléphone confortablement.');
  }
  window.screen?.orientation?.addEventListener('change', orientationChanged);
  addEventListener('orientationchange', orientationChanged);
  $('full').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen();
    } catch {}
  });
  const stick = $('stick');
  let stickOriginX = 0,
    stickOriginY = 0,
    stickMoved = false;
  function startStick(e, floating = false) {
    if (joy.id !== null || (riding && tilt.enabled)) return;
    if (mode === 'reveal') beginWalk();
    e.preventDefault();
    joy.id = e.pointerId;
    stickMoved = false;
    if (floating) {
      const r = stick.getBoundingClientRect();
      stick.style.left = e.clientX - r.width / 2 + 'px';
      stick.style.top = e.clientY - r.height / 2 + 'px';
      stick.style.bottom = 'auto';
    }
    stickOriginX = e.clientX;
    stickOriginY = e.clientY;
    joy.x = joy.y = 0;
    $('knob').style.transform = '';
    e.currentTarget?.setPointerCapture(e.pointerId);
  }
  function updateJoy(e) {
    let x = e.clientX - stickOriginX,
      y = e.clientY - stickOriginY;
    const d = Math.hypot(x, y),
      limit = 42;
    if (d > 7) stickMoved = true;
    if (d > limit) {
      x *= limit / d;
      y *= limit / d;
    }
    const input = radialInput(x / limit, y / limit);
    joy.x = input.x;
    joy.y = input.y;
    $('knob').style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  function stopStick(e, tappable = false) {
    if (e.pointerId !== joy.id) return;
    joy.x = joy.y = 0;
    joy.id = null;
    $('knob').style.transform = '';
    stick.style.left = '';
    stick.style.top = '';
    stick.style.bottom = '';
    if (tappable && !stickMoved) interactAt(e.clientX, e.clientY);
  }
  stick.addEventListener('pointerdown', (e) => startStick(e));
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) updateJoy(e);
  });
  for (const evt of ['pointerup', 'pointercancel', 'lostpointercapture'])
    stick.addEventListener(evt, (e) => stopStick(e));
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (mode === 'reveal') beginWalk();
    if (mode !== 'walk') return;
    if (
      !(riding && tilt.enabled) &&
      e.clientX < innerWidth * 0.44 &&
      e.clientY > innerHeight * 0.42
    ) {
      startStick(e, true);
      renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    if (lookId !== null) return;
    lookId = e.pointerId;
    lookMoved = false;
    lastX = downX = e.clientX;
    lastY = downY = e.clientY;
    downAt = performance.now();
    lastLookTime = clock.elapsedTime;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) {
      updateJoy(e);
      return;
    }
    if (e.pointerId !== lookId || (riding && tilt.enabled)) return;
    if (!lookMoved && Math.hypot(e.clientX - downX, e.clientY - downY) < 8) return;
    lookMoved = true;
    const sensitivity = (Math.PI * 0.65) / Math.min(innerWidth, innerHeight);
    turnView(-(e.clientX - lastX) * sensitivity);
    pitch = T.MathUtils.clamp(pitch - (e.clientY - lastY) * sensitivity, -0.65, 1.54);
    lastX = e.clientX;
    lastY = e.clientY;
    lastLookTime = clock.elapsedTime;
    $('lookhint').style.opacity = '0';
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.pointerId === joy.id) {
      stopStick(e, true);
      return;
    }
    if (e.pointerId !== lookId) return;
    if (
      !lookMoved &&
      Math.hypot(e.clientX - downX, e.clientY - downY) < 8 &&
      performance.now() - downAt < 500
    )
      interactAt(e.clientX, e.clientY);
    lookId = null;
    lastLookTime = clock.elapsedTime;
  });
  for (const evt of ['pointercancel', 'lostpointercapture'])
    renderer.domElement.addEventListener(evt, (e) => {
      stopStick(e);
      if (lookId === e.pointerId) lookId = null;
    });
  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key))
      e.preventDefault();
    if (mode === 'reveal') beginWalk();
    if (!e.repeat && e.key === ' ' && (!riding || mountedAnimal)) jump();
    if (!e.repeat && e.key.toLowerCase() === 'e') contextAction();
    keys.add(e.key.toLowerCase());
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    clearInput();
    clock.getDelta();
    ambience.visibility(document.hidden);
  });
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    $('error').hidden = false;
  });
  function updateCamera(dt) {
    const up = activeUp();
    camera.up.copy(up);
    const eye = player.position.clone().addScaledVector(up, swimming ? 2.5 : 2.4);
    const view = forward
      .clone()
      .multiplyScalar(Math.cos(pitch))
      .addScaledVector(up, Math.sin(pitch))
      .normalize();
    const offset = Math.max(
      1.1,
      (riding ? 10 + (Math.abs(drive.speed) / 48) * 3 : 9) * (1 - Math.max(0, pitch) / 1.65),
    );
    desired
      .copy(eye)
      .addScaledVector(forward, -offset)
      .addScaledVector(up, riding ? 1 : 0.65);
    const radial = desired.clone().sub(CENTER),
      r = radial.length();
    if (r > 1) {
      const n = radial.divideScalar(r),
        max = RADIUS - relief(n) - 0.8;
      if (r > max) desired.copy(CENTER).addScaledVector(n, max);
    }
    camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
    viewTarget.copy(camera.position).addScaledVector(view, 80);
    camera.lookAt(viewTarget);
    camera.fov = T.MathUtils.lerp(
      camera.fov,
      riding ? 59 + (Math.abs(drive.speed) / 48) * 6 : 59,
      Math.min(1, dt * 3),
    );
    camera.updateProjectionMatrix();
    const nearSun = player.position.distanceTo(CENTER);
    solarMat.opacity = nearSun < 32 ? Math.max(0.05, ((nearSun - 15) / 17) * 0.95) : 0.95;
    halo.visible = nearSun > 32;
  }
  function hoverBase(n) {
    return lakeDepth(n) + 0.24 * T.MathUtils.smoothstep(1 - lakeRadius(n), 0, 0.06);
  }
  function towerAllows(n) {
    const l = towerLocal(surface(n)),
      r = Math.hypot(l.x, l.z);
    if (l.y > 5 || l.y < -3) return true;
    if (r > 6.5 && r < 8.6) return l.x > 5 && Math.abs(l.z) < 2.6;
    return true;
  }
  function safeSurface(n, radius) {
    if (
      jumpHeight < 1.4 &&
      bridgeHeight(navNormal) > 1 &&
      bigLakeRadius(navNormal) < 1.02 &&
      roadDistance(navNormal) < 4.6 &&
      roadDistance(n) > 4.6
    )
      return false;
    if (
      jumpHeight < 1.4 &&
      ((bridgeHeight(navNormal) > 1 && bridgeHeight(n) === 0) ||
        (bridgeHeight(n) > 1 && bridgeHeight(navNormal) === 0))
    )
      return false;
    return !surfaceBlocked(n, radius) && towerAllows(n);
  }
  function moveSurface(side, ahead, dt, speedOverride = null) {
    const speed = speedOverride ?? (swimming ? 6.5 : 12),
      steps = Math.max(1, Math.ceil((speed * dt) / 0.38));
    for (let i = 0; i < steps; i++) {
      let next = advanceFrame(navNormal, forward, side, ahead, (speed * dt) / steps);
      next.normal = collisions.resolve(
        next.normal,
        riding ? 1.3 : 0.62,
        riding && !mountedAnimal ? 1.1 : jumpHeight,
      );
      for (const a of expansion.animals) {
        if (a === mountedAnimal) continue;
        const min = riding ? 3 : 2,
          dist = next.normal.distanceTo(a.n) * RADIUS;
        if (dist < min) {
          const away = next.normal.clone().addScaledVector(a.n, -next.normal.dot(a.n)).normalize();
          next.normal
            .copy(a.n)
            .multiplyScalar(Math.cos(min / RADIUS))
            .addScaledVector(away, Math.sin(min / RADIUS))
            .normalize();
        }
      }
      if (!safeSurface(next.normal, riding ? 1.2 : 0.6)) {
        next = advanceFrame(navNormal, forward, side, 0, (speed * dt) / steps);
        next.normal = collisions.resolve(
          next.normal,
          riding ? 1.3 : 0.62,
          riding && !mountedAnimal ? 1.1 : jumpHeight,
        );
        if (!safeSurface(next.normal, riding ? 1.2 : 0.6)) {
          next = advanceFrame(navNormal, forward, 0, ahead, (speed * dt) / steps);
          next.normal = collisions.resolve(
            next.normal,
            riding ? 1.3 : 0.62,
            riding && !mountedAnimal ? 1.1 : jumpHeight,
          );
        }
      }
      if (safeSurface(next.normal, riding ? 1.2 : 0.6)) {
        navNormal = next.normal;
        forward = next.forward.projectOnPlane(navNormal).normalize();
      }
    }
  }
  function move(dt) {
    let side =
        joy.x +
        (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
        (keys.has('q') || keys.has('a') || keys.has('arrowleft') ? 1 : 0),
      ahead =
        -joy.y +
        (keys.has('z') || keys.has('w') || keys.has('arrowup') ? 1 : 0) -
        (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const length = Math.hypot(side, ahead);
    moving = Math.min(1, length);
    if (riding) {
      const byTilt = tilt.enabled;
      side = byTilt ? tilt.update(dt) : T.MathUtils.clamp(side, -1, 1);
      ahead = accelerateHeld
        ? 1
        : byTilt
          ? (keys.has('w') || keys.has('z') || keys.has('arrowup') ? 1 : 0) -
            (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
          : T.MathUtils.clamp(ahead, -1, 1);
    } else {
      side /= Math.max(1, length);
      ahead /= Math.max(1, length);
    }
    expansion.updateLift(dt);
    if (jumpVelocity !== 0 || jumpHeight > 0) {
      jumpVelocity -= 18 * dt;
      jumpHeight = Math.max(0, jumpHeight + jumpVelocity * dt);
      if (jumpHeight === 0) jumpVelocity = 0;
    }
    if (climb) {
      const lift = expansion.lift;
      if (climb.onPlatform) climb.y = lift.height;
      const up = towerUp,
        right = forward.clone().cross(up).normalize(),
        direction = forward
          .clone()
          .multiplyScalar(ahead)
          .addScaledVector(right, side)
          .applyQuaternion(towerInverse);
      let x = climb.x + direction.x * dt * 9,
        z = climb.z + direction.z * dt * 9,
        r = Math.hypot(x, z);
      if (lift.moving && climb.onPlatform) {
        if (r > 5.3) {
          x *= 5.3 / r;
          z *= 5.3 / r;
        }
        climb.x = x;
        climb.z = z;
      } else if (climb.y > TOWER_HEIGHT - 1) {
        if (r < 13) {
          if (r < 6.3 && lift.height < TOWER_HEIGHT - 1) {
            if (r < 7) {
              x *= 7 / Math.max(r, 0.001);
              z *= 7 / Math.max(r, 0.001);
            }
          }
          climb.x = x;
          climb.z = z;
          climb.onPlatform = r < 5.8 && lift.height > TOWER_HEIGHT - 1;
        }
      } else {
        if (r < 6.4 || (x > 5 && Math.abs(z) < 2.6)) {
          climb.x = x;
          climb.z = z;
        }
        if (r > 8.8 && x > 5 && Math.abs(z) < 2.6) {
          navNormal = towerWorld({ x, y: 0, z }).sub(CENTER).normalize();
          forward.projectOnPlane(navNormal).normalize();
          climb = null;
        }
      }
      if (climb) player.position.copy(towerWorld(climb)).addScaledVector(towerUp, jumpHeight);
    }
    if (!climb) {
      if (riding) {
        const handling = drive.update(
            ahead,
            side,
            brakeHeld || (keys.has(' ') && !mountedAnimal),
            dt,
          ),
          speedFactor = mountedAnimal ? (mountedAnimal.kind === 'cow' ? 0.375 : 0.46) : 1;
        handling.speed *= speedFactor;
        bikeHeading.projectOnPlane(navNormal).normalize().applyAxisAngle(activeUp(), handling.turn);
        const oldNormal = navNormal.clone();
        const right = forward.clone().cross(activeUp()).normalize();
        const ds = bikeHeading.dot(right) * Math.sign(handling.speed),
          da = bikeHeading.dot(forward) * Math.sign(handling.speed);
        if (Math.abs(handling.speed) > 0.001) moveSurface(ds, da, dt, Math.abs(handling.speed));
        const transport = new T.Quaternion().setFromUnitVectors(oldNormal, navNormal);
        bikeHeading.applyQuaternion(transport).projectOnPlane(navNormal).normalize();
        const actual = oldNormal.distanceTo(navNormal) * RADIUS,
          expected = Math.abs(handling.speed) * dt;
        if (expected > 0.04 && actual < expected * 0.3) drive.speed *= 0.3;
        moving = Math.abs(drive.speed) / 48;
        if (
          (tilt.enabled || (lookId === null && clock.elapsedTime - lastLookTime > 1.4)) &&
          Math.abs(drive.speed) > 3
        ) {
          const up = activeUp(),
            angle = Math.atan2(
              up.dot(forward.clone().cross(bikeHeading)),
              forward.dot(bikeHeading),
            );
          forward.applyAxisAngle(up, angle * (1 - Math.exp(-dt * 1.8))).normalize();
        }
        if (tilt.enabled) pitch = T.MathUtils.lerp(pitch, 0.12, 1 - Math.exp(-dt * 3));
      } else {
        const motion = walkHandling.update(side, ahead, dt);
        if (Math.hypot(motion.side, motion.ahead) > 0.001)
          moveSurface(motion.side, motion.ahead, dt);
        moving = Math.hypot(motion.side, motion.ahead);
      }
      const depth = lakeDepth(navNormal);
      swimming = !riding && depth > 1.2 && bridgeHeight(navNormal) < 0.1 && jumpHeight < 0.3;
      const waterHeight =
        roadOffset(navNormal) > 0
          ? roadOffset(navNormal)
          : depth > 0
            ? depth + 0.24 - Math.min(1.25, depth * 0.9)
            : 0;
      const ridingHeight = mountedAnimal
        ? (mountedAnimal.kind === 'cow' ? 1.6 : 0.95) + animalGround(navNormal)
        : 1.05 + (roadOffset(navNormal) > 0 ? roadOffset(navNormal) : hoverBase(navNormal));
      player.position.copy(surface(navNormal, (riding ? ridingHeight : waterHeight) + jumpHeight));
      if (!riding && depth === 0 && jumpHeight < 0.05) {
        const local = towerLocal(player.position);
        if (
          Math.abs(local.y) < 1 &&
          Math.hypot(local.x, local.z) < 5.8 &&
          expansion.lift.height < 0.1
        ) {
          climb = { x: local.x, z: local.z, y: 0, onPlatform: true };
          forward.projectOnPlane(towerUp).normalize();
        }
      }
    }
    if (riding || length > 0.06) {
      const up = activeUp(),
        face = riding
          ? bikeHeading.clone()
          : forward
              .clone()
              .multiplyScalar(ahead)
              .addScaledVector(forward.clone().cross(up).normalize(), side)
              .normalize();
      const basis = new T.Matrix4().makeBasis(up.clone().cross(face).normalize(), up, face);
      const q = new T.Quaternion().setFromRotationMatrix(basis);
      if (riding)
        q.multiply(
          new T.Quaternion().setFromEuler(
            new T.Euler(T.MathUtils.clamp(drive.acceleration / 600, -0.06, 0.05), 0, drive.bank),
          ),
        );
      if (swimming) q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.55));
      player.quaternion.slerp(q, Math.min(1, dt * 14));
      walk += dt * (swimming ? 5 : 11) * moving;
    } else {
      const oldUp = new T.Vector3(0, 1, 0).applyQuaternion(player.quaternion);
      player.quaternion.premultiply(new T.Quaternion().setFromUnitVectors(oldUp, activeUp()));
    }
    if (riding) {
      if (mountedAnimal) {
        const a = mountedAnimal;
        a.n.copy(navNormal);
        a.root.position.copy(surface(navNormal, animalGround(navNormal) + jumpHeight));
        const up = activeUp(),
          q = new T.Quaternion().setFromRotationMatrix(
            new T.Matrix4().makeBasis(up.clone().cross(bikeHeading).normalize(), up, bikeHeading),
          );
        a.root.quaternion.slerp(q, Math.min(1, dt * 14));
        a.head.rotation.x = jumpHeight > 0.1 ? -0.22 : Math.sin(walk) * moving * 0.07;
        a.head.rotation.y = 0;
        a.legs.forEach(
          (leg, i) =>
            (leg.rotation.x =
              jumpHeight > 0.1
                ? -0.55
                : Math.sin(walk + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 * moving),
        );
      } else {
        expansion.bike.position.copy(
          surface(
            navNormal,
            1 +
              (roadOffset(navNormal) > 0 ? roadOffset(navNormal) : hoverBase(navNormal)) +
              Math.sin(clock.elapsedTime * 3) * 0.035,
          ),
        );
        expansion.bike.quaternion.copy(player.quaternion);
      }
    }
    legs.forEach(
      (l, i) =>
        (l.rotation.x = riding
          ? -0.95
          : Math.sin(walk + i * Math.PI) * (swimming ? 0.18 : 0.45) * moving),
    );
    arms.forEach((a, i) => {
      a.rotation.x = riding
        ? -1.1
        : swimming
          ? -0.4 + Math.sin(walk + i * Math.PI) * 0.9
          : -Math.sin(walk + i * Math.PI) * 0.4 * moving;
      a.rotation.z = swimming ? (i === 0 ? 0.65 : -0.65) : 0;
    });
    robe.position.y = 0.9;
    const up = activeUp();
    playerShadow.visible = !swimming && !riding;
    playerShadow.position.copy(player.position).addScaledVector(up, 0.03 - jumpHeight);
    playerShadow.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), up);
    const p = chart(navNormal);
    lakeWater.uniforms.swimmer.value.set(p.x, p.z);
    lakeWater.uniforms.wake.value = T.MathUtils.lerp(
      lakeWater.uniforms.wake.value,
      swimming
        ? 0.4 + moving * 0.6
        : riding && bridgeHeight(navNormal) < 0.1 && lakeRadius(navNormal) < 1
          ? Math.min(1, Math.abs(drive.speed) / 24)
          : 0,
      Math.min(1, dt * 4),
    );
    const far = bigLakeChart(navNormal);
    distantWater.uniforms.swimmer.value.set(far.x, far.z);
    distantWater.uniforms.wake.value = lakeWater.uniforms.wake.value;
    updateCamera(dt);
    updateHud();
  }
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.045),
      t = clock.elapsedTime;
    if (mode === 'intro') {
      camera.up.set(0, 1, 0);
      camera.position.set(520 + Math.sin(t * 0.07) * 40, 240, 1040);
      camera.lookAt(0, 30, 0);
    } else if (mode === 'approach') {
      const u = (t - startTime) / 4.5;
      if (u < 1) {
        const s = u * u * (3 - 2 * u);
        camera.position.set(520 * (1 - s), 240 * (1 - s) + 15 * s, 1040 * (1 - s) + 294 * s);
        camera.lookAt(0, 15, 276);
        $('fade').style.opacity = u > 0.85 ? String((u - 0.85) / 0.15) : '0';
      } else {
        mode = 'tunnel';
        startTime = t;
        interior();
        $('fade').style.opacity = '0';
      }
    } else if (mode === 'tunnel') {
      const u = Math.min(1, (t - startTime) / 6),
        s = u * u * (3 - 2 * u);
      const tunnelQ = orientation(normalAt(0, 118));
      camera.position.copy(
        new T.Vector3(0, 4, 35 - s * 73).applyQuaternion(tunnelQ).add(surfacePoint(0, 118)),
      );
      camera.up.copy(normalAt(0, 118).negate());
      camera.lookAt(surfacePoint(0, 45, 15));
      if (u >= 1) beginReveal(t);
    } else if (mode === 'reveal') {
      const u = t - startTime,
        smooth = (v) => {
          v = T.MathUtils.clamp(v, 0, 1);
          return v * v * (3 - 2 * v);
        };
      pitch =
        u < 3
          ? 0.12 + 1.26 * smooth(u / 3)
          : u < 4.2
            ? 1.38
            : 1.38 - 1.26 * smooth((u - 4.2) / 2.8);
      updateCamera(dt);
      if (u >= 7) beginWalk();
    } else move(dt);
    if (world.visible) {
      dayNight.update(t, player.position);
      fields.update(t, player.position, dayNight.direction.value);
      nightDetails.update(t, player.position, dayNight.direction.value);
      trailEffects.update(
        t,
        dt,
        {
          normal: navNormal,
          position: player.position,
          forward,
          riding,
          animal: mountedAnimal,
          jumpHeight,
          climb,
          mode,
        },
        dayNight.direction.value,
        lakeWater.uniforms.mist.value,
      );
      updateSunEffects(t);
      animatePatapon(t, dt);
      expansion.updateAnimals(t, dt, player.position);
      lakeWater.uniforms.time.value = distantWater.uniforms.time.value = t;
      ambience.update(
        t,
        player.position.distanceTo(surfacePoint(-29, -15)),
        riding && !mountedAnimal ? 0 : player.position.distanceTo(ship.position),
        player.position.distanceTo(CENTER),
        mode === 'walk' || mode === 'reveal',
      );
    }
    renderer.render(scene, camera);
  }

  function start() {
    animate();
  }
  // Stable entry points for the browser and the regression tests. Tests use these
  // instead of reaching into this module, so functions can move between files freely.
  function press(key) {
    keys.add(key);
  }
  function release(key) {
    keys.delete(key);
  }
  function releaseKeys() {
    keys.clear();
  }
  // Teleport or configure the player for a scenario; only the given fields change.
  function place(options) {
    if (options.normal) navNormal = options.normal.clone();
    if (options.forward) forward.copy(options.forward);
    if (options.position) player.position.copy(options.position);
    if (options.heading) bikeHeading.copy(options.heading);
    if (options.riding !== undefined) riding = options.riding;
    if (options.speed !== undefined) drive.speed = options.speed;
    if (options.lastLookTime !== undefined) lastLookTime = options.lastLookTime;
  }
  function state() {
    return {
      mode,
      riding,
      swimming,
      mountedAnimal,
      climb,
      jumpHeight,
      jumpVelocity,
      normal: navNormal,
      forward,
      heading: bikeHeading,
      position: player.position,
      speed: drive.speed,
      pitch,
      joy,
      lookId,
      lookMoved,
      accelerateHeld,
      brakeHeld,
      time: clock.elapsedTime,
    };
  }
  return {
    start,
    step: move,
    beginWalk,
    resetHome,
    clearInput,
    updateHud,
    orientationChanged,
    jump,
    contextAction,
    bikeAction,
    liftAction,
    greetAnimal,
    getContext,
    turnView,
    press,
    release,
    releaseKeys,
    place,
    state,
    parts: {
      scene,
      world,
      camera,
      clock,
      renderer,
      tilt,
      drive,
      expansion,
      collisions,
      landscape,
      lakeWater,
      distantWater,
      dayNight,
      forest,
      fields,
      nightDetails,
      trailEffects,
      innerSun,
      sunCage,
      sunInteriorUniforms,
      towerQ,
      updateSunEffects,
      animalGround,
      hoverBase,
    },
  };
}
