// Kiểm thử trọn luồng 1 giải RECF ADC Pro (Off Grid) ở chế độ demo, nhập điểm thành phần.  Chạy: python3 -m http.server 8767 & node tests/e2e_adc_pro.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8767';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ', m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } }), p = await ctx.newPage();
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.EVENTSTEM_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };' }));
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  const shot = async n => { if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/' + n + '.png', fullPage: true }); };
  const toast = async () => (await p.locator('#toast').innerText().catch(() => ''));
  const tab = async (name, sel) => { await p.click(`a[role=tab]:has-text("${name}")`); await p.waitForSelector(sel); };
  /* Nhập điểm thành phần trong hộp 🧮: {khoá: số}, landing = vùng của ống */
  const calc = async (vals) => {
    await p.waitForSelector('#calcDlg[open]');
    for (const [k, v] of Object.entries(vals)) {
      if (k === 'landing') await p.selectOption(`#calcDlg [data-k=landing]`, v); else await p.fill(`#calcDlg [data-k=${k}]`, String(v));
    }
    const tot = await p.locator('#calcTot').innerText();
    await p.click('#calcOk');
    return +tot;
  };
  /* Ô điểm chỉ đọc khi nhập điểm thành phần; các trận còn lại điền thẳng cho nhanh */
  const fillRO = (loc, v) => loc.evaluate((el, v) => { el.removeAttribute('readonly'); el.value = v; }, String(v));

  await p.goto(BASE + '/manage.html');
  await p.click('text=Create account');
  await p.fill('#suName', 'SEPA'); await p.fill('#suOrg', 'SEPA'); await p.fill('#suEmail', 'daoquyen@sepa.org.vn'); await p.fill('#suPw', 'secret1');
  await p.click('#fSignup button[type=submit]'); await p.waitForSelector('text=My events');

  // 1. Tạo giải ADC Pro
  await p.click('text=+ New event');
  await p.selectOption('#evProg', 'ADC Pro');
  assert(await p.isChecked('input[name=grade][value=HS]') && await p.isChecked('input[name=grade][value=UNI]') && !(await p.isChecked('input[name=grade][value=MS]')), 'ADC Pro defaults to high school + collegiate (1.4.2)');
  assert(await p.inputValue('#cSolo') === '5' && /piloting \+ autonomous/.test(await p.locator('#cSoloHint').innerText()), 'ADC Pro: 5 solo attempts in total (7.4.1)');
  assert(await p.locator('#cFinals').isVisible() && await p.locator('#cEntry').isVisible() && !(await p.locator('#cGoals').isVisible()), 'shows finals format + score entry, hides Fast Track goals option');
  await p.selectOption('#cEntry', 'detail');
  await p.fill('#evName', 'Off Grid Hà Nội'); await p.fill('#evDate', '2026-12-19'); await p.fill('#cMpt', '4');
  await p.click('#fNew button[type=submit]'); await p.waitForSelector('#tmPaste');
  assert(await p.locator('a[role=tab]:has-text("Eliminations")').count() === 1, 'tab renamed to Eliminations');

  // 2. 8 đội
  await p.fill('#tmPaste', Array.from({ length: 8 }, (_, i) => `DP${100 + i}, Pro ${i + 1}, School ${i % 3}, ${i % 2 ? 'UNI' : 'HS'}`).join('\n'));
  await p.selectOption('#tmGrade', 'HS'); await p.click('#tmAdd'); await p.waitForSelector('text=8 teams');

  // 3. Lịch 2v2: 8×4 = 32 chỗ → 8 trận
  await tab('Schedule', '#genSch'); await p.click('#genSch');
  await p.waitForSelector('text=8 qualification matches');

  // 4. Chấm điểm thành phần trận 1; các trận khác điền điểm tổng
  await tab('Scoring', '#scRows tbody tr');
  assert(/1\.6\.3/.test(await p.locator('.banner.info').innerText()) && !/Autonomous \/ Endgame/.test(await p.locator('.banner.info').innerText()), 'scoring help: win/tie RP only');
  assert(await p.locator('#scRows [data-f=auto_red]').count() === 0, 'no Autonomous / Endgame RP checkboxes');
  const r0 = p.locator('#scRows tbody tr').first();
  await r0.locator('[data-calc=red]').click();
  assert(await calc({ pump: 2, drop: 3, docked: 1 }) === 40, 'red: 2 pumps + drop zone (max 1) + docked = 40 (5.1)');
  await r0.locator('[data-calc=blue]').click();
  await calc({ pump: 2 });
  assert(/Only 3 pumps/.test(await toast()), 'cross-check: only 3 pumps on the field');
  await r0.locator('[data-calc=blue]').click();
  assert(await calc({ pump: 1, fuelOut: 5 }) === 20, 'blue: 1 pump + 5 fuel outside goals = 20');
  await p.waitForFunction(() => document.querySelector('#scRows tbody tr').classList.contains('done'));
  const rows = p.locator('#scRows tbody tr'), n = await rows.count();
  for (let i = 1; i < n; i++) {
    const r = rows.nth(i);
    if (i === 1) await r.locator('[data-f=red_status]').selectOption('red');
    await fillRO(r.locator('[data-f=score]'), i % 3 ? 30 + i : 25); await fillRO(r.locator('[data-f=score_blue]'), 25);
    await r.locator('[data-save]').click();
    await p.waitForFunction(i => document.querySelectorAll('#scRows tbody tr')[i].classList.contains('done'), i);
  }
  assert((await p.locator('#scProg').innerText()).startsWith(n + '/' + n), 'all matches scored');
  await shot('adcpro-scoring');

  // 5. Xếp hạng: TB RP, TB điểm, cao nhất, cao thứ 2
  await tab('Rankings', 'text=Qualification rankings');
  const head = await p.locator('#pane table').first().locator('thead').innerText();
  assert(/Avg score/i.test(head) && !/Endgame/i.test(head), 'ranking columns: average score, no Endgame RP');
  assert(/win 2, tie 1/.test(await p.locator('#pane').innerText()), 'ranking note cites 5.5');

  // 6. Solo: điểm thành phần + stop time; tổng 5 lượt chia tuỳ ý
  await tab('Solo', '#fSolo');
  assert(await p.locator('#soKind option').first().innerText() === 'Piloting', 'solo types Piloting / Autonomous');
  await p.fill('#soTeam', 'DP100'); await p.selectOption('#soKind', 'driving');
  await p.click('#soCalc');
  assert(await calc({ p1l: 1, p1s: 1, pad1: 1, arch: 1, blue: 1, teal: 1, p2l: 1, p2s: 1, pad2: 1, parked: 2, docked: 1, landing: 'z3', stop: 11 }) === 110, 'piloting: all tasks + zone 3 + stop time 11 → 10 s = 110 (3.1, 3.1.10)');
  assert(await p.inputValue('#soStop') === '10', 'stop time copied from the score sheet');
  await p.click('#fSolo button[type=submit]'); await p.waitForTimeout(200);
  for (let k = 0; k < 5; k++) {
    await p.fill('#soTeam', 'DP100'); await p.selectOption('#soKind', 'coding'); await p.click('#soCalc');
    await calc({ p1l: 1, landing: 'z1' });
    await p.click('#fSolo button[type=submit]'); await p.waitForTimeout(250);
  }
  assert(/used all its solo attempts/.test(await toast()), '6th solo attempt rejected: 5 in total (7.4.1)');
  const srow = await p.locator('#pane table').first().locator('tbody tr').first().innerText();
  assert(/DP100/.test(srow) && /130/.test(srow) && /5\/5/.test(srow), 'solo ranking: 110 + 20 = 130, 5/5 attempts');

  // 7. Chọn liên minh: 8 đội → đề xuất 4; chọn 2 để vào thẳng chung kết
  await tab('Eliminations', '#nAll');
  assert(await p.inputValue('#nAll') === '4', 'recommended alliances for 8 teams = 4 (7.4.4)');
  await p.fill('#nAll', '2'); await p.click('#startSel'); await p.waitForSelector('#invitee');
  const cap1 = await p.locator('#pane b.code').first().innerText();
  for (let k = 0; k < 2; k++) { await p.click('#accept'); await p.waitForTimeout(150); }
  await p.waitForSelector('text=Selection complete');
  await p.click('#mkBracket'); await p.waitForSelector('#eRows');
  const fr = p.locator('#eRows tbody tr').first();
  assert(/^F/.test(await fr.locator('td').first().innerText()), 'final created');
  await fr.locator('[data-calc=red]').click(); await calc({ pump: 3, supply: 4 });
  await fr.locator('[data-calc=blue]').click(); await calc({ fuelIn: 10 });
  await p.waitForSelector('.champ');
  const champ = await p.locator('.champ').innerText(); console.log('      ', champ);
  assert(champ.includes(cap1), 'seed 1 wins the final 50–10');
  await shot('adcpro-bracket');

  // 8. Giải thưởng + CSV
  await tab('Awards', '#fAw');
  const awt = await p.locator('#pane table').innerText();
  assert(awt.match(/Tournament Champions/g).length === 2 && /Solo Match Champion/.test(awt), 'Tournament Champions ×2 + Solo Match Champion');
  await tab('Export', '#dlCsv');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlCsv')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  assert((csv.match(/,alliance,/g) || []).length === 32, '32 counted alliance rows (8×4)');
  assert(/,ADC Pro,2026-2027,/.test(csv), 'CSV program ADC Pro, season 2026-2027');

  // 9. Công bố + xác minh, trang công khai, điện thoại
  await tab('Overview', '#evStatus');
  await p.selectOption('#evStatus', 'live'); await p.check('#evVerified'); await p.click('#saveStatus'); await p.waitForTimeout(300);
  await p.goto(BASE + '/event.html'); await p.waitForSelector('.ev-item'); await p.click('.ev-item'); await p.waitForSelector('#pane table');
  assert(/Avg score/i.test(await p.locator('#pane').innerText()), 'public rankings show average score');
  await p.click('a[role=tab]:has-text("Matches")'); await p.waitForTimeout(150);
  assert(/Scored pumps: 2 · Power cell on the drop zone: 1/.test(await p.locator('#pane span.big[title]').first().getAttribute('title')), 'score components shown on hover');
  await p.click('a[role=tab]:has-text("Eliminations")'); await p.waitForSelector('.champ');
  await shot('adcpro-public');
  await p.setViewportSize({ width: 375, height: 812 });
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'public page fits a phone');
  await p.setViewportSize({ width: 1280, height: 800 });

  // 10. Xếp hạng toàn cầu: ADC Pro có dữ liệu, nhãn Solo Piloting / Autonomous
  await p.goto(BASE + '/index.html#xephang'); await p.waitForSelector('#rkTable');
  await p.click('#rkProg button[data-v="ADC Pro"]'); await p.waitForSelector('#rkTable table');
  assert(await p.locator('#rkTable tr[data-team="DP100"]').count() === 1, 'ADC Pro tool event in global rankings');

  console.log('PAGE ERRORS', JSON.stringify(errs));
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
