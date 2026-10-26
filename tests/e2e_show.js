// Kiểm thử logo của giải và màn hình trình chiếu (chế độ demo).  Chạy: python3 -m http.server 8767 & node tests/e2e_show.js
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8767';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ', m); };
const asset = f => path.join(__dirname, '..', f);
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), p = await ctx.newPage();
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.EVENTSTEM_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };' }));
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  const shot = async n => { if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/' + n + '.png' }); };
  const tab = async (name, sel) => { await p.click(`a[role=tab]:has-text("${name}")`); await p.waitForSelector(sel); };

  await p.goto(BASE + '/manage.html');
  await p.click('text=Create account');
  await p.fill('#suName', 'SEPA'); await p.fill('#suOrg', 'SEPA'); await p.fill('#suEmail', 'daoquyen@sepa.org.vn'); await p.fill('#suPw', 'secret1');
  await p.click('#fSignup button[type=submit]'); await p.waitForSelector('text=My events');

  // 1. Giải Engage nhỏ: 6 đội, chấm vài trận, vài lượt solo
  await p.click('text=+ New event');
  await p.fill('#evName', 'Show Test Cup'); await p.fill('#evDate', '2026-12-20'); await p.fill('#evLoc', 'Hà Nội'); await p.fill('#evCountry', 'Vietnam'); await p.fill('#cMpt', '4'); await p.fill('#cFields', '2');
  await p.click('#fNew button[type=submit]'); await p.waitForSelector('#tmPaste');
  await p.fill('#tmPaste', Array.from({ length: 6 }, (_, i) => `SH${10 + i}A, Robo ${i + 1}, School ${i % 2}`).join('\n'));
  await p.click('#tmAdd'); await p.waitForSelector('text=6 teams');
  await tab('Schedule', '#genSch'); await p.click('#genSch'); await p.waitForSelector('text=qualification matches');
  await tab('Scoring', '#scRows tbody tr');
  for (let i = 0; i < 4; i++) {
    const r = p.locator('#scRows tbody tr').nth(i);
    await r.locator('.score-in').fill(String(40 + i * 5)); await r.locator('.score-in').press('Enter');
    await p.waitForFunction(i => document.querySelectorAll('#scRows tbody tr')[i].classList.contains('done'), i);
  }
  await tab('Solo', '#fSolo');
  await p.fill('#soTeam', 'SH10A'); await p.fill('#soScore', '55'); await p.click('#fSolo button[type=submit]'); await p.waitForSelector('text=All solo runs (1)');

  // 2. Logo đơn vị + nhà tài trợ
  await tab('Logo & show', '#orgFile');
  assert(await p.locator('.spread a[href^="show.html"]').count() === 1, 'Show screen button in the event header');
  await p.setInputFiles('#orgFile', asset('assets/logo.png'));
  await p.waitForSelector('#orgLogo');
  const src = await p.getAttribute('#orgLogo', 'src');
  assert(/^data:image\/(webp|png);base64,/.test(src) && src.length < 400000, 'organizer logo resized and stored as an image data URL (' + Math.round(src.length / 1024) + ' KB)');
  await p.setInputFiles('#spFile', [asset('assets/icon-512.png'), asset('apple-touch-icon.png'), asset('favicon-32.png')]);
  await p.waitForSelector('#spList [data-i="2"]');
  assert(await p.locator('#spList [data-i]').count() === 3, '3 sponsor logos added');
  await p.locator('#spList [data-i="1"] [data-name]').fill('Công ty ABC'); await p.locator('#spList [data-i="1"] [data-name]').dispatchEvent('change');
  await p.waitForFunction(() => document.querySelector('#spList [data-i="1"] [data-name]').value === 'Công ty ABC');
  await p.locator('#spList [data-i="1"] [data-up]').click();
  await p.waitForFunction(() => document.querySelector('#spList [data-i="0"] [data-name]').value === 'Công ty ABC');
  assert(true, 'sponsor renamed and moved up');
  await p.locator('#spList [data-i="2"] [data-del]').click();
  await p.waitForFunction(() => document.querySelectorAll('#spList [data-i]').length === 2);
  assert(true, 'sponsor removed');
  // file không phải ảnh bị từ chối
  await p.setInputFiles('#spFile', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await p.waitForFunction(() => /could not be saved/.test(document.querySelector('#toast').innerText));
  assert(await p.locator('#spList [data-i]').count() === 2, 'non-image file rejected');
  // cài đặt trình chiếu
  await p.uncheck('input[name=slide][value=awards]'); await p.fill('#shSec', '5'); await p.click('#fShow button[type=submit]');
  await p.waitForFunction(() => /Saved/.test(document.querySelector('#toast').innerText));
  await shot('show-manage');
  await p.setViewportSize({ width: 375, height: 812 });
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Logo & show tab fits a phone');
  await p.setViewportSize({ width: 1280, height: 800 });
  await tab('Overview', '#evStatus'); await p.selectOption('#evStatus', 'live'); await p.click('#saveStatus'); await p.waitForTimeout(300);

  // 3. Màn hình trình chiếu
  const s = await ctx.newPage(); s.on('pageerror', e => errs.push('show: ' + e.message));
  await s.setViewportSize({ width: 1920, height: 1080 });
  const evId = new URL(p.url()).hash.split('/')[1];
  await s.goto(BASE + '/show.html?id=' + evId); await s.waitForSelector('.show-slide');
  assert(await s.locator('#shName').innerText() === 'Show Test Cup', 'show header has event name');
  assert(await s.locator('#shOrg img').count() === 1, 'organizer logo in the show header');
  assert(await s.locator('#shSpons img').count() === 2, 'sponsor strip in the footer');
  const keys = await s.evaluate(() => EventSTEMShow.slides());
  console.log('       slides:', keys.join(', '));
  assert(keys[0] === 'next' && keys.includes('rank') && keys.includes('solo') && keys.includes('sponsors') && !keys.includes('awards'), 'slides follow the organizer settings');
  assert(/Up next/i.test(await s.locator('#shMain').innerText()) && /Latest results/i.test(await s.locator('#shMain').innerText()), 'first slide: up next + latest results');
  if (process.env.SHOTS) await s.screenshot({ path: process.env.SHOTS + '/show-1080-next.png' });
  await s.keyboard.press('ArrowRight'); await s.waitForSelector('.show-slide[data-k=rank]');
  assert(await s.locator('.show-slide table tbody tr').count() === 6, 'rankings slide lists the teams');
  if (process.env.SHOTS) await s.screenshot({ path: process.env.SHOTS + '/show-1080-rank.png' });
  await s.keyboard.press(' ');
  assert(/❚❚/.test(await s.locator('#shPage').innerText()), 'Space pauses the rotation');
  await s.keyboard.press(' ');
  // tự chuyển sau 5 giây
  const before = await s.evaluate(() => document.querySelector('.show-slide').dataset.k);
  await s.waitForFunction(k => document.querySelector('.show-slide').dataset.k !== k, before, { timeout: 8000 });
  assert(true, 'slides rotate automatically (5 s)');
  await s.goto(BASE + '/show.html?id=' + evId + '&only=sponsors'); await s.waitForSelector('.show-slide[data-k=sponsors]');
  assert(await s.locator('.show-sponsor-grid img').count() === 2 && /Công ty ABC/.test(await s.locator('.show-sponsor-grid').innerText()), 'sponsor slide with names (&only=sponsors)');
  if (process.env.SHOTS) await s.screenshot({ path: process.env.SHOTS + '/show-1080-sponsors.png' });
  await s.setViewportSize({ width: 1280, height: 720 });
  await s.goto(BASE + '/show.html?id=' + evId + '&only=rank'); await s.waitForSelector('.show-slide[data-k=rank]');
  assert(!(await s.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight)), 'show screen fits 1280×720 without scrolling');
  if (process.env.SHOTS) await s.screenshot({ path: process.env.SHOTS + '/show-720-rank.png' });
  await s.setViewportSize({ width: 1920, height: 1080 });

  // Từng màn riêng (&screen=) và đổi màn ngay trên thanh điều khiển
  const keysOf = async q => { await s.goto(BASE + '/show.html?id=' + evId + q); await s.waitForSelector('.show-slide'); await s.waitForFunction(() => EventSTEMShow.ready()); await s.waitForTimeout(200); return s.evaluate(() => EventSTEMShow.slides()); };
  let k = await keysOf('&screen=matches');
  assert(k.length >= 2 && k.every(x => x === 'next' || x === 'sched'), 'Match schedule screen: up next + remaining schedule only (' + k.join(', ') + ')');
  await s.waitForFunction(() => { EventSTEMShow.go(1); return document.querySelector('.show-slide[data-k=sched] table'); });
  assert(/Match schedule/.test(await s.locator('.show-h').innerText()), 'schedule slide lists the remaining matches');
  if (process.env.SHOTS) await s.screenshot({ path: process.env.SHOTS + '/show-1080-sched.png' });
  k = await keysOf('&screen=standings');
  assert(k.includes('rank') && k.includes('solo') && !k.includes('next') && !k.includes('sponsors'), 'Results & standings screen: rankings + solo only');
  k = await keysOf('&screen=events');
  assert(k.length === 1 && k[0] === 'events', 'Upcoming events screen');
  const evText = await s.locator('.show-slide').innerText();
  assert(/Vietnam/.test(await s.locator('.show-h').innerText()) && (await s.locator('.show-ev').count()) > 0, 'upcoming RECF events in the event\'s country and nearby');
  if (process.env.SHOTS) await s.screenshot({ path: process.env.SHOTS + '/show-1080-events.png' });
  await s.selectOption('#shScreen', 'sponsors'); await s.waitForSelector('.show-slide[data-k=sponsors]');
  assert(/screen=sponsors/.test(s.url()) && (await s.evaluate(() => EventSTEMShow.slides())).join() === 'sponsors', 'switch screen from the control bar (link updates too)');

  // Lớp phủ livestream: nền trong suốt, logo, trận đang đánh, kết quả vừa xong
  await s.goto(BASE + '/show.html?id=' + evId + '&screen=overlay'); await s.waitForSelector('#ovBar .ov-now');
  assert(await s.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgba(0, 0, 0, 0)', 'overlay background is transparent (for OBS browser source)');
  assert(!(await s.locator('#shMain').isVisible()) && !(await s.locator('.show-head').isVisible()), 'overlay hides the normal show layout');
  assert(await s.locator('#ovTop img').count() === 1 && await s.locator('#ovSpons img').count() === 1, 'overlay shows organizer logo and one sponsor logo at a time');
  assert(/NOW/.test(await s.locator('.ov-tag').innerText()) && /SH\d\dA/.test(await s.locator('.ov-al.red').innerText()), 'overlay shows the match being played with its teams');
  assert(/Last result/.test(await s.locator('#ovLast').innerText()), 'overlay shows the last result');
  if (process.env.SHOTS) { await s.goto(BASE + '/show.html?id=' + evId + '&screen=overlay&bg=green'); await s.waitForSelector('#ovBar .ov-now'); await s.screenshot({ path: process.env.SHOTS + '/show-overlay-green.png' }); }
  await s.goto(BASE + '/show.html?id=' + evId + '&screen=overlay&field=2'); await s.waitForSelector('#ovBar .ov-now');
  assert(/Field 2/.test(await s.locator('.ov-tag').innerText()), 'overlay can follow a single field (&field=2)');
  await s.waitForTimeout(3300);
  assert(await s.evaluate(() => getComputedStyle(document.querySelector('#shCtl')).opacity) === '0', 'controls hide by themselves without a mouse (OBS)');

  // Tab Logo & trình chiếu: link từng màn + lớp phủ
  await tab('Logo & show', '#shScreens');
  assert(await p.locator('#shScreens a[data-scr]').count() === 4, 'one link per screen in the organizer tool');
  assert(/screen=overlay/.test(await p.inputValue('#ovUrl')), 'overlay link ready to copy');
  await s.goto(BASE + '/show.html?id=' + evId + '&only=rank'); await s.waitForSelector('.show-slide[data-k=rank]');
  // cập nhật trực tiếp: chấm thêm 1 trận ở trang quản lý → màn hình tự tải lại
  await tab('Scoring', '#scRows tbody tr');
  const r5 = p.locator('#scRows tbody tr').nth(4); await r5.locator('.score-in').fill('99'); await r5.locator('.score-in').press('Enter');
  await s.waitForFunction(() => /99/.test(document.querySelector('#shMain').innerText), null, { timeout: 25000 });
  assert(true, 'show screen picks up new scores automatically');

  // 4. Trang công khai: logo + nhà tài trợ
  await p.goto(BASE + '/event.html?id=' + evId); await p.waitForSelector('#pane table');
  assert(await p.locator('img.ev-logo').count() === 1 && await p.locator('.spons img').count() === 2, 'public page shows organizer logo and sponsors');
  await p.setViewportSize({ width: 375, height: 812 });
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'public page with logos fits a phone');
  await shot('show-public-phone');

  console.log('PAGE ERRORS', JSON.stringify(errs));
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
