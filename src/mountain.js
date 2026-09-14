import * as T from './vendor/three.module.min.js';
import {
  MOUNTAIN,
  MOUNTAIN_RADIUS,
  STREAM_LENGTH,
  streamPoint,
  surface,
  orientation,
  mountainDistance,
} from './navigation.js';
// The spring at the mountain top and the stream that runs down to the lake. The stream bed
// itself is carved into the terrain (navigation.js); here we add the water: a still pool in
// the summit basin and a flowing ribbon that follows the carved channel.
export function buildMountain({ world, builders, collisions, rand }) {
  const { mat, mesh, ball } = builders;
  const uniforms = { time: { value: 0 } };
  // Summit pool: a small disc of water sitting in the basin.
  const pool = mesh(
    new T.CircleGeometry(3.6, 24),
    new T.MeshStandardMaterial({
      color: '#7fd0d6',
      emissive: '#2a6f7a',
      emissiveIntensity: 0.35,
      roughness: 0.25,
      transparent: true,
      opacity: 0.9,
    }),
    world,
  );
  pool.position.copy(surface(MOUNTAIN, -0.75));
  pool.quaternion
    .copy(orientation(MOUNTAIN))
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2));
  pool.castShadow = false;
  // Stones ring the spring and dot the slopes.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.3,
      r = 4.4 + rand() * 0.8;
    const n = MOUNTAIN.clone()
      .applyAxisAngle(
        new T.Vector3(1, 0, 0).projectOnPlane(MOUNTAIN).normalize(),
        (Math.cos(a) * r) / 260,
      )
      .applyAxisAngle(
        MOUNTAIN.clone()
          .cross(new T.Vector3(1, 0, 0).projectOnPlane(MOUNTAIN).normalize())
          .normalize(),
        (Math.sin(a) * r) / 260,
      )
      .normalize();
    const stone = ball(
      world,
      0,
      0,
      0,
      0.6 + rand() * 0.5,
      ['#8f9686', '#a3a48f', '#7c857a'][i % 3],
    );
    stone.position.copy(surface(n, 0.2));
    stone.quaternion.copy(orientation(n));
    stone.scale.y = 0.6;
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2,
      d = 8 + rand() * (MOUNTAIN_RADIUS - 12);
    const axisA = new T.Vector3(1, 0, 0).projectOnPlane(MOUNTAIN).normalize(),
      axisB = MOUNTAIN.clone().cross(axisA).normalize();
    const n = MOUNTAIN.clone()
      .applyAxisAngle(axisA, (Math.cos(a) * d) / 260)
      .applyAxisAngle(axisB, (Math.sin(a) * d) / 260)
      .normalize();
    const s = 1.2 + rand() * 2.4;
    const rock = ball(world, 0, 0, 0, s, ['#8b9184', '#9a9c8a', '#767f74'][i % 3]);
    rock.position.copy(surface(n, s * 0.15));
    rock.quaternion
      .copy(orientation(n))
      .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rand() * 6));
    rock.scale.set(1, 0.7 + rand() * 0.3, 0.8 + rand() * 0.5);
    collisions.add(n, s * 0.9, s);
  }
  // The stream: a ribbon of quads along the channel, water flowing towards the lake.
  const segments = 48,
    width = 2.1,
    positions = [],
    uvs = [],
    indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      n = streamPoint(t),
      ahead = streamPoint(Math.min(1, t + 0.02)),
      dir = ahead.clone().sub(n).projectOnPlane(n).normalize(),
      side = n.clone().cross(dir).normalize();
    for (const sign of [-1, 1]) {
      const edge = n
        .clone()
        .addScaledVector(side, (sign * width) / 2 / 260)
        .normalize();
      // The ribbon dips under the lake surface at the mouth instead of floating on it.
      positions.push(...surface(edge, 0.22 - 0.7 * T.MathUtils.smoothstep(t, 0.86, 1)).toArray());
      uvs.push(sign > 0 ? 1 : 0, t * (STREAM_LENGTH / 6));
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const stream = new T.Mesh(
    geometry,
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform float time;varying vec2 vUv;
void main(){float edge=1.-smoothstep(.3,.5,abs(vUv.x-.5));float flow=.5+.5*sin(vUv.y*9.-time*4.+sin(vUv.x*6.28+time)*.6);
float foam=smoothstep(.32,.5,abs(vUv.x-.5))*(.5+.5*sin(vUv.y*22.-time*7.));
vec3 colour=mix(vec3(.36,.72,.76),vec3(.62,.9,.92),flow*.6)+foam*.35;
gl_FragColor=vec4(colour,edge*.9);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
    }),
  );
  stream.castShadow = stream.receiveShadow = false;
  world.add(stream);
  function update(t) {
    uniforms.time.value = t;
  }
  return { pool, stream, uniforms, update, spring: MOUNTAIN, distance: mountainDistance };
}
