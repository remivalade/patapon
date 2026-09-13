import * as T from './vendor/three.module.min.js';
// Marceau: red hair, a soft Jedi robe, boots and a little belt, plus his ground shadow.
export function buildMarceau({ world, builders, rand }) {
  const { mesh, box, ball, cyl } = builders;
  const player = new T.Group();
  world.add(player);
  const robe = cyl(player, 0, 0.9, 0, 0.38, 0.65, 1.35, '#d4bf94', 7);
  box(player, 0, 1.08, 0.02, 0.83, 0.2, 0.73, '#77563c');
  const head = ball(player, 0, 1.96, 0, 0.4, '#f2c697', 1);
  const hair = ball(player, 0, 2.15, -0.035, 0.42, '#ba592c', 1);
  hair.scale.set(1, 0.62, 1);
  for (let i = 0; i < 7; i++)
    ball(player, (rand() - 0.5) * 0.63, 2.2 + rand() * 0.2, -0.08 + rand() * 0.3, 0.17, '#d77538');
  for (const x of [-0.15, 0.15]) ball(player, x, 1.99, 0.345, 0.028, '#464c36');
  const hood = ball(player, 0, 1.4, -0.3, 0.43, '#9a8057');
  hood.scale.set(1, 0.7, 0.55);
  const legs = [],
    arms = [];
  for (const x of [-0.23, 0.23]) {
    const leg = new T.Group();
    leg.position.set(x, 0.52, 0);
    box(leg, 0, -0.25, 0.04, 0.29, 0.55, 0.39, '#675039');
    player.add(leg);
    legs.push(leg);
    const arm = new T.Group();
    arm.position.set(x < 0 ? -0.45 : 0.45, 1.43, 0);
    cyl(arm, 0, -0.3, 0, 0.17, 0.22, 0.68, '#bda47a');
    ball(arm, 0, -0.67, 0, 0.14, '#f1c292');
    player.add(arm);
    arms.push(arm);
  }
  const saber = cyl(player, -0.48, 0.96, 0.15, 0.065, 0.065, 0.35, '#8eaca4', 6);
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
  return { player, robe, legs, arms, playerShadow };
}
