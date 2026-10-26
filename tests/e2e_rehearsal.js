// Kiểm thử chế độ tập dượt (?rehearsal=1).  Chạy: python3 -m http.server 8767 & node tests/e2e_rehearsal.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8767';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ', m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), p = await ctx.newPage();
  // Chặn config như các test khác: trang thường chạy chế độ demo, không chạm Supabase thật
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.EVENTSTEM_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };' }));
  const errs = []; const watch = pg => { pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('dialog', d => d.accept()); };
  watch(p);
  const shot = async (pg, n) => { if (process.env.SHOTS) await pg.screenshot({ path: process.env.SHOTS + '/' + n + '.png' }); };
  const tab = async (pg, name, sel) => { await pg.click(`a[role=tab]:has-text("${name}")`); await pg.waitForSelector(sel); };
  const ls = async (pg, k) => pg.evaluate(k => localStorage.getItem(k) || '', k);

  // 1. Vào tập dượt từ trang đăng nhập, không cần tài khoản
  await p.goto(BASE + '/manage.html'); await p.waitForSelector('text=Start a rehearsal');
  await p.click('text=Start a rehearsal'); await p.waitForSelector('#fPractice');
  assert(/rehearsal=1/.test(p.url()), 'rehearsal link opens manage.html?rehearsal=1');
  assert(/Rehearsal\./.test(await p.locator('#demoBanner').innerText()) && /REHEARSAL/.test(await p.locator('#who').innerText()), 'rehearsal banner and header tag, no sign-up needed');

  // 2. Giải tập ADC với 12 đội mẫu
  await p.selectOption('#prProg', 'ADC'); await p.fill('#prTeams', '12'); await p.click('#fPractice button[type=submit]');
  await p.waitForSelector('#genSch');
  await p.click('#genSch'); await p.waitForSelector('text=qualification matches');
  await p.click('#rhFill'); await p.waitForFunction(() => /filled/.test(document.querySelector('#toast').innerText), null, { timeout: 30000 });
  await tab(p, 'Scoring', '#scProg');
  const prog = await p.locator('#scProg').innerText(); const [a, n] = prog.split(' ')[0].split('/');
  assert(a === n && +n > 0, 'Fill random scores scored every qualification match (' + prog + ')');
  await tab(p, 'Solo', '#fSolo');
  assert(/All solo runs \(24\)/i.test(await p.locator('#pane').innerText()), 'one piloting + one autonomous run per team');
  await tab(p, 'Eliminations', '#nAll'); await p.click('#startSel'); await p.waitForSelector('#invitee');
  for (let k = 0; k < 4; k++) { await p.click('#accept'); await p.waitForTimeout(120); }
  await p.click('#mkBracket'); await p.waitForSelector('#eRows');
  assert(await p.locator('#eRows tbody tr').count() === 4, 'practice alliance selection + semifinals work');
  await shot(p, 'rehearsal-manage');

  // 3. Trang công khai và màn hình trình chiếu bản tập
  const pub = await p.getAttribute('.spread a[href^="event.html"]', 'href');
  const show = await p.getAttribute('.spread a[href^="show.html"]', 'href');
  assert(/rehearsal=1/.test(pub) && /rehearsal=1/.test(show), 'public page and show links stay in rehearsal');
  const s = await ctx.newPage(); watch(s); await s.setViewportSize({ width: 1600, height: 900 });
  await s.goto(BASE + '/' + show); await s.waitForSelector('.show-slide');
  assert(/REHEARSAL/.test(await s.locator('#shName').innerText()), 'show screen is marked REHEARSAL');
  assert((await s.evaluate(() => EventSTEMShow.slides())).includes('rank'), 'show screen has the practice rankings');
  await shot(s, 'rehearsal-show');
  await s.goto(BASE + '/' + pub); await s.waitForSelector('#pane table');
  assert(/Rehearsal\./.test(await s.locator('#demoBanner').innerText()), 'public page is marked rehearsal');

  // 4. Tách biệt: dữ liệu tập không vào chế độ demo / trang công khai thường
  await s.goto(BASE + '/event.html'); await s.waitForSelector('#app h2');
  assert(!(await s.locator('#app').innerText()).includes('Practice'), 'practice event is not in the normal public list');
  assert(!(await ls(s, 'eventstem-demo-v1')).includes('Practice'), 'practice data not written to the normal store');

  // 5. "Tập dượt giải này" từ một giải thật (chế độ demo đóng vai giải thật)
  const r = await ctx.newPage(); watch(r);
  await r.goto(BASE + '/manage.html#signup');
  await r.fill('#suName', 'SEPA'); await r.fill('#suOrg', 'SEPA'); await r.fill('#suEmail', 'daoquyen@sepa.org.vn'); await r.fill('#suPw', 'secret1');
  await r.click('#fSignup button[type=submit]'); await r.waitForSelector('text=My events');
  assert(await r.locator('a[href="manage.html?rehearsal=1"]').count() === 1, 'Rehearsal button on My events');
  await r.click('text=+ New event'); await r.fill('#evName', 'Real Cup'); await r.click('#fNew button[type=submit]'); await r.waitForSelector('#tmPaste');
  await r.fill('#tmPaste', 'RL1\nRL2\nRL3\nRL4\nRL5\nRL6'); await r.click('#tmAdd'); await r.waitForSelector('text=6 teams');
  await tab(r, 'Overview', '#rhThis');
  const [pr] = await Promise.all([ctx.waitForEvent('page'), r.click('#rhThis')]); watch(pr);
  await pr.waitForSelector('#genSch');
  assert(/rehearsal=1/.test(pr.url()), 'rehearsal copy opens in a new tab');
  await pr.click('#genSch'); await pr.waitForSelector('text=qualification matches');
  await tab(pr, 'Teams', '#tmPaste');
  assert(/6 teams/.test(await pr.locator('#pane').innerText()), 'rehearsal copy has the real team list');
  await r.reload(); await tab(r, 'Schedule', '#genSch');
  const realMatches = await r.evaluate(() => JSON.parse(localStorage.getItem('eventstem-demo-v1')).matches.length);
  const rhMatches = await r.evaluate(() => JSON.parse(localStorage.getItem('eventstem-rehearsal-v1')).matches.length);
  assert(realMatches === 0 && rhMatches > 0 && await r.locator('#schTable tbody tr').count() === 0, 'real event untouched (schedule only in the rehearsal copy)');

  // 6. Xoá dữ liệu tập
  await pr.goto(BASE + '/manage.html?rehearsal=1'); await pr.waitForSelector('#rhReset');
  await pr.click('#rhReset'); await pr.waitForSelector('text=No practice events yet');
  assert(true, 'clear all rehearsal data');
  await pr.setViewportSize({ width: 375, height: 812 });
  assert(!(await pr.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'rehearsal home fits a phone');
  await shot(pr, 'rehearsal-home-phone');

  console.log('PAGE ERRORS', JSON.stringify(errs));
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
