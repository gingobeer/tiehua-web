import { PHYSICS, clamp } from './physics.js';

// Time-window velocity sampling avoids letting an old fast motion power a
// later slow strike. All coordinates refer to the canvas, never screen pixels.
export class GestureSampler {
  constructor() { this.samples = []; }
  reset(point, time) { this.samples = [{ ...point, time }]; }
  push(point, time) {
    this.samples.push({ ...point, time });
    while (this.samples.length > 2 && this.samples[1].time < time - 65) this.samples.shift();
    if (this.samples.length > 32) this.samples.shift();
  }
  velocity(time) {
    if (this.samples.length < 2) return { x: 0, y: 0 };
    const last = this.samples[this.samples.length - 1];
    if (time - last.time > 100) return { x: 0, y: 0 };
    const first = this.samples[0];
    const dt = Math.max((Math.max(time, last.time) - first.time) / 1000, 1 / 240);
    let x = (last.x - first.x) * PHYSICS.width / dt;
    let y = (last.y - first.y) * PHYSICS.height / dt;
    const factor = Math.min(1, 22 / Math.max(Math.hypot(x, y), .001));
    x *= factor; y *= factor;
    return { x, y };
  }
}

export class PointerInput {
  constructor(canvas, game, { enabled, onGesture, onSoundUnlock }) {
    this.canvas = canvas; this.game = game; this.enabled = enabled;
    this.onGesture = onGesture; this.onSoundUnlock = onSoundUnlock;
    this.sampler = new GestureSampler(); this.pointerId = null; this.previous = null;
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => { if (e.pointerId === this.pointerId) this.cancel(); });
    canvas.addEventListener('lostpointercapture', e => { if (e.pointerId === this.pointerId) this.cancel(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, -.1, 1.1),
      y: clamp((e.clientY - r.top) / r.height, -.1, 1.1) };
  }
  down(e) {
    if (!this.enabled() || this.pointerId !== null || e.button !== 0) return;
    const p = this.point(e);
    if (!this.game.pointerDown(p)) return;
    e.preventDefault(); this.onSoundUnlock(); this.canvas.focus({ preventScroll: true });
    this.pointerId = e.pointerId; this.previous = p;
    this.sampler.reset(p, e.timeStamp);
    this.canvas.setPointerCapture(e.pointerId);
  }
  move(e) {
    if (e.pointerId !== this.pointerId || !this.enabled()) return;
    const p = this.point(e);
    this.sampler.push(p, e.timeStamp);
    this.game.pointerMove(p, this.sampler.velocity(e.timeStamp), this.previous);
    this.previous = p; this.onGesture();
  }
  up(e) {
    if (e.pointerId !== this.pointerId) return;
    if (this.enabled()) {
      const point = this.point(e);
      // Touch-end can arrive one display frame late without movement. Do not
      // replace the last motion window with two identical release positions.
      if (!this.previous || Math.hypot(point.x - this.previous.x, point.y - this.previous.y) > .0001)
        this.move(e);
      const velocity = this.sampler.velocity(e.timeStamp);
      this.lastRelease = { point: this.point(e), velocity, samples: [...this.sampler.samples] };
      this.game.pointerUp(this.point(e), velocity);
    } else this.game.cancelPointer();
    const id = this.pointerId; this.pointerId = null;
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.onGesture();
  }
  cancel() {
    const id = this.pointerId; this.pointerId = null;
    this.game.cancelPointer();
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }
}
