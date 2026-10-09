import { Game, DIFFICULTIES, clamp } from './physics.js';
import { Renderer } from './renderer.js';
import { PointerInput } from './input.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const game = new Game();
const ambient = new Game(71);
ambient.start({ demo: true, seed: 71 });
ambient.demoClock = 0;
for (let i = 0; i < 55; i++) ambient.update(1 / 60);
const renderer = new Renderer(canvas);
const sound = new Sound();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused = false, lastFrame = performance.now(), lastUi = 0, seenEvent = 0;
let lastAnnouncement = '', resultSaved = false, frameAverage = 1 / 60;
const ui = Object.fromEntries([
  'welcome', 'result', 'pause-overlay', 'stage-stats', 'demo-controls', 'action-hint',
  'score', 'time', 'time-caption', 'mode-label', 'power', 'power-label', 'power-bar',
  'load', 'height', 'speed', 'pause', 'hint-number', 'hint-title', 'hint-copy',
  'step-scoop', 'step-toss', 'step-strike',
].map(id => [id, $(id)]));
let selectedDifficulty = 'easy', usedKeyboardAssist = false;
try {
  const saved = localStorage.getItem('tiehua-web-difficulty');
  if (Object.hasOwn(DIFFICULTIES, saved)) selectedDifficulty = saved;
} catch {}
document.querySelector(`input[name="difficulty"][value="${selectedDifficulty}"]`).checked = true;
const bestKey = difficulty => `tiehua-web-best-v2-${difficulty}`;
function readBest(difficulty) {
  try { return Math.max(0, Number(localStorage.getItem(bestKey(difficulty))) || 0); } catch { return 0; }
}

function onHit() {
  if (game.eventId !== seenEvent) {
    seenEvent = game.eventId;
    sound.hit(game.lastHit?.power || 0);
  }
}
const input = new PointerInput(canvas, game, {
  enabled: () => !paused && !$('help-dialog').open && game.mode === 'playing',
  onGesture: onHit,
  onSoundUnlock: () => sound.unlock(),
});
function start(demo = false) {
  input.cancel(); paused = false; resultSaved = false;
  usedKeyboardAssist = false;
  game.start({ practice: $('practice').checked, demo, difficulty: selectedDifficulty });
  seenEvent = game.eventId; lastFrame = performance.now();
  sound.unlock(); updateUi();
  canvas.focus({ preventScroll: true });
  if (window.innerWidth <= 760) $('canvas-wrap').scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
}
function setPaused(value) {
  if (!['playing', 'demo'].includes(game.mode)) return;
  paused = value; input.cancel(); lastFrame = performance.now();
  if (paused) sound.suspend(); else sound.unlock();
  updateUi();
}
function announce(text) {
  if (text !== lastAnnouncement) { $('announcement').textContent = text; lastAnnouncement = text; }
}
function updateUi() {
  const isMenu = game.mode === 'menu', demo = game.mode === 'demo', result = game.mode === 'result';
  const playing = game.mode === 'playing';
  const shownDifficulty = playing || demo || result ? game.difficulty : selectedDifficulty;
  const realistic = shownDifficulty === 'realistic';
  const pending = (playing || demo) && selectedDifficulty !== game.difficulty;
  $('apply-difficulty').hidden = !pending;
  $('difficulty-notice').textContent = pending
    ? '点击上方按钮才会切换，当前炉成绩将清零；选回原档可取消。'
    : '拟真仅减少辅助；两档最高分分开保存。';
  $('difficulty-description').textContent = selectedDifficulty === 'easy'
    ? '辅助上抛 · 大范围命中 · 待击慢速'
    : '移动中松手 · 精确命中 · 正常飞行速度';
  $('step-toss').querySelector('p').innerHTML = realistic
    ? '向上提勺，移动中松开。<br>不再提供最低上抛速度。'
    : '向上提一点，松开即可。<br>稍停再松手，也能抛起来。';
  $('step-strike').querySelector('p').innerHTML = realistic
    ? '重新按下，划过较小虚线圈。<br>没有待击慢速，注意击打时机。'
    : '再按下，向上划过虚线圈。<br>圈内都能击中，不必瞄准亮点。';
  ui.welcome.hidden = !isMenu; ui.result.hidden = !result;
  ui['pause-overlay'].hidden = !paused;
  ui['stage-stats'].hidden = !playing && !result;
  ui['demo-controls'].hidden = !demo || paused;
  ui['action-hint'].hidden = !playing || paused;
  ui.pause.disabled = !playing && !demo;
  ui.pause.innerHTML = paused ? '继续 <kbd>P</kbd>' : '暂停 <kbd>P</kbd>';
  ui['mode-label'].textContent = paused ? '已暂停' : demo ? '金雨演示中' :
    isMenu ? '静候开炉' : result ? '一炉花成' : game.practice ? '自由练习中' : '炉火正旺';
  ui['mode-label'].textContent += ` · ${DIFFICULTIES[shownDifficulty].label}`;
  ui.score.textContent = String(game.score).padStart(4, '0');
  ui.time.innerHTML = game.practice ? '∞' : `${Math.ceil(game.remaining)}<em>s</em>`;
  ui['time-caption'].textContent = game.practice ? '自由练习' : '剩余时间';
  const power = Math.round(clamp(game.pointer ? game.power : game.lastPower, 0, 1) * 100);
  ui.power.innerHTML = `${String(power).padStart(2, '0')}<span>%</span>`;
  ui['power-bar'].style.width = `${power}%`;
  ui['power-label'].textContent = game.lastHit?.shape || (game.pointer && game.phase === 'tossed' ? '感受这一击' : '等待挥击');
  ui.load.innerHTML = `${Math.round(game.fill * 100)}<span>%</span>`;
  ui.height.innerHTML = `${game.bestHeight.toFixed(1)}<span>m</span>`;
  ui.speed.innerHTML = `${game.lastHit ? game.lastHit.tipSpeed.toFixed(1) : '—'}<span>m/s</span>`;
  const phase = game.phase;
  ui['step-scoop'].classList.toggle('active', phase === 'ready' || phase === 'scooping' && game.fill < .4);
  ui['step-toss'].classList.toggle('active', phase === 'scooping' && game.fill >= .4);
  ui['step-strike'].classList.toggle('active', phase === 'tossed' || phase === 'bloom');
  let hint;
  if (phase === 'ready') hint = ['01', '按住左下炉口，舀取铁水', game.message || (realistic ? '停留约半秒，再向上提勺' : '停留约 0.2 秒，再向上提一点')];
  else if (phase === 'scooping') hint = game.fill < .4
    ? ['01', `舀取中 · ${Math.round(game.fill * 100)}%`, '留在炉口，等勺里装满一些']
    : realistic ? ['02', '向上移动中松手，才能抛出', '无上抛辅助 · 松手前不要停住']
    : ['02', '向上提一点，松开即可抛出', '稍停再松开也可以 · 抛出后重新按下'];
  else if (phase === 'tossed') hint = ['03', '向上划过铁水周围的虚线圈', realistic ? '精确划过小圈 · 正常速度，无慢速辅助' : '圈内都能击中 · 不必精确碰到亮点'];
  else hint = ['✳', game.lastHit?.shape || '铁花成雨', `${game.lastHit?.impulse.toFixed(1) || '0'} N·s 冲量 · 等待下一勺`];
  ui['hint-number'].textContent = hint[0]; ui['hint-title'].textContent = hint[1]; ui['hint-copy'].textContent = hint[2];
  if (playing) announce(hint[1]);
  if (result && !resultSaved) {
    resultSaved = true;
    let bestScore = readBest(game.difficulty);
    if (!game.practice && !usedKeyboardAssist) {
      bestScore = Math.max(bestScore, game.score);
      try { localStorage.setItem(bestKey(game.difficulty), String(bestScore)); } catch {}
    }
    $('result-summary').textContent = `击打 ${game.strikes} 次 · 最高花高 ${game.bestHeight.toFixed(1)} 米`;
    $('result-score').textContent = String(game.score);
    $('best-score').textContent = `${game.settings.label}最佳 · ${bestScore} 分${usedKeyboardAssist ? '（本炉使用键盘辅助，不入纪录）' : ''}`;
    announce(`一炉花成，得分 ${game.score}`);
  }
}
$('start').addEventListener('click', () => start());
$('again').addEventListener('click', () => start());
$('demo-play').addEventListener('click', () => start());
$('watch').addEventListener('click', () => start(true));
$('pause').addEventListener('click', () => setPaused(!paused));
$('resume').addEventListener('click', () => setPaused(false));
document.querySelectorAll('input[name="difficulty"]').forEach(radio => {
  radio.addEventListener('change', () => {
    selectedDifficulty = radio.value;
    try { localStorage.setItem('tiehua-web-difficulty', selectedDifficulty); } catch {}
    updateUi();
  });
});
$('apply-difficulty').addEventListener('click', () => start());
$('sound').addEventListener('click', async () => {
  sound.enabled = !sound.enabled;
  if (sound.enabled) await sound.unlock(); else sound.suspend();
  $('sound').textContent = sound.enabled ? '声 ON' : '声 OFF';
  $('sound').setAttribute('aria-pressed', String(sound.enabled));
  $('sound').setAttribute('aria-label', sound.enabled ? '关闭声音' : '开启声音');
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.querySelector('.stage-card').requestFullscreen)
      await document.querySelector('.stage-card').requestFullscreen();
    else { $('fullscreen').textContent = '当前浏览器不支持全屏'; }
  } catch { $('fullscreen').textContent = '暂时无法全屏'; }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').textContent = document.fullscreenElement ? '退出全屏 ⛶' : '全屏 ⛶';
  input.cancel(); renderer.resize();
});
$('help-button').addEventListener('click', () => {
  if (['playing', 'demo'].includes(game.mode)) setPaused(true);
  $('help-dialog').querySelector('p').textContent =
    '在“这一击的分量”面板选择难度。轻松体验：约0.2秒装载，上提后停住再松手也能抛出，大命中圈、待击慢速。拟真挑战：装载更慢，必须向上移动中松手，小命中圈、正常飞行速度。两档均需重新按下划过虚线圈击打。游戏中切换需点击“切换并重新开炉”，当前成绩会清零。键盘辅助回合不保存最高分。';
  $('help-dialog').showModal();
});
$('close-help').addEventListener('click', () => $('help-dialog').close());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { setPaused(true); sound.suspend(); }
  lastFrame = performance.now();
});
window.addEventListener('blur', () => setPaused(true));
window.addEventListener('keydown', e => {
  if (/INPUT|BUTTON|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || $('help-dialog').open || e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (['playing', 'demo'].includes(game.mode)) { e.preventDefault(); setPaused(!paused); }
    return;
  }
  if (game.mode !== 'playing' || paused || input.pointerId !== null) return;
  if (!['Digit1', 'Digit2', 'Digit3'].includes(e.code)) return;
  e.preventDefault(); sound.unlock();
  usedKeyboardAssist = true;
  // Explicit accessibility assists. Mouse/touch gameplay never calls these.
  if (e.code === 'Digit1' && game.phase === 'ready') {
    game.pointerDown(game.furnace); game.fill = .75;
  } else if (e.code === 'Digit2' && game.phase === 'scooping') {
    game.pointerUp({ x: .46, y: .67 }, { x: 1.8, y: -6.5 });
  } else if (e.code === 'Digit3' && game.phase === 'tossed') {
    game.impact({ x: 1.5, y: e.shiftKey ? -18 : -10 }); game.pointer = null;
  }
  onHit(); updateUi();
});
new ResizeObserver(() => { input.cancel(); renderer.resize(); }).observe($('canvas-wrap'));
renderer.resize(); updateUi();
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, .05); lastFrame = now;
  if (!document.hidden) {
    if (!paused) {
      game.update(dt);
      if (game.mode === 'menu' && !reducedMotion) ambient.update(dt);
      onHit();
    }
    frameAverage += (dt - frameAverage) * .025;
    renderer.lowQuality = frameAverage > .029;
    renderer.render(game.mode === 'menu' ? ambient : game, now / 1000, game.mode === 'menu');
    if (now - lastUi > 70) { updateUi(); lastUi = now; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only diagnostics, enabled only by an explicit local test query string.
if (new URLSearchParams(location.search).has('debug')) {
  window.__tiehua = {
    snapshot: () => ({ mode: game.mode, phase: game.phase, score: game.score, difficulty: game.difficulty,
      fill: game.fill, strikes: game.strikes, particles: game.particles.length,
      remaining: game.remaining, paused, molten: game.molten ? { ...game.molten } : null }),
    input: () => ({ release: input.lastRelease, message: game.message }),
  };
}
