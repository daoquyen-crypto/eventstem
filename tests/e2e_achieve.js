// Kiểm thử trọn luồng 1 giải RECF Achieve (2 đấu 2) ở chế độ demo.  Chạy: python3 -m http.server 8767 & node tests/e2e_achieve.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8767';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ', m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } }), p = await ctx.newPage();
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.EVENTSTEM_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };' }));
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  const shot = async n => { if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/' + n + '.png' }); };
  const toast = async () => (await p.locator('#toast').innerText().catch(() => ''));
  const tab = async (name, sel) => { await p.click(`a[role=tab]:has-text("${name}")`); await p.waitForSelector(sel); };

  await p.goto(BASE + '/manage.html');
  await p.click('text=Create account');
  await p.fill('#suName', 'SEPA'); await p.fill('#suOrg', 'SEPA'); await p.fill('#suEmail', 'daoquyen@sepa.org.vn'); await p.fill('#suPw', 'secret1');
  await p.click('#fSignup button[type=submit]'); await p.waitForSelector('text=My events');

  // 1. Tạo giải Achieve
  await p.click('text=+ New event');
  await p.selectOption('#evProg', 'Achieve');
  assert(await p.isChecked('input[name=grade][value=MS]') && await p.isChecked('input[name=grade][value=HS]') && !(await p.isChecked('input[name=grade][value=ES]')), 'Achieve defaults to MS + HS');
  assert(await p.locator('#cFinals').isVisible() && !(await p.locator('#cDrop').isVisible()), 'Achieve shows finals format, hides drop-lowest');
  await p.fill('#evName', 'Pinnacle Hà Nội'); await p.fill('#evDate', '2026-12-05'); await p.fill('#cMpt', '5'); await p.fill('#cFields', '2');
  await p.click('#fNew button[type=submit]'); await p.waitForSelector('#tmPaste');
  assert(await p.locator('a[role=tab]:has-text("Eliminations")').count() === 1, 'tab renamed to Eliminations');

  // 2. 13 đội
  await p.fill('#tmPaste', Array.from({ length: 13 }, (_, i) => `VA${100 + i}, Team ${i + 1}, School ${i % 4}, ${i % 2 ? 'HS' : 'MS'}`).join('\n'));
  await p.selectOption('#tmGrade', 'MS'); await p.click('#tmAdd'); await p.waitForSelector('text=13 teams');

  // 3. Lịch 2v2: 13×5 = 65 chỗ → 17 trận (68 chỗ, 3 chỗ *)
  await tab('Schedule', '#genSch'); await p.click('#genSch');
  await p.waitForSelector('text=17 qualification matches');
  assert(await p.locator('#schTable .star').count() === 3, '3 extra seats marked *');
  const firstRow = await p.locator('#schTable tbody tr').first().innerText();
  assert((firstRow.match(/VA\d{3}/g) || []).length === 4, 'each match lists 4 teams');

  // 4. Chấm điểm: đỏ thắng các trận chẵn; tick Auto RP cho đỏ ở trận 1; trận 1 đội đỏ thứ 2 thẻ đỏ; trận 2 đội xanh 1 vắng
  await tab('Scoring', '#scRows tbody tr');
  const rows = p.locator('#scRows tbody tr'), n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    if (i === 0) { await r.locator('[data-f=red2_status]').selectOption('red'); await r.locator('[data-f=auto_red]').check(); }
    if (i === 1) await r.locator('[data-f=blue_status]').selectOption('absent');
    if (i === 2) await r.locator('[data-f=end_blue]').check();
    await r.locator('[data-f=score]').fill(String(i % 2 ? 20 : 40 + i));
    await r.locator('[data-f=score_blue]').fill(String(i % 2 ? 35 : 30));
    if (i === 3) { await r.locator('[data-f=score_blue]').fill(''); await r.locator('[data-save]').click(); assert(/both alliance scores/.test(await toast()), 'both scores required'); await r.locator('[data-f=score_blue]').fill('35'); }
    await r.locator('[data-save]').click();
    await p.waitForFunction(i => document.querySelectorAll('#scRows tbody tr')[i].classList.contains('done'), i);
  }
  assert((await p.locator('#scProg').innerText()).startsWith(n + '/' + n), 'all 17 matches scored');
  await shot('achieve-scoring');

  // 5. Xếp hạng RP
  await tab('Rankings', 'text=Qualification rankings');
  const rk = p.locator('#pane table').first().locator('tbody tr');
  assert(await rk.count() === 13, 'RP ranking lists 13 teams');
  const top = await rk.first().innerText(); console.log('       #1:', top.replace(/\s+/g, ' '));
  assert(/\d\.\d\d/.test(top), 'average RP shown with 2 decimals');

  // 6. Solo
  await tab('Solo', '#fSolo');
  for (const [t, k, sc] of [['VA100', 'driving', 50], ['VA100', 'coding', 20], ['VA101', 'driving', 45], ['VA101', 'coding', 25]]) {
    await p.fill('#soTeam', t); await p.selectOption('#soKind', k); await p.fill('#soScore', String(sc)); await p.click('#fSolo button[type=submit]'); await p.waitForTimeout(150);
  }
  assert(/VA101/.test(await p.locator('#pane table').first().locator('tbody tr').first().innerText()), 'Achieve solo tiebreak: best coding first (VA101 70 = VA100 70, coding 25 > 20)');

  // 7. Chọn liên minh: đề xuất 5 cho 13 đội; chọn 4; đội đầu tiên được mời từ chối
  await tab('Eliminations', '#nAll');
  assert(await p.inputValue('#nAll') === '5', 'recommended alliances for 13 teams = (13-3)/2 = 5');
  await p.fill('#nAll', '4'); await p.click('#startSel'); await p.waitForSelector('#invitee');
  const cap1 = await p.locator('#pane b.code').first().innerText();
  const firstInvitee = await p.inputValue('#invitee');
  await p.click('#decline'); await p.waitForSelector('text=Declined (cannot be invited again)');
  assert(!(await p.locator('#invitee option').allTextContents()).some(t => t.includes(firstInvitee)), 'declined team removed from invite list');
  for (let k = 0; k < 4; k++) { await p.click('#accept'); await p.waitForTimeout(150); }
  await p.waitForSelector('text=Selection complete');
  const al = await p.locator('#pane table').first().innerText();
  assert(al.includes(cap1), 'top-ranked team captains alliance 1');
  // đội đã từ chối vẫn làm đội trưởng được nếu đủ hạng → kiểm tra nó không phải partner của ai
  const partners = await p.locator('#pane table').first().locator('tbody tr td:nth-child(3)').allInnerTexts();
  assert(!partners.some(t => t.includes(firstInvitee)), 'declined team was never picked as a partner');
  await shot('achieve-selection');

  // 8. Nhánh đấu 4 liên minh: bán kết 1v4, 2v3
  await p.click('#mkBracket'); await p.waitForSelector('#eRows');
  let er = p.locator('#eRows tbody tr');
  assert(await er.count() === 2, '2 semifinal matches created');
  const score = async (i, a, bb, x) => { const r = p.locator('#eRows tbody tr').nth(i); if (x) await x(r); await r.locator('[data-f=score]').fill(String(a)); await r.locator('[data-f=score_blue]').fill(String(bb)); await r.locator('[data-save]').click(); await p.waitForTimeout(400); };
  await score(0, 40, 40);                                    // hoà → đánh lại
  assert(await p.locator('#eRows tbody tr').count() === 3, 'tie creates a replay automatically');
  await score(1, 60, 20);                                    // 2 thắng 3
  await score(2, 50, 30);                                    // trận đánh lại: 1 thắng 4
  await p.waitForFunction(() => document.querySelectorAll('#eRows tbody tr').length === 4);
  assert(/^F1/.test(await p.locator('#eRows tbody tr').nth(3).locator('td').first().innerText()), 'final created after both semis');
  await score(3, 90, 10, async r => { await r.locator('[data-f=blue2_status]').selectOption('red'); });
  await score(3, 20, 80, async r => { await r.locator('[data-f=blue2_status]').selectOption('red'); });   // xanh thắng điểm nhưng thẻ đỏ → 0
  await p.waitForSelector('.champ');
  const champ = await p.locator('.champ').innerText(); console.log('      ', champ);
  assert(champ.includes(cap1), 'red-card in final zeroes the blue alliance → seed 1 champions');
  await shot('achieve-bracket');

  // 9. Giải thưởng + CSV
  await tab('Awards', '#fAw');
  assert((await p.locator('#pane table').innerText()).match(/Tournament Champions/g).length === 2, 'both champion teams get Tournament Champions');
  await tab('Export', '#dlCsv');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlCsv')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  assert((csv.match(/,alliance,/g) || []).length === 65, '65 counted alliance rows (13×5)');
  assert(/,Achieve,2026-2027,/.test(csv), 'CSV program Achieve, season 2026-2027');

  // 10. Công bố + xác minh, trang công khai
  await tab('Overview', '#evStatus');
  assert(await p.locator('#evProg').isDisabled(), 'rules locked once matches exist');
  await p.selectOption('#evStatus', 'live'); await p.check('#evVerified'); await p.click('#saveStatus'); await p.waitForTimeout(300);
  await p.goto(BASE + '/event.html'); await p.waitForSelector('.ev-item'); await p.click('.ev-item'); await p.waitForSelector('#pane table');
  assert(/Qualification rankings/i.test(await p.locator('#pane').innerText()), 'public RP rankings');
  await p.fill('#myTeam', 'VA105'); await p.locator('#myTeam').dispatchEvent('input');
  assert(/Rank #\d+ \(\d\.\d\d RP\)/.test(await p.locator('#mine').innerText()), 'follow-a-team shows RP rank');
  await p.click('a[role=tab]:has-text("Eliminations")'); await p.waitForSelector('.champ');
  assert(/Semifinals/i.test(await p.locator('#pane').innerText()) && /Finals/i.test(await p.locator('#pane').innerText()), 'public bracket with rounds');
  await p.click('a[role=tab]:has-text("Matches")'); await p.waitForTimeout(150);
  assert(await p.locator('#pane tr[style*="outline"]').count() >= 5, 'followed team highlighted in 2v2 schedule');
  await shot('achieve-public');
  await p.setViewportSize({ width: 390, height: 844 });
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'public page fits a phone');
  await p.setViewportSize({ width: 1280, height: 800 });

  // 11. Xếp hạng toàn cầu: chương trình Achieve có dữ liệu
  await p.goto(BASE + '/index.html#xephang'); await p.waitForSelector('#rkTable');
  await p.click('#rkProg button[data-v="Achieve"]'); await p.waitForSelector('#rkTable table');
  assert(await p.locator('#rkTable tr[data-team="VA100"]').count() === 1, 'Achieve tool event in global rankings');

  console.log('PAGE ERRORS', JSON.stringify(errs));
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
