// Simulated browser for the regression checks: a fake DOM, a fake WebGL renderer
// and the real game created through `createGame`. Real Three.js mathematics run;
// nothing is rendered on a GPU.
import assert from 'node:assert/strict';

const nodes = new Map();
function element() {
  return {
    style: {},
    hidden: true,
    disabled: false,
    textContent: '',
    classList: { toggle() {} },
    setAttribute() {},
    appendChild() {},
    addEventListener(type, fn) {
      this[type] = fn;
    },
    setPointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 126, height: 126 };
    },
  };
}
export function installFakeBrowser() {
  globalThis.document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, element());
      return nodes.get(id);
    },
    addEventListener() {},
  };
  globalThis.window = globalThis;
  globalThis.innerWidth = 844;
  globalThis.innerHeight = 390;
  globalThis.devicePixelRatio = 2;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.requestAnimationFrame = () => {};
}
// Renders nothing but checks that every position stays finite, and keeps the scene.
export class FakeRenderer {
  constructor() {
    this.domElement = element();
    this.shadowMap = {};
    this.captured = null;
  }
  setPixelRatio() {}
  setSize() {}
  render(scene, camera) {
    this.captured = scene;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    scene.traverse((o) => {
      assert.ok(o.position.toArray().every(Number.isFinite));
      if (o.geometry?.attributes.position)
        for (const p of o.geometry.attributes.position.array) assert.ok(Number.isFinite(p));
    });
  }
}
// A pointer event as the game receives it from the browser.
export const touch = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y, preventDefault() {} });

export async function createTestGame() {
  installFakeBrowser();
  const { createGame } = await import('../src/world.js');
  const renderer = new FakeRenderer();
  const game = createGame({ renderer });
  return {
    game,
    renderer,
    canvas: renderer.domElement,
    hud: (id) => document.getElementById(id),
  };
}
