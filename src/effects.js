import * as T from './vendor/three.module.min.js';
import {
  RADIUS,
  CENTER,
  normalAt,
  bigLakeNormal,
  orientation,
  surface,
  lakeDepth,
  bridgeHeight,
  roadOffset,
  roadDistance,
} from './navigation.js';

const PALETTE = ['#c6ad81', '#b7e9e9', '#87a753', '#dfb358'];
export function buildTrailEffects(world, trees, rand) {
  const capacity = 320,
    particles = Array.from({ length: capacity }, () => ({
      position: new T.Vector3(),
      velocity: new T.Vector3(),
      n: new T.Vector3(),
      life: 0,
      total: 1,
      kind: 0,
      size: 0,
      gravity: 0,
      floor: 0,
    }));
  const positions = new Float32Array(capacity * 3),
    colors = new Float32Array(capacity * 3),
    sizes = new Float32Array(capacity),
    alpha = new Float32Array(capacity),
    kinds = new Float32Array(capacity);
  const geometry = new T.BufferGeometry();
  for (const [name, array, itemSize] of [
    ['position', positions, 3],
    ['color', colors, 3],
    ['particleSize', sizes, 1],
    ['opacity', alpha, 1],
    ['kind', kinds, 1],
  ])
    geometry.setAttribute(
      name,
      new T.BufferAttribute(array, itemSize).setUsage(T.DynamicDrawUsage),
    );
  const uniforms = {
    shadeDirection: { value: new T.Vector3() },
    mist: { value: new T.Color('#ced8c8') },
  };
  const material = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    vertexShader: `attribute float particleSize;attribute float opacity;attribute float kind;uniform vec3 shadeDirection;varying vec3 tint;varying float fade;varying float type;varying float distanceToEye;
  void main(){vec4 p=modelViewMatrix*vec4(position,1.);float day=1.-smoothstep(-.16,.16,dot(normalize(position-vec3(0.,260.,0.)),shadeDirection));tint=color*mix(vec3(.16,.25,.42),vec3(1.),day);fade=opacity;type=kind;distanceToEye=length(p.xyz);gl_Position=projectionMatrix*p;gl_PointSize=clamp(particleSize*projectionMatrix[1][1]*320./max(1.,-p.z),1.,38.);}`,
    fragmentShader: `uniform vec3 mist;varying vec3 tint;varying float fade;varying float type;varying float distanceToEye;void main(){vec2 p=gl_PointCoord*2.-1.;float shape=1.-smoothstep(.25,1.,length(p));if(type>1.5){p=mat2(.8,-.6,.6,.8)*p;shape=(1.-smoothstep(.15,.42,abs(p.x)))*(1.-smoothstep(.5,1.,abs(p.y)));}float a=fade*shape;if(a<.005)discard;vec3 c=mix(tint,mist,1.-exp(-pow(distanceToEye*.00205,2.)));gl_FragColor=vec4(c,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  world.add(points);
  const palette = PALETTE.map((c) => new T.Color(c)),
    stats = { dust: 0, splash: 0, grass: 0, leaves: 0, landings: 0, waterEntries: 0 };
  let cursor = 0,
    lastNormal = null,
    lastJump = 0,
    lastWet = false,
    stride = 0,
    leafClock = 0;
  function emit(n, base, kind, count, forward = new T.Vector3(), strength = 1) {
    const up = n.clone().negate(),
      right = new T.Vector3(1, 0, 0).projectOnPlane(n).normalize(),
      front = n.clone().cross(right);
    for (let j = 0; j < count; j++) {
      const p = particles[cursor],
        index = cursor;
      cursor = (cursor + 1) % capacity;
      const angle = rand() * Math.PI * 2,
        r = rand() * (kind === 1 ? 0.5 : 0.85);
      p.position
        .copy(base)
        .addScaledVector(right, Math.cos(angle) * r)
        .addScaledVector(front, Math.sin(angle) * r)
        .addScaledVector(up, 0.08);
      p.n.copy(n);
      p.kind = kind;
      p.total = p.life =
        kind === 3 ? 4 + rand() * 2 : kind === 1 ? 0.55 + rand() * 0.4 : 0.65 + rand() * 0.5;
      p.size =
        (kind === 0 ? 0.45 : kind === 1 ? 0.2 : kind === 3 ? 0.3 : 0.22) * (0.7 + rand() * 0.6);
      p.gravity = kind === 3 ? 0.15 : kind === 0 ? 1.2 : 8;
      p.floor = base.distanceTo(CENTER) + 0.04;
      p.velocity
        .copy(right)
        .multiplyScalar(Math.cos(angle) * (kind === 1 ? 2.2 : 1) * strength)
        .addScaledVector(front, Math.sin(angle) * (kind === 1 ? 2.2 : 1) * strength)
        .addScaledVector(
          up,
          kind === 3 ? -0.2 : (kind === 1 ? 2.6 : 1.2) * (0.5 + rand()) * strength,
        )
        .addScaledVector(forward, kind === 2 ? -1.8 : -0.3);
      if (kind === 3) p.floor = surface(n).distanceTo(CENTER);
      colors.set(palette[kind].toArray(), index * 3);
      kinds[index] = kind;
      stats[['dust', 'splash', 'grass', 'leaves'][kind]]++;
    }
  }
  function reset() {
    lastNormal = null;
    lastJump = 0;
    lastWet = false;
    stride = 0;
  }
  function update(t, dt, state, shade, mist) {
    uniforms.shadeDirection.value.copy(shade);
    uniforms.mist.value.copy(mist);
    const {
      normal: n,
      position,
      forward,
      riding,
      animal,
      jumpHeight,
      climb,
      mode,
      rush = 0,
    } = state;
    const distance = lastNormal ? lastNormal.distanceTo(n) * RADIUS : 0,
      wet = lakeDepth(n) > 0.35 && bridgeHeight(n) < 0.1,
      active = mode === 'walk' && !climb;
    if (active && lastNormal && distance < 12) {
      const contact = wet ? surface(n, lakeDepth(n) + 0.24) : surface(n, roadOffset(n) + 0.08),
        landed = lastJump > 0.02 && jumpHeight === 0;
      if (landed) {
        emit(n, contact, wet ? 1 : 0, wet ? 22 : 15, forward, 1.1);
        stats.landings++;
      } else if (wet && !lastWet && jumpHeight < 0.4) {
        emit(n, contact, 1, 22, forward, 1.15);
        stats.waterEntries++;
      }
      if (jumpHeight < 0.05 && distance > 0.002) {
        stride += distance;
        const spacing = riding && !animal ? 1.4 : animal ? 1.1 : 1.6;
        let bursts = 0;
        while (stride > spacing && bursts++ < 3) {
          stride -= spacing;
          if (wet) emit(n, contact, 1, riding ? 5 : 3, forward, 0.5);
          else if (riding && !animal) {
            if (roadDistance(n) > 7) emit(n, contact, 2, 5, forward, 0.8);
            emit(n, contact, 0, 2, forward, 0.45);
          } else
            emit(
              n,
              contact,
              0,
              animal ? 3 + Math.round(2 * rush) : 2,
              forward,
              animal ? 0.75 + 0.7 * rush : 0.4,
            );
        }
      } else stride = 0;
    }
    if (!active || distance >= 12) reset();
    else {
      lastNormal = n.clone();
      lastJump = jumpHeight;
      lastWet = wet;
    }
    leafClock += dt;
    if (leafClock > 0.55) {
      leafClock = 0;
      const nearby = trees.filter(
        (tree) => tree.kind !== 1 && surface(tree.n).distanceTo(position) < 48,
      );
      if (nearby.length && active) {
        const tree = nearby[Math.floor(rand() * nearby.length)];
        emit(tree.n, surface(tree.n, 5.5 * tree.s), 3, 1);
      }
    }
    let alive = 0;
    particles.forEach((p, i) => {
      if (p.life <= 0) {
        alpha[i] = 0;
        sizes[i] = 0;
        return;
      }
      p.life -= dt;
      p.velocity.addScaledVector(p.n, p.gravity * dt);
      p.position.addScaledVector(p.velocity, dt);
      if (p.kind === 3)
        p.position.addScaledVector(
          new T.Vector3(0.2, 0.1, 0.3).projectOnPlane(p.n),
          Math.sin(t * 2 + i) * dt,
        );
      if (p.position.distanceTo(CENTER) > p.floor || p.life <= 0) {
        p.life = 0;
        alpha[i] = 0;
        sizes[i] = 0;
        return;
      }
      const age = 1 - p.life / p.total;
      alpha[i] = Math.min(1, age * 5) * (1 - age) * (p.kind === 0 ? 0.42 : 0.85);
      sizes[i] = p.size * (p.kind === 0 ? 1 + age * 2 : 1);
      positions.set(p.position.toArray(), i * 3);
      alive++;
    });
    points.visible = alive > 0;
    for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
    return alive;
  }
  return { points, particles, capacity, stats, emit, reset, update };
}

export function buildNightDetails({ world, bridgeLamps, rand }) {
  const fireflies = [];
  for (let i = 0; i < 150; i++) {
    const a = rand() * Math.PI * 2,
      n =
        i < 65
          ? normalAt(-29 + Math.cos(a) * (27 + rand() * 5), -15 + Math.sin(a) * (35 + rand() * 5))
          : i < 120
            ? bigLakeNormal(Math.cos(a) * (111 + rand() * 4), Math.sin(a) * (92 + rand() * 4))
            : bigLakeNormal(35 + Math.cos(a) * 14, 8 + Math.sin(a) * 14);
    fireflies.push(surface(n, 1 + rand() * 3));
  }
  const lanternNormals = [
      [19, 14],
      [40, 13],
      [18, -18],
      [58, 30],
      [10, 30],
      [7, -37],
    ].map(([x, z]) => normalAt(x, z)),
    lampPositions = bridgeLamps.map((p) => p.clone());
  const dummy = new T.Object3D(),
    posts = new T.InstancedMesh(
      new T.CylinderGeometry(0.1, 0.16, 1.65, 5),
      new T.MeshStandardMaterial({ color: '#72674c', roughness: 1 }),
      lanternNormals.length,
    ),
    lamps = new T.InstancedMesh(
      new T.IcosahedronGeometry(0.23, 1),
      new T.MeshStandardMaterial({ color: '#ffe1a3', emissive: '#d9953c', emissiveIntensity: 1.2 }),
      lanternNormals.length,
    );
  lanternNormals.forEach((n, i) => {
    dummy.quaternion.copy(orientation(n));
    dummy.position.copy(surface(n, 0.825));
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(surface(n, 1.85));
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
    lampPositions.push(dummy.position.clone());
  });
  world.add(posts, lamps);
  function glowCloud(locations, lantern = false) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(
        locations.flatMap((p) => p.toArray()),
        3,
      ),
    );
    geometry.setAttribute(
      'phase',
      new T.Float32BufferAttribute(
        locations.map(() => rand() * Math.PI * 2),
        1,
      ),
    );
    const uniforms = {
      time: { value: 0 },
      shadeDirection: { value: new T.Vector3() },
      viewer: { value: new T.Vector3() },
      lantern: { value: lantern ? 1 : 0 },
    };
    const material = new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: `uniform float time;uniform float lantern;uniform vec3 shadeDirection;uniform vec3 viewer;attribute float phase;varying float visibility;void main(){vec3 n=normalize(position-vec3(0.,260.,0.)),p=position;vec3 tangent=normalize(cross(n,vec3(.2,.4,.7)));p+=tangent*sin(time*.8+phase)*.7*(1.-lantern);p-=n*sin(time*1.3+phase)*.35*(1.-lantern);float night=smoothstep(-.16,.16,dot(n,shadeDirection));float nearby=1.-smoothstep(lantern>.5?90.:55.,lantern>.5?180.:95.,distance(viewer,p));visibility=night*nearby*mix(.6+.4*sin(time*2.+phase),1.,lantern);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(mix(180.,1250.,lantern)/max(1.,-mv.z),1.,mix(12.,64.,lantern));}`,
      fragmentShader: `uniform float lantern;varying float visibility;void main(){float r=length(gl_PointCoord-.5)*2.;float a=(exp(-r*r*5.)*.5+exp(-r*r*50.)*.7)*(1.-smoothstep(.75,1.,r))*visibility;if(a<.003)discard;gl_FragColor=vec4(mix(vec3(.78,1.,.38),vec3(1.,.64,.23),lantern),a);}`,
    });
    const points = new T.Points(geometry, material);
    points.frustumCulled = false;
    world.add(points);
    return { points, uniforms };
  }
  const flies = glowCloud(fireflies),
    glows = glowCloud(lampPositions, true);
  const poolGeometry = new T.CircleGeometry(2.4, 24);
  poolGeometry.rotateX(-Math.PI / 2);
  const poolUniforms = { shadeDirection: { value: new T.Vector3() } };
  const poolMaterial = new T.ShaderMaterial({
    uniforms: poolUniforms,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    vertexShader: `uniform vec3 shadeDirection;varying vec2 lightUv;varying float night;void main(){lightUv=uv;vec4 p=instanceMatrix*vec4(position,1.);night=smoothstep(-.16,.16,dot(normalize(p.xyz-vec3(0.,260.,0.)),shadeDirection));gl_Position=projectionMatrix*modelViewMatrix*p;}`,
    fragmentShader: `varying vec2 lightUv;varying float night;void main(){float d=length(lightUv-.5)*2.;gl_FragColor=vec4(1.,.64,.24,pow(max(0.,1.-d),2.)*.18*night);}`,
  });
  const pools = new T.InstancedMesh(poolGeometry, poolMaterial, lampPositions.length);
  lampPositions.forEach((p, i) => {
    const n = p.clone().sub(CENTER).normalize();
    dummy.position.copy(p).addScaledVector(n, bridgeHeight(n) > 0.1 ? 1.55 : 1.8);
    dummy.quaternion.copy(orientation(n));
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });
  world.add(pools);
  function update(t, position, shade) {
    for (const cloud of [flies, glows]) {
      cloud.uniforms.time.value = t;
      cloud.uniforms.viewer.value.copy(position);
      cloud.uniforms.shadeDirection.value.copy(shade);
    }
    poolUniforms.shadeDirection.value.copy(shade);
  }
  return { flies, glows, pools, posts, lamps, fireflies, lampPositions, update };
}
