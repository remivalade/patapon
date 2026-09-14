import * as T from './vendor/three.module.min.js';
import {
  RADIUS,
  CENTER,
  normalAt,
  chart,
  bigLakeNormal,
  bigLakeChart,
  bigLakeRadius,
  smallLakeRadius,
  lakeDepth,
  islandDistance,
  ISLAND_CHART,
} from './navigation.js';
// Schools of small fish wandering under the surface of both lakes. Every fish is one
// instance of a single low-poly mesh; a school is a point that swims around its lake,
// steering back when it nears the shore or the island and darting away from the player.
// The school's fish orbit that point slowly and wiggle as they go.
function fishGeometry() {
  const v = {
    nose: [0, 0, 0.5],
    top: [0, 0.16, 0.05],
    bottom: [0, -0.14, 0.05],
    left: [-0.1, 0, 0.05],
    right: [0.1, 0, 0.05],
    tail: [0, 0, -0.32],
    finTop: [0, 0.17, -0.56],
    finBottom: [0, -0.17, -0.56],
  };
  const faces = [
    ['nose', 'top', 'left'],
    ['nose', 'left', 'bottom'],
    ['nose', 'bottom', 'right'],
    ['nose', 'right', 'top'],
    ['tail', 'left', 'top'],
    ['tail', 'bottom', 'left'],
    ['tail', 'right', 'bottom'],
    ['tail', 'top', 'right'],
    ['tail', 'finTop', 'finBottom'],
    ['tail', 'finBottom', 'finTop'],
  ];
  const positions = [];
  for (const face of faces) for (const name of face) positions.push(...v[name]);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
// Where each school lives: which lake, its chart, and how far out it may roam.
const LAKES = {
  big: {
    normal: (x, z) => bigLakeNormal(x, z),
    chart: (n) => bigLakeChart(n),
    radius: (n) => bigLakeRadius(n),
    home: { x: -60, z: 30 },
    limit: 0.9,
  },
  small: {
    normal: (x, z) => normalAt(x, z),
    chart: (n) => chart(n),
    radius: (n) => smallLakeRadius(n),
    home: { x: -29, z: -15 },
    limit: 0.72,
  },
};
export const SCHOOLS = [
  { lake: 'big', x: -95, z: 70, colour: '#f2a23a', size: 22, length: 1 },
  { lake: 'big', x: 70, z: -80, colour: '#bcd4e6', size: 26, length: 0.8 },
  { lake: 'big', x: -30, z: -60, colour: '#f6d35a', size: 18, length: 1.15 },
  { lake: 'big', x: 120, z: 40, colour: '#f2a23a', size: 20, length: 0.9 },
  { lake: 'small', x: -33, z: -8, colour: '#f2a23a', size: 14, length: 0.7 },
];
export function buildFish({ world, rand }) {
  const schools = SCHOOLS.map((spec, index) => {
    const lake = LAKES[spec.lake];
    const fish = [];
    for (let i = 0; i < spec.size; i++)
      fish.push({
        radius: 0.6 + rand() * 2.6,
        angle: rand() * Math.PI * 2,
        spin: 0.25 + rand() * 0.3,
        depth: 0.5 + rand() * 1,
        phase: rand() * Math.PI * 2,
        scale: spec.length * (0.8 + rand() * 0.4),
      });
    return {
      lake,
      spec,
      x: spec.x,
      z: spec.z,
      heading: rand() * Math.PI * 2,
      wander: rand() * 100,
      speed: 2.2 + index * 0.25,
      fright: 0,
      first: 0,
      fish,
    };
  });
  // One instanced mesh per lake, so each lake's fish can glow with its own night. The
  // instance colour gives every fish its tint; at night the same colour becomes light.
  const meshes = {};
  for (const key of Object.keys(LAKES)) {
    const members = schools.filter((s) => s.lake === LAKES[key]);
    const count = members.reduce((sum, s) => sum + s.fish.length, 0);
    const glow = { value: 0 };
    const material = new T.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.15,
      flatShading: true,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.glow = glow;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', 'uniform float glow;\n#include <common>')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * glow;',
        );
    };
    const mesh = new T.InstancedMesh(fishGeometry(), material, count);
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    let index = 0;
    const colour = new T.Color();
    for (const school of members) {
      school.mesh = mesh;
      school.first = index;
      colour.set(school.spec.colour);
      for (let i = 0; i < school.fish.length; i++) mesh.setColorAt(index++, colour);
    }
    world.add(mesh);
    meshes[key] = { mesh, glow, centre: LAKES[key].normal(LAKES[key].home.x, LAKES[key].home.z) };
  }
  const total = schools.reduce((sum, s) => sum + s.fish.length, 0);
  const dummy = new T.Object3D(),
    up = new T.Vector3(),
    forward = new T.Vector3(),
    right = new T.Vector3(),
    q = new T.Quaternion(),
    yaw = new T.Quaternion();
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // The school point moves in its lake chart; steering keeps it in open water.
  function steer(school, t, dt, player) {
    const { lake } = school;
    let target = school.heading + Math.sin(t * 0.35 + school.wander) * 0.9;
    let turn = 1.2,
      speed = school.speed;
    const here = lake.normal(school.x, school.z);
    if (lake.radius(here) > lake.limit) {
      target = Math.atan2(lake.home.z - school.z, lake.home.x - school.x);
      turn = 2.5;
    } else if (lake === LAKES.big && islandDistance(here) < 26) {
      const c = bigLakeChart(here);
      target = Math.atan2(c.z - ISLAND_CHART.z, c.x - ISLAND_CHART.x);
      turn = 2.5;
    }
    if (player) {
      const p = lake.chart(player),
        dx = school.x - p.x,
        dz = school.z - p.z,
        d = Math.hypot(dx, dz);
      if (d < 9) {
        target = Math.atan2(dz, dx);
        turn = 4;
        school.fright = 1.5;
      }
    }
    if (school.fright > 0) {
      school.fright -= dt;
      speed *= 2.6;
    }
    school.heading += T.MathUtils.clamp(wrap(target - school.heading), -turn * dt, turn * dt);
    school.x += Math.cos(school.heading) * speed * dt;
    school.z += Math.sin(school.heading) * speed * dt;
  }
  // `night(n)` gives the darkness (0 day, 1 night) at a point; fish light up in the dark.
  function update(t, dt, player = null, night = null) {
    for (const lake of Object.values(meshes)) {
      const dark = night ? night(lake.centre) : 0;
      lake.glow.value = 0.05 + 1.5 * dark;
    }
    for (const school of schools) {
      steer(school, t, dt, player);
      const { lake } = school;
      const centre = lake.normal(school.x, school.z);
      up.copy(centre).negate();
      // Chart axes at the school: forward follows the heading, right lies across it.
      const ahead = lake.normal(
        school.x + Math.cos(school.heading) * 2,
        school.z + Math.sin(school.heading) * 2,
      );
      forward.copy(ahead).sub(centre).projectOnPlane(centre).normalize();
      right.copy(forward).cross(up).normalize();
      q.setFromUnitVectors(new T.Vector3(0, 1, 0), up);
      school.fish.forEach((f, i) => {
        const a = f.angle + t * f.spin,
          ox = Math.cos(a) * f.radius,
          oz = Math.sin(a) * f.radius * 0.6,
          wiggle = Math.sin(t * 7 + f.phase) * 0.28;
        const n = centre
          .clone()
          .addScaledVector(forward, oz / RADIUS)
          .addScaledVector(right, ox / RADIUS)
          .normalize();
        const bed = lakeDepth(n);
        const depth = Math.min(f.depth, Math.max(0.3, bed - 0.4));
        dummy.position
          .copy(n)
          .multiplyScalar(RADIUS - 0.24 - depth)
          .add(CENTER);
        // Face along the school's heading in the surface plane, then wiggle.
        const facing = new T.Matrix4().lookAt(new T.Vector3(), forward.clone().negate(), up);
        dummy.quaternion.setFromRotationMatrix(facing);
        yaw.setFromAxisAngle(up, wiggle + Math.sin(a) * 0.15);
        dummy.quaternion.premultiply(yaw);
        dummy.scale.setScalar(f.scale);
        dummy.updateMatrix();
        school.mesh.setMatrixAt(school.first + i, dummy.matrix);
      });
    }
    for (const lake of Object.values(meshes)) lake.mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { meshes, schools, count: total, update };
}
