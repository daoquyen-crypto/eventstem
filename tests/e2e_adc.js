// Kiểm thử trọn luồng 1 giải RECF ADC Fast Track ở chế độ demo.  Chạy: python3 -m http.server 8767 & node tests/e2e_adc.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8767';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ', m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } }), p = await ctx.newPage();
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.EVENTSTEM_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };' }));
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  const shot = async n => { if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/' + n + '.png', fullPage: true }); };
  const tab = async (name, sel) => { await p.click(`a[role=tab]:has-text("${name}")`); await p.waitForSelector(sel); };

  await p.goto(BASE + '/manage.html');
  await p.click('text=Create account');
  await p.fill('#suName', 'SEPA'); await p.fill('#suOrg', 'SEPA'); await p.fill('#suEmail', 'daoquyen@sepa.org.vn'); await p.fill('#suPw', 'secret1');
  await p.click('#fSignup button[type=submit]'); await p.waitForSelector('text=My events');

  // 1. Tạo giải ADC
  await p.click('text=+ New event');
  await p.selectOption('#evProg', 'ADC');
  assert(await p.isChecked('input[name=grade][value=ES]') && await p.isChecked('input[name=grade][value=MS]') && await p.isChecked('input[name=grade][value=HS]'), 'ADC defaults to ES + MS + HS');
  assert(await p.inputValue('#cSolo') === '3', 'ADC: 3 solo attempts per type (7.4.1)');
  assert(!(await p.locator('#cDrop').isVisible()) && !(await p.locator('#cFinals').isVisible()), 'ADC hides drop-lowest (always on) and Achieve finals format');
  await p.fill('#evName', 'Fast Track Hà Nội'); await p.fill('#evDate', '2026-12-12'); await p.fill('#cMpt', '4');
  await p.click('#fNew button[type=submit]'); await p.waitForSelector('#tmPaste');
  assert(await p.locator('a[role=tab]:has-text("Eliminations")').count() === 1, 'tab renamed to Eliminations');

  // 2. 10 đội
  await p.fill('#tmPaste', Array.from({ length: 10 }, (_, i) => `DR${100 + i}, Drone ${i + 1}, School ${i % 3}, ${['ES', 'MS', 'HS'][i % 3]}`).join('\n'));
  await p.click('#tmAdd'); await p.waitForSelector('text=10 teams');

  // 3. Lịch hợp tác: 10×4 = 40 chỗ → 20 trận
  await tab('Schedule', '#genSch'); await p.click('#genSch');
  await p.waitForSelector('text=20 qualification matches');

  // 4. Chấm điểm: trận 1 đội đỏ thẻ đỏ
  await tab('Scoring', '#scRows tbody tr');
  assert(/5\.4\.1/.test(await p.locator('.banner.info').innerText()), 'scoring help cites ADC rule 5.4.1');
  const rows = p.locator('#scRows tbody tr'), n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    if (i === 0) await r.locator('[data-f=red_status]').selectOption('red');
    await r.locator('.score-in').fill(String(30 + (i * 7) % 50));
    await r.locator('.score-in').press('Enter');
    await p.waitForFunction(i => document.querySelectorAll('#scRows tbody tr')[i].classList.contains('done'), i);
  }
  assert((await p.locator('#scProg').innerText()).startsWith(n + '/' + n), 'all 20 matches scored');

  // 5. Xếp hạng
  await tab('Rankings', 'text=Alliance rankings');
  assert(await p.locator('#pane table').first().locator('tbody tr').count() === 10, 'alliance ranking lists 10 teams');
  assert(/2nd, then 3rd highest/.test(await p.locator('#pane').innerText()), 'ADC tiebreak note (7.4.2)');

  // 6. Solo: Piloting / Autonomous, 3 lượt mỗi loại
  await tab('Solo', '#fSolo');
  assert(await p.locator('#soStop').count() === 0, 'no stop time for ADC solo');
  assert((await p.locator('#soKind option').allTextContents()).join('|') === 'Piloting|Autonomous', 'solo types are Piloting / Autonomous');
  const add = async (t, k, sc) => { await p.fill('#soTeam', t); await p.selectOption('#soKind', k); await p.fill('#soScore', String(sc)); const c = await p.locator('text=/All solo runs \\(\\d+\\)/').innerText().catch(() => '(0)'); await p.click('#fSolo button[type=submit]');
    await p.waitForFunction(c => !document.body.innerText.includes(c), c, { timeout: 5000 }); };
  for (const [t, k, sc] of [['DR100', 'driving', 60], ['DR100', 'coding', 40], ['DR101', 'driving', 50], ['DR101', 'coding', 50], ['DR100', 'driving', 20], ['DR100', 'driving', 30]]) await add(t, k, sc);
  await p.fill('#soTeam', 'DR100'); await p.selectOption('#soKind', 'driving'); await p.locator('#soTeam').dispatchEvent('input');
  assert(/Attempts left: 0/.test(await p.locator('#soLeft').innerText()), 'piloting attempts used up after 3');
  await p.selectOption('#soKind', 'coding');
  assert(/Attempts left: 2/.test(await p.locator('#soLeft').innerText()), 'autonomous attempts counted separately');
  const solo1 = await p.locator('#pane table').first().locator('tbody tr').first().innerText();
  assert(/DR101/.test(solo1), 'ADC solo tiebreak: higher autonomous wins (DR101 100 = DR100 100, autonomous 50 > 40)');
  assert(/Piloting/i.test(await p.locator('#pane table').first().locator('thead').innerText()), 'solo table header says Piloting');
  await shot('adc-solo');

  // 7. Chọn liên minh: 10 đội đủ điều kiện → đề xuất 4 (7.4.4)
  await tab('Eliminations', '#nAll');
  assert(await p.inputValue('#nAll') === '4', 'recommended alliances for 8–19 teams = 4');
  await p.click('#startSel'); await p.waitForSelector('#invitee');
  for (let k = 0; k < 4; k++) { await p.click('#accept'); await p.waitForTimeout(150); }
  await p.waitForSelector('text=Selection complete');

  // 8. Bán kết: 4 trận, đánh từ hạt giống 4; hoà ở ngưỡng → 3 liên minh vào chung kết
  await p.click('#mkBracket'); await p.waitForSelector('#eRows');
  assert(await p.locator('#eRows tbody tr').count() === 4, '4 semifinal matches');
  assert(/^SF/.test(await p.locator('#eRows tbody tr').first().locator('td').first().innerText()), 'semifinal match code SF');
  const score = async (i, v, x) => { const r = p.locator('#eRows tbody tr').nth(i); if (x) await x(r); await r.locator('.score-in').fill(String(v)); await r.locator('[data-save]').click(); await p.waitForTimeout(400); };
  await score(0, 50); await score(1, 70); await score(2, 70); await score(3, 90);
  await p.waitForFunction(() => document.querySelectorAll('#eRows tbody tr').length === 7);
  assert(true, 'tie at the cut-off sends 3 alliances to the finals (7.4.5)');
  // chung kết: 2 liên minh hoà 100 → TB1
  await score(4, 100); await score(5, 100); await score(6, 80);
  await p.waitForFunction(() => document.querySelectorAll('#eRows tbody tr').length === 9);
  assert(/^TB1/.test(await p.locator('#eRows tbody tr').nth(7).locator('td').first().innerText()), 'tie for first creates tiebreaker TB1');
  await score(7, 60); await score(8, 40, async r => { await r.locator('[data-f=blue_status]').selectOption('red'); });
  await p.waitForSelector('.champ');
  const champ = await p.locator('.champ').innerText(); console.log('      ', champ);
  assert(/Teamwork Champions/.test(champ), 'Teamwork Champions declared');
  await shot('adc-elims');

  // 9. Giải thưởng + CSV
  await tab('Awards', '#fAw');
  const aw = await p.locator('#pane table').innerText();
  assert((aw.match(/Teamwork Champions/g) || []).length === 2 && /Skills Mission Champion/.test(aw), 'performance awards: Teamwork Champions ×2, Skills Mission Champion');
  await tab('Export', '#dlCsv');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlCsv')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  assert((csv.match(/,alliance,/g) || []).length === 40, '40 alliance rows (10×4), eliminations excluded');
  assert(/,ADC,2026-2027,/.test(csv), 'CSV program ADC, season 2026-2027');

  // 10. Trang công khai
  await tab('Overview', '#evStatus');
  await p.selectOption('#evStatus', 'live'); await p.check('#evVerified'); await p.click('#saveStatus'); await p.waitForTimeout(300);
  await p.goto(BASE + '/event.html'); await p.waitForSelector('.ev-item'); await p.click('.ev-item'); await p.waitForSelector('#pane table');
  assert(/Best piloting \+ best autonomous/.test(await p.locator('#pane').innerText()), 'public solo note for ADC');
  await p.click('a[role=tab]:has-text("Eliminations")'); await p.waitForSelector('.champ');
  const pub = await p.locator('#pane').innerText();
  assert(/Semifinals/i.test(pub) && /Finals/i.test(pub) && /Tiebreaker 1/i.test(pub), 'public page shows semifinals, finals and tiebreaker');
  await shot('adc-public');
  await p.setViewportSize({ width: 375, height: 812 });
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'public page fits a phone');
  await shot('adc-public-phone');
  await p.setViewportSize({ width: 1280, height: 800 });

  // 11. Xếp hạng toàn cầu: chương trình ADC có dữ liệu
  await p.goto(BASE + '/index.html#xephang'); await p.waitForSelector('#rkTable');
  await p.click('#rkProg button[data-v="ADC"]'); await p.waitForSelector('#rkTable table');
  assert(await p.locator('#rkTable tr[data-team="DR100"]').count() === 1, 'ADC tool event in global rankings');

  console.log('PAGE ERRORS', JSON.stringify(errs));
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
