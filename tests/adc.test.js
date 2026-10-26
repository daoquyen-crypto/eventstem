// Luật ADC Fast Track (Game Manual v1.1).  Chạy: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/adc.js');
const Rules = require('../js/rules.js');

const teams = n => Array.from({ length: n }, (_, i) => ({ number: 'D' + String(i + 1).padStart(2, '0') }));
const q = (num, red, blue, score, extra) => Object.assign({ round: 'qual', num, red, blue, score, red_counts: true, blue_counts: true, red_status: 'ok', blue_status: 'ok' }, extra);

test('Rules: chọn được bộ luật ADC', () => {
  const R = Rules.of({ ruleset: 'adc-2027' });
  assert.equal(R.id, 'adc-2027');
  assert.equal(R.format, 'coop');
  assert.equal(R.eliminations, 'rounds');
  assert.deepEqual(R.grades, ['ES', 'MS', 'HS']);
  assert.ok(Rules.CHOICES.some(c => c.program === 'ADC' && c.ruleset === 'adc-2027'));
  assert.equal(Rules.choiceOf({ program: 'ADC', ruleset: 'adc-2027' }).key, 'ADC');
});

test('lịch: dùng lịch hợp tác 2 đội, đủ số trận', () => {
  const r = D.schedule(teams(10).map(t => t.number), { matchesPerTeam: 6, seed: 4 });
  assert.equal(r.matches.length, 30);
  r.matches.forEach(m => { assert.notEqual(m.red, m.blue); assert.equal(m.round, 'qual'); });
});

test('7.4.2: bỏ trận thấp nhất (kể cả 0 do thẻ đỏ), bằng điểm so điểm cao thứ 2 rồi thứ 3', () => {
  const T = teams(4), ms = [
    q(1, 'D01', 'D02', 50), q(2, 'D01', 'D03', 40), q(3, 'D01', 'D04', 30, { red_status: 'red' }),
    q(4, 'D02', 'D03', 60), q(5, 'D02', 'D04', 30),
    q(6, 'D03', 'D04', 50)
  ];
  const rk = D.ranking(T, ms, { seed: 'x' }), by = Object.fromEntries(rk.map(r => [r.team, r]));
  // D01: 50, 40, 0 → bỏ 0 → TB 45
  assert.equal(by.D01.dropped, 0); assert.equal(by.D01.avg, 45);
  // D02: 50, 60, 30 → bỏ 30 → TB 55
  assert.equal(by.D02.avg, 55);
  // D03: 40, 60, 50 → TB 55; bằng D02, so điểm cao thứ 2: D03 = 50, D02 = 50; thứ 3: D03 = 40 > D02 = 30
  assert.equal(by.D03.avg, 55);
  assert.ok(by.D03.rank < by.D02.rank);
});

test('7.4.2: tiebreak chỉ tới điểm cao thứ 3, sau đó bốc thăm', () => {
  const T = teams(4);
  // D01 và D02 cùng điểm 10,10,10,0 ; khác ở điểm thứ 4 (0 vs 0) -> phải bốc thăm, không lỗi
  const ms = [q(1, 'D01', 'D03', 10), q(2, 'D01', 'D04', 10), q(3, 'D01', 'D03', 10), q(4, 'D01', 'D04', 5),
    q(5, 'D02', 'D03', 10), q(6, 'D02', 'D04', 10), q(7, 'D02', 'D03', 10), q(8, 'D02', 'D04', 0)];
  const a = D.ranking(T, ms, { seed: 's1' }), b = D.ranking(T, ms, { seed: 's1' });
  assert.deepEqual(a.map(r => r.team), b.map(r => r.team));   // cùng seed → cùng kết quả
  const r1 = a.find(r => r.team === 'D01'), r2 = a.find(r => r.team === 'D02');
  assert.equal(r1.avg, r2.avg);
});

test('3.5: Solo = Piloting cao nhất + Autonomous cao nhất, tiebreak theo Autonomous', () => {
  const runs = [
    { team: 'A', kind: 'driving', score: 60 }, { team: 'A', kind: 'coding', score: 40 },
    { team: 'B', kind: 'driving', score: 50 }, { team: 'B', kind: 'coding', score: 50 },
    { team: 'C', kind: 'driving', score: 50 }, { team: 'C', kind: 'coding', score: 50 }, { team: 'C', kind: 'coding', score: 20 },
    { team: 'D', kind: 'driving', score: 90 }
  ];
  const rk = D.soloRanking(runs);
  assert.deepEqual(rk.map(r => r.team), ['C', 'B', 'A', 'D']);   // C hơn B nhờ Autonomous thứ 2; B hơn A nhờ Autonomous cao nhất
  assert.equal(rk[0].total, 100); assert.equal(rk[3].total, 90);
  assert.equal(rk[0].autonomous, 2); assert.equal(rk[0].piloting, 1);
});

test('7.4.1: mỗi loại solo tối đa 3 lượt', () => {
  const runs = [{ team: 'A', kind: 'driving' }, { team: 'A', kind: 'driving' }, { team: 'A', kind: 'coding' }];
  assert.equal(D.soloLeft(runs, 'A', 'driving'), 1);
  assert.equal(D.soloLeft(runs, 'A', 'coding'), 2);
  assert.equal(D.soloLeft(runs, 'B', 'coding'), 3);
});

test('7.4.4: số liên minh theo số đội đủ điều kiện', () => {
  assert.equal(D.recommendedAlliances(25), 10);
  assert.equal(D.recommendedAlliances(20), 10);
  assert.equal(D.recommendedAlliances(19), 4);
  assert.equal(D.recommendedAlliances(8), 4);
  assert.equal(D.recommendedAlliances(7), 2);
  assert.equal(D.recommendedAlliances(3), 1);
  assert.deepEqual(D.stagesFor(10), ['QF', 'SF', 'F']);
  assert.deepEqual(D.stagesFor(4), ['SF', 'F']);
  assert.deepEqual(D.stagesFor(2), ['F']);
});

test('1.6.4: từ 3 thẻ đỏ không được chọn liên minh', () => {
  const T = teams(4), ms = [1, 2, 3].map(i => q(i, 'D01', 'D02', 20, { red_status: 'red' })).concat([q(4, 'D03', 'D04', 10)]);
  const el = D.eligible(D.ranking(T, ms), T, ms);
  assert.ok(!el.some(r => r.team === 'D01'));
  assert.ok(el.some(r => r.team === 'D02'));
});

/* Giả lập chấm điểm các trận loại trực tiếp */
const alliances = n => Array.from({ length: n }, (_, i) => ({ seed: i + 1, captain: 'C' + (i + 1), partner: 'P' + (i + 1) }));
function addAll(ms, toCreate, scoreOf) {
  toCreate.forEach(m => ms.push(Object.assign({}, m, { score: scoreOf(m) })));
}

test('7.4.5: 10 liên minh: tứ kết → 4 vào bán kết → 2 vào chung kết; đánh từ hạt giống thấp nhất', () => {
  const al = alliances(10), ms = [];
  let r = D.eliminations(al, ms);
  assert.equal(r.toCreate.length, 10);
  assert.deepEqual(r.toCreate.map(m => m.seed), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.ok(r.toCreate.every(m => m.round === 'elim' && m.label === 'QF'));
  assert.deepEqual(r.toCreate.map(m => m.num), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  addAll(ms, r.toCreate, m => 100 - m.seed * 5);                   // hạt giống 1..4 cao nhất
  r = D.eliminations(al, ms);
  assert.equal(r.stages[0].done, true);
  assert.deepEqual(r.toCreate.map(m => m.seed), [4, 3, 2, 1]);     // bán kết: xếp thấp nhất ở tứ kết đánh trước
  assert.ok(r.toCreate.every(m => m.label === 'SF' && m.round === 'elim'));
  assert.deepEqual(r.toCreate.map(m => m.num), [11, 12, 13, 14]);
  addAll(ms, r.toCreate, m => ({ 1: 40, 2: 70, 3: 90, 4: 10 })[m.seed]);
  r = D.eliminations(al, ms);
  assert.deepEqual(r.toCreate.map(m => m.seed), [2, 3]);           // chung kết: 3 (90) và 2 (70); 2 đánh trước
  assert.ok(r.toCreate.every(m => m.round === 'final' && m.label === 'F'));
  addAll(ms, r.toCreate, m => ({ 2: 120, 3: 100 })[m.seed]);
  r = D.eliminations(al, ms);
  assert.equal(r.champion.seed, 2);
  assert.equal(r.done, true);
  assert.equal(r.toCreate.length, 0);
});

test('7.4.5: hoà ở ngưỡng thì cùng đi tiếp (ví dụ hình 7.4.5-F2: 5 liên minh vào bán kết)', () => {
  const al = alliances(10), ms = [], pts = { 1: 100, 2: 90, 3: 85, 4: 80, 5: 80, 6: 75, 7: 60, 8: 60, 9: 50, 10: 40 };
  addAll(ms, D.eliminations(al, ms).toCreate, m => pts[m.seed]);
  const r = D.eliminations(al, ms);
  assert.deepEqual(r.stages[0].rows.filter(x => x.advance).map(x => x.seed), [1, 2, 3, 4, 5]);
  assert.equal(r.toCreate.length, 5);
  assert.deepEqual(r.toCreate.map(m => m.seed), [5, 4, 3, 2, 1]);
});

test('1.6.3: thẻ đỏ ở loại trực tiếp làm cả liên minh 0 điểm', () => {
  const al = alliances(2), ms = [];
  const tc = D.eliminations(al, ms).toCreate;
  ms.push(Object.assign({}, tc[0], { score: 50 }));                                 // hạt giống 2
  ms.push(Object.assign({}, tc[1], { score: 90, blue_status: 'red' }));            // hạt giống 1, thẻ đỏ
  const r = D.eliminations(al, ms);
  assert.equal(r.champion.seed, 2);
});

test('7.4.5: chung kết hoà → TB1 → TB2 → so điểm vòng trước', () => {
  const al = alliances(4), ms = [];
  addAll(ms, D.eliminations(al, ms).toCreate, m => ({ 1: 80, 2: 90, 3: 70, 4: 60 })[m.seed]);   // bán kết: 2 và 1 vào chung kết
  addAll(ms, D.eliminations(al, ms).toCreate, () => 100);                                      // chung kết hoà
  let r = D.eliminations(al, ms);
  assert.equal(r.champion, null);
  assert.deepEqual(r.tied.map(a => a.seed).sort(), [1, 2]);
  assert.ok(r.toCreate.every(m => m.label === 'TB1' && m.round === 'final'));
  assert.deepEqual(r.toCreate.map(m => m.num), [3, 4]);
  addAll(ms, r.toCreate, () => 50);                                                          // TB1 hoà
  r = D.eliminations(al, ms);
  assert.ok(r.toCreate.every(m => m.label === 'TB2'));
  addAll(ms, r.toCreate, () => 60);                                                          // TB2 hoà → xét bán kết: 2 (90) > 1 (80)
  r = D.eliminations(al, ms);
  assert.equal(r.champion.seed, 2);
  assert.equal(r.tiebreaks.length, 2);
});

test('7.4.5: tiebreak phân định được ngay ở TB1', () => {
  const al = alliances(2), ms = [];
  addAll(ms, D.eliminations(al, ms).toCreate, () => 70);
  addAll(ms, D.eliminations(al, ms).toCreate, m => (m.seed === 1 ? 30 : 45));
  const r = D.eliminations(al, ms);
  assert.equal(r.champion.seed, 2);
});

test('giải thưởng thành tích và CSV', () => {
  const al = alliances(2), ms = [q(1, 'C1', 'P1', 40), q(2, 'C2', 'P2', 30)];
  addAll(ms, D.eliminations(al, ms).toCreate, m => (m.seed === 1 ? 80 : 60));
  const ev = { id: 'abc', name: 'Drone Cup', date: '2026-11-20', country: 'Vietnam', config: { selection: { n: 2, picks: [{ captain: 'C1', partner: 'P1' }, { captain: 'C2', partner: 'P2' }] } } };
  const runs = [{ team: 'C2', kind: 'driving', score: 55 }, { team: 'C2', kind: 'coding', score: 30 }, { team: 'P1', kind: 'coding', score: 70 }];
  const aw = D.performanceAwards(ms, runs, ev);
  assert.deepEqual(aw.map(a => a.team + ':' + a.name), ['C1:Teamwork Champions', 'P1:Teamwork Champions', 'C2:Skills Mission Champion']);
  const T = ['C1', 'P1', 'C2', 'P2'].map(n => ({ number: n }));
  const rows = D.resultRows(ev, T, ms, runs, []);
  assert.ok(rows.every(r => r[2] === 'ADC'));
  assert.equal(rows.filter(r => r[13] === 'alliance').length, 4);       // chỉ trận vòng loại
  assert.deepEqual(rows.filter(r => r[13] === 'solo1').map(r => r[14]), [55]);
  assert.deepEqual(rows.filter(r => r[13] === 'solo2').map(r => r[14]), [30, 70]);
  assert.equal(rows.filter(r => r[13] === 'award').length, 3);
});

test('5.1: điểm Alliance từ thành phần (bóng, goal bonus, túi đậu, đường bay, hạ cánh)', () => {
  // 4 goal: 3,1,2,4 bóng → 2×10 + 5×1 = 25; vùng 3 → 3; túi 2 → 20; đường bay 1 → 10; khối nhỏ → 20
  const r = D.calc('alliance', { goals: [3, 1, 2, 4], zone: 3, bags: 2, paths: 1, small: true });
  assert.equal(r.score, 25 + 3 + 20 + 10 + 20);
  assert.deepEqual(r.detail.goals, [3, 1, 2, 4]);
  // cắt theo tối đa: túi đậu 2, đường bay 2; goal trống → không có bonus
  assert.equal(D.calc('alliance', { goals: [5, 0, 5, 5], bags: 9, paths: 3, large: 1 }).score, 30 + 0 + 20 + 20 + 15);
  // đổi số goal
  assert.equal(D.calc('alliance', { goals: [2, 2, 9] }, { goals: 2 }).score, 8 + 10);
});

test('3.1 / 4.2: điểm Solo từ thành phần', () => {
  // Piloting: cất cánh 5 + phase1×2 10 + phase2 10 + phase3 15 + phase4 10 + hồng tâm 15
  assert.equal(D.calc('driving', { takeoff: 1, p1: 2, p2: 1, p3: 1, p4: 1, landing: 'bull' }).score, 65);
  // Autonomous: tối đa 2 lần mỗi mục, cất cánh 1 lần
  const a = D.calc('coding', { takeoff: 3, cube: 5, m1: 1, m2: 1, m3: 1, spiral: 1, landing: 'cube' });
  assert.equal(a.score, 5 + 50 + 45 + 10 + 10);
  assert.equal(a.detail.takeoff, 1); assert.equal(a.detail.cube, 2);
  assert.match(D.describe('coding', a.detail, true), /Through the large cube: 2/);
});

test('tuỳ chọn: stop time ở tiebreak thứ 2, và hạt giống cao hơn thắng khi vẫn hoà', () => {
  const run = (opts, stops) => {
    const al = alliances(2), ms = [];
    addAll(ms, D.eliminations(al, ms, opts).toCreate, () => 50);                          // chung kết hoà
    addAll(ms, D.eliminations(al, ms, opts).toCreate, () => 40);                          // TB1 hoà
    D.eliminations(al, ms, opts).toCreate.forEach(m => ms.push(Object.assign({}, m, { score: 30, stop_time: stops[m.seed] })));   // TB2 hoà
    return D.eliminations(al, ms, opts);
  };
  assert.equal(run({}, { 1: 5, 2: 20 }).champion, null);                                    // mặc định: không xét stop time, đánh TB3
  assert.equal(run({}, { 1: 5, 2: 20 }).toCreate[0].label, 'TB3');
  assert.equal(run({ stopTimeTiebreak: true }, { 1: 5, 2: 20 }).champion.seed, 2);          // dừng sớm hơn (còn 20 giây) thắng
  assert.equal(run({ finalTie: 'seed' }, { 1: 5, 2: 20 }).champion.seed, 1);                // hạt giống cao hơn thắng
});
