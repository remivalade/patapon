import * as T from './vendor/three.module.min.js';
import { CENTER } from './navigation.js';
import { daylightAt } from './landscape.js';
// Sun colours selectable from the control box. sun: the sphere; halo and glow: the light
// around it; light: the point light that shines on the habitat.
export const SUN_COLOURS = [
  { name: 'doré', sun: '#fff2ce', halo: '#ffcf77', glow: '#ffd28b', light: '#ffe3a4' },
  { name: 'orange', sun: '#ffd9a8', halo: '#ff9a3c', glow: '#ffb060', light: '#ffcf8a' },
  { name: 'rose', sun: '#ffd6e8', halo: '#ff7ab8', glow: '#ff9ccc', light: '#ffc4dc' },
  { name: 'rouge', sun: '#ffc9b8', halo: '#ff5a48', glow: '#ff7a5c', light: '#ffb09c' },
  { name: 'violet', sun: '#e6d4ff', halo: '#a66bff', glow: '#bf8cff', light: '#d9bdff' },
  { name: 'bleu', sun: '#d2e8ff', halo: '#5aa8ff', glow: '#7dbcff', light: '#b8d6ff' },
  { name: 'vert', sun: '#dcffd6', halo: '#5ee07a', glow: '#8cf0a0', light: '#c2f5c8' },
];
// The artificial sun at the centre of the globe: sphere, halo, glow, motes and its interior.
export function buildSun({ world, mesh, rand, camera, lights }) {
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
    uniforms: { strength: glowUniforms.strength, time: glowUniforms.time, tint: glowUniforms.tint },
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
    vertexShader:
      'uniform float time;varying float sparkle;void main(){sparkle=.35+.35*sin(time*.8+position.x*.6+position.z);vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(650./max(1.,-p.z),1.,4.);}',
    fragmentShader:
      'uniform float strength;uniform vec3 tint;varying float sparkle;void main(){float d=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.1,1.,d))*sparkle*strength;gl_FragColor=vec4(tint*vec3(1.,.95,.75),a);}',
  });
  const solarDust = new T.Points(solarDustGeometry, solarDustMaterial);
  solarDust.position.copy(CENTER);
  world.add(solarDust);
  let colourIndex = 0;
  function setColour(index) {
    colourIndex = ((index % SUN_COLOURS.length) + SUN_COLOURS.length) % SUN_COLOURS.length;
    const c = SUN_COLOURS[colourIndex];
    solarMat.color.set(c.sun);
    haloMat.uniforms.tint.value.set(c.halo);
    glowUniforms.tint.value.set(c.glow);
    if (lights?.centralLight) lights.centralLight.color.set(c.light);
    if (lights?.shadowLight) lights.shadowLight.color.set(c.light);
  }
  function nextColour() {
    setColour(colourIndex + 1);
  }
  function update(t, shadeDirection, disco = 0) {
    sunInteriorUniforms.time.value = t;
    const inside = 1 - T.MathUtils.smoothstep(camera.position.distanceTo(CENTER), 18, 31);
    sunInteriorUniforms.strength.value = inside;
    cageMaterial.opacity = inside * 0.6;
    innerSun.visible = sunCage.visible = inside > 0.01;
    glowUniforms.time.value = t;
    const distance = camera.position.distanceTo(CENTER);
    glowUniforms.strength.value =
      T.MathUtils.smoothstep(distance, 30, 85) *
      (0.1 + 0.9 * daylightAt(camera.position.clone().sub(CENTER).normalize(), shadeDirection)) *
      (1 - 0.7 * disco);
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
  return {
    update,
    solarMat,
    halo,
    innerSun,
    sunCage,
    sunInteriorUniforms,
    setColour,
    nextColour,
    get colour() {
      return SUN_COLOURS[colourIndex];
    },
    get colourIndex() {
      return colourIndex;
    },
  };
}
