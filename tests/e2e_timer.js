// Kiểm thử đồng hồ trọng tài (timer.html) và phần cài bảng giờ trong tab Logo & trình chiếu (chế độ demo).
// Chạy: python3 -m http.server 8767 & node tests/e2e_timer.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8767';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ', m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.EVENTSTEM_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };' }));
  const errs = [];
  const page = async () => { const x = await ctx.newPage(); x.on('pageerror', e => errs.push(e.message)); x.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); x.on('dialog', d => d.accept()); return x; };
  const shot = async (x, n) => { if (process.env.SHOTS) await x.screenshot({ path: process.env.SHOTS + '/' + n + '.png' }); };
  const time = x => x.locator('#tmTime').innerText();
  const state = x => x.evaluate(() => EventSTEMTimer.state());

  // 1. Đồng hồ không gắn giải: bảng có sẵn, đồng hồ giả để chạy nhanh
  const t = await page();
  // đồng hồ giả đứng yên, chỉ chạy khi gọi runFor (bộ đếm vẽ lại mỗi 100 ms nên chờ thêm 50 ms)
  await t.clock.install({ time: new Date('2026-12-20T09:00:00') }); await t.clock.pauseAt(new Date('2026-12-20T09:00:01'));
  await t.goto(BASE + '/timer.html'); await t.waitForFunction(() => window.EventSTEMTimer && EventSTEMTimer.state());
  assert(JSON.stringify(await t.evaluate(() => EventSTEMTimer.list())) === '["achieve-driving","achieve-coding"]', 'standard timers: Achieve Driving, Achieve Coding');
  assert(await time(t) === '0:15', 'Achieve Driving starts at 0:15 (autonomous)');
  await t.click('#tmGo'); await t.clock.runFor(5050);
  assert(await time(t) === '0:10' && (await state(t)).kind === 'auto', 'autonomous counts down');
  await t.keyboard.press('Space'); await t.clock.runFor(30050);
  assert((await state(t)).status === 'pause' && await time(t) === '0:10', 'Space pauses; paused time is not counted');
  await t.keyboard.press('Space'); await t.clock.runFor(10550);
  assert((await state(t)).kind === 'driver' && await time(t) === '1:45', 'after 15 s it switches to driver control 1:45');
  await t.clock.runFor(105050);
  assert((await state(t)).status === 'done' && await time(t) === '0:00' && /TIME/.test(await t.locator('#tmPhase').innerText()), 'time is up after 1:45');
  await t.keyboard.press('r');
  assert((await state(t)).status === 'ready' && await time(t) === '0:15', 'R resets');
  await shot(t, 'timer-ready');

  // Coding: 2:00 tự hành, chọn từ danh sách
  await t.selectOption('#tmPreset', 'achieve-coding');
  assert(await time(t) === '2:00' && await t.locator('#tmSteps li').count() === 1, 'Achieve Coding: 2:00 autonomous only');
  await t.click('#tmGo'); await t.clock.runFor(1050); await t.keyboard.press('n');
  assert((await state(t)).status === 'done', 'N skips the last period');

  // Chỉnh nhanh: 0:20 tự hành + 1:30 điều khiển, chờ trọng tài giữa 2 phần, đếm 3 giây
  await t.selectOption('#tmPreset', 'achieve-driving');
  await t.click('#tmAdj summary');
  await t.fill('#tfAuto', '0:20'); await t.fill('#tfDrv', '90'); await t.selectOption('#tfBet', 'wait'); await t.selectOption('#tfLead', '3');
  await t.click('#fTimer button[type=submit]');
  assert(/0:20 \+ 1:30 \(adjusted\)/.test(await t.locator('#tmPreset option:checked').innerText()), 'quick adjust applied to this device');
  await t.click('#tmGo'); await t.clock.runFor(1050);
  assert((await state(t)).kind === 'lead' && /GET READY/.test(await t.locator('#tmPhase').innerText()), 'get-ready countdown first');
  await t.clock.runFor(22550);
  assert((await state(t)).status === 'wait' && await time(t) === '1:30', 'stops after autonomous and waits for the referee');
  await t.click('#tmGo'); await t.clock.runFor(2050);
  assert((await state(t)).kind === 'driver' && await time(t) === '1:28', 'referee starts driver control');
  await t.click('#tmGo'); await t.click('#tmReset');
  await t.reload(); await t.waitForFunction(() => window.EventSTEMTimer && EventSTEMTimer.state());
  assert(/\(adjusted\)/.test(await t.locator('#tmPreset option:checked').innerText()) && await time(t) === '0:03', 'adjustment kept after reload');
  await t.click('#tmAdj summary'); await t.click('#tfDef');
  assert(await time(t) === '0:15', 'back to default');
  // Lưu thành bảng mới trên máy
  await t.fill('#tfName', 'Luyện tập'); await t.selectOption('#tfMode', 'driver'); await t.fill('#tfDrv', '1:00'); await t.click('#tfNew');
  assert((await state(t)).preset === 'my-luyen-tap' && await time(t) === '1:00', 'saved a new driver-only timer on this device');
  await t.setViewportSize({ width: 375, height: 812 });
  assert(!(await t.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'timer fits a phone');
  await shot(t, 'timer-phone');
  await t.close();

  // 2. Ban tổ chức đặt bảng giờ cho giải
  const p = await page();
  await p.goto(BASE + '/manage.html');
  await p.click('text=Create account');
  await p.fill('#suName', 'SEPA'); await p.fill('#suOrg', 'SEPA'); await p.fill('#suEmail', 'daoquyen@sepa.org.vn'); await p.fill('#suPw', 'secret1');
  await p.click('#fSignup button[type=submit]'); await p.waitForSelector('text=My events');
  await p.click('text=+ New event');
  await p.selectOption('#evProg', 'Achieve');
  await p.fill('#evName', 'Timer Cup'); await p.fill('#evDate', '2026-12-20'); await p.fill('#evCountry', 'Vietnam');
  await p.click('#fNew button[type=submit]'); await p.waitForSelector('#tmPaste');
  assert(await p.locator('.spread a[href^="timer.html"]').count() === 1, 'Referee timer button in the event header');
  await p.click('a[role=tab]:has-text("Logo & show")'); await p.waitForSelector('#fTimers [data-i]');
  assert(await p.locator('#fTimers [data-i]').count() === 2, 'standard timers listed');
  await p.click('#tpAdd');
  const nw = p.locator('#fTimers [data-i="2"]');
  await nw.locator('[data-k=name]').fill('Driving Skills');
  await nw.locator('[data-k=mode]').selectOption('driver');
  assert(await nw.locator('[data-k=auto]').count() === 0, 'driver-only timer hides the autonomous time');
  await nw.locator('[data-k=driver]').fill('1:00');
  await nw.locator('input[name=tpDef]').check();
  await p.locator('#fTimers [data-i="0"] [data-k=driver]').fill('abc');
  await p.click('#fTimers button[type=submit]');
  assert(/Check the times/.test(await p.locator('#tpErr').innerText()), 'wrong time is rejected');
  await p.locator('#fTimers [data-i="0"] [data-k=driver]').fill('1:45');
  await p.click('#fTimers button[type=submit]'); await p.waitForFunction(() => /Saved/.test(document.querySelector('#toast').innerText));
  await p.waitForSelector('#tpStd');
  assert(await p.locator('#fTimers [data-i]').count() === 3 && await p.locator('#fTimers [data-i="2"] input[name=tpDef]').isChecked(), 'event timers saved with the new default');
  await p.setViewportSize({ width: 375, height: 812 });
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Logo & show tab with timers fits a phone');
  await p.setViewportSize({ width: 1280, height: 800 });
  await shot(p, 'timer-manage');
  const evId = new URL(p.url()).hash.split('/')[1];

  const v = await page();
  await v.goto(BASE + '/timer.html?id=' + evId); await v.waitForFunction(() => window.EventSTEMTimer && EventSTEMTimer.state());
  assert(await v.locator('#tmName').innerText() === 'Timer Cup', 'timer shows the event name');
  assert((await state(v)).preset === 'driving-skills' && await time(v) === '1:00', 'event default timer opens first');
  assert(JSON.stringify(await v.evaluate(() => EventSTEMTimer.list())) === '["achieve-driving","achieve-coding","driving-skills","my-luyen-tap"]', 'event timers + this device\'s own timer');
  await v.goto(BASE + '/timer.html?id=' + evId + '&preset=achieve-coding'); await v.waitForFunction(() => window.EventSTEMTimer && EventSTEMTimer.state());
  assert((await state(v)).preset === 'achieve-coding', '&preset= picks a timer');

  // Về bảng có sẵn
  await p.click('#tpStd'); await p.waitForFunction(() => !document.querySelector('#tpStd') && document.querySelectorAll('#fTimers [data-i]').length === 2);
  assert(true, 'back to the standard timers');

  assert(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close();
  console.log('E2E timer: OK');
})().catch(e => { console.error(e); process.exit(1); });
