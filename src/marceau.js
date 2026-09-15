import * as T from './vendor/three.module.min.js';
import { buildFace } from './face.js';
// Marceau: Mii proportions (one head for three, capsule body, short tube limbs, big round
// hands), red hair as a smooth cap with tufts along the brim, a drawn face, his Jedi robe,
// belt and lightsaber, plus his ground shadow.
export function buildMarceau({ world, builders, rand }) {
  const { mesh, box, ball, cyl } = builders;
  const player = new T.Group();
  world.add(player);
  const robe = cyl(player, 0, 0.98, 0, 0.4, 0.55, 0.95, '#d4bf94', 7);
  box(player, 0, 1.06, 0.02, 0.86, 0.16, 0.8, '#77563c');
  const hood = ball(player, 0, 1.42, -0.32, 0.4, '#9a8057');
  hood.scale.set(1, 0.6, 0.5);
  const head = new T.Group();
  head.position.set(0, 1.82, 0);
  player.add(head);
  ball(head, 0, 0, 0, 0.6, '#f2c697', 1);
  const cap = ball(head, 0, 0.2, -0.05, 0.63, '#ba592c', 1);
  cap.scale.set(1, 0.7, 1);
  // Seven tufts along the brim, front and sides, with a little jitter (the same number of
  // random draws as before keeps every tree and rock built afterwards in place).
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.4;
    ball(head, Math.sin(a) * 0.5, 0.36 - Math.abs(a) * 0.08 + (rand() - 0.5) * 0.06, Math.cos(a) * 0.5 - 0.05, 0.17 + rand() * 0.05, '#d77538');
  }
  const face = buildFace({ builders, style: 'mii', parent: head, R: 0.6, tweak: { blushColour: '#eba58f' } });
  const legs = [],
    arms = [];
  for (const x of [-0.2, 0.2]) {
    const leg = new T.Group();
    leg.position.set(x, 0.62, 0);
    cyl(leg, 0, -0.27, 0, 0.14, 0.15, 0.5, '#675039', 7);
    const foot = ball(leg, 0, -0.52, 0.07, 0.16, '#4b3b2c');
    foot.scale.set(1, 0.7, 1.3);
    player.add(leg);
    legs.push(leg);
    const arm = new T.Group();
    arm.position.set(x < 0 ? -0.55 : 0.55, 1.35, 0);
    cyl(arm, 0, -0.22, 0, 0.12, 0.14, 0.45, '#bda47a', 7);
    ball(arm, 0, -0.5, 0, 0.17, '#f1c292', 1);
    player.add(arm);
    arms.push(arm);
  }
  const saber = cyl(player, -0.5, 0.9, 0.2, 0.065, 0.065, 0.35, '#8eaca4', 6);
  saber.rotation.z = 0.15;
  const playerShadow = mesh(
    new T.CircleGeometry(0.7, 24),
    new T.MeshBasicMaterial({
      color: '#324735',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
    world,
  );
  playerShadow.rotation.x = -Math.PI / 2;
  return { player, robe, legs, arms, face, playerShadow };
}
