import * as T from './vendor/three.module.min.js';
import {
  RADIUS,
  CENTER,
  ROAD_AXIS,
  normalAt,
  roadNormal,
  orientation,
  surface,
  lakeDepth,
  bigLakeRadius,
  bridgeHeight,
  ISLAND,
  bigLakeNormal,
} from './navigation.js';

export const DAY_DURATION = 180;
const homeNormal = normalAt(29, -4),
  cycleAxis = homeNormal
    .clone()
    .cross(new T.Vector3(0, 0, 1))
    .normalize();
export function shadeAt(t) {
  return homeNormal
    .clone()
    .negate()
    .applyAxisAngle(cycleAxis, (t * Math.PI * 2) / DAY_DURATION);
}
export function daylightAt(n, direction) {
  return 1 - T.MathUtils.smoothstep(n.dot(direction), -0.16, 0.16);
}

export function buildLandscape({ world, mesh, mat, ball, cyl, beam, collisions }) {
  const bridgeSamples = [],
    lamps = [],
    scenery = new T.Group();
  world.add(scenery);
  // Railings, crossbeams and piers follow the same spherical bridge as the road.
  for (let i = 0; i < 720; i++) {
    const n = roadNormal((i / 720) * Math.PI * 2),
      next = roadNormal(((i + 1) / 720) * Math.PI * 2),
      h = bridgeHeight(n);
    if (bigLakeRadius(n) > 1.04 || h < 0.3) continue;
    bridgeSamples.push(n);
    const q = orientation(n),
      base = surface(n, lakeDepth(n) + h);
    if (i % 3 === 0) {
      const pier = new T.Group();
      pier.position.copy(base);
      pier.quaternion.copy(q);
      scenery.add(pier);
      const length = lakeDepth(n) + h;
      for (const x of [-4.7, 4.7]) cyl(pier, x, -length / 2, 0, 0.44, 0.7, length, '#96a89e', 6);
      const cross = beam(pier, [-5.5, -0.35, 0], [5.5, -0.35, 0], 0.25, '#7c9489');
      cross.castShadow = false;
    }
    for (const sign of [-1, 1]) {
      const edge = n
        .clone()
        .multiplyScalar(Math.cos(5.65 / RADIUS))
        .addScaledVector(ROAD_AXIS, Math.sin((sign * 5.65) / RADIUS));
      const edgeNext = next
        .clone()
        .multiplyScalar(Math.cos(5.65 / RADIUS))
        .addScaledVector(ROAD_AXIS, Math.sin((sign * 5.65) / RADIUS));
      const p = surface(edge, lakeDepth(edge) + h + 1.35),
        p2 = surface(edgeNext, lakeDepth(edgeNext) + bridgeHeight(next) + 1.35);
      beam(scenery, p.toArray(), p2.toArray(), 0.1, '#dbc798');
      if (i % 3 === 0) {
        const post = new T.Group();
        post.position.copy(surface(edge, lakeDepth(edge) + h));
        post.quaternion.copy(orientation(edge));
        scenery.add(post);
        cyl(post, 0, 0.7, 0, 0.11, 0.14, 1.4, '#c6b18b', 5);
        if (i % 12 === 0) {
          ball(post, 0, 1.6, 0, 0.24, '#ffe6a6', 1).material = mat('#ffe6a6', '#c58b3c');
          lamps.push(surface(edge, lakeDepth(edge) + h + 1.6));
        }
      }
    }
  }
  // A handful of distinct low-poly trees on the raised island.
  const islandTrees = [
    [35, 8, 1.25],
    [28, 3, 0.95],
    [42, 5, 1.05],
    [33, 17, 0.8],
    [44, 15, 0.75],
    [28, 13, 0.7],
  ];
  for (const [x, z, s] of islandTrees) {
    const n = bigLakeNormal(x, z),
      tree = new T.Group();
    tree.position.copy(surface(n));
    tree.quaternion.copy(orientation(n));
    scenery.add(tree);
    cyl(tree, 0, 2.1 * s, 0, 0.32 * s, 0.6 * s, 4.2 * s, '#795c3d', 6);
    const crown = ball(tree, 0, 5.2 * s, 0, 3 * s, '#a8b965', 1);
    crown.scale.y = 1.2;
    collisions.add(n, 0.6 * s, 9 * s);
  }
  batchStatic(scenery);
  return { bridgeSamples, island: ISLAND, lamps };
}

export function buildDayNight({ world, mesh, mat, beam, scene, waters }) {
  const direction = { value: shadeAt(0) },
    center = { value: CENTER.clone() };
  const cap = new T.Group();
  cap.position.copy(CENTER);
  world.add(cap);
  const coverMaterial = new T.MeshBasicMaterial({
    color: '#293749',
    side: T.DoubleSide,
    fog: false,
  });
  mesh(new T.SphereGeometry(34, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), coverMaterial, cap);
  const rim = mesh(new T.TorusGeometry(34, 0.35, 6, 96), mat('#b99c63', '#493b24'), cap);
  rim.rotation.x = Math.PI / 2;
  for (let k = 0; k < 12; k++) {
    const phi = (k * Math.PI) / 6;
    for (let j = 0; j < 8; j++) {
      const a = ((j / 8) * Math.PI) / 2,
        b = (((j + 1) / 8) * Math.PI) / 2;
      beam(
        cap,
        [
          34.2 * Math.sin(a) * Math.cos(phi),
          34.2 * Math.cos(a),
          34.2 * Math.sin(a) * Math.sin(phi),
        ],
        [
          34.2 * Math.sin(b) * Math.cos(phi),
          34.2 * Math.cos(b),
          34.2 * Math.sin(b) * Math.sin(phi),
        ],
        0.09,
        '#677985',
      );
    }
  }
  batchStatic(cap);
  // Analytic occlusion casts a hemisphere of night without costly cube shadow maps.
  // Evaluate per fragment so the giant terrain and instanced forests share a moving terminator.
  const patched = new Set();
  world.traverse((object) => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material?.isMeshStandardMaterial || patched.has(material)) continue;
      patched.add(material);
      const previous = material.onBeforeCompile,
        inheritedKey = material.customProgramCacheKey();
      material.onBeforeCompile = function (shader) {
        previous.call(this, shader);
        shader.uniforms.shadeDirection = direction;
        shader.uniforms.solarCenter = center;
        shader.vertexShader = 'varying vec3 solarWorldPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `vec4 solarPosition=vec4(transformed,1.);
   #ifdef USE_INSTANCING
   solarPosition=instanceMatrix*solarPosition;
   #endif
   solarWorldPosition=(modelMatrix*solarPosition).xyz;
   #include <project_vertex>`,
        );
        shader.fragmentShader =
          'uniform vec3 shadeDirection;uniform vec3 solarCenter;varying vec3 solarWorldPosition;\n' +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <aomap_fragment>',
          `#include <aomap_fragment>
   vec3 radial=solarWorldPosition-solarCenter;
   float shade=smoothstep(-.16,.16,dot(normalize(radial),shadeDirection))*smoothstep(38.,55.,length(radial));
   reflectedLight.directDiffuse*=1.-shade*.975;
   reflectedLight.directSpecular*=1.-shade*.975;
   reflectedLight.indirectDiffuse*=mix(vec3(1.),vec3(.13,.22,.4),shade);
   reflectedLight.indirectSpecular*=1.-shade*.8;`,
        );
      };
      material.customProgramCacheKey = () => inheritedKey + '-patapon-moving-solar-cover-v1';
      material.needsUpdate = true;
    }
  });
  const dayFog = new T.Color('#ced8c8'),
    nightFog = new T.Color('#15283f'),
    dayBackground = new T.Color('#aabca0'),
    nightBackground = new T.Color('#15263c');
  function update(t, playerPosition) {
    direction.value.copy(shadeAt(t));
    cap.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.value);
    const n = playerPosition.clone().sub(CENTER).normalize(),
      light = playerPosition.distanceTo(CENTER) < 40 ? 1 : daylightAt(n, direction.value);
    if (scene.fog) scene.fog.color.copy(nightFog).lerp(dayFog, light);
    if (scene.background?.isColor)
      scene.background.copy(nightBackground).lerp(dayBackground, light);
    for (const water of waters) {
      water.uniforms.shadeDirection.value.copy(direction.value);
      water.uniforms.mist.value.copy(scene.fog?.color ?? dayFog);
    }
    return light;
  }
  return { cap, direction, update, patched };
}

// Batch this static scenery by material to keep the bridge and cover cheap on mobile.
function batchStatic(root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(),
    groups = new Map(),
    originals = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    originals.push(o);
    let group = groups.get(o.material);
    if (!group) {
      group = { positions: [], normals: [], uvs: [], indices: [] };
      groups.set(o.material, group);
    }
    const g = o.geometry,
      m = inverse.clone().multiply(o.matrixWorld),
      normalMatrix = new T.Matrix3().getNormalMatrix(m),
      v = new T.Vector3(),
      base = group.positions.length / 3;
    for (let i = 0; i < g.attributes.position.count; i++) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(m);
      group.positions.push(v.x, v.y, v.z);
      v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(normalMatrix).normalize();
      group.normals.push(v.x, v.y, v.z);
      group.uvs.push(g.attributes.uv?.getX(i) ?? 0, g.attributes.uv?.getY(i) ?? 0);
    }
    for (let i = 0; i < (g.index?.count ?? g.attributes.position.count); i++)
      group.indices.push(base + (g.index ? g.index.getX(i) : i));
  });
  for (const o of originals) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  for (const [material, data] of groups) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(data.uvs, 2));
    geometry.setIndex(data.indices);
    const object = new T.Mesh(geometry, material);
    object.receiveShadow = true;
    root.add(object);
  }
}
