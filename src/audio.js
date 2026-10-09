export class Sound {
  constructor() { this.enabled = false; this.context = null; }
  async unlock() {
    if (!this.enabled) return false;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { this.enabled = false; return false; }
    try {
      this.context ||= new Audio();
      if (this.context.state === 'suspended') await this.context.resume();
      return true;
    } catch { this.enabled = false; return false; }
  }
  hit(power) {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const duration = .7 + power * .5;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * (.75 * Math.exp(-t * 55) + .12 * Math.exp(-t * 4));
    }
    const noise = ctx.createBufferSource(); noise.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1700;
    const gain = ctx.createGain(); gain.gain.value = .2 + power * .1;
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start();
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    const tone = ctx.createOscillator(), env = ctx.createGain();
    tone.type = 'triangle'; tone.frequency.setValueAtTime(170, ctx.currentTime);
    tone.frequency.exponentialRampToValueAtTime(62, ctx.currentTime + .17);
    env.gain.setValueAtTime(.10, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .2);
    tone.connect(env).connect(ctx.destination); tone.start(); tone.stop(ctx.currentTime + .23);
    tone.onended = () => { tone.disconnect(); env.disconnect(); };
  }
  suspend() { this.context?.suspend().catch(() => {}); }
}
