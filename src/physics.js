// Standalone, engine-free approximation in SI units. Positive y points down.
export const PHYSICS = Object.freeze({
  width: 10, height: 10, gravity: 9.81, density: 7000,
  airDensity: 1.18, airViscosity: 1.85e-5, surfaceTension: 1.75,
  furnaceK: 1840, ambientK: 295, heatCapacity: 820,
  solidusK: 1420, liquidusK: 1530, latentHeat: 247000,
  capacityKg: 0.26, ground: 0.88, fixedStep: 1 / 120,
});
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Deliberate gameplay assistance, separate from physical material parameters.
export const ASSIST = Object.freeze({
  scoopRate: 3.0,
  minimumFill: 0.10,
  minimumLift: 0.035,
  hitRadius: 0.095,
  minimumStrikeSpeed: 0.25,
  airborneTimeScale: 0.65,
});
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ ...ASSIST, label: '轻松体验', minimumReleaseSpeed: 0 }),
  realistic: Object.freeze({
    label: '拟真挑战', scoopRate: 1.9, minimumFill: 0.16,
    minimumLift: 0.055, hitRadius: 0.050, minimumStrikeSpeed: 0.45,
    airborneTimeScale: 1, minimumReleaseSpeed: 0.8,
  }),
});
const radiusForMass = m => Math.cbrt(3 * m / (4 * Math.PI * PHYSICS.density));
export class Random {
  constructor(seed = 42) { this.state = seed >>> 0 || 1; }
  next() {
    let s = this.state; s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.state = s >>> 0; return this.state / 4294967296;
  }
  normal() {
    return Math.sqrt(-2 * Math.log(Math.max(1e-8, this.next()))) * Math.cos(2 * Math.PI * this.next());
  }
}
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function integrateParticle(p, dt, wind) {
  const c = PHYSICS, ux = p.vx - wind, speed = Math.hypot(ux, p.vy);
  const re = c.airDensity * speed * 2 * p.radius / c.airViscosity;
  const cd = re < 1000 ? 24 / Math.max(re, 0.001) * (1 + 0.15 * re ** 0.687) : 0.44;
  const rate = 0.5 * c.airDensity * cd * Math.PI * p.radius ** 2 * speed / p.mass;
  const damping = 1 / (1 + rate * dt);
  p.vx = wind + ux * damping;
  p.vy = (p.vy + c.gravity * dt) * damping;
  p.x += p.vx * dt / c.width; p.y += p.vy * dt / c.height;
  const area = 4 * Math.PI * p.radius ** 2;
  const phaseCp = p.temperature >= c.solidusK && p.temperature <= c.liquidusK
    ? c.latentHeat / (c.liquidusK - c.solidusK) : 0;
  const loss = area * (65 * (p.temperature - c.ambientK) +
    0.78 * 5.670374419e-8 * (p.temperature ** 4 - c.ambientK ** 4));
  // No uncalibrated oxidation heat source. Glow here is incandescence.
  p.temperature = Math.max(c.ambientK, p.temperature - loss * dt / (p.mass * (c.heatCapacity + phaseCp)));
  p.age += dt;
}

export class Game {
  constructor(seed = 42) {
    this.difficulty = 'easy';
    this.random = new Random(seed);
    this.mode = 'menu'; this.phase = 'ready'; this.elapsed = 0;
    this.particles = []; this.molten = null; this.fill = 0;
    this.score = 0; this.strikes = 0; this.bestHeight = 0;
    this.wind = 0.25; this.accumulator = 0; this.cooldown = 0;
    this.pointer = null; this.tip = { x: 0.36, y: 0.80 };
    this.power = 0; this.lastPower = 0; this.flash = 0;
    this.lastHit = null; this.eventId = 0; this.message = '';
    this.duration = 60; this.remaining = 60; this.practice = false;
    this.attemptAge = 0; this.emissionMass = 0;
  }
  start({ practice = false, demo = false, seed = Date.now(), difficulty = 'easy' } = {}) {
    this.difficulty = Object.hasOwn(DIFFICULTIES, difficulty) ? difficulty : 'easy';
    this.random = new Random(seed);
    this.mode = demo ? 'demo' : 'playing'; this.phase = 'ready';
    this.particles.length = 0; this.molten = null; this.fill = 0;
    this.elapsed = 0; this.remaining = this.duration; this.score = 0;
    this.strikes = 0; this.bestHeight = 0; this.accumulator = 0;
    this.pointer = null; this.cooldown = 0; this.flash = 0;
    this.power = 0; this.lastPower = 0; this.lastHit = null; this.message = '';
    this.practice = practice; this.demoClock = 0.2; this.wind = 0.25;
  }
  get furnace() { return { x: 0.30, y: 0.82 }; }
  get settings() { return DIFFICULTIES[this.difficulty]; }
  pointerDown(point) {
    if (this.mode !== 'playing' || this.pointer) return false;
    if (this.phase === 'ready') {
      if (Math.hypot(point.x - this.furnace.x, point.y - this.furnace.y) > 0.11) {
        this.message = '先按住左下方的炉口'; return false;
      }
      this.phase = 'scooping'; this.fill = 0; this.attemptAge = 0;
    } else if (this.phase !== 'tossed') return false;
    this.pointer = { ...point }; this.tip = { ...point }; this.message = '';
    return true;
  }
  pointerMove(point, velocity, previous = this.pointer) {
    if (!this.pointer) return false;
    this.tip = { ...point };
    let hit = false;
    if (this.phase === 'tossed' && this.molten) {
      this.power = clamp(Math.hypot(velocity.x, velocity.y) / 14, 0, 1);
      const d = distanceToSegment(this.molten, previous, point);
      // Deliberately enlarged interaction radius, independent of window pixels.
      if (d <= this.settings.hitRadius && Math.hypot(velocity.x, velocity.y) > this.settings.minimumStrikeSpeed) {
        this.impact(velocity, clamp(1 - d / (this.settings.hitRadius * 1.5), 0.4, 1)); hit = true;
      }
    }
    this.pointer = { ...point };
    return hit;
  }
  pointerUp(point, velocity) {
    if (!this.pointer) return;
    if (this.phase === 'scooping') {
      if (this.fill < this.settings.minimumFill) {
        this.message = '铁水还没舀足 · 在炉口停留一会儿'; this.resetAction();
      } else if (this.difficulty === 'realistic' && velocity.y > -this.settings.minimumReleaseSpeed) {
        this.message = '拟真挑战：向上移动时松手，才能抛出'; this.resetAction();
      } else if (point.y > this.furnace.y - this.settings.minimumLift) {
        this.message = '向上提一点，再松开即可'; this.resetAction();
      } else {
        const mass = PHYSICS.capacityKg * this.fill;
        this.molten = {
          // Keep the release in the reachable stage region. A minimum launch
          // impulse tolerates a pause before release; it is not measured force.
          x: this.difficulty === 'easy' ? clamp(point.x, 0.20, 0.80) : clamp(point.x, 0.08, 0.92),
          y: this.difficulty === 'easy' ? clamp(point.y, 0.54, 0.76) : clamp(point.y, 0.15, 0.81),
          vx: this.difficulty === 'easy' ? clamp(velocity.x * 0.35, -1.5, 1.5) : clamp(velocity.x * 0.65, -5, 5),
          vy: this.difficulty === 'easy' ? clamp(velocity.y * 0.72, -7, -5.2) : clamp(velocity.y * 0.72, -9, -0.1),
          mass, radius: radiusForMass(mass), temperature: PHYSICS.furnaceK, age: 0,
        };
        this.phase = 'tossed'; this.fill = 0; this.message = '松开后再划一次 · 向上穿过亮点';
      }
    } else if (this.phase === 'tossed') this.message = '未击中 · 再划过铁水亮点';
    this.pointer = null;
  }
  cancelPointer() {
    this.pointer = null; this.power = 0;
    if (this.phase === 'scooping') { this.message = '已取消舀取'; this.resetAction(); }
  }
  resetAction() { this.phase = 'ready'; this.fill = 0; this.molten = null; this.pointer = null; }

  impact(velocity, contact = 1) {
    if (!this.molten) return;
    const g = this.molten, c = PHYSICS;
    let vx = velocity.x, vy = velocity.y;
    const tipSpeed = Math.hypot(vx, vy);
    const cap = Math.min(1, 22 / Math.max(tipSpeed, 1e-6)); vx *= cap; vy *= cap;
    const rvx = vx - g.vx, rvy = vy - g.vy, rel = Math.hypot(rvx, rvy);
    const reducedMass = 1.8 * g.mass / (1.8 + g.mass);
    const transfer = 0.72 * contact;
    const impulse = 1.12 * reducedMass * rel * transfer;
    const impactEnergy = 0.5 * reducedMass * rel * rel * transfer;
    const directionLength = Math.max(Math.hypot(vx, vy), 1e-6);
    const power = clamp(impactEnergy / 22, 0, 1);
    const weber = c.density * (rel * 0.24) ** 2 * g.radius * 2 / c.surfaceTension;
    const count = weber < 30 ? 1 : Math.round(90 + power * 850);
    const weights = Array.from({ length: count }, () => Math.exp(clamp(this.random.normal(), -2.5, 2.5) * 1.25));
    const total = weights.reduce((a, b) => a + b, 0);
    const centerX = g.vx + vx / directionLength * impulse / g.mass;
    const centerY = g.vy + vy / directionLength * impulse / g.mass;
    const spread = 0.18 + power * 0.6 + (1 - contact) * 0.45;
    const fragments = weights.map(weight => {
      const mass = g.mass * weight / total;
      const side = clamp(this.random.normal(), -2.4, 2.4) * rel * spread * 0.32;
      const axial = this.random.normal() * rel * 0.14;
      return { x: g.x, y: g.y, vx: centerX - vy / directionLength * side + vx / directionLength * axial,
        vy: centerY + vx / directionLength * side + vy / directionLength * axial,
        radius: radiusForMass(mass), mass, temperature: g.temperature,
        age: 0, bounce: 0, originY: g.y, groundAge: 0 };
    });
    const surfaceCost = Math.max(0, 4 * Math.PI * c.surfaceTension *
      (fragments.reduce((s, p) => s + p.radius ** 2, 0) - g.radius ** 2));
    const budget = 0.5 * g.mass * (g.vx ** 2 + g.vy ** 2) + impactEnergy * 0.70;
    const raw = fragments.reduce((s, p) => s + 0.5 * p.mass * (p.vx ** 2 + p.vy ** 2), 0);
    const scale = Math.min(1, Math.sqrt(Math.max(0, budget - surfaceCost) / Math.max(raw, 1e-9)));
    for (const p of fragments) { p.vx *= scale; p.vy *= scale; }
    const up = -vy / directionLength;
    const shape = power < 0.12 ? '低星散' : up > 0.86 && power < 0.65 ? '冲天束' :
      up > 0.35 ? '金雨开' : vy > 0 ? '落火瀑' : '侧金扇';
    this.lastHit = { power, shape, impulse, impactEnergy, weber, count, mass: g.mass,
      kineticEnergy: raw * scale * scale, budget, tipSpeed: Math.min(tipSpeed, 22) };
    this.particles.push(...fragments);
    this.emissionMass = fragments.reduce((sum, p) => sum + p.mass, 0);
    this.lastPower = power; this.power = power; this.flash = 1; this.eventId++;
    this.strikes++; this.score += Math.round(35 + power * 160 + contact * 45);
    this.message = `${shape} · ${Math.round(power * 100)}% 力度`;
    this.molten = null; this.phase = 'bloom'; this.cooldown = 1.15;
  }
  demoBurst() {
    const mass = 0.20;
    this.molten = { x: 0.48, y: 0.72, vx: 0, vy: -1.2, mass,
      radius: radiusForMass(mass), temperature: PHYSICS.furnaceK, age: 0 };
    this.impact({ x: (this.random.next() - 0.5) * 6, y: -12 - this.random.next() * 6 });
  }
  update(dt) {
    this.accumulator += clamp(dt, 0, 0.05);
    while (this.accumulator >= PHYSICS.fixedStep) {
      this.step(PHYSICS.fixedStep); this.accumulator -= PHYSICS.fixedStep;
    }
  }
  step(dt) {
    if (this.mode === 'menu' || this.mode === 'result') return;
    this.elapsed += dt; this.flash = Math.max(0, this.flash - dt * 4);
    if (!this.pointer) this.power = Math.max(0, this.power - dt * 0.4);
    if (this.mode === 'demo') {
      this.demoClock -= dt;
      if (this.demoClock <= 0) { this.demoBurst(); this.demoClock = 3.5; }
    } else if (!this.practice) {
      this.remaining = Math.max(0, this.duration - this.elapsed);
      if (this.remaining <= 0) {
        this.mode = 'result'; this.cancelPointer(); return;
      }
    }
    if (this.phase === 'scooping' && this.pointer) {
      const d = Math.hypot((this.pointer.x - this.furnace.x) / 0.10,
        (this.pointer.y - this.furnace.y) / 0.07);
      if (d < 1) this.fill = Math.min(1, this.fill + dt * this.settings.scoopRate * (1 - d * 0.65));
      this.attemptAge += dt;
    }
    if (this.molten) {
      // Slow only the waiting target. Round time and emitted sparks stay real-time.
      integrateParticle(this.molten, dt * this.settings.airborneTimeScale, this.wind);
      if (this.molten.y > PHYSICS.ground || this.molten.x < -0.1 ||
        this.molten.x > 1.1 || this.molten.age > 4) {
        this.resetAction(); this.message = '铁水落地了 · 上抛后及时向上击打';
      }
    }
    let write = 0;
    for (const p of this.particles) {
      integrateParticle(p, dt, this.wind);
      this.bestHeight = Math.max(this.bestHeight, (p.originY - p.y) * PHYSICS.height);
      if (p.y >= PHYSICS.ground) {
        p.y = PHYSICS.ground;
        if (!p.bounce && p.vy > 0.5) { p.vy = -p.vy * 0.13; p.vx *= 0.55; p.bounce = 1; }
        else { p.vy = 0; p.vx *= Math.exp(-dt * 7); p.groundAge += dt; }
      }
      if (p.temperature > 700 && p.age < 10 && p.groundAge < 0.85 && p.x > -0.15 && p.x < 1.15)
        this.particles[write++] = p;
    }
    this.particles.length = write;
    if (this.phase === 'bloom') {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.resetAction();
    }
  }
}
