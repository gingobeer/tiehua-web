import { PHYSICS, Random, clamp } from './physics.js';

const TAU = Math.PI * 2;
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('浏览器不支持 Canvas 2D，请更换现代浏览器。');
    this.background = document.createElement('canvas');
    this.width = 800; this.height = 800; this.dpr = 1; this.lowQuality = false;
  }
  resize() {
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, box.width); this.height = Math.max(1, box.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.background.width = this.canvas.width; this.background.height = this.canvas.height;
    this.paintBackground();
  }
  paintBackground() {
    const c = this.background.getContext('2d'), w = this.width, h = this.height;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#111c1a'); sky.addColorStop(.55, '#162019'); sky.addColorStop(1, '#11170f');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    const haze = c.createRadialGradient(w * .51, h * .65, 0, w * .51, h * .65, w * .65);
    haze.addColorStop(0, '#535b2d25'); haze.addColorStop(1, '#111c1900');
    c.fillStyle = haze; c.fillRect(0, 0, w, h);
    const r = new Random(893);
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(183,192,156,${.07 + r.next() * .24})`;
      c.beginPath(); c.arc(r.next() * w, r.next() * h * .63, .4 + r.next() * .5, 0, TAU); c.fill();
    }
    // A soft moon and imperfect landscape: all locally generated artwork.
    const moon = c.createRadialGradient(w * .84, h * .17, 0, w * .84, h * .17, w * .105);
    moon.addColorStop(0, '#d7d4a814'); moon.addColorStop(1, '#d7d4a800');
    c.fillStyle = moon; c.fillRect(w * .73, h * .05, w * .23, h * .25);
    c.fillStyle = '#c3c7a48a'; c.beginPath(); c.arc(w * .84, h * .17, w * .018, 0, TAU); c.fill();
    c.fillStyle = '#15201c'; c.beginPath(); c.arc(w * .847, h * .164, w * .0175, 0, TAU); c.fill();
    c.fillStyle = '#0c1511'; c.beginPath(); c.moveTo(0, h * .74);
    for (let i = 0; i <= 20; i++) c.lineTo(i / 20 * w, h * (.63 + r.next() * .06));
    c.lineTo(w, h); c.lineTo(0, h); c.fill();
    // Village roof silhouettes, subtle enough to leave the light in focus.
    for (const [x, y, size] of [[-.03, .71, .23], [.76, .73, .29], [.57, .72, .13]]) {
      const bx = x * w, by = y * h, bw = size * w;
      c.fillStyle = '#0a120f'; c.fillRect(bx + bw * .12, by, bw * .76, h * .13);
      c.beginPath(); c.moveTo(bx - bw * .07, by + h * .01);
      c.quadraticCurveTo(bx + bw * .2, by, bx + bw * .5, by - h * .06);
      c.quadraticCurveTo(bx + bw * .8, by, bx + bw * 1.07, by + h * .01);
      c.lineTo(bx + bw * .88, by + h * .017); c.lineTo(bx + bw * .12, by + h * .017); c.fill();
      c.fillStyle = '#bc794623';
      for (let j = 0; j < 3; j++) c.fillRect(bx + bw * (.26 + j * .18), by + h * .036, bw * .055, h * .025);
    }
    c.fillStyle = '#11150e'; c.fillRect(0, h * .87, w, h * .13);
    c.strokeStyle = '#7a6f3b19'; c.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const yy = h * (.883 + i * i * .004);
      c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy + h * .002); c.stroke();
    }
    for (let i = 0; i < 16; i++) {
      c.beginPath(); c.moveTo(w * .5 + (i - 8) * w * .043, h * .87);
      c.lineTo(w * .5 + (i - 8) * w * .12, h); c.stroke();
    }
    for (let i = 0; i < 1200; i++) {
      c.fillStyle = `rgba(190,182,131,${r.next() * .027})`;
      c.fillRect(r.next() * w, r.next() * h, 1, 1);
    }
  }
  glow(x, y, radius, color, alpha = 1) {
    const c = this.ctx;
    const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${color},${alpha})`);
    gradient.addColorStop(.25, `rgba(${color},${alpha * .3})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = gradient; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  render(model, time, ambient = false) {
    const c = this.ctx, w = this.width, h = this.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.background, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const activity = clamp(model.particles.length / 900, 0, 1);
    c.save(); c.translate(w * .49, h * .88); c.scale(1, .16);
    this.glow(0, 0, w * (.22 + activity * .14), '226,116,33', .14 + activity * .10); c.restore();
    this.furnace(model, time, ambient);
    this.performer(model, activity);
    this.particles(model.particles, ambient);
    this.tools(model);
    if (model.mode === 'playing') this.indicators(model, time);
  }
  furnace(model, time, ambient) {
    const c = this.ctx, w = this.width, h = this.height;
    const x = model.furnace.x * w, y = model.furnace.y * h;
    this.glow(x, y, w * .11, '240,107,30', .17);
    c.fillStyle = '#22271a'; c.beginPath();
    c.moveTo(x - w * .049, y); c.lineTo(x + w * .049, y);
    c.lineTo(x + w * .032, y + h * .058); c.lineTo(x - w * .032, y + h * .058); c.closePath(); c.fill();
    c.strokeStyle = '#827242'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(x, y, w * .049, h * .012, 0, 0, TAU); c.stroke();
    c.fillStyle = '#e99b42'; c.beginPath(); c.ellipse(x, y, w * .040, h * .008, 0, 0, TAU); c.fill();
    c.fillStyle = '#ffe0a1'; c.beginPath(); c.ellipse(x - w * .007, y - h * .001, w * .024, h * .004, 0, 0, TAU); c.fill();
    c.strokeStyle = '#645934'; c.beginPath(); c.moveTo(x - w * .034, y + h * .04); c.lineTo(x + w * .034, y + h * .04); c.stroke();
    if (ambient) return;
    if (model.phase === 'ready' || model.phase === 'scooping') {
      c.strokeStyle = '#d4ad6477'; c.lineWidth = 1; c.setLineDash([2, 5]);
      c.beginPath(); c.ellipse(x, y, w * (.069 + Math.sin(time * 2) * .003), h * .03, 0, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.font = `${Math.max(9, w * .014)}px "PingFang SC",sans-serif`;
      c.textAlign = 'center'; c.fillStyle = '#d5c69e'; c.fillText('按住舀取', x, y - h * .049);
    }
  }
  performer(model, activity) {
    const c = this.ctx, w = this.width, h = this.height;
    const x = w * .445, y = h * .80;
    const tilt = model.phase === 'scooping' ? -.018 * w : 0;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#050c09'; c.lineWidth = Math.max(5, w * .014);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - w * .014, y + h * .046); c.lineTo(x - w * .042, h * .876);
    c.moveTo(x - w * .012, y + h * .044); c.lineTo(x + w * .030, h * .876); c.stroke();
    c.lineWidth = w * .019; c.beginPath(); c.moveTo(x + tilt, y - h * .045); c.lineTo(x, y + h * .019); c.stroke();
    c.fillStyle = '#050c09'; c.beginPath(); c.arc(x + tilt, y - h * .064, w * .011, 0, TAU); c.fill();
    c.fillStyle = '#2e3020'; c.beginPath(); c.ellipse(x + tilt, y - h * .071, w * .023, h * .004, -.13, 0, TAU); c.fill();
    const target = model.pointer && model.phase !== 'bloom' ? model.tip : { x: .40, y: .785 };
    const tx = clamp(target.x, .34, .51) * w, ty = clamp(target.y, .71, .81) * h;
    c.strokeStyle = '#080f0a'; c.lineWidth = w * .008;
    c.beginPath(); c.moveTo(x + tilt, y - h * .032); c.lineTo(x - w * .009, y - h * .003); c.lineTo(tx, ty); c.stroke();
    c.strokeStyle = `rgba(208,136,65,${.18 + activity * .16})`; c.lineWidth = .8;
    c.beginPath(); c.moveTo(x + tilt - w * .010, y - h * .043); c.lineTo(x - w * .012, y + h * .012); c.stroke();
    c.restore();
  }
  particles(particles, ambient) {
    const c = this.ctx, w = this.width, h = this.height;
    const buckets = Array.from({ length: 12 }, () => []);
    for (let i = 0; i < particles.length; i++) {
      if (this.lowQuality && i % 2) continue;
      const p = particles[i];
      const heat = clamp((p.temperature - 700) / 1140, 0, 1);
      if (heat < .05) continue;
      const band = heat > .78 ? 2 : heat > .42 ? 1 : 0;
      const wide = p.radius > .0022 ? 1 : 0;
      const bright = heat > .6 ? 1 : 0;
      buckets[band * 4 + wide * 2 + bright].push(p);
    }
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const colors = [[211, 68, 17], [255, 156, 42], [255, 223, 153]];
    for (let b = 0; b < buckets.length; b++) {
      if (!buckets[b].length) continue;
      const color = colors[Math.floor(b / 4)], thick = Math.floor(b / 2) % 2;
      c.beginPath();
      for (const p of buckets[b]) {
        const exposure = Math.min(p.age, ambient ? .028 : .022);
        let dx = p.vx * exposure / PHYSICS.width * w;
        let dy = p.vy * exposure / PHYSICS.height * h;
        if (Math.hypot(dx, dy) < .45) dx = .45;
        c.moveTo(p.x * w - dx, p.y * h - dy); c.lineTo(p.x * w, p.y * h);
      }
      const alpha = b % 2 ? .85 : .35;
      if (!this.lowQuality) {
        c.lineWidth = thick ? 4 : 2.5;
        c.strokeStyle = `rgba(235,115,29,${alpha * .10})`; c.stroke();
      }
      c.lineWidth = thick ? 1.6 : .85;
      c.strokeStyle = `rgba(${color.join(',')},${ambient ? alpha * .8 : alpha})`; c.stroke();
    }
    c.restore();
  }
  tools(model) {
    const c = this.ctx, w = this.width, h = this.height;
    if (model.phase === 'scooping') {
      const x = model.tip.x * w, y = model.tip.y * h;
      c.strokeStyle = '#9b7945'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x + w * .12, y + h * .025); c.lineTo(x, y); c.stroke();
      c.fillStyle = '#383527'; c.beginPath(); c.ellipse(x, y, w * .027, h * .010, .08, 0, TAU); c.fill();
      if (model.fill > 0) {
        c.fillStyle = '#ffbe65'; c.beginPath(); c.ellipse(x, y, w * .023 * model.fill, h * .006, 0, 0, TAU); c.fill();
        this.glow(x, y, w * .045, '255,131,34', .15);
      }
      c.strokeStyle = '#e5bd78'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, w * .043, -Math.PI / 2, -Math.PI / 2 + model.fill * TAU); c.stroke();
    } else if (model.pointer && model.phase === 'tossed') {
      const x = model.tip.x * w, y = model.tip.y * h;
      c.strokeStyle = '#8d6a3d'; c.lineWidth = Math.max(4, w * .008); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x + w * .045, y + h * .13); c.lineTo(x, y); c.stroke();
      c.strokeStyle = '#d4a35d'; c.lineWidth = 1; c.stroke();
    }
    if (model.molten) {
      const p = model.molten, x = p.x * w, y = p.y * h;
      this.glow(x, y, w * .07, '255,158,57', .27);
      c.fillStyle = '#ffdea0'; c.beginPath(); c.ellipse(x, y, Math.max(3, w * .007), Math.max(4, h * .009), -.2, 0, TAU); c.fill();
      c.strokeStyle = '#e5ca8677'; c.lineWidth = 1; c.setLineDash([3, 5]);
      c.beginPath(); c.ellipse(x, y, w * model.settings.hitRadius, h * model.settings.hitRadius, 0, 0, TAU); c.stroke(); c.setLineDash([]);
    }
  }
  indicators(model, time) {
    const c = this.ctx, w = this.width, h = this.height;
    if (model.molten && model.strikes < 3) {
      const x = model.molten.x * w, y = model.molten.y * h;
      c.save(); c.globalAlpha = .5 + .12 * Math.sin(time * 4);
      c.strokeStyle = '#e3bc79'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y + h * .11); c.lineTo(x, y + h * .045);
      c.moveTo(x - 4, y + h * .055); c.lineTo(x, y + h * .045); c.lineTo(x + 4, y + h * .055); c.stroke();
      c.restore();
    }
  }
}
