import * as T from './vendor/three.module.min.js';
import { addWind } from './vegetation.js';
import { buildFace } from './face.js';
import {
  RADIUS,
  CENTER,
  TOWER_HEIGHT,
  ROAD_AXIS,
  MEADOW,
  roadNormal,
  normalAt,
  orientation,
  surface,
  surfacePoint,
  roadDistance,
  meadowDistance,
  roadOffset,
  lakeDepth,
} from './navigation.js';
export function buildExpansion({ world, mesh, mat, box, ball, cyl, beam, rand, towerGroup }) {
  const dummy = new T.Object3D();
  // A closed great-circle road, gently following the relief.
  const positions = [],
    indices = [],
    N = 720;
  for (let i = 0; i <= N; i++) {
    const n = roadNormal((i / N) * Math.PI * 2);
    for (const sign of [-1, 1]) {
      const edge = n
        .clone()
        .multiplyScalar(Math.cos(5.2 / RADIUS))
        .addScaledVector(ROAD_AXIS, Math.sin((sign * 5.2) / RADIUS));
      positions.push(...surface(edge, roadOffset(edge) + 0.16).toArray());
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const roadG = new T.BufferGeometry();
  roadG.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  roadG.setIndex(indices);
  roadG.computeVertexNormals();
  mesh(
    roadG,
    new T.MeshStandardMaterial({ color: '#8e9b8b', roughness: 1, side: T.DoubleSide }),
    world,
  );
  const markings = new T.InstancedMesh(new T.BoxGeometry(0.2, 0.035, 2.8), mat('#e8dcb5'), 240);
  for (let i = 0; i < 240; i++) {
    const t = (i / 240) * Math.PI * 2,
      n = roadNormal(t),
      f = roadNormal(t + 0.001)
        .sub(n)
        .normalize()
        .projectOnPlane(n)
        .normalize(),
      up = n.clone().negate();
    dummy.position.copy(surface(n, roadOffset(n) + 0.19));
    dummy.quaternion.setFromRotationMatrix(
      new T.Matrix4().makeBasis(up.clone().cross(f).normalize(), up, f),
    );
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    markings.setMatrixAt(i, dummy.matrix);
  }
  world.add(markings);
  // A colourful flower meadow beside the road.
  const mx = new T.Vector3(1, 0, 0).projectOnPlane(MEADOW).normalize(),
    mz = MEADOW.clone().cross(mx).normalize();
  function meadowNormal(x, z) {
    return MEADOW.clone()
      .multiplyScalar(RADIUS)
      .addScaledVector(mx, x)
      .addScaledVector(mz, z)
      .normalize();
  }
  const flowerCount = 1500,
    stems = new T.InstancedMesh(
      new T.CylinderGeometry(0.035, 0.05, 0.55, 4),
      mat('#63894c'),
      flowerCount,
    ),
    blooms = new T.InstancedMesh(new T.IcosahedronGeometry(0.28, 0), mat('#fff1b6'), flowerCount);
  for (let i = 0; i < flowerCount; i++) {
    const a = rand() * Math.PI * 2,
      r = Math.sqrt(rand()) * 53,
      n = meadowNormal(Math.cos(a) * r, Math.sin(a) * r);
    if (roadDistance(n) < 6) {
      i--;
      continue;
    }
    dummy.quaternion.copy(orientation(n));
    dummy.position.copy(surface(n, 0.3));
    dummy.scale.setScalar(0.75 + rand() * 0.65);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(surface(n, 0.65));
    dummy.scale.y = 0.4;
    dummy.updateMatrix();
    blooms.setMatrixAt(i, dummy.matrix);
    blooms.setColorAt(
      i,
      new T.Color(['#fff3bd', '#ecc079', '#eeb3c4', '#bba8e6', '#f0eee0'][i % 5]),
    );
  }
  addWind(stems.material, { amount: 0.08, base: -0.275, height: 0.55 });
  addWind(blooms.material, { amount: 0.08, whole: true });
  world.add(stems, blooms);
  const animals = [];
  function animal(kind, x, z, index) {
    // root stands on the ground and turns; figure carries the model and can bounce or rock.
    const root = new T.Group(),
      figure = new T.Group(),
      cow = kind === 'cow',
      legs = [],
      head = new T.Group();
    root.userData.kind = kind;
    root.add(figure);
    world.add(root);
    // Plush proportions: a round body, a big oval head on a generous muzzle, floppy ears,
    // short legs and a drawn face. The back stays at the same height so riders sit as before.
    const body = ball(figure, 0, cow ? 1.5 : 1.0, 0, cow ? 1.1 : 0.9, cow ? '#f6f0db' : '#ece6d0', 1);
    body.scale.set(cow ? 1 : 0.9, 0.85, cow ? 1.4 : 1.1);
    if (cow) {
      for (const [x, y, z, s] of [
        [0.9, 1.7, -0.2, 0.52],
        [-0.7, 2.2, -0.6, 0.55],
        [-0.85, 1.4, 0.55, 0.45],
      ]) {
        const p = ball(figure, x, y, z, s, '#4b5047', 0);
        p.scale.set(0.8, 0.7, 1.2);
      }
    } else {
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        ball(figure, Math.cos(a) * 0.55, 1.1 + Math.sin(a) * 0.42, (rand() - 0.5) * 1.3, 0.4, '#f5efd9', 0);
      }
    }
    head.position.set(0, cow ? 1.95 : 1.4, cow ? 1.3 : 0.95);
    figure.add(head);
    const skull = ball(head, 0, 0, 0, cow ? 0.8 : 0.55, cow ? '#f1ead9' : '#7a715c', 1);
    skull.scale.set(1, cow ? 1.05 : 1.08, 0.95);
    if (!cow) ball(head, 0, 0.5, -0.08, 0.42, '#f5efd9', 1);
    const muzzle = new T.Group();
    muzzle.position.set(0, cow ? -0.45 : -0.3, cow ? 0.65 : 0.42);
    head.add(muzzle);
    ball(muzzle, 0, 0, 0, cow ? 0.66 : 0.36, cow ? '#dba89b' : '#8a8068', 1).scale.set(1, 0.7, 0.85);
    for (const sign of [-1, 1]) {
      if (cow) ball(muzzle, sign * 0.22, 0.12, 0.5, 0.06, '#b07f75', 1);
      const ear = ball(head, sign * (cow ? 0.9 : 0.62), cow ? 0.1 : 0.02, 0, cow ? 0.32 : 0.22, cow ? '#665f50' : '#7a715c');
      ear.scale.set(1.5, 0.4, 0.65);
      ear.rotation.z = sign * (cow ? 0.4 : 0.5);
      if (cow) {
        const horn = cyl(head, sign * 0.45, 0.8, -0.05, 0.02, 0.08, 0.3, '#ccb991', 5);
        horn.rotation.z = -sign * 0.35;
      }
      for (const zz of [-1, 1]) {
        const leg = new T.Group();
        leg.position.set(sign * (cow ? 0.62 : 0.42), cow ? 0.95 : 0.75, zz * (cow ? 0.9 : 0.62));
        cyl(leg, 0, cow ? -0.33 : -0.25, 0, cow ? 0.17 : 0.11, cow ? 0.19 : 0.13, cow ? 0.65 : 0.5, cow ? '#f2e9d4' : '#61594a', 5);
        box(leg, 0, cow ? -0.72 : -0.55, 0.05, cow ? 0.38 : 0.26, 0.2, cow ? 0.42 : 0.3, '#454b40');
        figure.add(leg);
        legs.push(leg);
      }
    }
    const face = buildFace({
      builders: { mesh, mat },
      style: 'plush',
      parent: head,
      R: cow ? 0.78 : 0.53,
      tweak: cow ? { yaw: 0.36, pitch: 0.18, blushColour: '#f0b8b0' } : { yaw: 0.36, pitch: 0.12, sclera: true, blushColour: '#b58a80' },
      mouthParent: muzzle,
      mouthR: cow ? 0.56 : 0.3,
      mouthPitch: -0.3,
    });
    beam(
      figure,
      [0, cow ? 1.8 : 1.3, cow ? -1.45 : -1],
      [0, 0.95, cow ? -1.7 : -1.25],
      cow ? 0.07 : 0.1,
      cow ? '#ac9d80' : '#e2d8bf',
    );
    const a = {
      root,
      figure,
      head,
      legs,
      face,
      kind,
      x,
      z,
      index,
      angle: rand() * 6.28,
      reaction: 0,
      n: meadowNormal(x, z),
    };
    root.traverse((o) => (o.userData.animal = a));
    animals.push(a);
    return a;
  }
  for (let i = 0; i < 5; i++) animal('cow', (i % 3) * 13, 8 + Math.floor(i / 3) * 16, i);
  for (let i = 0; i < 7; i++)
    animal('sheep', -5 + (i % 4) * 11, -24 + Math.floor(i / 4) * 13, i + 5);
  function updateAnimals(t, dt, playerPosition) {
    for (const a of animals) {
      // Faces live even on the ridden animal: a grin at the gallop, a gasp when bumped.
      a.face.update(t, a.ridden ? 'joy' : a.reaction > t ? 'surprise' : 'rest');
      if (a.ridden) continue;
      const grazing = a.freeRoam || Math.sin(t * 0.16 + a.index * 2) > 0.05;
      if (!grazing) {
        a.angle += dt * 0.15 * Math.sin(t * 0.17 + a.index);
        const nx = a.x + Math.sin(a.angle) * dt * 0.55,
          nz = a.z + Math.cos(a.angle) * dt * 0.55;
        if (Math.hypot(nx, nz) < 43 && roadDistance(meadowNormal(nx, nz)) > 9) {
          a.x = nx;
          a.z = nz;
        } else a.angle += dt * 1.4;
      }
      if (!a.freeRoam) a.n = meadowNormal(a.x, a.z);
      a.root.position.copy(
        surface(
          a.n,
          roadOffset(a.n) +
            Math.max(0, lakeDepth(a.n) + 0.24 - 0.6) * (roadOffset(a.n) === 0 ? 1 : 0),
        ),
      );
      a.root.quaternion
        .copy(orientation(a.n))
        .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), a.angle));
      a.head.rotation.x = a.reaction > t ? -0.18 : grazing ? 0.45 + 0.08 * Math.sin(t * 0.8) : 0;
      a.head.rotation.y = a.reaction > t ? 0.15 * Math.sin(t * 5) : 0;
      if (playerPosition.distanceTo(a.root.position) < 12) {
        a.root.updateWorldMatrix(true, false);
        const look = a.root.worldToLocal(playerPosition.clone());
        a.head.rotation.y = T.MathUtils.clamp(Math.atan2(look.x, look.z), -0.7, 0.7);
        a.head.rotation.x = -0.05;
      }
      // Breathing while grazing, a light bob and a fuller stride while wandering.
      a.figure.scale.y = 1 + 0.012 * Math.sin(t * 1.4 + a.index);
      a.figure.position.y = grazing ? 0 : Math.abs(Math.sin(t * 3)) * 0.035;
      a.figure.rotation.set(grazing ? 0 : Math.sin(t * 3 + 0.6) * 0.02, 0, 0);
      a.legs.forEach(
        (leg, i) =>
          (leg.rotation.x = grazing
            ? 0
            : Math.sin(t * 3 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.26),
      );
    }
  }
  // A compact hovering speeder, parked beside the cabin and the circuit.
  const bike = new T.Group();
  world.add(bike);
  const chassis = ball(bike, 0, 0.5, 0, 1, '#a7784d', 1);
  chassis.scale.set(0.65, 0.4, 2.4);
  box(bike, 0, 0.85, -0.3, 0.92, 0.3, 1.4, '#514a3e');
  box(bike, 0, 1.05, 0.85, 0.65, 0.32, 0.6, '#788d82');
  for (const x of [-0.54, 0.54]) {
    beam(bike, [x, 0.4, 1], [x, 0.35, 4.2], 0.09, '#91a79b');
    box(bike, x, 0.35, 3.8, 0.32, 0.1, 1.6, '#c3b184');
    const engine = cyl(bike, x, 0.4, -1.5, 0.27, 0.32, 0.9, '#768981');
    engine.rotation.x = Math.PI / 2;
    mesh(new T.SphereGeometry(0.23, 8, 6), mat('#b4f5ef', '#4bbba7'), bike, x, 0.4, -2);
    beam(bike, [x, 0.95, 0.9], [x * 1.3, 1.2, 0.4], 0.07, '#c2c5a8');
  }
  let bikeNormal = normalAt(64, 10);
  bike.position.copy(surface(bikeNormal, 1));
  bike.quaternion.copy(orientation(bikeNormal));
  bike.traverse((o) => (o.userData.interaction = 'bike'));
  // Glass lift shaft with a real travelling deck and a button on board.
  const glass = new T.MeshPhysicalMaterial({
    color: '#b4eee5',
    transparent: true,
    opacity: 0.15,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 1,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const glassWall = mesh(
    new T.CylinderGeometry(
      7.5,
      7.5,
      TOWER_HEIGHT,
      48,
      1,
      true,
      Math.PI / 2 + 0.43,
      Math.PI * 2 - 0.86,
    ),
    glass,
    towerGroup,
    0,
    TOWER_HEIGHT / 2,
    0,
  );
  // Glass must not cast a solid shadow over the lift.
  glassWall.castShadow = false;
  for (const a of [0.4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.6]) {
    cyl(
      towerGroup,
      Math.sin(a) * 7.5,
      TOWER_HEIGHT / 2,
      Math.cos(a) * 7.5,
      0.12,
      0.12,
      TOWER_HEIGHT,
      '#a6c9bd',
      6,
    );
  }
  for (let y = 0; y <= TOWER_HEIGHT; y += 21) {
    const ring = mesh(new T.TorusGeometry(7.5, 0.1, 5, 48), mat('#c6dfcd'), towerGroup, 0, y, 0);
    ring.rotation.x = Math.PI / 2;
  }
  cyl(towerGroup, 0, -0.2, 0, 8.7, 8.7, 0.4, '#a8ba9e', 32);
  const roomFloor = mesh(
    new T.RingGeometry(6.5, 14, 64),
    new T.MeshStandardMaterial({ color: '#b8bb9c', side: T.DoubleSide, roughness: 0.65 }),
    towerGroup,
    0,
    TOWER_HEIGHT,
    0,
  );
  roomFloor.rotation.x = -Math.PI / 2;
  const platform = new T.Group();
  towerGroup.add(platform);
  cyl(platform, 0, -0.15, 0, 6.4, 6.4, 0.3, '#88aaa1', 32);
  const rim = mesh(
    new T.TorusGeometry(6.25, 0.1, 6, 48),
    mat('#dcf7da', '#58766d'),
    platform,
    0,
    0.08,
    0,
  );
  rim.rotation.x = -Math.PI / 2;
  box(platform, 3, 1, 0, 0.6, 2, 0.6, '#648c83');
  const liftButton = ball(platform, 3, 2.12, 0, 0.38, '#f9dc85', 1);
  liftButton.material = mat('#ffe7a2', '#bd944a');
  liftButton.userData.interaction = 'lift';
  const callButton = box(towerGroup, 9, 1.2, 2.7, 0.65, 1.9, 0.65, '#7c9d90');
  callButton.userData.interaction = 'call';
  ball(towerGroup, 9, 2.3, 2.7, 0.3, '#f1da99').userData.interaction = 'call';
  const lift = { height: 0, target: 0, platform, button: liftButton, moving: false };
  function updateLift(dt) {
    const delta = lift.target - lift.height,
      step = dt * 24;
    lift.height = Math.abs(delta) < step ? lift.target : lift.height + Math.sign(delta) * step;
    lift.moving = Math.abs(lift.target - lift.height) > 0.001;
    platform.position.y = lift.height;
  }
  return { animals, updateAnimals, bike, lift, updateLift, meadowNormal };
}
