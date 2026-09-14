import * as T from './vendor/three.module.min.js';
import { bigLakeNormal, surface, orientation, lakeDepth } from './navigation.js';
// A small rowing boat moored at the big lake shore, near the causeway landing. The player
// rides it like the speeder, but only on water; the boat rocks gently on the waves.
export const BOAT_MOORING = { x: -22, z: 130 };
export function buildBoat({ world, builders }) {
  const { mat, mesh, box, ball, cyl, beam } = builders;
  const root = new T.Group();
  world.add(root);
  const hull = ball(root, 0, 0.55, 0, 1, '#8a5a3a', 1);
  hull.scale.set(1.15, 0.5, 2.7);
  const inner = ball(root, 0, 0.72, 0, 1, '#c99a6a', 1);
  inner.scale.set(0.95, 0.32, 2.4);
  inner.material = new T.MeshStandardMaterial({
    color: '#c99a6a',
    roughness: 1,
    flatShading: true,
    side: T.BackSide,
  });
  const rim = mesh(new T.TorusGeometry(1, 0.09, 6, 22), mat('#6f4629'), root, 0, 0.98, 0);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.1, 2.55, 1);
  for (const z of [-0.9, 0.4]) box(root, 0, 0.85, z, 1.7, 0.1, 0.32, '#a67b52');
  box(root, 0, 0.6, 2.35, 0.25, 0.9, 0.3, '#6f4629');
  const oars = [];
  for (const sign of [-1, 1]) {
    const oar = new T.Group();
    oar.position.set(sign * 1.05, 0.95, 0.2);
    root.add(oar);
    cyl(oar, sign * 0.9, -0.35, 0, 0.05, 0.05, 2.4, '#b58a5e', 5).rotation.z = sign * 1.15;
    box(oar, sign * 1.9, -0.9, 0, 0.12, 0.55, 0.3, '#d8b48c');
    oars.push(oar);
  }
  beam(root, [0, 0.98, -2.6], [0, 1.5, -2.9], 0.06, '#6f4629');
  root.traverse((o) => {
    o.userData.interaction = 'boat';
  });
  const mooring = bigLakeNormal(BOAT_MOORING.x, BOAT_MOORING.z);
  root.position.copy(surface(mooring, lakeDepth(mooring) + 0.24));
  root.quaternion.copy(orientation(mooring));
  // Idle: bob on the waves; rowing: the oars swing with the stroke.
  function animate(t, rowing) {
    for (const [i, oar] of oars.entries()) {
      const stroke = rowing ? Math.sin(t * 3.2) : Math.sin(t * 0.8) * 0.08;
      oar.rotation.x = stroke * 0.55;
      oar.rotation.y = (i === 0 ? 1 : -1) * Math.max(0, stroke) * 0.25;
    }
  }
  return { root, mooring, oars, animate };
}
