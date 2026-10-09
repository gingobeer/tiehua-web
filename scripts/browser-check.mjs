import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true,
});
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const errors = [], checks = [];
async function open(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4180/?debug', { waitUntil: 'networkidle' });
  return { context, page };
}
const snap = page => page.evaluate(() => window.__tiehua.snapshot());
try {
  const { page } = await open({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.screenshot({ path: fileURLToPath(new URL('desktop-menu.png', artifacts)), fullPage: true });
  await page.locator('#practice').check();
  await page.locator('#start').click();
  await page.waitForTimeout(160);
  let box = await page.locator('#game').boundingBox();
  const pt = (x, y) => ({ x: box.x + x * box.width, y: box.y + y * box.height });
  let p = pt(.30, .82);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(430);
  assert.ok((await snap(page)).fill > .35);
  for (let i = 1; i <= 8; i++) {
    p = pt(.30 + .15 * i / 8, .82 - .19 * i / 8);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(13);
  }
  await page.mouse.up();
  let state = await snap(page);
  assert.equal(state.phase, 'tossed', JSON.stringify({state, input: await page.evaluate(() => window.__tiehua.input())}));
  checks.push('desktop pointer scoop and toss');
  // Track the actual target without changing the model.
  p = pt(state.molten.x, state.molten.y + .09);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 0; i < 6; i++) {
    state = await snap(page); if (!state.molten) break;
    p = pt(state.molten.x, state.molten.y - .035);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(12);
  }
  await page.mouse.up();
  assert.equal((await snap(page)).strikes, 1);
  checks.push('desktop continuous segment hit');
  await page.waitForTimeout(520);
  await page.screenshot({ path: fileURLToPath(new URL('desktop-strike.png', artifacts)), fullPage: true });
  await page.keyboard.press('p'); await page.waitForTimeout(100);
  assert.equal((await snap(page)).paused, true);
  const time = (await snap(page)).remaining;
  await page.waitForTimeout(350); assert.equal((await snap(page)).remaining, time);
  await page.locator('#resume').click();
  assert.equal((await snap(page)).paused, false);
  checks.push('pause and resume');
  await page.waitForTimeout(1300);
  await page.locator('#game').focus();
  await page.keyboard.press('1'); await page.keyboard.press('2'); await page.keyboard.press('Shift+3');
  assert.equal((await snap(page)).strikes, 2);
  checks.push('keyboard accessibility sequence');
  await page.locator('#help-button').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#help-dialog').evaluate(e => e.open), true);
  assert.equal((await snap(page)).paused, true);
  await page.locator('#close-help').click();
  await page.locator('#resume').click();
  checks.push('help dialog pauses gameplay');

  const { page: mobile, context: mobileContext } = await open({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  await mobile.screenshot({ path: fileURLToPath(new URL('mobile-menu.png', artifacts)), fullPage: true });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.locator('#practice').check();
  await mobile.locator('#start').tap();
  await mobile.waitForTimeout(650);
  const mb = await mobile.locator('#game').boundingBox();
  const touch = await mobileContext.newCDPSession(mobile);
  const tp = (x, y) => ({ x: mb.x + x * mb.width, y: mb.y + y * mb.height, id: 1 });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(.30, .82)] });
  await mobile.waitForTimeout(450);
  assert.ok((await snap(mobile)).fill > .3);
  for (let i = 1; i <= 8; i++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(.30 + .15 * i / 8, .82 - .18 * i / 8)] });
    await mobile.waitForTimeout(14);
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  state = await snap(mobile);
  assert.equal(state.phase, 'tossed', JSON.stringify({state, input: await mobile.evaluate(() => window.__tiehua.input())}));
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(state.molten.x, state.molten.y + .10)] });
  state = await snap(mobile);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(state.molten.x, state.molten.y - .06)] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await snap(mobile)).strikes, 1);
  await mobile.waitForTimeout(450);
  await mobile.screenshot({ path: fileURLToPath(new URL('mobile-strike.png', artifacts)), fullPage: true });
  checks.push('mobile touch scoop / toss / strike, no horizontal overflow');
  await mobile.waitForTimeout(1100);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(.30, .82)] });
  await mobile.waitForTimeout(100);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal((await snap(mobile)).phase, 'ready');
  checks.push('touch cancellation never triggers a hit');
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.locator('#watch').tap();
  await mobile.waitForTimeout(750);
  assert.equal((await snap(mobile)).mode, 'demo');
  assert.ok((await snap(mobile)).particles > 0);
  await mobile.locator('#demo-play').tap();
  assert.equal((await snap(mobile)).score, 0);
  checks.push('demo and new round are separate');
  await mobile.setViewportSize({ width: 320, height: 720 });
  await mobile.goto('http://127.0.0.1:4180/dist/?debug', { waitUntil: 'networkidle' });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.locator('#watch').tap();
  await mobile.waitForTimeout(650);
  assert.equal((await snap(mobile)).mode, 'demo');
  assert.ok((await snap(mobile)).particles > 0);
  checks.push('standalone dist build works at 320px width');
  await mobile.locator('input[name="difficulty"][value="realistic"]').check();
  assert.equal((await snap(mobile)).difficulty, 'easy');
  await mobile.locator('#apply-difficulty').click();
  assert.equal((await snap(mobile)).difficulty, 'realistic');
  assert.equal((await snap(mobile)).phase, 'ready');
  assert.equal((await snap(mobile)).score, 0);
  assert.match(await mobile.locator('#mode-label').textContent(), /拟真挑战/);
  await mobile.reload({ waitUntil: 'networkidle' });
  assert.equal(await mobile.locator('input[value="realistic"]').isChecked(), true);
  await mobile.locator('#start').tap();
  assert.equal((await snap(mobile)).difficulty, 'realistic');
  await mobile.locator('input[value="easy"]').check();
  assert.equal((await snap(mobile)).difficulty, 'realistic');
  await mobile.locator('#apply-difficulty').click();
  assert.equal((await snap(mobile)).difficulty, 'easy');
  checks.push('difficulty selection, explicit restart, persistence and switching back');
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-check.json', artifacts), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
}
