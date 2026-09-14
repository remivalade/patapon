import * as T from './vendor/three.module.min.js';
import { SHORE_GLSL } from './navigation.js';
// Ripples that really spread: each lake keeps a small height field in a texture, and the
// GPU advances the wave equation on it every frame (height and velocity per texel, the
// neighbours' average pulling each texel back: the same idea as Evan Wallace's WebGL water,
// rebuilt for lakes on a sphere). Marceau, the boat and surfacing fish drop rings into it;
// the water shader turns the heights into normals (glints, mirror wobble) and into
// caustics (light focused where the surface bulges).
// The texture does not cover a whole lake: it is a window of RIPPLES.window units around
// the player, moved by whole texels when the player walks away from its centre. Waves fade
// out at the window edge and at the shore instead of bouncing back.
export const RIPPLES = {
  size: 512,
  mobileSize: 384,
  window: 110,
  recentre: 12,
  speed: 0.05,
  damping: 0.993,
  maxDrops: 8,
};
const QUAD_VERTEX = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
export function createRipples({ renderer, waters, mobile = false }) {
  const capable =
    typeof renderer.setRenderTarget === 'function' && renderer.capabilities?.isWebGL2 === true;
  const gl = capable ? renderer.getContext() : null;
  const floats =
    !!gl &&
    !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  if (!capable || !floats) {
    return { enabled: false, lakes: {}, drop: () => false, update() {} };
  }
  const size = mobile ? RIPPLES.mobileSize : RIPPLES.size;
  const scale = 1 / RIPPLES.window;
  const quadScene = new T.Scene(),
    quadCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    quad = new T.Mesh(new T.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  quadScene.add(quad);
  const sim = new T.ShaderMaterial({
    uniforms: {
      heights: { value: null },
      texel: { value: 1 / size },
      speed: { value: RIPPLES.speed },
      damping: { value: RIPPLES.damping },
      window: { value: new T.Vector4() },
      shape: { value: new T.Vector4() },
      large: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: QUAD_VERTEX,
    fragmentShader: `uniform sampler2D heights;uniform float texel,speed,damping,large;uniform vec4 window,shape;varying vec2 vUv;
${SHORE_GLSL}
void main(){vec4 info=texture2D(heights,vUv);vec2 dx=vec2(texel,0.),dy=vec2(0.,texel);
float average=(texture2D(heights,vUv-dx).r+texture2D(heights,vUv+dx).r+texture2D(heights,vUv-dy).r+texture2D(heights,vUv+dy).r)*.25;
info.g+=(average-info.r)*speed;info.g*=damping;info.r+=info.g;
vec2 lake=(vUv-.5)/window.z+window.xy;vec2 q=(lake-shape.xy)/shape.zw;float r=length(q)/mix(1.,shoreScale(q),large);
float edge=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y));
float keep=mix(.86,1.,smoothstep(0.,.06,edge))*mix(.86,1.,1.-smoothstep(.95,1.02,r));
gl_FragColor=vec4(info.rg*keep,0.,1.);}`,
  });
  const drops = new T.ShaderMaterial({
    uniforms: {
      heights: { value: null },
      drops: { value: Array.from({ length: RIPPLES.maxDrops }, () => new T.Vector4()) },
      count: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: QUAD_VERTEX,
    fragmentShader: `uniform sampler2D heights;uniform vec4 drops[${RIPPLES.maxDrops}];uniform int count;varying vec2 vUv;
void main(){vec4 info=texture2D(heights,vUv);
for(int i=0;i<${RIPPLES.maxDrops};i++){if(i>=count)break;vec4 d=drops[i];float k=max(0.,1.-distance(vUv,d.xy)/d.z);k=.5-cos(k*3.14159)*.5;info.r+=k*d.w;}
gl_FragColor=vec4(info.rg,0.,1.);}`,
  });
  const shift = new T.ShaderMaterial({
    uniforms: { heights: { value: null }, offset: { value: new T.Vector2() } },
    depthTest: false,
    depthWrite: false,
    vertexShader: QUAD_VERTEX,
    fragmentShader: `uniform sampler2D heights;uniform vec2 offset;varying vec2 vUv;
void main(){vec2 s=vUv+offset;gl_FragColor=any(lessThan(s,vec2(0.)))||any(greaterThan(s,vec2(1.)))?vec4(0.):texture2D(heights,s);}`,
  });
  function makeTarget() {
    const target = new T.WebGLRenderTarget(size, size, {
      type: T.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    });
    target.texture.generateMipmaps = false;
    target.texture.minFilter = target.texture.magFilter = T.LinearFilter;
    return target;
  }
  const lakes = {};
  for (const key of Object.keys(waters)) {
    const water = waters[key];
    lakes[key] = {
      water,
      targets: [makeTarget(), makeTarget()],
      index: 0,
      centre: { x: 0, z: 0 },
      queue: [],
      active: false,
    };
    water.uniforms.rippleTexel.value = 1 / size;
  }
  function pass(lake, material) {
    const from = lake.targets[lake.index],
      to = lake.targets[1 - lake.index];
    material.uniforms.heights.value = from.texture;
    quad.material = material;
    renderer.setRenderTarget(to);
    renderer.render(quadScene, quadCamera);
    lake.index = 1 - lake.index;
  }
  // A ring in lake `key` at chart position (x, z): radius in world units, strength in height.
  function drop(key, x, z, radius, strength) {
    const lake = lakes[key];
    if (!lake || !lake.active || lake.queue.length >= RIPPLES.maxDrops) return false;
    const u = (x - lake.centre.x) * scale + 0.5,
      v = (z - lake.centre.z) * scale + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    lake.queue.push(new T.Vector4(u, v, radius * scale, strength));
    return true;
  }
  // `near` maps a lake key to the player's chart position in that lake, or nothing when the
  // player is too far for its ripples to matter (the lake then keeps still, for free).
  function update(near) {
    const previous = renderer.getRenderTarget();
    for (const [key, lake] of Object.entries(lakes)) {
      const p = near[key];
      const { uniforms } = lake.water;
      if (!p) {
        lake.active = false;
        lake.queue.length = 0;
        uniforms.rippleWindow.value.w = 0;
        continue;
      }
      if (!lake.active) {
        // Waking up: start clean around the player.
        lake.active = true;
        lake.centre = { x: p.x, z: p.z };
        for (const target of lake.targets) {
          renderer.setRenderTarget(target);
          renderer.clear();
        }
      } else {
        const dx = p.x - lake.centre.x,
          dz = p.z - lake.centre.z;
        if (Math.hypot(dx, dz) > RIPPLES.recentre) {
          // Slide the window by whole texels so the waves keep their shape.
          const tx = Math.round(dx * scale * size),
            tz = Math.round(dz * scale * size);
          shift.uniforms.offset.value.set(tx / size, tz / size);
          pass(lake, shift);
          lake.centre.x += tx / (scale * size);
          lake.centre.z += tz / (scale * size);
        }
      }
      sim.uniforms.window.value.set(lake.centre.x, lake.centre.z, scale, 1);
      sim.uniforms.shape.value.copy(uniforms.shape.value);
      sim.uniforms.large.value = uniforms.large.value;
      pass(lake, sim);
      if (lake.queue.length) {
        lake.queue.forEach((d, i) => drops.uniforms.drops.value[i].copy(d));
        drops.uniforms.count.value = lake.queue.length;
        pass(lake, drops);
        lake.queue.length = 0;
      }
      uniforms.ripples.value = lake.targets[lake.index].texture;
      uniforms.rippleWindow.value.set(lake.centre.x, lake.centre.z, scale, 1);
    }
    renderer.setRenderTarget(previous);
  }
  return { enabled: true, size, lakes, drop, update };
}
