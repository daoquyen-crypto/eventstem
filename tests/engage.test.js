// Chạy: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engage.js');

const teams = n => Array.from({ length: n }, (_, i) => 'T' + String(i + 1).padStart(2, '0'));
function counts(ms) {
  const c = {}, all = {};
  ms.forEach(m => ['red', 'blue'].forEach(s => { all[m[s]] = (all[m[s]] || 0) + 1; if (m[s + '_counts']) c[m[s]] = (c[m[s]] || 0) + 1; }));
  return { c, all };
}

test('lịch: mỗi đội đúng số trận tính điểm, số chẵn chỗ', () => {
  const r = E.schedule(teams(12), { matchesPerTeam: 6, seed: 1 });
  assert.equal(r.matches.length, 36);
  const { c } = counts(r.matches);
  teams(12).forEach(t => assert.equal(c[t], 6));
  r.matches.forEach(m => assert.notEqual(m.red, m.blue));
  assert.equal(r.matches[0].num, 1);
});

test('lịch: tổng chỗ lẻ thì có đúng 1 chỗ đánh dấu * (không tính)', () => {
  const r = E.schedule(teams(7), { matchesPerTeam: 5, seed: 2 });   // 35 chỗ → 18 trận
  assert.equal(r.matches.length, 18);
  const { c } = counts(r.matches);
  teams(7).forEach(t => assert.equal(c[t], 5));
  const star = r.matches.flatMap(m => ['red', 'blue'].filter(s => !m[s + '_counts']));
  assert.equal(star.length, 1);
});

test('lịch: nhiều sân thì 1 đội không đánh 2 sân cùng lượt', () => {
  const r = E.schedule(teams(20), { matchesPerTeam: 6, fields: 3, seed: 3, start: '08:30', cycleMin: 5 });
  const bySlot = {};
  r.matches.forEach(m => { (bySlot[m.time] = bySlot[m.time] || []).push(m.red, m.blue); });
  Object.values(bySlot).forEach(ts => assert.equal(new Set(ts).size, ts.length));
  assert.equal(r.matches[0].time, '08:30');
  assert.equal(r.matches[3].time, '08:35');
  assert.deepEqual(r.matches.slice(0, 3).map(m => m.field), ['1', '2', '3']);
});

test('lịch: cùng seed cho cùng lịch; đủ đội thì không gặp lại đồng đội', () => {
  const a = E.schedule(teams(16), { matchesPerTeam: 6, seed: 'x' }), b = E.schedule(teams(16), { matchesPerTeam: 6, seed: 'x' });
  assert.deepEqual(a.matches, b.matches);
  assert.equal(a.stats.repeats, 0);
});

test('lịch: ít hơn 2 đội thì không có trận', () => {
  assert.equal(E.schedule(['A'], {}).matches.length, 0);
});

const T = ['A', 'B', 'C', 'D'].map(n => ({ number: n }));
const qm = (red, blue, score, extra) => Object.assign({ round: 'qual', red, blue, red_counts: true, blue_counts: true, score, red_status: 'ok', blue_status: 'ok' }, extra);

test('alliance: bỏ trận thấp nhất, kể cả trận 0 vì thẻ đỏ', () => {
  const ms = [qm('A', 'B', 100), qm('A', 'C', 80, { red_status: 'red' }), qm('A', 'D', 60), qm('B', 'C', 50)];
  const r = E.allianceRanking(T, ms, {});
  const A = r.find(x => x.team === 'A');
  assert.deepEqual(A.sorted, [100, 60, 0]);
  assert.equal(A.avg, 80);
  assert.equal(A.dropped, 0);
  const C = r.find(x => x.team === 'C');   // C không bị thẻ đỏ → giữ 80
  assert.deepEqual(C.sorted, [80, 50]);
  assert.equal(C.avg, 80);
});

test('alliance: vắng mặt = 0; trận * và trận chưa đánh không tính', () => {
  const ms = [qm('A', 'B', 90, { blue_status: 'absent' }), qm('A', 'B', 70, { blue_counts: false }), qm('A', 'B', null)];
  const r = E.allianceRanking(T, ms, { dropLowest: false });
  assert.deepEqual(r.find(x => x.team === 'B').sorted, [0]);
  assert.deepEqual(r.find(x => x.team === 'A').sorted, [90, 70]);
});

test('alliance: tiebreak điểm cao thứ 2, rồi bốc thăm ổn định', () => {
  // A: 100,60,40 → bỏ 40 → TB 80, thứ 2 = 60.  B: 90,70,10 → TB 80, thứ 2 = 70 → B trên A
  const ms = [qm('A', 'C', 100), qm('A', 'D', 60), qm('A', 'C', 40), qm('B', 'D', 90), qm('B', 'C', 70), qm('B', 'D', 10)];
  const r = E.allianceRanking(T, ms, {});
  assert.ok(r.findIndex(x => x.team === 'B') < r.findIndex(x => x.team === 'A'));
  const s1 = E.allianceRanking(T, [qm('A', 'B', 50)], { seed: 'ev1' }).map(x => x.team);
  const s2 = E.allianceRanking(T, [qm('A', 'B', 50)], { seed: 'ev1' }).map(x => x.team);
  assert.deepEqual(s1, s2);
});

test('alliance: đội chưa đánh trận nào nằm cuối', () => {
  const r = E.allianceRanking(T, [qm('A', 'B', 0)], {});
  assert.deepEqual(r.slice(2).map(x => x.played), [0, 0]);
});

test('solo: tổng driving + coding, tiebreak coding cao nhất', () => {
  const runs = [
    { team: 'A', kind: 'driving', score: 100 }, { team: 'A', kind: 'coding', score: 50 },
    { team: 'B', kind: 'driving', score: 90 }, { team: 'B', kind: 'coding', score: 60 },
    { team: 'C', kind: 'driving', score: 120 }
  ];
  const r = E.soloRanking(runs);
  assert.deepEqual(r.map(x => [x.team, x.total]), [['B', 150], ['A', 150], ['C', 120]]);
});

test('solo: tiebreak stop time của trận driving cao nhất', () => {
  const runs = [
    { team: 'A', kind: 'driving', score: 100, stop_time: 5 }, { team: 'A', kind: 'coding', score: 50 },
    { team: 'B', kind: 'driving', score: 100, stop_time: 12 }, { team: 'B', kind: 'coding', score: 50 }
  ];
  assert.equal(E.soloRanking(runs)[0].team, 'B');
});

test('chung kết: ghép 1+2, 3+4; loại đội ≥3 thẻ đỏ và đội rút; đánh từ liên minh thấp nhất', () => {
  const teams6 = ['A', 'B', 'C', 'D', 'E', 'F'].map(n => ({ number: n, excluded: n === 'C' }));
  const ms = [qm('A', 'B', 100), qm('C', 'D', 90), qm('E', 'F', 80),
    qm('B', 'D', 70, { blue_status: 'red' }), qm('D', 'F', 60, { red_status: 'red' }), qm('D', 'E', 50, { red_status: 'red' })];
  const rk = E.allianceRanking(teams6, ms, { dropLowest: false });
  const el = E.finalsEligible(rk, teams6, ms, {});
  assert.ok(!el.some(x => x.team === 'C' || x.team === 'D'));
  const fm = E.finalsMatches(el, 2);
  assert.equal(fm.length, 2);
  assert.equal(fm[0].seed, 2);                                 // liên minh hạng thấp đánh trước
  assert.deepEqual([fm[1].red, fm[1].blue], [el[0].team, el[1].team]);
});

test('chung kết: điểm cao nhất vô địch; thẻ đỏ = cả liên minh 0; hoà thì cần tiebreak', () => {
  const f = (num, red, blue, score, x) => Object.assign({ round: 'final', num, red, blue, score, red_status: 'ok', blue_status: 'ok' }, x);
  let r = E.finalsResult([f(1, 'C', 'D', 120), f(2, 'A', 'B', 150, { blue_status: 'red' })]);
  assert.equal(r.champion.red, 'C');
  r = E.finalsResult([f(1, 'C', 'D', 120), f(2, 'A', 'B', 120)]);
  assert.equal(r.champion, null);
  assert.equal(r.tied.length, 2);
  r = E.finalsResult([f(1, 'C', 'D', 120), f(2, 'A', 'B', 120), f(3, 'C', 'D', 90), f(4, 'A', 'B', 100)]);
  assert.equal(r.champion.red, 'A');
  r = E.finalsResult([f(1, 'C', 'D', 120), f(2, 'A', 'B', null)]);
  assert.equal(r.done, false);
});

test('giải thưởng: 1 đội không nhận quá 1 giải giám khảo', () => {
  assert.deepEqual(E.awardConflicts([{ team: 'A', judged: true }, { team: 'A', judged: true }, { team: 'B', judged: true }, { team: 'B', judged: false }]), ['A']);
});

test('CSV: đúng cột của build_results.py, có giải thành tích tự động', () => {
  const ev = { recf_code: 'ENG1', name: 'Giải "Thử", HN', program: 'Engage', date: '2026-11-01', country: 'Vietnam', verified: true };
  const tm = [{ number: 'A', name: 'Sao', grade: 'ES' }, { number: 'B', grade: 'MS' }];
  const ms = [qm('A', 'B', 80), { round: 'final', num: 1, red: 'A', blue: 'B', score: 90, red_status: 'ok', blue_status: 'ok' }];
  const csv = E.toCSV(E.resultRows(ev, tm, ms, [{ team: 'A', kind: 'coding', score: 40 }], [{ team: 'B', name: 'Think Award', judged: true }]));
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], E.CSV_COLS.join(','));
  assert.match(lines[1], /^ENG1,"Giải ""Thử"", HN",Engage,2026-2027,2026-11-01,Vietnam,,yes,A,Sao,,Vietnam,ES,solo2,40$/);
  assert.equal(lines.filter(l => /,alliance,80$/.test(l)).length, 2);
  assert.ok(lines.some(l => /,B,.*,award,Think Award$/.test(l)));
  assert.equal(lines.filter(l => /award,Tournament Champions$/.test(l)).length, 2);
  assert.ok(lines.some(l => /,A,.*award,Solo Match Champion$/.test(l)));
});

test('mùa giải theo ngày', () => {
  assert.equal(E.season('2026-11-01'), '2026-2027');
  assert.equal(E.season('2027-03-01'), '2026-2027');
});

test('nhập đội: bỏ tiêu đề, trùng, dòng lỗi; nhận tab/phẩy/chấm phẩy', () => {
  const r = E.parseTeams('Team,Name,Org\nvn1234a, Sao Mai, Trường A, ms\nVN1234A,dup\nVN9; X; Y\nbad team!\n\tVN7\tZ', { grade: 'ES', country: 'Vietnam' });
  assert.deepEqual(r.teams.map(t => [t.number, t.grade]), [['VN1234A', 'MS'], ['VN9', 'ES'], ['VN7', 'ES']]);
  assert.equal(r.teams[0].country, 'Vietnam');
  assert.deepEqual(r.badLines, [5]);
});
