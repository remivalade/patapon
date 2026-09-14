import * as T from './vendor/three.module.min.js';
import { CENTER, surface, orientation } from './navigation.js';
// Puffy low-poly clouds drifting inside the globe, well above the treetops. Each cloud is
// a few flattened icosahedra; all of them live in one instanced mesh inside a group that
// slowly turns around the centre, so they drift without any per-frame matrix work.
export function buildClouds({ world, rand, count = 34 }) {
  const group = new T.Group();
  group.position.copy(CENTER);
  world.add(group);
  const puffs = [];
  for (let c = 0; c < count; c++) {
    const u = rand() * 2 - 1,
      a = rand() * Math.PI * 2,
      n = new T.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a)),
      altitude = 48 + rand() * 30,
      scale = 5 + rand() * 6,
      pieces = 3 + Math.floor(rand() * 4),
      right = new T.Vector3(1, 0, 0).projectOnPlane(n).normalize(),
      front = n.clone().cross(right);
    for (let k = 0; k < pieces; k++) {
      const dx = (rand() - 0.5) * scale * 1.6,
        dz = (rand() - 0.5) * scale * 0.8,
        s = scale * (0.45 + rand() * 0.5);
      const p = surface(n, altitude + (rand() - 0.5) * 2)
        .addScaledVector(right, dx)
        .addScaledVector(front, dz)
        .sub(CENTER);
      puffs.push({ p, n, s, squash: 0.55 + rand() * 0.2, yaw: rand() * 6 });
    }
  }
  const mesh = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    new T.MeshStandardMaterial({ color: '#fbfbf6', roughness: 1, flatShading: true }),
    puffs.length,
  );
  const dummy = new T.Object3D();
  puffs.forEach((puff, i) => {
    dummy.position.copy(puff.p);
    dummy.quaternion
      .copy(orientation(puff.n))
      .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), puff.yaw));
    dummy.scale.set(puff.s, puff.s * puff.squash, puff.s * 0.8);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = mesh.receiveShadow = false;
  group.add(mesh);
  const axis = new T.Vector3(0.2, 1, 0.35).normalize();
  function update(t) {
    group.quaternion.setFromAxisAngle(axis, t * 0.0045);
  }
  return { group, mesh, count: puffs.length, update };
}
