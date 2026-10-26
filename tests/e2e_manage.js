// Kiểm thử trọn luồng công cụ quản lý ở chế độ demo.  Chạy: python3 -m http.server 8767 & node tests/e2e_manage.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8767';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ', m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept(d.type() === 'prompt' ? (globalThis.PROMPT || '') : undefined));
  const shot = async n => { if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/' + n + '.png', fullPage: false }); };
  const toast = async () => (await p.locator('#toast').innerText().catch(() => ''));
  await p.goto(BASE + '/manage.html');
  assert(await p.locator('#demoBanner').isVisible(), 'demo banner shown');

  // 1. Đăng ký: tài khoản đầu tiên là SEPA
  await p.click('text=Create account');
  await p.fill('#suName', 'Đào Quyên'); await p.fill('#suOrg', 'SEPA'); await p.fill('#suEmail', 'daoquyen@sepa.org.vn'); await p.fill('#suPw', 'secret1');
  await p.click('#fSignup button[type=submit]');
  await p.waitForSelector('text=My events');
  assert(await p.locator('#who .tag').innerText() === 'SEPA', 'first account is SEPA admin');

  // 2. Tạo giải
  await p.click('text=+ New event');
  await p.fill('#evName', 'Engage Hà Nội Open'); await p.fill('#evDate', '2026-11-15'); await p.fill('#evLoc', 'Hà Nội');
  await p.fill('#cMpt', '5'); await p.fill('#cFields', '2');
  await p.click('#fNew button[type=submit]');
  await p.waitForSelector('#tmPaste');
  assert(p.url().includes('/teams'), 'redirected to teams tab');

  // 3. Nhập 11 đội (lẻ → có trận *) + 1 dòng lỗi
  const lines = ['Team,Name,School'].concat(Array.from({ length: 11 }, (_, i) => `VN${100 + i}A, Đội ${i + 1}, Trường ${i % 3}, ${i % 2 ? 'MS' : 'ES'}`)).concat(['bad team!']);
  await p.fill('#tmPaste', lines.join('\n'));
  await p.click('#tmAdd');
  await p.waitForSelector('text=11 teams');
  assert(/Skipped lines: 13/.test(await toast()), 'bad line reported');
  // đổi tên đội inline
  await p.locator('tr[data-team="VN100A"] input[data-f=name]').fill('Sao Mai'); await p.locator('tr[data-team="VN100A"] input[data-f=name]').dispatchEvent('change');
  await p.waitForTimeout(200);

  // 4. Lịch
  await p.click('a[role=tab]:has-text("Schedule")'); await p.waitForSelector('#genSch');
  await p.click('#genSch');
  await p.waitForSelector('text=28 qualification matches');   // 11*5=55 chỗ → 28 trận
  assert(await p.locator('#schTable .star').count() === 1, 'exactly one * extra match');
  assert(await p.locator('#schTable tbody tr').first().locator('td').nth(1).innerText() === '09:00', 'first match 09:00');

  // 5. Chấm điểm tất cả trận: điểm = 50 + i; trận 1 đội đỏ thẻ đỏ; trận 2 đội xanh vắng
  await p.click('a[role=tab]:has-text("Scoring")'); await p.waitForSelector('#scRows tbody tr');
  const rows = p.locator('#scRows tbody tr'); const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    if (i === 0) await r.locator('[data-f=red_status]').selectOption('red');
    if (i === 1) await r.locator('[data-f=blue_status]').selectOption('absent');
    await r.locator('.score-in').fill(String(50 + i));
    await r.locator('.score-in').press('Enter');
    await p.waitForFunction(i => document.querySelectorAll('#scRows tbody tr')[i].classList.contains('done'), i);
  }
  const prog = await p.locator('#scProg').innerText(); console.log('      scProg=', prog, 'n=', n);
  assert(prog.startsWith(n + '/' + n), 'all matches scored');
  await shot('scoring'); await p.setViewportSize({ width: 390, height: 844 }); await shot('scoring-mobile'); await p.setViewportSize({ width: 1280, height: 800 });

  // 6. Solo + giới hạn 5 lượt
  await p.click('a[role=tab]:has-text("Solo")'); await p.waitForSelector('#fSolo');
  const solo = async (t, k, s, st) => { await p.fill('#soTeam', t); await p.selectOption('#soKind', k); await p.fill('#soScore', String(s)); if (st != null) await p.fill('#soStop', String(st)); await p.click('#fSolo button[type=submit]'); await p.waitForTimeout(150); };
  await solo('VN100A', 'driving', 120, 5); await solo('VN100A', 'coding', 60); await solo('VN101A', 'driving', 130); await solo('VN101A', 'coding', 50);
  for (let i = 0; i < 3; i++) await solo('VN102A', 'driving', 10 + i);
  await solo('VN102A', 'coding', 5); await solo('VN102A', 'coding', 6);
  await solo('VN102A', 'coding', 7);
  assert(/used all its solo attempts/.test(await toast()), 'solo attempt limit enforced');
  const soloTop = await p.locator('table').first().locator('tbody tr').first().innerText();
  // VN100A 120+60 = VN101A 130+50 = 180 → tiebreak 1 (coding cao nhất, 3.5): VN100A xếp trên
  assert(/VN100A[\s\S]*180/.test(soloTop), 'solo tie at 180 broken by best coding (3.5) → VN100A first');

  // 7. Xếp hạng
  await p.click('a[role=tab]:has-text("Rankings")'); await p.waitForSelector('text=Alliance rankings');
  const rk = await p.locator('table').first().locator('tbody tr').count();
  assert(rk === 11, 'alliance ranking lists 11 teams');

  // 8. Chung kết: loại 1 đội, tạo, chấm, hoà → tiebreak
  await p.click('a[role=tab]:has-text("Teams")'); await p.waitForSelector('#tmAdd');
  await p.locator('tr[data-team="VN110A"] input[data-f=excluded]').check(); await p.waitForTimeout(200);
  await p.click('a[role=tab]:has-text("Finals")'); await p.waitForSelector('#nAll');
  assert((await p.locator('#nAll').inputValue()) === '5', '10 eligible → 5 alliances');
  await p.fill('#nAll', '3'); await p.click('#genF');
  await p.waitForSelector('#fRows');
  const fr = p.locator('#fRows tbody tr'); assert(await fr.count() === 3, '3 finals matches');
  const fScores = [100, 140, 140];
  for (let i = 0; i < 3; i++) { await fr.nth(i).locator('.score-in').fill(String(fScores[i])); await fr.nth(i).locator('[data-save]').click(); await p.waitForTimeout(250); }
  await p.waitForSelector('#addTb');
  assert(/Tie for first place/.test(await p.locator('.banner.err').innerText()), 'tie detected');
  await p.click('#addTb'); await p.waitForTimeout(300);
  const fr2 = p.locator('#fRows tbody tr'); assert(await fr2.count() === 5, 'tiebreak matches added');
  await fr2.nth(3).locator('.score-in').fill('90'); await fr2.nth(3).locator('[data-save]').click(); await p.waitForTimeout(250);
  await p.locator('#fRows tbody tr').nth(4).locator('.score-in').fill('110'); await p.locator('#fRows tbody tr').nth(4).locator('[data-save]').click();
  await p.waitForSelector('.champ');
  await shot('finals');
  const champ = await p.locator('.champ').innerText(); console.log('      ', champ);

  // 9. Giải thưởng
  await p.click('a[role=tab]:has-text("Awards")'); await p.waitForSelector('#fAw');
  await p.fill('#awTeam', 'VN103A'); await p.fill('#awName', 'Excellence Award'); await p.click('#fAw button[type=submit]'); await p.waitForTimeout(200);
  await p.fill('#awTeam', 'VN103A'); await p.fill('#awName', 'Think Award'); await p.click('#fAw button[type=submit]'); await p.waitForTimeout(200);
  assert(/at most one judged award|already has a judged award/.test(await toast()), 'second judged award blocked');
  const awText = await p.locator('#pane table').innerText();
  assert(/Tournament Champions/.test(awText) && /Solo Match Champion/.test(awText) && /Excellence Award/.test(awText), 'auto + judged awards listed');

  // 10. Xuất CSV
  await p.click('a[role=tab]:has-text("Export")'); await p.waitForSelector('#dlCsv');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlCsv')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  assert(csv.split('\n')[0].replace('﻿', '') === 'event_code,event_name,program,season,date,country,partner,verified,team,team_name,organization,team_country,grade,type,value', 'CSV header matches results template');
  assert((csv.match(/,alliance,/g) || []).length === 55, '55 counted alliance rows (11×5)');
  require('fs').writeFileSync(process.env.CSV_OUT || '/tmp/e2e_event.csv', csv);

  // 11. Công bố, xác minh
  await p.click('a[role=tab]:has-text("Overview")'); await p.waitForSelector('#evStatus');
  await p.selectOption('#evStatus', 'live'); await p.check('#evVerified'); await p.click('#saveStatus'); await p.waitForTimeout(300);
  assert(/Live/.test(await p.locator('.pill').first().innerText()), 'status live');
  const evUrl = p.url(); await shot('overview');

  // 12. Tài khoản thứ 2 → chờ duyệt → SEPA duyệt
  await p.click('#signOut'); await p.waitForSelector('#fLogin');
  await p.click('text=Create account');
  await p.fill('#suName', 'Thầy B'); await p.fill('#suOrg', 'THCS B'); await p.fill('#suEmail', 'gv@thcs-b.edu.vn'); await p.fill('#suPw', 'secret2');
  await p.click('#fSignup button[type=submit]');
  await p.waitForSelector('text=Waiting for approval');
  await p.goto(evUrl); await p.waitForTimeout(200);
  assert(await p.locator('text=Waiting for approval').isVisible(), 'pending user cannot open event workspace');
  await p.click('#signOut'); await p.waitForSelector('#fLogin');
  await p.fill('#liEmail', 'daoquyen@sepa.org.vn'); await p.fill('#liPw', 'secret1'); await p.click('#fLogin button[type=submit]');
  await p.waitForSelector('#pendBadge .pill');
  await p.click('a:has-text("Accounts")');
  await shot('accounts');
  await p.click('button[data-s=approved]:not([data-r])'); await p.waitForTimeout(200);
  assert(!(await p.locator('#adm').innerText()).includes('Pending'), 'user approved');
  await p.click('a:has-text("Approval settings")'); await p.check('input[value=domains]'); await p.fill('#aDom', 'edu.vn\n@hanoi.edu.vn'); await p.click('#fSet button'); await p.waitForTimeout(200);
  await p.click('#signOut'); await p.waitForSelector('#fLogin');
  await p.click('text=Create account');
  await p.fill('#suName', 'C'); await p.fill('#suOrg', 'C'); await p.fill('#suEmail', 'c@hanoi.edu.vn'); await p.fill('#suPw', 'secret3');
  await p.click('#fSignup button[type=submit]');
  await p.waitForSelector('text=My events');
  assert(true, 'trusted-domain account auto-approved');
  await p.goto(evUrl); await p.waitForTimeout(300);
  assert(/Only the organizer/.test(await p.locator('#app').innerText()), 'other organizer cannot manage event');

  // 13. Tiếng Việt
  await p.click('.lang [data-l=vi]'); await p.waitForTimeout(100);
  assert(/Giải của tôi|Chỉ đơn vị tổ chức/.test(await p.locator('#app').innerText()), 'Vietnamese UI');
  await p.click('.lang [data-l=en]');

  // 14. Trang công khai
  await p.goto(BASE + '/event.html');
  await p.waitForSelector('.ev-item');
  console.log('      LIST:', (await p.locator('#app').innerText()).slice(0, 200).replace(/\n/g, ' / '));
  assert(/Live now \(1\)/i.test(await p.locator('#app').innerText()), 'public list shows 1 live event');
  await p.click('.ev-item'); await p.waitForSelector('#pane table');
  assert(/Alliance rankings/i.test(await p.locator('#pane').innerText()), 'event page opens on rankings');
  const pubRank = await p.locator('#pane table').first().locator('tbody tr').count();
  assert(pubRank === 11, 'public alliance ranking has 11 teams');
  await p.fill('#myTeam', 'vn100a'); await p.locator('#myTeam').dispatchEvent('input');
  assert(/VN100A · Sao Mai/i.test(await p.locator('#mine').innerText()), 'follow-a-team card');
  await p.click('a[role=tab]:has-text("Matches")'); await p.waitForTimeout(150);
  assert(await p.locator('#pane tr[style*="outline"]').count() >= 5, 'followed team matches highlighted');
  await p.click('a[role=tab]:has-text("Finals")'); await p.waitForTimeout(150);
  assert(await p.locator('.champ').isVisible(), 'champions shown publicly');
  await shot('public-event');
  await p.setViewportSize({ width: 390, height: 844 }); await shot('public-mobile');
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'public page no horizontal scroll on phone');
  await p.setViewportSize({ width: 1280, height: 800 });

  // 15. Xếp hạng toàn cầu trên trang chủ gộp giải đã xác minh
  await p.goto(BASE + '/index.html#xephang'); await p.waitForSelector('#rkTable table');
  const cnt = await p.locator('#rkCount').innerText(); console.log('      ', cnt);
  assert(/verified event/.test(cnt), 'global rankings count verified events');
  assert(await p.locator('#rkTable tr[data-team="VN100A"]').count() === 1, 'tool team appears in global rankings');

  console.log('PAGE ERRORS', JSON.stringify(errs));
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
