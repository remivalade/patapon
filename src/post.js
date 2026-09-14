import * as T from './vendor/three.module.min.js';
// One full-screen pass after the scene: tone mapping and colour space (which Three.js only
// applies when drawing straight to the screen), then a light grade and a soft vignette.
// The scene is drawn into a multisampled half-float target so highlights keep their range.
// Falls back to plain rendering where the renderer cannot do it (tests, old devices).
export function createPost({ renderer, mobile = false }) {
  const capable =
    typeof renderer.setRenderTarget === 'function' && renderer.capabilities?.isWebGL2 === true;
  if (!capable) {
    return {
      enabled: false,
      render: (scene, camera) => renderer.render(scene, camera),
      resize() {},
    };
  }
  const gl = renderer.getContext();
  const halfFloat = !!(
    gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')
  );
  const size = renderer.getDrawingBufferSize(new T.Vector2());
  const target = new T.WebGLRenderTarget(size.x, size.y, {
    type: halfFloat ? T.HalfFloatType : T.UnsignedByteType,
    samples: mobile ? 2 : 4,
    depthBuffer: true,
  });
  const uniforms = {
    tDiffuse: { value: target.texture },
    saturation: { value: 1.12 },
    contrast: { value: 1.06 },
    vignette: { value: 0.28 },
  };
  const material = new T.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform sampler2D tDiffuse;uniform float saturation;uniform float contrast;uniform float vignette;varying vec2 vUv;
void main(){
vec3 colour=texture2D(tDiffuse,vUv).rgb;
gl_FragColor=vec4(colour,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
vec3 c=gl_FragColor.rgb;
float luma=dot(c,vec3(.2126,.7152,.0722));
c=mix(vec3(luma),c,saturation);
c=(c-.5)*contrast+.5;
vec2 d=(vUv-.5)*vec2(1.,.85);
c*=1.-vignette*smoothstep(.35,1.05,length(d)*1.6);
gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`,
  });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new T.Scene();
  quadScene.add(quad);
  const quadCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function render(scene, camera) {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCamera);
  }
  function resize() {
    const s = renderer.getDrawingBufferSize(new T.Vector2());
    target.setSize(s.x, s.y);
  }
  return { enabled: true, render, resize, uniforms, target, halfFloat };
}
