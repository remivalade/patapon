// Device axes stay in the screen's natural orientation (W3C orientation-event).
// Project world-up into the displayed screen to measure a steering-wheel roll.
export function screenRoll(beta, gamma, screenAngle = 0) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const rad = Math.PI / 180,
    b = beta * rad,
    g = gamma * rad,
    a = screenAngle * rad;
  const x = -Math.cos(b) * Math.sin(g),
    y = Math.sin(b);
  const right = x * Math.cos(a) - y * Math.sin(a),
    top = x * Math.sin(a) + y * Math.cos(a);
  if (Math.hypot(right, top) < 0.18) return null; // A flat phone has no stable wheel angle.
  return Math.atan2(-right, top) / rad;
}
export function steeringFromRoll(angle, neutral) {
  const delta = ((angle - neutral + 540) % 360) - 180;
  return Math.sign(delta) * Math.pow(Math.min(1, Math.max(0, Math.abs(delta) - 2.5) / 22.5), 1.2);
}
export class TiltSteering {
  constructor(env = globalThis, onChange = () => {}) {
    this.env = env;
    this.onChange = onChange;
    this.enabled = false;
    this.state = 'off';
    this.value = 0;
    this.neutral = null;
    this.latest = null;
    this.lastSample = -Infinity;
    this.sequence = 0;
    this.read = this.read.bind(this);
  }
  angle() {
    return this.env.screen?.orientation?.angle ?? this.env.orientation ?? 0;
  }
  reset() {
    this.neutral = null;
    this.value = 0;
  }
  stop(state = 'off') {
    this.sequence++;
    this.env.clearTimeout(this.timer);
    this.env.removeEventListener('deviceorientation', this.read);
    this.enabled = false;
    this.state = state;
    this.latest = null;
    this.reset();
    this.onChange(state);
  }
  async start() {
    this.stop();
    const request = this.sequence,
      API = this.env.DeviceOrientationEvent;
    if (!API) {
      this.stop('unavailable');
      return false;
    }
    this.state = 'waiting';
    this.onChange(this.state);
    try {
      // Permission is requested directly from the mode button's click, when required.
      if (
        typeof API.requestPermission === 'function' &&
        (await API.requestPermission()) !== 'granted'
      ) {
        if (request === this.sequence) this.stop('denied');
        return false;
      }
      if (request !== this.sequence) return false;
      this.env.addEventListener('deviceorientation', this.read);
      this.timer = this.env.setTimeout(() => {
        if (this.state === 'waiting') this.stop('unavailable');
      }, 3500);
      return true;
    } catch {
      if (request === this.sequence) this.stop('denied');
      return false;
    }
  }
  read(event) {
    if (this.state !== 'waiting' && !this.enabled) return;
    const angle = this.angle(),
      roll = screenRoll(event.beta, event.gamma, angle);
    if (roll === null) {
      this.latest = null;
      this.value = 0;
      return;
    }
    if (angle !== this.screenAngle) {
      this.screenAngle = angle;
      this.reset();
    }
    this.latest = roll;
    this.lastSample = this.env.performance.now();
    if (this.neutral === null) this.neutral = roll;
    if (!this.enabled) {
      this.env.clearTimeout(this.timer);
      this.enabled = true;
      this.state = 'on';
      this.onChange(this.state);
    }
  }
  update(dt) {
    if (!this.enabled) return 0;
    if (this.env.performance.now() - this.lastSample > 1500) {
      this.stop('unavailable');
      return 0;
    }
    const target =
      this.latest === null || this.neutral === null
        ? 0
        : steeringFromRoll(this.latest, this.neutral);
    this.value += (target - this.value) * (1 - Math.exp(-dt / 0.11));
    return this.value;
  }
}
