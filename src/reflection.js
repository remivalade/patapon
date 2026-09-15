import * as T from './vendor/three.module.min.js';
import { CENTER, RADIUS } from './navigation.js';
// The lakes mirror the world. Once per frame the scene is drawn again, at low resolution,
// from a camera mirrored through the water surface; the water shader then projects that
// picture back onto itself (`reflectionMatrix`) and blends it in by viewing angle.
// The surface is a sphere, so the mirror is the plane tangent to the water under the
// player: exact nearby, slightly off far away, where mist hides the difference.
// An oblique near plane clips everything under the water out of the mirrored view.
// Only drawn near a lake; a frame-rate guard switches it off on a device that cannot keep up.
export const REFLECTION = {
  scale: 0.42,
  mobileScale: 0.32,
  maxWidth: 1100,
  fade: 3,
  guard: { warmup: 2, window: 4, minimumFps: 30 },
};
export function createReflection({ renderer, scene, camera, waters = [], mobile = false }) {
  const capable =
    typeof renderer.setRenderTarget === 'function' && renderer.capabilities?.isWebGL2 === true;
  const guard = { elapsed: 0, frames: 0, time: 0, fps: null, settled: !capable };
  if (!capable) {
    return {
      enabled: false,
      guard,
      strength: 0,
      render() {},
      resize() {},
      disable() {},
      resetGuard() {},
    };
  }
  const gl = renderer.getContext();
  const halfFloat = !!(
    gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')
  );
  const target = new T.WebGLRenderTarget(4, 4, {
    type: halfFloat ? T.HalfFloatType : T.UnsignedByteType,
    depthBuffer: true,
  });
  target.texture.generateMipmaps = false;
  target.texture.minFilter = target.texture.magFilter = T.LinearFilter;
  const textureMatrix = new T.Matrix4();
  for (const water of waters) {
    water.uniforms.reflection.value = target.texture;
    water.uniforms.reflectionMatrix.value = textureMatrix;
  }
  const mirror = new T.PerspectiveCamera();
  const up = new T.Vector3(),
    point = new T.Vector3(),
    eye = new T.Vector3(),
    view = new T.Vector3(),
    look = new T.Vector3(),
    plane = new T.Plane(),
    clip = new T.Vector4(),
    q = new T.Vector4(),
    rotation = new T.Matrix4();
  let enabled = true,
    strength = 0;
  function resize() {
    const s = renderer.getDrawingBufferSize(new T.Vector2());
    const scale = Math.min(
      mobile ? REFLECTION.mobileScale : REFLECTION.scale,
      REFLECTION.maxWidth / s.x,
    );
    target.setSize(Math.max(4, Math.round(s.x * scale)), Math.max(4, Math.round(s.y * scale)));
  }
  resize();
  function setStrength(value) {
    strength = value;
    for (const water of waters) water.uniforms.reflectionStrength.value = value;
  }
  // normal: the player's outward normal; wanted: a lake is close enough to be worth a mirror;
  // dt: the real frame time, for the fade and the guard.
  function render({ normal, wanted = true, dt = 0 }) {
    const goal = enabled && wanted ? 1 : 0;
    setStrength(
      T.MathUtils.clamp(strength + (goal - strength) * Math.min(1, dt * REFLECTION.fade), 0, 1),
    );
    if (strength <= 0.001) return;
    camera.updateMatrixWorld();
    up.copy(normal).negate();
    point.copy(CENTER).addScaledVector(normal, RADIUS - 0.24);
    eye.setFromMatrixPosition(camera.matrixWorld);
    // Camera under the surface: nothing sensible to mirror.
    if (view.subVectors(eye, point).dot(up) <= 0.05) return;
    view.subVectors(point, eye).reflect(up).negate().add(point);
    rotation.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
    look.subVectors(point, look).reflect(up).negate().add(point);
    mirror.position.copy(view);
    mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(up);
    mirror.lookAt(look);
    mirror.near = camera.near;
    mirror.far = camera.far;
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    // Oblique near plane: clip the mirrored view at the water so the lake bed stays out.
    for (const water of waters)
      water.uniforms.mirrorPlane.value.set(up.x, up.y, up.z, -up.dot(point));
    // Clip a little above the surface: the water itself stays in the mirrored view (so a
    // grazing reflection meets water, not the lake bed) but never fights the clip plane.
    plane
      .setFromNormalAndCoplanarPoint(up, point)
      .translate(view.copy(up).multiplyScalar(0.3))
      .applyMatrix4(mirror.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = mirror.projectionMatrix.elements;
    q.set(
      (Math.sign(clip.x) + p[8]) / p[0],
      (Math.sign(clip.y) + p[9]) / p[5],
      -1,
      (1 + p[10]) / p[14],
    );
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = clip.z + 1 - 0.003;
    p[14] = clip.w;
    // The water is drawn in the mirror with its plain colour: no picture of itself.
    for (const water of waters) water.uniforms.reflectionStrength.value = 0;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previous);
    for (const water of waters) water.uniforms.reflectionStrength.value = strength;
    if (dt > 0 && !guard.settled) {
      guard.elapsed += dt;
      if (guard.elapsed > REFLECTION.guard.warmup) {
        guard.frames++;
        guard.time += dt;
        if (guard.time >= REFLECTION.guard.window) {
          guard.fps = guard.frames / guard.time;
          guard.settled = true;
          if (guard.fps < REFLECTION.guard.minimumFps) disable();
        }
      }
    }
  }
  function resetGuard() {
    guard.elapsed = guard.frames = guard.time = 0;
    guard.fps = null;
    guard.settled = false;
  }
  function disable() {
    enabled = false;
    setStrength(0);
  }
  return {
    target,
    mirror,
    guard,
    render,
    resize,
    disable,
    resetGuard,
    get enabled() {
      return enabled;
    },
    get strength() {
      return strength;
    },
  };
}
