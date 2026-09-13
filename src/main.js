import * as T from './vendor/three.module.min.js';
import { createGame } from './world.js';
let renderer;
try {
  renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('error').hidden = false;
  throw e;
}
createGame({ renderer }).start();
