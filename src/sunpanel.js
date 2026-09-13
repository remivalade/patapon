import * as T from './vendor/three.module.min.js';
// The sun control box beside the lift call button: a pedestal, a tilted panel and three
// buttons. Colour button: painted with the current sun colour. Speed button: four lamps
// show how fast the day/night cover turns. Disco button: a small mirror ball that lights
// up while the disco is on. Coordinates are local to the tower group (y is up).
export const PANEL_STAND = new T.Vector3(9.4, 0, -1.3);
export const PANEL_FOCUS = new T.Vector3(9.4, 1.35, -3.15);
export function buildSunPanel({ towerGroup, builders }) {
  const { mat, mesh, box, ball, cyl } = builders;
  const group = new T.Group();
  towerGroup.add(group);
  box(group, 9.4, 0.5, -3.4, 1.3, 1, 0.7, '#6f8c86');
  box(group, 9.4, 0.02, -3.4, 1.6, 0.06, 1, '#5b716c');
  const face = new T.Group();
  face.position.copy(PANEL_FOCUS);
  face.rotation.x = -0.5;
  group.add(face);
  box(face, 0, 0, 0, 1.5, 0.95, 0.1, '#3d5652');
  box(face, 0, 0, 0.04, 1.4, 0.85, 0.04, '#587873');
  const buttons = {};
  // Colour: a round pushbutton whose glow is the sun colour.
  const colour = cyl(face, -0.45, 0.05, 0.1, 0.2, 0.2, 0.12, '#ffe7a2', 24);
  colour.rotation.x = Math.PI / 2;
  colour.material = new T.MeshStandardMaterial({
    color: '#ffe7a2',
    emissive: '#ffcf77',
    emissiveIntensity: 0.6,
    roughness: 0.4,
  });
  buttons.color = colour;
  // Speed: a wide key with four lamps above it.
  buttons.speed = box(face, 0, -0.12, 0.1, 0.4, 0.22, 0.1, '#7fa39c');
  const lamps = [];
  for (let i = 0; i < 4; i++) {
    const lamp = ball(face, -0.21 + i * 0.14, 0.2, 0.09, 0.05, '#6b6a5c', 1);
    lamp.material = new T.MeshStandardMaterial({ color: '#6b6a5c', roughness: 0.5 });
    lamps.push(lamp);
  }
  // Disco: a faceted little ball.
  const disco = mesh(new T.IcosahedronGeometry(0.18, 1), mat('#c8ccd6'), face, 0.45, 0.05, 0.16);
  disco.material = new T.MeshStandardMaterial({
    color: '#c8ccd6',
    flatShading: true,
    roughness: 0.25,
    metalness: 0.4,
  });
  buttons.disco = disco;
  for (const [kind, object] of Object.entries(buttons)) object.userData.panel = kind;
  for (const lamp of lamps) lamp.userData.panel = 'speed';
  const targets = [...Object.values(buttons), ...lamps];
  function setColor(hex) {
    colour.material.color.set(hex);
    colour.material.emissive.set(hex);
  }
  // level 0 stops the cover; 1 to 4 light one lamp more each.
  function setSpeedLevel(level) {
    lamps.forEach((lamp, i) => {
      const lit = i < level;
      lamp.material.color.set(lit ? '#fff1b0' : '#6b6a5c');
      lamp.material.emissive.set(lit ? '#ffd45e' : '#000000');
      lamp.material.emissiveIntensity = lit ? 1.4 : 0;
    });
  }
  function setDisco(on) {
    disco.material.emissive.set(on ? '#ff7ad9' : '#000000');
    disco.material.emissiveIntensity = on ? 1.2 : 0;
  }
  return { group, buttons, lamps, targets, setColor, setSpeedLevel, setDisco };
}
