import * as T from './vendor/three.module.min.js';
// Deep space around the asteroid: lights, sky, stars, the home rock, its gate and companions.
export function buildExterior({ outside, mat, mesh, ball, rand }) {
  const dummy = new T.Object3D();
  const outerAmbient = new T.AmbientLight('#8093bb', 0.65);
  outside.add(outerAmbient);
  const outerKey = new T.DirectionalLight('#ffe0b4', 3.4);
  outerKey.position.set(-450, 650, 500);
  outside.add(outerKey);
  const outerRim = new T.DirectionalLight('#738eff', 1.7);
  outerRim.position.set(350, -60, -500);
  outside.add(outerRim);
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
}
