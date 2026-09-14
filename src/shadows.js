import * as T from './vendor/three.module.min.js';
// Real shadows from one directional light that follows Marceau. The sun sits at the centre
// of the globe, so its light always comes from straight "above": the shadows are short,
// noon-like contact shadows. A tight orthographic box around the player keeps them sharp
// and cheap; the box is snapped to the shadow texel grid so edges do not crawl. Shadow
// intensity follows daylight so shadows vanish on the night side and during the disco.
// A frame-rate guard switches shadows off on a device that cannot keep up.
export const SHADOW_BOX = 120;
export const SHADOW_HEIGHT = 70;
export const GUARD = { warmup: 2, window: 4, minimumFps: 30 };
export function detectMobile(env = globalThis) {
  try {
    return (
      !!env.matchMedia?.('(pointer: coarse)')?.matches ||
      /Mobi|Android|iPhone|iPad/.test(env.navigator?.userAgent ?? '')
    );
  } catch {
    return false;
  }
}
export function createShadows({ renderer, world, colour = '#ffe3a4', mobile = detectMobile() }) {
  const size = mobile ? 1024 : 2048;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = mobile ? T.PCFShadowMap : T.PCFSoftShadowMap;
  // Most of the sun's direct light comes from here, so shadows read clearly (about half
  // as bright as sunlit ground once the ambient light is counted).
  const light = new T.DirectionalLight(colour, 2.6);
  light.castShadow = true;
  light.shadow.mapSize.set(size, size);
  const cam = light.shadow.camera;
  cam.left = cam.bottom = -SHADOW_BOX / 2;
  cam.right = cam.top = SHADOW_BOX / 2;
  cam.near = 1;
  cam.far = SHADOW_HEIGHT + 60;
  // Three.js keeps the old projection until told otherwise: without this call the box
  // would silently stay at its 10-unit default.
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.05;
  light.shadow.radius = mobile ? 2 : 1;
  light.target = new T.Object3D();
  world.add(light, light.target);
  const texel = SHADOW_BOX / size;
  let enabled = true;
  const guard = { elapsed: 0, frames: 0, time: 0, fps: null, settled: false };
  const right = new T.Vector3(),
    across = new T.Vector3(),
    focus = new T.Vector3();
  // Called once per frame while the habitat is visible.
  // position/up/forward: the player; light: daylight at the player (0 at night or disco);
  // dt: the real frame time, unclamped, for the guard.
  function update({ position, up, forward, daylight, dt, active = true }) {
    if (!enabled) return;
    // A stable sideways axis: swap the reference only where the tangent plane tilts a lot.
    const reference = Math.abs(up.y) < 0.8 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
    across.copy(reference).projectOnPlane(up).normalize();
    right.crossVectors(across, up).normalize();
    focus.copy(position).addScaledVector(forward, SHADOW_BOX * 0.15);
    // Snap the box to the texel grid in its own frame so shadow edges stay put while walking.
    const sx = focus.dot(right),
      sy = focus.dot(across);
    focus
      .addScaledVector(right, Math.round(sx / texel) * texel - sx)
      .addScaledVector(across, Math.round(sy / texel) * texel - sy);
    light.target.position.copy(focus);
    light.position.copy(focus).addScaledVector(up, SHADOW_HEIGHT);
    cam.up.copy(across);
    light.shadow.intensity = T.MathUtils.clamp(daylight, 0, 1);
    if (active && dt > 0 && !guard.settled) {
      guard.elapsed += dt;
      if (guard.elapsed > GUARD.warmup) {
        guard.frames++;
        guard.time += dt;
        if (guard.time >= GUARD.window) {
          guard.fps = guard.frames / guard.time;
          guard.settled = true;
          if (guard.fps < GUARD.minimumFps) disable();
        }
      }
    }
  }
  // Measure again from scratch, for instance after the page comes back from the background.
  function resetGuard() {
    guard.elapsed = guard.frames = guard.time = 0;
    guard.fps = null;
    guard.settled = false;
  }
  function disable() {
    if (!enabled) return;
    enabled = false;
    light.castShadow = false;
    renderer.shadowMap.enabled = false;
    world.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m) m.needsUpdate = true;
    });
  }
  return {
    light,
    mobile,
    size,
    guard,
    update,
    disable,
    resetGuard,
    get enabled() {
      return enabled;
    },
  };
}
