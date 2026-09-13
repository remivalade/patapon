// Tunable arcade handling, expressed in seconds rather than frames.
export const DRIVE = {
  maxSpeed: 48,
  reverseSpeed: 10,
  acceleration: 30,
  coastDeceleration: 55,
  brakeDeceleration: 100,
  reverseAcceleration: 20,
};
export function approach(value, target, amount) {
  return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
}
export function radialInput(x, y, deadZone = 0.12) {
  const r = Math.hypot(x, y);
  if (r <= deadZone) return { x: 0, y: 0 };
  const m = Math.pow(Math.min(1, (r - deadZone) / (1 - deadZone)), 1.3);
  return { x: (x / r) * m, y: (y / r) * m };
}
export class SpeederHandling {
  constructor() {
    this.reset();
  }
  reset() {
    this.speed = 0;
    this.acceleration = 0;
    this.bank = 0;
  }
  update(throttle, steering, brake, dt) {
    const previous = this.speed;
    let target = 0,
      rate = DRIVE.coastDeceleration;
    if (brake) {
      target = 0;
      rate = DRIVE.brakeDeceleration;
    } else if (throttle > 0.01) {
      target = throttle * DRIVE.maxSpeed;
      rate = this.speed < 0 ? DRIVE.brakeDeceleration : DRIVE.acceleration;
    } else if (throttle < -0.01) {
      if (this.speed > 0.05) {
        target = 0;
        rate = DRIVE.brakeDeceleration;
      } else {
        target = throttle * DRIVE.reverseSpeed;
        rate = DRIVE.reverseAcceleration;
      }
    }
    this.speed = approach(this.speed, target, rate * dt);
    this.acceleration = (this.speed - previous) / Math.max(0.001, dt);
    const ratio = Math.min(1, Math.abs(this.speed) / DRIVE.maxSpeed);
    this.bank = approach(this.bank, -steering * 0.2 * ratio, dt * 0.65);
    const turnRate = (1.9 - 0.85 * ratio) * steering * (this.speed < -0.1 ? -1 : 1);
    return { speed: this.speed, turn: -turnRate * dt, bank: this.bank };
  }
}
export class WalkHandling {
  constructor() {
    this.reset();
  }
  reset() {
    this.side = 0;
    this.ahead = 0;
  }
  update(side, ahead, dt) {
    const moving = Math.hypot(side, ahead) > 0.01,
      alpha = 1 - Math.exp(-dt / (moving ? 0.075 : 0.04));
    this.side += (side - this.side) * alpha;
    this.ahead += (ahead - this.ahead) * alpha;
    if (!moving && Math.hypot(this.side, this.ahead) < 0.006) this.reset();
    return { side: this.side, ahead: this.ahead };
  }
}
