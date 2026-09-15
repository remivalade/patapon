import * as T from './vendor/three.module.min.js';
// Drawn faces shared by every character: flat stickers stuck on a round head, the way a
// Mii's eyes and mouth sit on its skull. Three mouths overlap and only one shows, the eyes
// squash to blink, the brows lift on surprise. The stickers use the game's own materials,
// so the night and disco shaders reach the faces too.
const FRONT = new T.Vector3(0, 0, 1);
const INK = '#1f1c19',
  GLINT = '#fff6d7',
  SCLERA = '#f4ecd8';
// Sizes are fractions of the head radius; yaw and pitch place the eyes around the front.
export const FACE_STYLES = {
  // Two ovals below the middle of the head, brows, a small mouth: the Mii recipe.
  mii: { eye: 0.085, eyeScale: [0.85, 1.3], yaw: 0.3, pitch: -0.04, glint: 0.3, brow: true, blush: 0.09, mouth: 0.12, tube: 0.02 },
  // Almond eyes and a wide smile on a muzzle: the plush look of Nintendo's animals.
  plush: { eye: 0.13, eyeScale: [0.75, 1.35], yaw: 0.36, pitch: -0.06, glint: 0.36, brow: false, blush: 0.09, mouth: 0.2, tube: 0.025 },
};
export function buildFace({ builders, style, parent, R, mouthParent = parent, mouthR = R, mouthPitch, tweak = {} }) {
  const { mesh, mat } = builders;
  const c = { blushColour: '#eba190', ...FACE_STYLES[style], ...tweak };
  function sticker(target, radius, yaw, pitch, geometry, colour, lift = 0.02) {
    const d = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const o = mesh(geometry, mat(colour), target, ...d.clone().multiplyScalar(radius + lift).toArray());
    o.quaternion.setFromUnitVectors(FRONT, d);
    o.castShadow = false;
    return o;
  }
  const eyes = [],
    brows = [];
  for (const s of [-1, 1]) {
    const eye = sticker(parent, R, s * c.yaw, c.pitch, new T.CircleGeometry(c.eye * R, 20), INK);
    eye.scale.set(c.eyeScale[0], c.eyeScale[1], 1);
    if (c.sclera) {
      const white = mesh(new T.CircleGeometry(c.eye * R * 1.5, 20), mat(SCLERA), eye, 0, 0, -0.008);
      white.scale.set(1.05, 0.95, 1);
      white.castShadow = false;
    }
    if (c.glint) {
      const glint = mesh(new T.CircleGeometry(c.eye * R * c.glint, 12), mat(GLINT), eye, -c.eye * R * 0.32, c.eye * R * 0.35, 0.01);
      glint.castShadow = false;
    }
    eyes.push(eye);
    if (c.brow) {
      const brow = sticker(parent, R, s * c.yaw, c.pitch + 0.26, new T.BoxGeometry(R * 0.24, R * 0.035, R * 0.01), INK);
      brow.rotateZ(-s * 0.14);
      brow.userData.rest = brow.position.clone();
      brows.push(brow);
    }
    if (c.blush)
      sticker(parent, R, s * (c.yaw + 0.45), c.pitch - 0.25, new T.CircleGeometry(c.blush * R, 16), c.blushColour, 0.012);
  }
  const pitch = mouthPitch ?? c.pitch - 0.42;
  const smile = sticker(mouthParent, mouthR, 0, pitch, new T.TorusGeometry(c.mouth * mouthR, c.tube * mouthR, 5, 16, Math.PI), INK);
  smile.rotateZ(Math.PI);
  const gasp = sticker(mouthParent, mouthR, 0, pitch, new T.TorusGeometry(c.mouth * mouthR * 0.7, c.tube * mouthR, 5, 16), INK);
  const grin = sticker(mouthParent, mouthR, 0, pitch, new T.CircleGeometry(c.mouth * mouthR * 1.15, 16, Math.PI, Math.PI), INK);
  gasp.visible = grin.visible = false;
  let nextBlink = 2 + Math.random() * 3,
    blinkAt = -1;
  const face = {
    mood: 'rest',
    // rest: small smile. surprise: round mouth, wide eyes, brows up. joy: grin, squinting eyes.
    setMood(mood) {
      if (mood === face.mood) return;
      face.mood = mood;
      smile.visible = mood === 'rest';
      gasp.visible = mood === 'surprise';
      grin.visible = mood === 'joy';
      for (const brow of brows) brow.position.copy(brow.userData.rest).y += mood === 'surprise' ? R * 0.08 : 0;
    },
    update(t, mood = face.mood) {
      face.setMood(mood);
      if (t > nextBlink) {
        blinkAt = t;
        nextBlink = t + 2.5 + Math.random() * 3.5;
      }
      const closed = t - blinkAt >= 0 && t - blinkAt < 0.13,
        open = face.mood === 'surprise' ? 1.25 : face.mood === 'joy' ? 0.72 : 1;
      for (const eye of eyes) eye.scale.set(c.eyeScale[0] * open, c.eyeScale[1] * open * (closed ? 0.12 : 1), 1);
    },
  };
  return face;
}
