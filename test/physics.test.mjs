import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, PHYSICS, Random, integrateParticle } from '../src/physics.js';
import { GestureSampler, PointerInput } from '../src/input.js';

const tick = (g, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); };
function toss() {
  const g = new Game(); g.start({ practice: true, seed: 42 });
  assert.ok(g.pointerDown(g.furnace)); tick(g, .5);
  g.pointerUp({ x: .46, y: .65 }, { x: 0, y: -6 });
  return g;
}
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test('deterministic PRNG including zero seed', () => {
  for (const seed of [0, 42, 123]) {
    const a = new Random(seed), b = new Random(seed);
    for (let i = 0; i < 50; i++) near(a.next(), b.next());
  }
});
test('scoop requires furnace dwell; valid upward release creates airborne iron', () => {
  const g = new Game(); g.start();
  assert.equal(g.pointerDown({ x: .8, y: .2 }), false);
  g.pointerDown(g.furnace);
  g.pointerMove({ x: .8, y: .2 }, { x: 0, y: 0 });
  tick(g, 1); assert.equal(g.fill, 0);
  g.cancelPointer(); assert.equal(g.phase, 'ready');
  const ready = toss();
  assert.equal(ready.phase, 'tossed'); assert.ok(ready.molten.mass > .1);
});
test('release at furnace does not toss, lifted stationary release gets assistance', () => {
  const g = new Game(); g.start(); g.pointerDown(g.furnace); tick(g, .5);
  g.pointerUp(g.furnace, { x: 0, y: 0 });
  assert.equal(g.phase, 'ready'); assert.equal(g.molten, null);
  g.pointerDown(g.furnace); tick(g, .2);
  g.pointerUp({ x: .4, y: .6 }, { x: 0, y: 0 });
  assert.equal(g.phase, 'tossed'); assert.equal(g.molten.vy, -5.2);
});
test('segment contact strikes immediately, miss does not', () => {
  const g = toss();
  g.pointerDown({ x: .8, y: .7 });
  g.pointerMove({ x: .8, y: .4 }, { x: 0, y: -12 });
  assert.equal(g.strikes, 0); g.cancelPointer();
  const { x, y } = g.molten;
  g.pointerDown({ x, y: y + .08 });
  assert.ok(g.pointerMove({ x, y: y - .05 }, { x: 0, y: -12 }));
  assert.equal(g.strikes, 1); assert.equal(g.phase, 'bloom');
});
test('emission preserves mass and never exceeds impact energy budget', () => {
  for (const speed of [1, 4, 10, 18, 50]) for (const dir of [-1, 1]) {
    const g = toss(), mass = g.molten.mass;
    g.impact({ x: 2, y: dir * speed }, .7);
    near(g.particles.reduce((sum, p) => sum + p.mass, 0), mass);
    const energy = g.particles.reduce((sum, p) => sum + .5 * p.mass * (p.vx ** 2 + p.vy ** 2), 0);
    assert.ok(energy <= g.lastHit.budget + 1e-8);
    near(energy, g.lastHit.kineticEnergy, 1e-7);
  }
});
test('strong strokes have higher energy; downward strikes are not overridden', () => {
  const weak = toss(), strong = toss(), down = toss();
  weak.impact({ x: 0, y: -5 }); strong.impact({ x: 0, y: -18 });
  down.impact({ x: 0, y: 15 });
  assert.ok(strong.lastHit.kineticEnergy > weak.lastHit.kineticEnergy);
  assert.ok(down.particles.reduce((s, p) => s + p.mass * p.vy, 0) > 0);
});
test('fixed time step produces matching results at 30Hz and 60Hz', () => {
  const a = toss(), b = toss(); a.impact({ x: 1, y: -14 }); b.impact({ x: 1, y: -14 });
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  for (let i = 0; i < 30; i++) b.update(1 / 30);
  assert.equal(a.particles.length, b.particles.length);
  for (let i = 0; i < a.particles.length; i++) near(a.particles[i].y, b.particles[i].y);
});
test('smaller incandescent particles cool faster', () => {
  const p = r => ({ x: .5, y: .3, vx: 0, vy: 0, temperature: 1800,
    mass: 4 / 3 * Math.PI * r ** 3 * PHYSICS.density, radius: r, age: 0 });
  const a = p(.0002), b = p(.002);
  integrateParticle(a, 1 / 120, 0); integrateParticle(b, 1 / 120, 0);
  assert.ok(a.temperature < b.temperature);
});
test('timed rounds end, practice stays open, restart resets metrics', () => {
  const a = new Game(); a.start(); a.duration = .1; tick(a, .2);
  assert.equal(a.mode, 'result');
  a.start({ practice: true }); tick(a, 1);
  assert.equal(a.mode, 'playing'); assert.equal(a.score, 0); assert.equal(a.strikes, 0);
});
test('particles stay finite and are reclaimed; no delayed secondary explosion', () => {
  const g = toss(); g.impact({ x: 2, y: -17 }); let count = g.particles.length;
  for (let i = 0; i < 1200; i++) {
    g.update(1 / 120);
    assert.ok(g.particles.length <= count); count = g.particles.length;
    for (const p of g.particles) {
      assert.ok(Number.isFinite(p.x + p.y + p.temperature + p.vx + p.vy));
      assert.ok(p.temperature >= PHYSICS.ambientK);
    }
  }
  assert.equal(g.particles.length, 0);
});
test('gesture velocity uses recent motion and decays after holding still', () => {
  const g = new GestureSampler();
  g.reset({ x: .3, y: .8 }, 0);
  g.push({ x: .3, y: .7 }, 50);
  assert.ok(g.velocity(50).y < -10);
  near(g.velocity(200).y, 0);
  for (let t = 60; t < 300; t += 10) g.push({ x: .3, y: .7 }, t);
  near(g.velocity(300).y, 0);
});

test('touch-end without movement preserves recent release velocity, long holds stop it', () => {
  const canvas = {
    addEventListener() {}, focus() {}, setPointerCapture() {}, releasePointerCapture() {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  };
  for (const delay of [70, 180]) {
    const game = new Game(); game.start({ practice: true });
    const input = new PointerInput(canvas, game, {
      enabled: () => true, onGesture() {}, onSoundUnlock() {},
    });
    const event = (x, y, t) => ({ pointerId: 1, button: 0, clientX: x, clientY: y,
      timeStamp: t, preventDefault() {} });
    input.down(event(30, 82, 0)); tick(game, .5);
    input.move(event(34, 76, 510));
    input.move(event(38, 70, 535));
    input.move(event(42, 64, 560));
    input.up(event(42, 64, 560 + delay));
    assert.equal(game.phase, 'tossed');
    if (delay === 180) near(input.lastRelease.velocity.y, 0);
  }
});

test('short lift and relaxed aim work without automatically hitting far misses', () => {
  const g = new Game(); g.start({ practice: true });
  g.pointerDown(g.furnace); tick(g, .15);
  g.pointerUp({ x: .31, y: .78 }, { x: 0, y: 0 });
  assert.equal(g.phase, 'tossed');
  tick(g, 1.5);
  assert.ok(g.molten, 'slow-motion target should still be available after 1.5 seconds');
  const { x, y } = g.molten;
  g.pointerDown({ x: x + .12, y: y + .1 });
  assert.equal(g.pointerMove({ x: x + .12, y: y - .1 }, { x: 0, y: -3 }), false);
  g.cancelPointer();
  g.pointerDown({ x: x + .08, y: y + .1 });
  assert.equal(g.pointerMove({ x: x + .08, y: y - .1 }, { x: 0, y: -3 }), true);
  assert.equal(g.strikes, 1);
});

test('difficulty profiles differ in release, aim radius and flight time', () => {
  for (const difficulty of ['easy', 'realistic']) {
    const g = new Game(); g.start({ practice: true, difficulty });
    g.pointerDown(g.furnace); tick(g, .5);
    g.pointerUp({ x: .45, y: .65 }, { x: 0, y: 0 });
    assert.equal(g.phase, difficulty === 'easy' ? 'tossed' : 'ready');
    if (!g.molten) {
      g.pointerDown(g.furnace); tick(g, .5);
      g.pointerUp({ x: .45, y: .65 }, { x: 0, y: -6 });
    }
    const { x, y } = g.molten;
    g.pointerDown({ x: x + .08, y: y + .12 });
    assert.equal(g.pointerMove({ x: x + .08, y: y - .12 }, { x: 0, y: -4 }), difficulty === 'easy');
    g.cancelPointer();
    g.start({ difficulty, practice: true });
    g.pointerDown(g.furnace); tick(g, .5);
    g.pointerUp({ x: .45, y: .65 }, { x: 0, y: -6 });
    tick(g, .1);
    near(g.molten.age, difficulty === 'easy' ? .065 : .1);
  }
});

test('restarting with different difficulty resets current action and score', () => {
  const g = toss(); g.impact({ x: 0, y: -12 });
  assert.ok(g.score > 0);
  g.start({ difficulty: 'realistic' });
  assert.equal(g.difficulty, 'realistic');
  assert.equal(g.score, 0); assert.equal(g.particles.length, 0);
  assert.equal(g.phase, 'ready'); assert.equal(g.pointer, null);
  g.start({ difficulty: 'invalid' });
  assert.equal(g.difficulty, 'easy');
});
