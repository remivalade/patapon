import * as T from './vendor/three.module.min.js';
import { placeOnGlobe } from './builders.js';
// Patapon's village: stepping stones, log cabin, deck chair, Patapon himself and the parked freighter.
export function buildVillage({ world, builders, rand }) {
  const { mat, mesh, box, ball, cyl, beam } = builders;
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
  function animatePatapon(t, dt, playerPosition, playerUp, canWave) {
    const distance = playerPosition.distanceTo(chair.position);
    if (distance > 23) canGreet = true;
    if (canWave && distance < 16 && canGreet) {
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
    const local = bear.worldToLocal(playerPosition.clone().addScaledVector(playerUp, 1.8));
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
  return { ship, chair, animatePatapon };
}
