// Régression logique : vraies mathématiques Three.js, DOM et moteur WebGL simulés.
// Ne remplace pas une validation visuelle ni un essai sur téléphone.
// Les vérifications passent uniquement par la porte d'entrée de `createGame`
// (commandes, `place`, `state`, `parts`) : elles survivent aux déplacements de code.
import assert from 'node:assert/strict';
import * as T from '../src/vendor/three.module.min.js';
import { createTestGame, touch } from './harness.mjs';
import {
  RADIUS,
  CENTER,
  TOWER_HEIGHT,
  ROAD_AXIS,
  normalAt,
  chart,
  surface,
  surfacePoint,
  orientation,
  advanceFrame,
  lakeRadius,
  lakeDepth,
  roadDistance,
  bigLakeRadius,
  roadOffset,
  islandDistance,
  bigLakeNormal,
  bigLakeChart,
  MOUNTAIN,
  streamPoint,
  lakeShorePoint,
  BIG_LAKE,
  spanRise,
  SPAN,
  bridgeHeight,
  cliffHeight,
  CLIFFS,
  relief,
  mountainDistance,
} from '../src/navigation.js';
import { SCHOOLS } from '../src/fish.js';
import { daylightAt } from '../src/landscape.js';

const { game, renderer, canvas, hud } = await createTestGame();
const { parts } = game;
const s = () => game.state();
const ahead = (n) => new T.Vector3(0, 0, -1).projectOnPlane(n).normalize();
// Place the player on the speeder at a given spot, as the older checks did by hand.
function ride(n, speed, extra = {}) {
  const f = ahead(n);
  game.place({ normal: n, forward: f, heading: f, riding: true, speed, ...extra });
}
function steps(count, dt = 0.016) {
  for (let i = 0; i < count; i++) game.step(dt);
}

// One rendered frame: every position and vertex must be finite.
game.start();
let meshes = 0,
  triangles = 0;
renderer.captured.traverse((o) => {
  if (o.geometry) {
    meshes++;
    if (!o.isPoints)
      triangles +=
        ((o.geometry.index?.count || o.geometry.attributes.position.count) / 3) * (o.count || 1);
  }
});
console.log({ meshes, triangles });

// The checks run in order: several of them continue from the previous situation.
const results = [];
const checks = [];
const check = (name, run) => checks.push({ name, run });

check('full-speed road circuit', () => {
  game.beginWalk();
  parts.expansion.updateAnimals(0, 0.01, s().position);
  const n = normalAt(73, 32);
  ride(n, 48, { position: surface(n) });
  const start = n.clone();
  game.press('w');
  const frames = 2400,
    dt = (2 * Math.PI * RADIUS) / 48 / frames;
  steps(frames, dt);
  game.releaseKeys();
  assert.ok(s().normal.distanceTo(start) < 0.004, 'Speeder full road circuit');
  game.place({ riding: false });
});

check('tree and rock collisions', () => {
  const { collisions } = parts;
  const obstacle = collisions.objects[0];
  const tangent = new T.Vector3(1, 0, 0).projectOnPlane(obstacle.n).normalize();
  const inside = obstacle.n
    .clone()
    .addScaledVector(tangent, 0.2 / RADIUS)
    .normalize();
  const out = collisions.resolve(inside, 0.62, 0);
  assert.ok(out.distanceTo(obstacle.n) * RADIUS >= obstacle.radius + 0.6, 'Tree collision');
  const big = collisions.objects.find((c) => c.radius > 8);
  const bounced = collisions.resolve(big.n, 0.62, 0);
  assert.ok(bounced.distanceTo(big.n) * RADIUS >= big.radius + 0.55, 'Rock collision');
});

check('jump and landing', () => {
  game.resetHome();
  game.jump();
  let max = 0;
  for (let i = 0; i < 150; i++) {
    game.step(0.016);
    max = Math.max(max, s().jumpHeight);
  }
  assert.ok(max > 1.5 && s().jumpHeight === 0, 'Jump and landing');
});

check('landing cloud through the real game loop', () => {
  // The loop hands the effects the live player state, including the experience phase.
  const { trailEffects, updateWorld } = parts;
  game.resetHome();
  const before = trailEffects.stats.landings;
  game.jump();
  for (let i = 1; i <= 150; i++) {
    game.step(0.016);
    updateWorld(i * 0.016, 0.016);
  }
  assert.equal(trailEffects.stats.landings, before + 1);
});

check('swim and leave lake', () => {
  const n = normalAt(-29, -15);
  game.place({ normal: n, position: surface(n) });
  game.step(0.016);
  assert.ok(s().swimming, 'Swimming entry');
  assert.ok(s().position.distanceTo(CENTER) < RADIUS + 1.3, 'Waterline');
  game.place({ normal: normalAt(0, 30) });
  game.step(0.016);
  assert.ok(!s().swimming, 'Swimming exit');
});

check('lift up, down and disembark', () => {
  game.resetHome();
  const n = normalAt(8, -49);
  game.place({ normal: n, position: surface(n) });
  game.liftAction();
  assert.ok(s().climb?.onPlatform);
  steps(700);
  assert.equal(parts.expansion.lift.height, TOWER_HEIGHT);
  assert.equal(s().climb.y, TOWER_HEIGHT);
  game.liftAction();
  steps(700);
  assert.equal(parts.expansion.lift.height, 0);
  game.place({ forward: new T.Vector3(1, 0, 0).applyQuaternion(parts.towerQ) });
  game.press('w');
  steps(120);
  game.releaseKeys();
  assert.equal(s().climb, null, 'Leave elevator at ground');
});

check('mount and dismount speeder', () => {
  game.resetHome();
  const n = parts.expansion.bike.position.clone().sub(CENTER).normalize();
  game.place({ normal: n, position: surface(n) });
  game.bikeAction();
  assert.ok(s().riding);
  game.bikeAction();
  assert.ok(!s().riding);
});

check('cow and sheep interaction', () => {
  const { camera, world, expansion } = parts;
  const cow = expansion.animals.find((a) => a.kind === 'cow');
  world.updateMatrixWorld(true);
  const cowUp = cow.n.clone().negate(),
    cowFront = new T.Vector3(0, 0, 1).applyQuaternion(cow.root.quaternion);
  const cowHead = cow.head.getWorldPosition(new T.Vector3());
  camera.position.copy(cowHead).addScaledVector(cowFront, 8).addScaledVector(cowUp, 1);
  camera.up.copy(cowUp);
  camera.lookAt(cowHead);
  camera.updateMatrixWorld(true);
  canvas.pointerdown(touch(42, innerWidth / 2, innerHeight / 2));
  canvas.pointerup(touch(42, innerWidth / 2, innerHeight / 2));
  assert.ok(cow.reaction > s().time);
  const sheep = expansion.animals.find((a) => a.kind === 'sheep');
  game.greetAnimal(sheep);
  assert.ok(sheep.reaction > s().time);
});

check('simultaneous touches, jump on press and camera drag threshold', () => {
  game.resetHome();
  // Independent touches, immediate jump, camera dead zone and drag history.
  hud('jump').pointerdown(touch(3, 750, 330));
  assert.equal(s().jumpVelocity, 8.3);
  game.resetHome();
  canvas.pointerdown(touch(10, 140, 300));
  canvas.pointermove(touch(10, 140, 260));
  assert.ok(s().joy.y < -0.8);
  const oldPitch = s().pitch;
  canvas.pointerdown(touch(11, 550, 220));
  canvas.pointermove(touch(11, 552, 222));
  assert.equal(s().pitch, oldPitch);
  canvas.pointermove(touch(11, 550, 180));
  assert.ok(s().pitch > oldPitch);
  assert.ok(s().joy.y < -0.8);
  assert.ok(s().lookMoved);
  canvas.pointermove(touch(11, 550, 220));
  assert.ok(s().lookMoved, 'Returning a drag to start is still a drag');
  canvas.pointerup(touch(11, 550, 220));
  canvas.pointerup(touch(10, 140, 260));
  assert.equal(s().joy.y, 0);
  assert.equal(s().lookId, null);
});

check('accelerate and cross lake shore to shore', () => {
  // Accelerating toward the lake, crossing both shores, hovering and remounting in deep water.
  game.resetHome();
  const n = normalAt(-29, 28);
  ride(n, 0, { position: surface(n) });
  parts.drive.reset();
  game.press('w');
  let wet = 0;
  for (let i = 0; i < 200; i++) {
    game.step(0.016);
    if (lakeRadius(s().normal) < 0.7) {
      wet++;
      assert.ok(
        Math.abs(parts.expansion.bike.position.distanceTo(CENTER) - (RADIUS - 1.24)) < 0.06,
        'Speeder remains above water',
      );
      assert.ok(!s().swimming);
    }
  }
  game.releaseKeys();
  assert.ok(wet > 40, 'Cross lake interior');
  assert.ok(chart(s().normal).z < -47, 'Reach opposite shore');
  assert.ok(lakeRadius(s().normal) > 1);
});

check('dismount into lake, remount and water wake', () => {
  const n = normalAt(-29, -15);
  game.place({ normal: n, heading: s().heading.clone().projectOnPlane(n).normalize() });
  game.step(0.016);
  assert.ok(parts.lakeWater.uniforms.wake.value > 0);
  game.bikeAction();
  game.step(0.016);
  assert.ok(s().swimming);
  assert.equal(game.getContext().type, 'bike');
  game.bikeAction();
  assert.ok(s().riding);
  assert.ok(!s().swimming);
});

check('hold brake stops speeder', () => {
  hud('brake').pointerdown(touch(12, 750, 330));
  steps(40);
  assert.equal(s().speed, 0);
  hud('brake').pointerup(touch(12, 750, 330));
  assert.ok(!s().brakeHeld);
});

check('steering, free look and delayed camera recenter', () => {
  // Manual camera orientation does not determine the vehicle course.
  game.resetHome();
  ride(normalAt(73, 32), 20, { lastLookTime: s().time });
  game.turnView(0.5);
  const lookAngle = s().forward.angleTo(s().heading);
  game.press('w');
  game.step(0.016);
  assert.ok(Math.abs(s().forward.angleTo(s().heading) - lookAngle) < 0.001);
  game.place({ lastLookTime: -100 });
  game.step(0.016);
  assert.ok(s().forward.angleTo(s().heading) < lookAngle);
  game.press('d');
  const before = s().heading.clone();
  game.step(0.1);
  assert.ok(before.angleTo(s().heading) > 0.05);
  game.releaseKeys();
});

check('speeder collision at full speed', () => {
  // High speed movement cannot pass through a tree trunk.
  const trunk = parts.collisions.objects.find((c) => c.height > 4 && c.radius < 3);
  const tangent = new T.Vector3(1, 0, 0).projectOnPlane(trunk.n).normalize();
  const n = trunk.n
    .clone()
    .addScaledVector(tangent, (trunk.radius + 6) / RADIUS)
    .normalize();
  const f = trunk.n.clone().addScaledVector(n, -trunk.n.dot(n)).normalize();
  game.place({ normal: n, forward: f, heading: f, speed: 48, position: surface(n) });
  game.press('w');
  for (let i = 0; i < 12; i++) {
    game.step(0.045);
    assert.ok(s().normal.distanceTo(trunk.n) * RADIUS > trunk.radius + 1.25);
  }
  game.releaseKeys();
});

check('sun interior halo and spherical cage visibility', () => {
  const { camera, innerSun, sunCage, sunInteriorUniforms, updateSunEffects } = parts;
  camera.position.copy(CENTER).add(new T.Vector3(0, -8, 0));
  updateSunEffects(1);
  assert.ok(innerSun.visible && sunCage.visible && sunInteriorUniforms.strength.value > 0.99);
  camera.position.set(0, 4, 0);
  updateSunEffects(1);
  assert.ok(!innerSun.visible && !sunCage.visible);
});

check('accelerator hold, multiple fingers, brake priority and pointer cancellation', () => {
  game.resetHome();
  const n = normalAt(73, 32);
  ride(n, 0, { position: surface(n) });
  hud('accelerate').pointerdown(touch(30, 750, 250));
  assert.ok(s().accelerateHeld);
  steps(40);
  assert.ok(s().speed > 18 && s().speed < 21);
  assert.ok(!hud('accelerate').hidden && !hud('brake').hidden && hud('jump').hidden);
  hud('accelerate').pointerdown(touch(31, 750, 250));
  hud('accelerate').pointerup(touch(30, 750, 250));
  assert.ok(s().accelerateHeld, 'Second finger still holds pedal');
  hud('brake').pointerdown(touch(32, 750, 330));
  steps(30);
  assert.equal(s().speed, 0, 'Brake wins over accelerator');
  hud('brake').pointercancel(touch(32, 750, 330));
  game.step(0.016);
  assert.ok(s().speed > 0);
  hud('accelerate').lostpointercapture(touch(31, 750, 250));
  assert.ok(!s().accelerateHeld);
  steps(30);
  assert.equal(s().speed, 0);
});

check('tilt driving, automatic camera, recenter and rotate phone', () => {
  const { tilt } = parts;
  tilt.state = 'waiting';
  tilt.read({ beta: 55, gamma: 0 });
  tilt.read({ beta: 55, gamma: 0 });
  game.updateHud();
  assert.ok(tilt.enabled && hud('stick').hidden && !hud('recenter').hidden);
  tilt.read({ beta: 55, gamma: 30 });
  hud('accelerate').pointerdown(touch(34, 750, 250));
  const headingStart = s().heading.clone();
  steps(35);
  assert.ok(s().speed > 15, 'Accelerator works in tilt mode');
  assert.ok(headingStart.angleTo(s().heading) > 0.2, 'Sensor changes course');
  assert.ok(s().forward.angleTo(s().heading) < 0.6, 'Camera follows turn');
  canvas.pointerdown(touch(35, 550, 200));
  canvas.pointerup(touch(35, 550, 200));
  assert.equal(s().lookId, null, 'Camera pointer released in tilt mode');
  hud('recenter').click();
  assert.ok(!s().accelerateHeld);
  tilt.read({ beta: 55, gamma: 30 });
  assert.equal(tilt.update(0.016), 0, 'Recenter while holding a comfortable pose');
  hud('accelerate').pointerdown(touch(36, 750, 250));
  game.orientationChanged();
  assert.ok(!s().accelerateHeld);
  assert.equal(s().speed, 0, 'Screen rotation releases throttle');
  tilt.stop();
  game.updateHud();
  assert.ok(!hud('stick').hidden);
});

check('dismount clears pedals and restores walking controls', () => {
  hud('accelerate').pointerdown(touch(37, 750, 250));
  game.bikeAction();
  assert.ok(!s().riding && !s().accelerateHeld);
  game.step(0.016);
  assert.ok(hud('accelerate').hidden && hud('brake').hidden && !hud('jump').hidden);
});

check('cow and sheep mount, gallop, tilt, jump, land and remain after dismount', () => {
  // Both kinds are actual moving mounts, including when their grazing update runs.
  const { expansion, tilt, animalGround } = parts;
  for (const kind of ['cow', 'sheep']) {
    game.resetHome();
    const a = expansion.animals.find((a) => a.kind === kind);
    a.n = normalAt(73, 32);
    a.root.position.copy(surface(a.n));
    a.root.quaternion.copy(orientation(a.n));
    game.place({ normal: a.n, position: surface(a.n) });
    game.contextAction();
    assert.equal(s().mountedAnimal, a);
    assert.ok(a.ridden && s().riding);
    game.updateHud();
    assert.ok(!hud('jump').hidden);
    const initial = a.n.clone();
    game.press('w');
    game.jump();
    let highest = 0;
    for (let i = 0; i < 160; i++) {
      game.step(0.016);
      expansion.updateAnimals(i * 0.016, 0.016, s().position);
      highest = Math.max(highest, s().jumpHeight);
      assert.ok(a.n.distanceTo(s().normal) < 1e-10);
      assert.ok(
        a.root.position.distanceTo(surface(s().normal, animalGround(s().normal) + s().jumpHeight)) <
          1e-8,
      );
    }
    game.releaseKeys();
    assert.ok(highest > 2.7 && s().jumpHeight === 0);
    assert.ok(initial.distanceTo(s().normal) * RADIUS > 15);
    tilt.state = 'waiting';
    tilt.read({ beta: 55, gamma: 0 });
    tilt.read({ beta: 55, gamma: 0 });
    tilt.read({ beta: 55, gamma: 25 });
    hud('accelerate').pointerdown(touch(65, 750, 250));
    const oldHeading = s().heading.clone();
    steps(20);
    assert.ok(oldHeading.angleTo(s().heading) > 0.05);
    tilt.stop();
    const parked = a.n.clone();
    game.bikeAction();
    assert.ok(!s().riding && !s().mountedAnimal && !a.ridden);
    expansion.updateAnimals(80, 0.016, s().position);
    assert.ok(a.n.distanceTo(parked) < 1e-9, 'Released animal stays where ridden');
  }
});

check('mounted animals bolt on their own, slow only while braking, and gallop', () => {
  const { expansion } = parts;
  for (const kind of ['cow', 'sheep']) {
    game.resetHome();
    const a = expansion.animals.find((a) => a.kind === kind);
    a.n = normalAt(73, 32);
    a.root.position.copy(surface(a.n));
    a.root.quaternion.copy(orientation(a.n));
    game.place({ normal: a.n, position: surface(a.n) });
    game.contextAction();
    assert.equal(s().mountedAnimal, a);
    assert.ok(s().speed > 10, 'The animal bolts at once');
    game.updateHud();
    assert.ok(hud('accelerate').hidden && !hud('brake').hidden, 'No accelerator on an animal');
    const start = s().normal.clone();
    let bounced = false;
    steps(90);
    for (let i = 0; i < 30; i++) {
      game.step(0.016);
      bounced ||= a.figure.position.y > 0.05;
    }
    assert.ok(s().speed > 48, `${kind} outruns the speeder without any input`);
    assert.ok(start.distanceTo(s().normal) * RADIUS > 60, 'It really moves');
    assert.ok(bounced, 'The gallop bounces the figure');
    assert.ok(
      s().rush > 0.9 && Number(hud('speed').style.opacity) > 0.9,
      'Speed streaks at full rush',
    );
    hud('brake').pointerdown(touch(70, 750, 330));
    steps(90);
    assert.ok(s().speed < 0.5, 'Holding the brake calms it down');
    assert.equal(Number(hud('speed').style.opacity), 0);
    hud('brake').pointerup(touch(70, 750, 330));
    steps(30);
    assert.ok(s().speed > 15, 'It bolts again once the brake is released');
    game.bikeAction();
    assert.ok(!s().riding);
    assert.equal(hud('speed').style.opacity, '0', 'Streaks vanish after dismount');
    // Back to the meadow, so the next animal does not run into this one.
    a.freeRoam = false;
    expansion.updateAnimals(80, 0.016, s().position);
    assert.ok(a.figure.position.y < 0.05, 'No gallop bounce once released');
  }
});

check('walk across the elevated bridge without swimming', () => {
  // New lake water, exposed island, and dry bridge use the same terrain functions.
  game.resetHome();
  const bridge = parts.landscape.bridgeSamples.find((n) => bigLakeRadius(n) < 0.6);
  assert.ok(bridge);
  game.place({
    normal: bridge,
    position: surface(bridge, roadOffset(bridge)),
    forward: new T.Vector3().crossVectors(ROAD_AXIS, bridge).normalize(),
  });
  game.press('w');
  for (let i = 0; i < 70; i++) {
    game.step(0.016);
    assert.ok(!s().swimming);
    assert.ok(s().position.distanceTo(CENTER) < RADIUS - 2);
  }
  game.releaseKeys();
});

check('raised island with six collidable trees', () => {
  game.place({ normal: parts.landscape.island });
  game.clearInput();
  game.step(0.016);
  assert.ok(!s().swimming);
  assert.ok(s().position.distanceTo(CENTER) < RADIUS - 1);
  assert.ok(islandDistance(s().normal) < 1);
  assert.ok(parts.collisions.objects.filter((c) => islandDistance(c.n) < 17).length >= 6);
});

check('swim and use speeder on the large lake', () => {
  const { landscape, expansion, hoverBase } = parts;
  game.place({ normal: landscape.island.clone().addScaledVector(ROAD_AXIS, -0.13).normalize() });
  game.clearInput();
  game.step(0.016);
  assert.ok(bigLakeRadius(s().normal) < 1 && s().swimming, 'Swim in new lake');
  const n = s().normal;
  expansion.bike.position.copy(surface(n, 1 + hoverBase(n)));
  game.place({ position: surface(n, lakeDepth(n) - 1) });
  game.bikeAction();
  game.step(0.016);
  assert.ok(s().riding && !s().swimming);
  assert.ok(Math.abs(expansion.bike.position.distanceTo(CENTER) - (RADIUS - 1.24)) < 0.1);
  game.bikeAction();
  game.step(0.016);
  assert.ok(s().swimming);
});

check('one player mode at a time, with coherent transitions', () => {
  // The mirrors riding/swimming/mountedAnimal/climb always agree with the single mode.
  const agree = () => {
    const { mode, riding, swimming, mountedAnimal, climb } = s();
    assert.equal(riding, mode === 'riding');
    assert.equal(swimming, mode === 'swimming');
    assert.ok(!mountedAnimal || mode === 'riding');
    assert.equal(!!climb, mode === 'lift');
    return mode;
  };
  game.resetHome();
  assert.equal(agree(), 'walking');
  const bike = parts.expansion.bike.position.clone().sub(CENTER).normalize();
  game.place({ normal: bike, position: surface(bike) });
  game.bikeAction();
  assert.equal(agree(), 'riding');
  game.liftAction();
  assert.equal(agree(), 'riding', 'The lift is refused while riding');
  game.jump();
  assert.equal(s().jumpVelocity, 0, 'No jump on the speeder');
  game.bikeAction();
  assert.equal(agree(), 'walking');
  const lake = normalAt(-29, -15);
  game.place({ normal: lake, position: surface(lake) });
  game.step(0.016);
  assert.equal(agree(), 'swimming');
  game.jump();
  assert.equal(s().jumpVelocity, 0, 'No jump while swimming');
  game.resetHome();
  const tower = normalAt(8, -49);
  game.place({ normal: tower, position: surface(tower) });
  game.liftAction();
  assert.equal(agree(), 'lift');
  assert.ok(s().climb.onPlatform);
  game.bikeAction();
  assert.equal(agree(), 'lift', 'The speeder is refused on the lift');
  game.jump();
  steps(30);
  assert.equal(agree(), 'lift', 'Jumping on the platform keeps the lift mode');
  game.resetHome();
  assert.equal(agree(), 'walking');
  assert.equal(s().jumpHeight, 0);
});

check(
  'moving hemispherical cover, opposite day/night, water lighting and full three-minute cycle',
  () => {
    const { dayNight, scene, distantWater } = parts;
    const homeN = normalAt(29, -4),
      homePosition = surface(homeN);
    dayNight.update(0, homePosition);
    assert.ok(daylightAt(homeN, dayNight.direction.value) > 0.99);
    const lit = scene.fog.color.clone();
    dayNight.update(90, homePosition);
    assert.ok(daylightAt(homeN, dayNight.direction.value) < 0.01);
    assert.ok(daylightAt(homeN.clone().negate(), dayNight.direction.value) > 0.99);
    assert.ok(scene.fog.color.r < lit.r * 0.2);
    const capDirection = new T.Vector3(0, 1, 0).applyQuaternion(dayNight.cap.quaternion);
    assert.ok(capDirection.distanceTo(dayNight.direction.value) < 1e-9);
    assert.ok(distantWater.uniforms.shadeDirection.value.distanceTo(capDirection) < 1e-9);
    dayNight.update(180, homePosition);
    assert.ok(daylightAt(homeN, dayNight.direction.value) > 0.99);
    for (const material of dayNight.patched) {
      const shader = {
        uniforms: {},
        vertexShader: T.ShaderLib.standard.vertexShader,
        fragmentShader: T.ShaderLib.standard.fragmentShader,
      };
      material.onBeforeCompile(shader);
      assert.ok(shader.vertexShader.includes('solarWorldPosition=(modelMatrix*solarPosition).xyz'));
      assert.ok(shader.fragmentShader.includes('reflectedLight.directDiffuse*=1.-shade*.975'));
      assert.equal(shader.uniforms.shadeDirection, dayNight.direction);
    }
  },
);

check('sun control box: approach, first-person view, buttons and return', () => {
  const { sunPanel, sun, dayNight, camera, player, panelStand, panelFocus } = parts;
  game.resetHome();
  const n = panelStand.clone().sub(CENTER).normalize();
  game.place({ normal: n, position: surface(n) });
  game.step(0.016);
  assert.equal(game.getContext().type, 'panel');
  assert.equal(game.getContext().text, 'Interagir');
  game.contextAction();
  assert.equal(s().mode, 'panel');
  assert.equal(game.getContext().text, 'Retour');
  game.updateHud();
  assert.ok(hud('stick').hidden && hud('jump').hidden && !hud('action').hidden);
  assert.ok(!player.visible, 'First person: Marceau is hidden');
  steps(60);
  const toPanel = panelFocus.clone().sub(camera.position);
  assert.ok(toPanel.length() > 1.5 && toPanel.length() < 4.2, 'Camera close to the panel');
  const view = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  assert.ok(view.dot(toPanel.normalize()) > 0.99, 'Camera looks at the panel');
  const here = s().position.clone();
  game.press('w');
  steps(10);
  game.releaseKeys();
  game.jump();
  assert.ok(s().position.distanceTo(here) < 1e-9 && s().jumpVelocity === 0, 'Nothing moves');
  // Colour: a tap on the button, as on a phone, cycles the sun colour.
  const before = sun.colourIndex;
  const p = sunPanel.buttons.color.getWorldPosition(new T.Vector3()).project(camera);
  const x = ((p.x + 1) / 2) * innerWidth,
    y = ((1 - p.y) / 2) * innerHeight;
  canvas.pointerdown(touch(80, x, y));
  canvas.pointerup(touch(80, x, y));
  assert.equal(sun.colourIndex, before + 1, 'Tap on the colour button');
  assert.equal(sun.solarMat.color.getHexString(), sun.colour.sun.slice(1));
  assert.equal(sunPanel.buttons.color.material.emissive.getHexString(), sun.colour.halo.slice(1));
  // Speed: the lamps follow the level and level 0 stops the cover.
  while (dayNight.level !== 0) game.pressPanel('speed');
  assert.ok(sunPanel.lamps.every((lamp) => lamp.material.emissiveIntensity === 0));
  const home = s().position;
  dayNight.update(1000, home);
  const frozen = dayNight.direction.value.clone();
  dayNight.update(1010, home);
  assert.ok(dayNight.direction.value.distanceTo(frozen) < 1e-9, 'Stopped cover');
  game.pressPanel('speed');
  game.pressPanel('speed');
  assert.equal(dayNight.speed, 1);
  assert.equal(sunPanel.lamps.filter((lamp) => lamp.material.emissiveIntensity > 0).length, 2);
  dayNight.update(1020, home);
  assert.ok(dayNight.direction.value.distanceTo(frozen) > 0.1, 'Cover turns again');
  // Disco: the perforated shell replaces the cover and the shaders know about it.
  game.pressPanel('disco');
  assert.ok(dayNight.discoOn && sunPanel.buttons.disco.material.emissiveIntensity > 0);
  dayNight.update(1021, home);
  dayNight.update(1024, home);
  assert.ok(dayNight.disco.value > 0.95 && dayNight.shell.visible && !dayNight.cap.visible);
  assert.equal(parts.lakeWater.uniforms.disco.value, dayNight.disco.value);
  const shader = {
    uniforms: {},
    vertexShader: T.ShaderLib.standard.vertexShader,
    fragmentShader: T.ShaderLib.standard.fragmentShader,
  };
  [...dayNight.patched][0].onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('vec3 discoLight(vec3 d,float t)'));
  assert.equal(shader.uniforms.disco, dayNight.disco);
  game.pressPanel('disco');
  dayNight.update(1025, home);
  dayNight.update(1028, home);
  assert.ok(dayNight.disco.value === 0 && !dayNight.shell.visible && dayNight.cap.visible);
  game.contextAction();
  assert.equal(s().mode, 'walking');
  assert.ok(player.visible);
  sun.setColour(0);
});

check('three tree silhouettes, clear flower fields and composed wind/night shaders', () => {
  const { forest, fields, collisions, dayNight } = parts;
  assert.ok(
    forest.groups.every((g) => g.length > 0),
    'All three tree silhouettes',
  );
  assert.equal(fields.locations.length, 2100);
  for (const n of fields.locations) {
    assert.ok(roadDistance(n) >= 7);
    assert.ok(lakeRadius(n) >= 1.08);
    assert.ok(
      collisions.nearby(n).every((c) => c.n.distanceTo(n) * RADIUS > c.radius),
      'Flower clearings remain open',
    );
  }
  for (const material of dayNight.patched) {
    if (!material.userData.wind) continue;
    const shader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('uniform float windTime'));
    assert.ok(shader.vertexShader.includes('solarWorldPosition=(modelMatrix*solarPosition).xyz'));
    assert.ok(shader.uniforms.windTime);
  }
});

check('local daytime butterflies and night light uniforms', () => {
  const { expansion, fields, nightDetails } = parts;
  const meadow = expansion.meadowNormal(0, 0);
  fields.update(1, surface(meadow), meadow.clone().negate());
  assert.ok(fields.wings.visible);
  for (const batch of [fields.wings, fields.bodies])
    assert.ok(batch.instanceMatrix.array.every(Number.isFinite));
  fields.update(2, surface(meadow), meadow);
  assert.ok(!fields.wings.visible, 'Butterflies rest at night');
  nightDetails.update(1, surface(meadow), meadow);
  assert.ok(nightDetails.flies.uniforms.shadeDirection.value.distanceTo(meadow) < 1e-9);
  assert.equal(nightDetails.fireflies.length, 150);
  assert.ok(nightDetails.lampPositions.length > 6);
});

// The trail effects are driven with a synthetic player state, independent of the game.
const effectState = {
  normal: normalAt(0, 25),
  position: surfacePoint(0, 25),
  forward: new T.Vector3(0, 0, -1),
  riding: true,
  animal: { kind: 'cow' },
  jumpHeight: 0,
  climb: null,
  mode: 'walk',
};
let effectTime = 0;
const effectStep = (dt) => {
  effectTime += dt;
  return parts.trailEffects.update(
    effectTime,
    dt,
    effectState,
    parts.dayNight.direction.value,
    parts.lakeWater.uniforms.mist.value,
  );
};

check('hoof dust, landing clouds, speeder grass and water-entry splashes', () => {
  const { trailEffects, expansion } = parts;
  const state = effectState;
  trailEffects.reset();
  effectStep(0.016);
  const dustBefore = trailEffects.stats.dust;
  for (let i = 0; i < 15; i++) {
    state.normal = advanceFrame(state.normal, state.forward, 0, 1, 0.2).normal;
    state.position = surface(state.normal);
    effectStep(0.016);
  }
  assert.ok(trailEffects.stats.dust > dustBefore, 'Hoof dust');
  state.jumpHeight = 2;
  effectStep(0.016);
  const landBefore = trailEffects.stats.landings;
  state.jumpHeight = 0;
  effectStep(0.016);
  assert.equal(trailEffects.stats.landings, landBefore + 1);
  const meadow = expansion.meadowNormal(0, 0);
  state.normal = meadow.clone();
  state.position = surface(state.normal);
  state.animal = null;
  trailEffects.reset();
  effectStep(0.016);
  const grassBefore = trailEffects.stats.grass;
  for (let i = 0; i < 15; i++) {
    state.normal = advanceFrame(
      state.normal,
      state.forward.clone().projectOnPlane(state.normal).normalize(),
      0,
      1,
      0.2,
    ).normal;
    state.position = surface(state.normal);
    effectStep(0.016);
  }
  assert.ok(trailEffects.stats.grass > grassBefore, 'Speeder stirs grass');
  state.riding = false;
  state.normal = normalAt(-29, 20);
  state.position = surface(state.normal);
  trailEffects.reset();
  effectStep(0.016);
  const entryBefore = trailEffects.stats.waterEntries;
  state.normal = normalAt(-29, 10);
  state.position = surface(state.normal);
  effectStep(0.016);
  assert.equal(trailEffects.stats.waterEntries, entryBefore + 1);
  assert.ok(trailEffects.stats.splash >= 22);
});

check('shadows follow the player, fade with the night and bow to the frame-rate guard', () => {
  const { shadows, updateWorld } = parts;
  const { light } = shadows;
  game.resetHome();
  assert.ok(shadows.enabled && light.castShadow && renderer.shadowMap.enabled);
  // Find a moment of full daylight at home (the cover keeps turning at normal speed).
  let t = 2000;
  updateWorld(t, 0.016);
  while (light.shadow.intensity < 0.99 && t < 2200) updateWorld((t += 1), 0.016);
  assert.ok(light.shadow.intensity > 0.99, 'Full shadows in daylight at home');
  const up = s().normal.clone().negate();
  const box = light.target.position.clone().sub(s().position);
  assert.ok(box.length() < 20 && Math.abs(box.dot(up)) < 0.6, 'Shadow box centred just ahead');
  const above = light.position.clone().sub(light.target.position);
  assert.ok(Math.abs(above.length() - 70) < 1e-6 && above.normalize().dot(up) > 0.999, 'Overhead');
  assert.equal(light.color.getHexString(), parts.sun.colour.light.slice(1));
  // Standing still, the box does not move: it is snapped to the texel grid.
  const before = light.target.position.clone();
  updateWorld(t + 0.016, 0.016);
  assert.ok(light.target.position.distanceTo(before) < 1e-9);
  // Night side, half a cycle later: shadows fade out. Back to day a full cycle later.
  updateWorld(t + 90, 0.016);
  assert.ok(light.shadow.intensity < 0.01, 'No shadows at night');
  updateWorld(t + 180, 0.016);
  assert.ok(light.shadow.intensity > 0.99);
  // Disco: no shadows either.
  game.pressPanel('disco');
  updateWorld(t + 183, 0.016);
  updateWorld(t + 186, 0.016);
  assert.ok(light.shadow.intensity < 0.01, 'No shadows under the disco');
  game.pressPanel('disco');
  updateWorld(t + 190, 0.016);
  updateWorld(t + 194, 0.016);
  assert.ok(light.shadow.intensity > 0.99);
  // A slow device: 20 fps during the measuring window switches the shadows off.
  shadows.resetGuard();
  t += 200;
  for (let i = 0; i < 200 && shadows.enabled; i++) updateWorld((t += 0.05), 0.016, 0.05);
  assert.ok(shadows.guard.settled && shadows.guard.fps < 30);
  assert.ok(!shadows.enabled && !light.castShadow && !renderer.shadowMap.enabled);
});

check('hills, flat village and tunnel, mountain with a spring and a stream to the lake', () => {
  assert.equal(relief(normalAt(28, 12)), 0, 'Village stays flat');
  assert.equal(relief(normalAt(0, 118)), 0, 'Tunnel stays flat');
  let hilly = 0;
  for (let i = 0; i < 40; i++)
    hilly += Math.abs(relief(normalAt(260 * Math.cos(i), 260 * Math.sin(i))));
  assert.ok(hilly / 40 > 2, 'Rolling hills away from the village');
  assert.ok(relief(MOUNTAIN) > 25, 'A real mountain');
  assert.ok(mountainDistance(parts.mountain.pool.position.clone().sub(CENTER).normalize()) < 0.5);
  let previous = Infinity;
  for (let i = 0; i <= 10; i++) {
    const h = relief(streamPoint(i / 10));
    assert.ok(h < previous + 0.5, 'The stream only runs downhill');
    previous = h;
  }
  assert.ok(bigLakeRadius(streamPoint(1)) < 1, 'The stream reaches the lake');
  assert.ok(lakeDepth(bigLakeNormal(0, 0)) >= 9.9, 'A deep, wide lake');
  // The shoreline wanders: bays and headlands, never a plain ellipse.
  const reach = [];
  for (let i = 0; i < 72; i++) {
    const p = lakeShorePoint((i / 36) * Math.PI);
    reach.push(Math.hypot(p.x, p.z));
    const n = bigLakeNormal(p.x, p.z);
    assert.ok(Math.abs(bigLakeRadius(n) - 1) < 0.01, 'Shore points sit on the shore');
    assert.ok(n.dot(BIG_LAKE) > 0.62, 'The whole shore stays inside the lake chart');
  }
  assert.ok(Math.max(...reach) / Math.min(...reach) > 1.5, 'An irregular shoreline');
  // Cliffs on two stretches of shore: rock rising steeply from the water, gentle elsewhere.
  for (const cliff of CLIFFS) {
    const foot = bigLakeNormal(...Object.values(lakeShorePoint(cliff.angle, 0.98))),
      top = bigLakeNormal(...Object.values(lakeShorePoint(cliff.angle, 1.06)));
    assert.ok(relief(top) - relief(foot) > 8, 'A cliff face above the water');
    assert.ok(lakeDepth(foot) > 0, 'Water at the cliff foot');
  }
  for (const n of parts.landscape.bridgeSamples)
    assert.equal(cliffHeight(n), 0, 'No cliff on the causeway');
  // The suspension span: the deck climbs well clear of the water in the middle of the lake.
  const middle = parts.landscape.bridgeSamples.reduce((best, n) =>
    Math.abs(bigLakeChart(n).z) < Math.abs(bigLakeChart(best).z) ? n : best,
  );
  const clearance = lakeDepth(middle) + bridgeHeight(middle) - (lakeDepth(middle) - 0.24);
  assert.ok(clearance > 14, `Room under the span (${clearance.toFixed(1)})`);
  assert.ok(spanRise(middle) > 7.5 && spanRise(parts.boat.mooring) === 0, 'The rise is local');
  const { towers, tops, cable } = parts.landscape.suspension;
  assert.equal(towers.length, 4, 'Two towers, two legs each');
  // Golden Gate order: deck above the water, cable never below the deck, towers far above.
  const above = (p) => RADIUS - p.distanceTo(CENTER);
  const deckMiddle = above(surface(middle, lakeDepth(middle) + bridgeHeight(middle)));
  for (const top of tops) assert.ok(above(top) > deckMiddle + 15, 'Towers rise above the deck');
  for (const { point, deck } of cable)
    assert.ok(above(point) > above(deck) + 0.5, 'The cable stays above the deck');
  assert.ok(
    Math.max(...cable.map((c) => above(c.point))) > deckMiddle + 18,
    'The cable climbs to the towers',
  );
  for (const n of parts.landscape.bridgeSamples)
    if (Math.abs(bigLakeChart(n).z) < SPAN.half)
      assert.ok(!parts.landscape.piers.includes(n), 'No pier under the span');
  // Schools of fish swim in both lakes, stay in the water and flee a swimmer.
  const { fish } = parts;
  assert.ok(fish.count > 80 && fish.schools.length === SCHOOLS.length);
  for (let i = 0; i < 1200; i++) fish.update(i * 0.05, 0.05);
  for (const school of fish.schools) {
    const n = school.lake.normal(school.x, school.z);
    assert.ok(lakeDepth(n) > 0.8, `School stays in deep water (${school.spec.lake})`);
  }
  const school = fish.schools[0],
    before = { x: school.x, z: school.z };
  const swimmer = school.lake.normal(school.x + 3, school.z);
  for (let i = 0; i < 40; i++) fish.update(60 + i * 0.05, 0.05, swimmer);
  assert.ok(school.x < before.x - 2, 'The school darts away from the swimmer');
  const m = new T.Matrix4();
  fish.meshes.big.mesh.getMatrixAt(0, m);
  const p = new T.Vector3().setFromMatrixPosition(m);
  const under = RADIUS - 0.24 - p.distanceTo(CENTER);
  assert.ok(under > 0.25 && under < 1.6, `Fish swim just under the surface (${under.toFixed(2)})`);
  fish.update(61, 0.016, null, () => 1);
  assert.ok(fish.meshes.big.glow.value > 1.2, 'Fish glow at night');
  fish.update(61, 0.016, null, () => 0);
  assert.ok(fish.meshes.big.glow.value < 0.1, 'Fish do not glow by day');
  assert.equal(cliffHeight(parts.boat.mooring), 0, 'No cliff at the mooring');
  assert.equal(cliffHeight(streamPoint(1)), 0, 'No cliff at the stream mouth');
  const arches = parts.landscape.bridgeSamples.length;
  assert.ok(arches > 100, `A long causeway (${arches} samples)`);
  assert.ok(parts.clouds.count > 80);
  parts.clouds.update(0);
  const q0 = parts.clouds.group.quaternion.clone();
  parts.clouds.update(100);
  assert.ok(q0.angleTo(parts.clouds.group.quaternion) > 0.3, 'Clouds drift');
  assert.equal(parts.post.enabled, false, 'No post pass without WebGL2 (fake renderer)');
});

check('rowing boat: board from the shore, row, stay on the water, pass under the causeway', () => {
  const { boat } = parts;
  game.resetHome();
  const shore = boat.mooring.clone();
  game.place({ normal: shore, position: surface(shore, lakeDepth(shore) + 0.24) });
  game.step(0.016);
  assert.ok(!s().swimming, 'Wading at the mooring');
  assert.equal(game.getContext().type, 'boat');
  assert.equal(game.getContext().text, 'Ramer');
  game.contextAction();
  assert.equal(s().mode, 'riding');
  assert.equal(s().vehicle, 'boat');
  assert.equal(game.getContext().text, 'Descendre');
  game.updateHud();
  assert.ok(!hud('accelerate').hidden && hud('jump').hidden);
  // Row towards the middle of the lake.
  const centre = bigLakeNormal(0, 0);
  game.place({ forward: centre.clone().sub(shore).projectOnPlane(shore).normalize() });
  game.place({ heading: s().forward });
  hud('accelerate').pointerdown(touch(90, 750, 250));
  const start = s().normal.clone();
  steps(300);
  assert.ok(s().speed > 10 && s().speed <= 14, 'Rowing speed');
  assert.ok(start.distanceTo(s().normal) * RADIUS > 30, 'The boat moves');
  assert.ok(
    Math.abs(s().position.distanceTo(CENTER) - (RADIUS - 0.24 - 0.55)) < 0.2,
    'Seated at water level',
  );
  assert.ok(Math.abs(boat.root.position.distanceTo(CENTER) - (RADIUS - 0.24)) < 0.1);
  // Turn back towards the shore: the boat stops in shallow water instead of climbing out.
  game.place({ forward: shore.clone().sub(s().normal).projectOnPlane(s().normal).normalize() });
  game.place({ heading: s().forward });
  steps(600);
  assert.ok(lakeDepth(s().normal) > 0.3 && bigLakeRadius(s().normal) < 1, 'Never leaves the water');
  // Cross under the causeway: from one side of the road line to the other, staying on the water.
  const road = bigLakeChart(parts.landscape.bridgeSamples.find((n) => bigLakeRadius(n) < 0.3));
  const from = bigLakeNormal(road.x - 20, road.z),
    across = bigLakeNormal(road.x + 20, road.z);
  game.place({ normal: from, position: surface(from, lakeDepth(from) + 0.79) });
  game.place({ forward: across.clone().sub(from).projectOnPlane(from).normalize() });
  game.place({ heading: s().forward, speed: 12 });
  for (let i = 0; i < 260; i++) {
    game.step(0.016);
    assert.ok(
      s().position.distanceTo(CENTER) > RADIUS - 2,
      'Stays at water level under the bridge',
    );
  }
  assert.ok(bigLakeChart(s().normal).x > road.x + 8, 'Passed under the causeway');
  hud('accelerate').pointerup(touch(90, 750, 250));
  game.boatAction();
  game.step(0.016);
  assert.equal(s().mode, 'swimming', 'Leaving the boat mid-lake means swimming');
  game.resetHome();
  assert.ok(
    boat.root.position.distanceTo(surface(boat.mooring, lakeDepth(boat.mooring) + 0.24)) < 1e-6,
  );
});

check('nearby falling leaves and bounded particle pool expires cleanly', () => {
  const { trailEffects, forest } = parts;
  const state = effectState;
  const goldTree = forest.groups[2][0];
  state.normal = goldTree.n.clone();
  state.position = surface(state.normal);
  trailEffects.reset();
  const leavesBefore = trailEffects.stats.leaves;
  for (let i = 0; i < 15; i++) effectStep(0.05);
  assert.ok(trailEffects.stats.leaves > leavesBefore, 'Leaves fall near leafy trees');
  trailEffects.emit(state.normal, state.position, 0, 700);
  state.climb = {};
  let alive = 0;
  for (let i = 0; i < 170; i++) {
    alive = effectStep(0.05);
    assert.ok(alive <= 320);
    for (const attr of Object.values(trailEffects.points.geometry.attributes))
      assert.ok(attr.array.every(Number.isFinite));
  }
  assert.equal(alive, 0);
  assert.equal(trailEffects.particles.length, 320);
});

for (const { name, run } of checks) {
  try {
    run();
    results.push(name);
  } catch (e) {
    console.log(results);
    console.error(`Échec : ${name}\n${e.message}`);
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode) console.log(results);
