import * as T from './vendor/three.module.min.js';
import { createAmbience } from './audio.js';
import { SpeederHandling, WalkHandling, radialInput, MOUNTS } from './handling.js';
import { TiltSteering } from './tilt.js';
import { buildDayNight, COVER_SPEEDS } from './landscape.js';
import { PANEL_STAND, PANEL_FOCUS } from './sunpanel.js';
import { buildFields, addWind, windTime } from './vegetation.js';
import { buildTrailEffects, buildNightDetails } from './effects.js';
import { createRandom, createBuilders } from './builders.js';
import { buildExterior } from './exterior.js';
import { buildHabitat } from './habitat.js';
import { buildMarceau } from './marceau.js';
import { createShadows } from './shadows.js';
import { createPost } from './post.js';
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
  bigLakeRadius,
  bigLakeChart,
  bridgeHeight,
  roadOffset,
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
  $('world').appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color('#0b1323');
  const camera = new T.PerspectiveCamera(59, innerWidth / innerHeight, 0.12, 7000);
  const world = new T.Group(),
    outside = new T.Group();
  scene.add(world, outside);
  world.visible = false;
  // The world is built in a fixed order: the shared random sequence depends on it.
  const rand = createRandom(4309);
  const builders = createBuilders();
  const { mat, mesh, beam } = builders;
  buildExterior({ outside, mat, mesh, ball: builders.ball, rand });
  const habitat = buildHabitat({ world, builders, rand, collisions, camera });
  const {
    trees,
    forest,
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
    sunPanel,
    lights,
    mountain,
    clouds,
    boat,
  } = habitat;
  const { solarMat, halo, innerSun, sunCage, sunInteriorUniforms } = sun;
  // Real shadows: one directional light following Marceau; its colour follows the sun.
  const shadows = createShadows({ renderer, world, colour: sun.colour.light });
  lights.shadowLight = shadows.light;
  // One full-screen pass: tone mapping, grade and vignette.
  const post = createPost({ renderer, mobile: shadows.mobile });
  function updateSunEffects(t) {
    sun.update(t, dayNight.direction.value, dayNight.disco.value);
  }
  const { player, robe, legs, arms, playerShadow } = buildMarceau({ world, builders, rand });
  let navNormal = normalAt(0, 71),
    forward = new T.Vector3(0, 0, -1).projectOnPlane(navNormal).normalize();
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
  // The sun control box: where the player stands, what the camera looks at, what the
  // buttons do. Opening it is a player mode; the buttons talk to the sun and the cover.
  const panelStand = towerWorld(PANEL_STAND),
    panelFocus = towerWorld(PANEL_FOCUS),
    panelStandNormal = panelStand.clone().sub(CENTER).normalize();
  function nearPanel() {
    return player.position.distanceTo(panelStand) < 4.5;
  }
  function openPanel() {
    navNormal = panelStandNormal.clone();
    forward.copy(panelFocus).sub(panelStand).projectOnPlane(navNormal).normalize();
    setMode({ type: 'panel' });
    player.position.copy(surface(navNormal));
    pitch = 0.12;
  }
  function closePanel() {
    setMode({ type: 'walking' });
  }
  function pressPanel(kind) {
    if (kind === 'color') {
      sun.nextColour();
      sunPanel.setColor(sun.colour.halo);
    } else if (kind === 'speed') {
      dayNight.setSpeedLevel((dayNight.level + 1) % COVER_SPEEDS.length);
      sunPanel.setSpeedLevel(dayNight.level);
    } else if (kind === 'disco') {
      dayNight.setDisco(!dayNight.discoOn);
      sunPanel.setDisco(dayNight.discoOn);
    }
  }
  sunPanel.setColor(sun.colour.halo);
  sunPanel.setSpeedLevel(dayNight.level);
  // The player is in exactly one mode. Every change goes through setMode, the single
  // place that performs the cleanup the previous mode needs and the setup the next one
  // needs. Jumping is not a mode: its height and velocity live alongside the mode and are
  // allowed while walking or riding an animal.
  //   { type: 'walking' } | { type: 'swimming' }
  //   { type: 'riding', animal, vehicle }   animal, or vehicle 'speeder' | 'boat'
  //   { type: 'lift', climb }      climb: local tower coordinates and onPlatform
  //   { type: 'panel' }            standing at the sun control box, first-person view
  let playerMode = { type: 'walking' };
  // Read-only mirrors of playerMode for the rest of this module, refreshed by setMode only.
  let riding = false,
    swimming = false,
    mountedAnimal = null,
    mountedVehicle = null,
    climb = null;
  let jumpHeight = 0,
    jumpVelocity = 0;
  function setMode(next) {
    const previous = playerMode;
    if (previous.type === 'riding' && next.type !== 'riding') {
      if (previous.animal) releaseAnimal(previous.animal);
      if (tilt.state === 'waiting') tilt.stop();
      clearInput();
      jumpHeight = jumpVelocity = 0;
    }
    if (next.type === 'riding' && previous.type !== 'riding') {
      clearInput();
      jumpHeight = jumpVelocity = 0;
      if (next.animal) next.animal.ridden = next.animal.freeRoam = true;
    }
    if (next.type === 'lift') {
      jumpHeight = jumpVelocity = 0;
      forward.projectOnPlane(towerUp).normalize();
    }
    if (previous.type === 'panel' && next.type !== 'panel') player.visible = true;
    if (next.type === 'panel') {
      clearInput();
      jumpHeight = jumpVelocity = 0;
      player.visible = false;
      playerShadow.visible = false;
    }
    playerMode = next;
    riding = next.type === 'riding';
    swimming = next.type === 'swimming';
    mountedAnimal = riding ? next.animal : null;
    mountedVehicle = riding && !next.animal ? (next.vehicle ?? 'speeder') : null;
    climb = next.type === 'lift' ? next.climb : null;
    if (!riding) setRush(0);
  }
  // The handling numbers of whatever the player is riding.
  function mountProfile() {
    if (mountedAnimal) return MOUNTS[mountedAnimal.kind];
    return mountedVehicle === 'boat' ? MOUNTS.boat : MOUNTS.speeder;
  }
  function vehicleObject(kind) {
    return kind === 'boat' ? boat.root : expansion.bike;
  }
  function rideRatio() {
    return Math.abs(drive.speed) / mountProfile().maxSpeed;
  }
  // rush: how hard a mounted animal is bolting (0 to 1); drives the streaks, the wider
  // view and the dust. mountBob: the gallop bounce shared by the animal and its rider.
  let rush = 0,
    mountBob = 0,
    shownRush = -1;
  function setRush(value) {
    const shown = Math.round(value * 20) / 20;
    if (shown === shownRush) return;
    shownRush = shown;
    $('speed').style.opacity = String(shown);
  }
  player.position.copy(surface(navNormal));
  player.visible = false;
  let phase = 'intro',
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
    post.resize();
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
    phase = 'walk';
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
    phase = 'reveal';
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
    setMode({ type: 'walking' });
    if (tilt.state === 'waiting') tilt.stop();
    if (phase === 'reveal') beginWalk();
    clearInput();
    const parked = normalAt(64, 10);
    expansion.bike.position.copy(surface(parked, 1));
    expansion.bike.quaternion.copy(orientation(parked));
    boat.root.position.copy(surface(boat.mooring, lakeDepth(boat.mooring) + 0.24));
    boat.root.quaternion.copy(orientation(boat.mooring));
    jumpHeight = jumpVelocity = 0;
    navNormal = normalAt(28, 12);
    forward.set(0, 0, -1).projectOnPlane(navNormal).normalize();
    player.position.copy(surface(navNormal));
    pitch = 0.12;
    updateCamera(1);
  }
  function jump() {
    if (phase === 'reveal') beginWalk();
    if (
      phase !== 'walk' ||
      (riding && !mountedAnimal) ||
      swimming ||
      playerMode.type === 'panel' ||
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
      setMode({ type: 'lift', climb: { x: 0, z: 0, y: 0, onPlatform: true } });
      player.position.copy(towerWorld(climb));
    }
    if (climb && Math.hypot(climb.x, climb.z) < 5.7) {
      climb.onPlatform = true;
      lift.target = lift.height < TOWER_HEIGHT / 2 ? TOWER_HEIGHT : 0;
    } else lift.target = climb ? TOWER_HEIGHT : 0;
  }
  function bikeAction() {
    vehicleAction('speeder');
  }
  function boatAction() {
    vehicleAction('boat');
  }
  // Mount or leave the speeder or the boat. Leaving the boat drops the player into the water
  // where it is (swimming, or wading near the shore); leaving the speeder looks for a free
  // spot around it.
  function vehicleAction(kind) {
    if (climb) return;
    if (riding && mountedVehicle === 'boat') {
      setMode({ type: 'walking' });
      player.position.copy(surface(navNormal, lakeDepth(navNormal) + 0.24));
      return;
    }
    if (riding) {
      const right = forward.clone().cross(activeUp()).normalize();
      for (let i = 0; i < 8; i++) {
        const offset = right.clone().applyAxisAngle(activeUp(), (i * Math.PI) / 4);
        const n = navNormal.clone().multiplyScalar(RADIUS).addScaledVector(offset, 4).normalize();
        const resolved = collisions.resolve(n, 0.65, 0);
        if (!surfaceBlocked(resolved, 0.6) && towerAllows(resolved)) {
          navNormal = resolved;
          forward.projectOnPlane(navNormal).normalize();
          setMode({ type: 'walking' });
          player.position.copy(surface(navNormal));
          return;
        }
      }
      return;
    }
    const vehicle = vehicleObject(kind);
    if (player.position.distanceTo(vehicle.position) > 8) return;
    navNormal = vehicle.position.clone().sub(CENTER).normalize();
    forward.set(0, 0, 1).applyQuaternion(vehicle.quaternion).projectOnPlane(navNormal).normalize();
    setMode({ type: 'riding', animal: null, vehicle: kind });
    bikeHeading.copy(forward);
  }
  // A released animal stays where it was ridden, facing the last heading.
  function releaseAnimal(a) {
    a.ridden = false;
    a.freeRoam = true;
    const local = bikeHeading.clone().applyQuaternion(orientation(a.n).invert());
    a.angle = Math.atan2(local.x, local.z);
  }
  function mountAnimal(a) {
    if (riding || climb || player.position.distanceTo(a.root.position) > 8) return;
    navNormal = a.n.clone();
    forward.set(0, 0, 1).applyQuaternion(a.root.quaternion).projectOnPlane(navNormal).normalize();
    setMode({ type: 'riding', animal: a });
    bikeHeading.copy(forward);
    // The animal bolts at once: a burst of speed and a warning for the rider.
    drive.speed = MOUNTS[a.kind].maxSpeed * 0.35;
    driveNotice(
      a.kind === 'cow'
        ? 'Meuh ! La vache n’est pas contente. Accroche-toi, freine pour la calmer !'
        : 'Bêêê ! Le mouton s’emballe. Accroche-toi, freine pour le calmer !',
    );
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
    if (phase === 'reveal') beginWalk();
    if (phase !== 'walk') return;
    const choice = getContext();
    if (choice?.type === 'bike') bikeAction();
    else if (choice?.type === 'boat') boatAction();
    else if (choice?.type === 'lift' || choice?.type === 'call') liftAction();
    else if (choice?.type === 'panel') playerMode.type === 'panel' ? closePanel() : openPanel();
    else if (choice?.animal) mountAnimal(choice.animal);
  }
  function getContext() {
    if (playerMode.type === 'panel') return { type: 'panel', text: 'Retour' };
    if (riding) return { type: mountedVehicle === 'boat' ? 'boat' : 'bike', text: 'Descendre' };
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
    if (nearPanel()) return { type: 'panel', text: 'Interagir' };
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
    if (player.position.distanceTo(boat.root.position) < 8) return { type: 'boat', text: 'Ramer' };
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
    $('accelerate').hidden = !riding || !!mountedAnimal;
    $('brake').hidden = $('tilt').hidden = !riding;
    $('recenter').hidden = !riding || !tilt.enabled;
    const atPanel = playerMode.type === 'panel';
    $('stick').hidden = (riding && tilt.enabled) || atPanel;
    $('lookhint').hidden = (riding && tilt.enabled) || atPanel;
    $('drive-notice').hidden = !riding || !$('drive-notice').textContent;
    $('jump').hidden =
      (riding && !mountedAnimal) || swimming || atPanel || !!(climb && expansion.lift.moving);
  }
  function interactAt(x, y) {
    pointer.set((x / innerWidth) * 2 - 1, (-y / innerHeight) * 2 + 1);
    world.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    if (playerMode.type === 'panel') {
      const button = raycaster
        .intersectObjects(sunPanel.targets, false)
        .find((h) => h.distance < 8);
      if (button) pressPanel(button.object.userData.panel);
      return;
    }
    const targets = [
      ...expansion.animals.map((a) => a.root),
      expansion.bike,
      boat.root,
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
    else if (kind === 'boat') boatAction();
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
    if (phase !== 'intro') return;
    ambience.start();
    phase = 'approach';
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
    if (joy.id !== null || (riding && tilt.enabled) || playerMode.type === 'panel') return;
    if (phase === 'reveal') beginWalk();
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
    if (phase === 'reveal') beginWalk();
    if (phase !== 'walk') return;
    if (
      playerMode.type !== 'panel' &&
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
    if (e.pointerId !== lookId || (riding && tilt.enabled) || playerMode.type === 'panel') return;
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
    if (phase === 'reveal') beginWalk();
    if (!e.repeat && e.key === ' ' && (!riding || mountedAnimal)) jump();
    if (!e.repeat && e.key.toLowerCase() === 'e') contextAction();
    if (!e.repeat && playerMode.type === 'panel') {
      if (e.key === 'Escape') closePanel();
      const button = ['color', 'speed', 'disco'][Number(e.key) - 1];
      if (button) pressPanel(button);
    }
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
    if (playerMode.type === 'panel') {
      // Face the panel from close by; step back just enough for it to fit on a narrow screen.
      const back = panelStand.clone().sub(panelFocus).projectOnPlane(up).normalize();
      const halfWidth = Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      const distance = T.MathUtils.clamp(0.95 / halfWidth, 1.9, 3.6);
      desired.copy(panelFocus).addScaledVector(back, distance).addScaledVector(up, 0.45);
      camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
      camera.lookAt(panelFocus);
      camera.fov = T.MathUtils.lerp(camera.fov, 59, Math.min(1, dt * 3));
      camera.updateProjectionMatrix();
      return;
    }
    const eye = player.position.clone().addScaledVector(up, swimming ? 2.5 : 2.4);
    const view = forward
      .clone()
      .multiplyScalar(Math.cos(pitch))
      .addScaledVector(up, Math.sin(pitch))
      .normalize();
    const offset = Math.max(
      1.1,
      (riding ? 10 + rideRatio() * 3 : 9) * (1 - Math.max(0, pitch) / 1.65),
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
      riding ? 59 + rideRatio() * (mountedAnimal ? 14 : 6) : 59,
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
    if (mountedVehicle === 'boat') return lakeDepth(n) > 0.35 && !surfaceBlocked(n, radius);
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
    if (playerMode.type === 'panel') {
      expansion.updateLift(dt);
      updateCamera(dt);
      updateHud();
      return;
    }
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
    const profile = mountProfile();
    rush = mountBob = 0;
    if (riding) {
      const byTilt = tilt.enabled;
      side = byTilt ? tilt.update(dt) : T.MathUtils.clamp(side, -1, 1);
      // A charging animal runs on its own; the accelerator only matters on the speeder.
      ahead = profile.charge
        ? 1
        : accelerateHeld
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
          setMode({ type: 'walking' });
        }
      }
      if (climb) player.position.copy(towerWorld(climb)).addScaledVector(towerUp, jumpHeight);
    }
    if (!climb) {
      if (riding) {
        const braking =
          brakeHeld ||
          (keys.has(' ') && !mountedAnimal) ||
          (profile.charge && (keys.has('s') || keys.has('arrowdown')));
        const handling = drive.update(ahead, side, braking, dt, profile);
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
        moving = Math.abs(drive.speed) / profile.maxSpeed;
        if (mountedAnimal) {
          rush = T.MathUtils.clamp((moving - 0.3) / 0.5, 0, 1);
          mountBob = Math.max(0, Math.sin(walk)) * 0.24 * moving;
        }
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
      const deep = !riding && depth > 1.2 && bridgeHeight(navNormal) < 0.1 && jumpHeight < 0.3;
      if (deep && playerMode.type === 'walking') setMode({ type: 'swimming' });
      else if (!deep && playerMode.type === 'swimming') setMode({ type: 'walking' });
      const waterHeight =
        roadOffset(navNormal) > 0
          ? roadOffset(navNormal)
          : depth > 0
            ? depth + 0.24 - Math.min(1.25, depth * 0.9)
            : 0;
      const ridingHeight = mountedAnimal
        ? (mountedAnimal.kind === 'cow' ? 1.6 : 0.95) + animalGround(navNormal) + mountBob
        : mountedVehicle === 'boat'
          ? depth + 0.24 + 0.55 + Math.sin(clock.elapsedTime * 1.7) * 0.06
          : 1.05 + (roadOffset(navNormal) > 0 ? roadOffset(navNormal) : hoverBase(navNormal));
      player.position.copy(surface(navNormal, (riding ? ridingHeight : waterHeight) + jumpHeight));
      if (!riding && depth === 0 && jumpHeight < 0.05) {
        const local = towerLocal(player.position);
        if (
          Math.abs(local.y) < 1 &&
          Math.hypot(local.x, local.z) < 5.8 &&
          expansion.lift.height < 0.1
        ) {
          setMode({ type: 'lift', climb: { x: local.x, z: local.z, y: 0, onPlatform: true } });
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
            new T.Euler(
              T.MathUtils.clamp(drive.acceleration / 600, -0.06, 0.05) +
                (mountedAnimal ? -Math.sin(walk + 0.7) * 0.1 * moving : 0),
              0,
              drive.bank,
            ),
          ),
        );
      if (swimming) q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.55));
      player.quaternion.slerp(q, Math.min(1, dt * 14));
      walk += dt * (swimming ? 5 : mountedAnimal ? 15 : 11) * moving;
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
        // Gallop: the figure bounces in the flight phase, rocks nose-down on landing and
        // leans into turns; the head stretches forward; front and rear pairs swing almost
        // together, the right side leading slightly.
        a.figure.position.y = mountBob;
        a.figure.rotation.set(-Math.sin(walk + 0.7) * 0.1 * moving, 0, drive.bank * 0.9);
        a.figure.scale.y = 1;
        a.head.rotation.x =
          jumpHeight > 0.1 ? -0.22 : -0.3 * moving + Math.sin(walk) * 0.1 * moving;
        a.head.rotation.y = Math.sin(walk * 0.5) * 0.06 * moving;
        a.legs.forEach((leg, i) => {
          const front = i === 1 || i === 3,
            lead = i >= 2 ? 0.35 : 0;
          leg.rotation.x =
            jumpHeight > 0.1
              ? front
                ? -0.7
                : 0.4
              : Math.sin(walk + (front ? 0 : Math.PI * 0.85) + lead) * 0.75 * moving;
        });
      } else if (mountedVehicle === 'boat') {
        boat.root.position.copy(
          surface(
            navNormal,
            lakeDepth(navNormal) + 0.24 + Math.sin(clock.elapsedTime * 1.7) * 0.06,
          ),
        );
        boat.root.quaternion.copy(player.quaternion);
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
    // The flat disc only stands in when real shadows are off.
    playerShadow.visible = !swimming && !riding && !shadows.enabled;
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
    setRush(rush);
    updateCamera(dt);
    updateHud();
  }
  function animate() {
    requestAnimationFrame(animate);
    const real = clock.getDelta(),
      dt = Math.min(real, 0.045),
      t = clock.elapsedTime;
    if (phase === 'intro') {
      camera.up.set(0, 1, 0);
      camera.position.set(520 + Math.sin(t * 0.07) * 40, 240, 1040);
      camera.lookAt(0, 30, 0);
    } else if (phase === 'approach') {
      const u = (t - startTime) / 4.5;
      if (u < 1) {
        const s = u * u * (3 - 2 * u);
        camera.position.set(520 * (1 - s), 240 * (1 - s) + 15 * s, 1040 * (1 - s) + 294 * s);
        camera.lookAt(0, 15, 276);
        $('fade').style.opacity = u > 0.85 ? String((u - 0.85) / 0.15) : '0';
      } else {
        phase = 'tunnel';
        startTime = t;
        interior();
        $('fade').style.opacity = '0';
      }
    } else if (phase === 'tunnel') {
      const u = Math.min(1, (t - startTime) / 6),
        s = u * u * (3 - 2 * u);
      const tunnelQ = orientation(normalAt(0, 118));
      camera.position.copy(
        new T.Vector3(0, 4, 35 - s * 73).applyQuaternion(tunnelQ).add(surfacePoint(0, 118)),
      );
      camera.up.copy(normalAt(0, 118).negate());
      camera.lookAt(surfacePoint(0, 45, 15));
      if (u >= 1) beginReveal(t);
    } else if (phase === 'reveal') {
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
    if (world.visible) updateWorld(t, dt, real);
    post.render(scene, camera);
  }
  // Everything that lives in the habitat advances here, after the player has moved.
  function updateWorld(t, dt, realDt = dt) {
    const daylight = dayNight.update(t, player.position);
    lights.hemisphere.position.copy(activeUp());
    clouds.update(t);
    mountain.update(t);
    boat.animate(t, mountedVehicle === 'boat' && Math.abs(drive.speed) > 0.5);
    shadows.update({
      position: player.position,
      up: activeUp(),
      forward,
      daylight,
      dt: realDt,
      active: phase === 'walk',
    });
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
        mode: phase,
        rush,
      },
      dayNight.direction.value,
      lakeWater.uniforms.mist.value,
    );
    updateSunEffects(t);
    animatePatapon(t, dt, player.position, activeUp(), phase === 'walk');
    expansion.updateAnimals(t, dt, player.position);
    lakeWater.uniforms.time.value = distantWater.uniforms.time.value = t;
    ambience.update(
      t,
      player.position.distanceTo(surfacePoint(-29, -15)),
      mountedVehicle === 'speeder' ? 0 : player.position.distanceTo(ship.position),
      player.position.distanceTo(CENTER),
      phase === 'walk' || phase === 'reveal',
    );
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
    if (options.riding !== undefined && options.riding !== riding)
      setMode(options.riding ? { type: 'riding', animal: null } : { type: 'walking' });
    if (options.speed !== undefined) drive.speed = options.speed;
    if (options.lastLookTime !== undefined) lastLookTime = options.lastLookTime;
  }
  function state() {
    return {
      phase,
      mode: playerMode.type,
      riding,
      swimming,
      mountedAnimal,
      vehicle: mountedVehicle,
      climb,
      jumpHeight,
      jumpVelocity,
      normal: navNormal,
      forward,
      heading: bikeHeading,
      position: player.position,
      speed: drive.speed,
      rush,
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
    boatAction,
    liftAction,
    greetAnimal,
    getContext,
    pressPanel,
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
      updateWorld,
      sun,
      sunPanel,
      shadows,
      lights,
      post,
      boat,
      clouds,
      mountain,
      panelStand,
      panelFocus,
      player,
      animalGround,
      hoverBase,
    },
  };
}
