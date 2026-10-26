// Luật ADC Pro Off Grid (Game Manual v2.0).  Chạy: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/adcpro.js');
const Rules = require('../js/rules.js');

const teams = n => Array.from({ length: n }, (_, i) => ({ number: 'P' + String(i + 1).padStart(2, '0') }));
const ok = { red_status: 'ok', red2_status: 'ok', blue_status: 'ok', blue2_status: 'ok', red_counts: true, red2_counts: true, blue_counts: true, blue2_counts: true };
const q = (num, r, b, score, score_blue, extra) => Object.assign({ round: 'qual', num, red: r[0], red2: r[1], blue: b[0], blue2: b[1], score, score_blue }, ok, extra);

test('Rules: chọn được bộ luật ADC Pro', () => {
  const R = Rules.of({ ruleset: 'adcpro-2027' });
  assert.equal(R.id, 'adcpro-2027');
  assert.equal(R.format, 'versus');
  assert.equal(R.rpBonus, false);
  assert.ok(!R.soloPerKind);
  assert.deepEqual(R.solo2, ['Piloting', 'Autonomous']);
  assert.deepEqual(R.grades, ['HS', 'UNI']);   // 1.4.2: 19U / high school và collegiate
  assert.equal(Rules.choiceOf({ program: 'ADC Pro', ruleset: 'adcpro-2027' }).key, 'ADC Pro');
  assert.equal(P.cfg({}).soloAttempts, 5);     // 7.4.1
});

test('lịch: 2 đấu 2, mỗi đội đủ số trận tính điểm', () => {
  const T = teams(10).map(t => t.number), r = P.schedule(T, { matchesPerTeam: 6, seed: 3 });
  const cnt = {};
  r.matches.forEach(m => { P.SLOTS.forEach(s => { if (m[s + '_counts']) cnt[m[s]] = (cnt[m[s]] || 0) + 1; }); assert.equal(new Set(P.SLOTS.map(s => m[s])).size, 4); });
  T.forEach(t => assert.equal(cnt[t], 6));
});

test('5.5: chỉ có match RP (thắng 2, hoà 1), không có Autonomous / Endgame RP', () => {
  const T = teams(4), ms = [
    q(1, ['P01', 'P02'], ['P03', 'P04'], 50, 40, { auto_red: true, end_red: true }),
    q(2, ['P01', 'P03'], ['P02', 'P04'], 30, 30)
  ];
  const by = Object.fromEntries(P.ranking(T, ms, { seed: 'x' }).map(r => [r.team, r]));
  assert.equal(by.P01.rp, 3); assert.equal(by.P01.avg, 1.5);
  assert.equal(by.P03.rp, 1); assert.equal(by.P04.rp, 1);
  assert.equal(by.P01.avgScore, 40);
});

test('5.5: bằng RP thì so TB điểm trận, điểm cao nhất, cao thứ 2, rồi bốc thăm', () => {
  const T = teams(8), ms = [
    q(1, ['P01', 'P05'], ['P06', 'P07'], 60, 10), q(2, ['P02', 'P08'], ['P06', 'P07'], 40, 10),   // P01 TB 60 > P02 TB 40
    q(3, ['P03', 'P05'], ['P06', 'P08'], 50, 10), q(4, ['P03', 'P07'], ['P06', 'P08'], 0, 10),
    q(5, ['P04', 'P05'], ['P06', 'P08'], 30, 10), q(6, ['P04', 'P07'], ['P06', 'P08'], 20, 10)
  ];
  const rk = P.ranking(T, ms, { seed: 's' }), by = Object.fromEntries(rk.map(r => [r.team, r]));
  assert.ok(by.P01.rank < by.P02.rank);
  // P03: thắng 1 thua 1, TB 25, cao nhất 50; P04: thắng 2 → nhiều RP hơn
  assert.ok(by.P04.rank < by.P03.rank);
  const a = P.ranking(T, ms, { seed: 's' }), b = P.ranking(T, ms, { seed: 's' });
  assert.deepEqual(a.map(r => r.team), b.map(r => r.team));
});

test('5.5: bằng RP và TB điểm thì so điểm trận cao nhất', () => {
  const T = teams(8), ms = [
    q(1, ['P01', 'P05'], ['P06', 'P07'], 60, 10), q(2, ['P01', 'P05'], ['P06', 'P07'], 20, 10),
    q(3, ['P02', 'P08'], ['P06', 'P07'], 40, 10), q(4, ['P02', 'P08'], ['P06', 'P07'], 40, 10)
  ];
  const by = Object.fromEntries(P.ranking(T, ms, { seed: 'k' }).map(r => [r.team, r]));
  assert.equal(by.P01.avg, by.P02.avg); assert.equal(by.P01.avgScore, by.P02.avgScore);
  assert.ok(by.P01.rank < by.P02.rank);
});

test('1.6.3: thẻ đỏ → đội đó 0 RP, đồng đội và đối thủ giữ kết quả thật', () => {
  const T = teams(4), ms = [q(1, ['P01', 'P02'], ['P03', 'P04'], 50, 40, { red_status: 'red' })];
  const by = Object.fromEntries(P.ranking(T, ms, { seed: 'x' }).map(r => [r.team, r]));
  assert.equal(by.P01.rp, 0); assert.equal(by.P01.avgScore, 0);
  assert.equal(by.P02.rp, 2); assert.equal(by.P02.avgScore, 50);
  assert.equal(by.P03.rp, 0);   // không được xử thắng: điểm thật 40 < 50
});

test('5.4.1, 7.4.2: vắng mặt 0 điểm; trận đánh dấu * không tính', () => {
  const T = teams(4), ms = [
    q(1, ['P01', 'P02'], ['P03', 'P04'], 50, 40, { red2_status: 'absent' }),
    q(2, ['P01', 'P02'], ['P03', 'P04'], 10, 40, { red_counts: false })
  ];
  const by = Object.fromEntries(P.ranking(T, ms, { seed: 'x' }).map(r => [r.team, r]));
  assert.equal(by.P02.rp, 0); assert.equal(by.P02.played, 2);
  assert.equal(by.P01.played, 1); assert.equal(by.P01.rp, 2);
});

test('3.5: Solo = Piloting cao nhất + Autonomous cao nhất; tiebreak Autonomous → Piloting → stop time', () => {
  const runs = [
    { team: 'A', kind: 'driving', score: 60, stop_time: 0 }, { team: 'A', kind: 'coding', score: 40 },
    { team: 'B', kind: 'driving', score: 50 }, { team: 'B', kind: 'coding', score: 50 },
    { team: 'C', kind: 'driving', score: 50, stop_time: 4 }, { team: 'C', kind: 'coding', score: 50 },
    { team: 'D', kind: 'driving', score: 40 }, { team: 'D', kind: 'coding', score: 60 }
  ];
  const rk = P.soloRanking(runs);
  assert.deepEqual(rk.map(r => r.team), ['D', 'C', 'B', 'A']);   // cùng 100: Autonomous 60 > 50 = 50 > 40; C hơn B ở stop time
  assert.equal(rk[0].total, 100); assert.equal(rk[0].attempts, 2);
});

test('3.5: hoà hết hạng mục 1–3 thì xét lượt thứ 2', () => {
  const runs = [
    { team: 'A', kind: 'driving', score: 50 }, { team: 'A', kind: 'coding', score: 50 }, { team: 'A', kind: 'coding', score: 10 },
    { team: 'B', kind: 'driving', score: 50 }, { team: 'B', kind: 'coding', score: 50 }, { team: 'B', kind: 'coding', score: 30 }
  ];
  assert.deepEqual(P.soloRanking(runs).map(r => r.team), ['B', 'A']);
});

test('7.4.4: số liên minh đề xuất theo số đội', () => {
  assert.equal(P.recommendedAlliances(12), 6);
  assert.equal(P.recommendedAlliances(13), 5);
  assert.equal(P.recommendedAlliances(20), 8);
  assert.equal(P.recommendedAlliances(30), 12);
  assert.equal(P.recommendedAlliances(40), 16);
});

test('7.4.5: nhánh đấu, hoà đánh lại tối đa 2 trận rồi hạt giống cao hơn đi tiếp', () => {
  const al = [{ seed: 1, captain: 'P01', partner: 'P02' }, { seed: 2, captain: 'P03', partner: 'P04' }];
  let br = P.bracket(al, [], {});
  assert.equal(br.toCreate.length, 1); assert.equal(br.toCreate[0].label, 'F');
  const g = n => Object.assign({}, br.toCreate[0], { num: n, score: 20, score_blue: 20 });
  br = P.bracket(al, [g(1), g(2), g(3)], {});
  assert.equal(br.champion.seed, 1);
});

test('7.4.6: chung kết thắng 2 trong 3 khi chọn bo3', () => {
  const al = [{ seed: 1, captain: 'P01', partner: 'P02' }, { seed: 2, captain: 'P03', partner: 'P04' }];
  const t = P.bracket(al, [], { finals: 'bo3' }).toCreate[0];
  const g = (n, a, b) => Object.assign({}, t, { num: n, score: a, score_blue: b });
  assert.equal(P.bracket(al, [g(1, 10, 20)], { finals: 'bo3' }).champion, null);
  assert.equal(P.bracket(al, [g(1, 10, 20), g(2, 10, 30)], { finals: 'bo3' }).champion.seed, 2);
});

test('5.1: điểm thành phần trận Alliance, có giới hạn theo hình 5.0', () => {
  const r = P.calc('alliance', { pump: 2, drop: 3, supply: 4, fuelIn: 5, fuelOut: 6, docked: 3, parked: 4 });
  // 2×10 + 1×15 + 4×5 + 5×1 + 6×2 + 2×5 + 4×1 = 86 (drop tối đa 1, docked tối đa 2)
  assert.equal(r.score, 86); assert.equal(r.detail.drop, 1); assert.equal(r.detail.docked, 2);
  assert.equal(P.matchIssues({ red: { pump: 2 }, blue: { pump: 2 } }).length, 1);
  assert.equal(P.matchIssues({ red: { pump: 2, fuelIn: 20 }, blue: { pump: 1, fuelOut: 16 } }).length, 0);
  assert.match(P.describe('alliance', { red: r.detail, blue: { pump: 1 } }, true), /Red: .*Scored pumps: 2.*\| Blue: Scored pumps: 1/);
});

test('3.1, 3.1.10: Solo piloting, stop time chỉ tính khi xong hết, làm tròn xuống số chẵn', () => {
  const all = { p1l: 1, p1s: 1, pad1: 1, arch: 1, blue: 1, teal: 1, p2l: 1, p2s: 1, pad2: 1, parked: 2, docked: 1, landing: 'z3' };
  // 5+10+10+5+5+5+5+10+10+10+10 = 85, + vùng 3 = 15 → 100
  assert.equal(P.calc('driving', all).score, 100);
  const s = P.calc('driving', Object.assign({}, all, { stop: 11 }));
  assert.equal(s.detail.stop, 10); assert.equal(s.score, 110);
  const part = P.calc('driving', Object.assign({}, all, { landing: '', stop: 20 }));
  assert.equal(part.detail.stop, 0); assert.equal(part.score, 85);
});

test('4.2: Solo autonomous gấp đôi điểm, không có stop time', () => {
  const all = { p1l: 1, p1s: 1, pad1: 1, arch: 1, blue: 1, teal: 1, p2l: 1, p2s: 1, pad2: 1, parked: 2, docked: 1, landing: 'z2', stop: 30 };
  const r = P.calc('coding', all);
  assert.equal(r.score, 190); assert.equal(r.detail.stop, undefined);
});

test('Giải thành tích + CSV: Tournament Champions, Solo Match Champion, program ADC Pro', () => {
  const T = teams(4).map(t => Object.assign(t, { name: '', org: '', grade: 'HS' }));
  const sel = { n: 2, picks: [{ captain: 'P01', partner: 'P02' }, { captain: 'P03', partner: 'P04' }], declined: [] };
  const ev = { id: 'e1', name: 'X', program: 'ADC Pro', ruleset: 'adcpro-2027', date: '2026-11-01', config: { selection: sel } };
  const f = Object.assign({}, P.bracket(P.selection([], sel).alliances, [], {}).toCreate[0], { num: 1, score: 50, score_blue: 30 });
  const ms = [q(1, ['P01', 'P02'], ['P03', 'P04'], 50, 40), f];
  const runs = [{ team: 'P03', kind: 'driving', score: 40 }, { team: 'P03', kind: 'coding', score: 60 }];
  const aw = P.performanceAwards(ms, runs, ev);
  assert.deepEqual(aw.map(a => a.team + ':' + a.name), ['P01:Tournament Champions', 'P02:Tournament Champions', 'P03:Solo Match Champion']);
  const rows = Rules.of(ev).resultRows(ev, T, ms, runs, []);
  assert.ok(rows.every(r => r[2] === 'ADC Pro'));
  assert.equal(rows.filter(r => r[13] === 'alliance').length, 4);
  assert.deepEqual(rows.filter(r => r[13] === 'solo2').map(r => r[14]), [60]);
});

test('Tuỳ chọn qualRedCard: đối thủ giữ kết quả thật (mặc định) hoặc được xử thắng', () => {
  const T = teams(4), ms = [q(1, ['P01', 'P02'], ['P03', 'P04'], 50, 40, { red_status: 'red' })];
  const rp = o => Object.fromEntries(P.ranking(T, ms, Object.assign({ seed: 'x' }, o)).map(r => [r.team, r.rp]));
  assert.deepEqual(rp({}), { P01: 0, P02: 2, P03: 0, P04: 0 });
  assert.deepEqual(rp({ qualRedCard: 'win' }), { P01: 0, P02: 2, P03: 2, P04: 2 });   // xanh được xử thắng; P02 vẫn thắng theo điểm thật (như Achieve)
});

test('Tuỳ chọn elimRedCard: thẻ đỏ ở bán kết làm liên minh 0 điểm, hoặc chỉ tính ở chung kết', () => {
  const al = [1, 2, 3, 4].map(s => ({ seed: s, captain: 'C' + s, partner: 'X' + s }));
  const sf = P.bracket(al, [], {}).toCreate;   // 2 trận bán kết: 1–4, 2–3
  const g1 = Object.assign({}, sf[0], { num: 1, score: 50, score_blue: 30, red2_status: 'red' });
  const g2 = Object.assign({}, sf[1], { num: 2, score: 40, score_blue: 20 });
  assert.equal(P.bracket(al, [g1, g2], {}).rounds[0][0].winner, 4);                         // mặc định: hạt giống 1 bị 0 điểm
  assert.equal(P.bracket(al, [g1, g2], { elimRedCard: 'finals' }).rounds[0][0].winner, 1);  // chỉ chung kết: bán kết giữ điểm
  assert.deepEqual(P.gameScores(g1, { elimRedCard: 'finals' }), { red: 50, blue: 30 });
  assert.deepEqual(P.gameScores(Object.assign({}, g1, { round: 'final' }), { elimRedCard: 'finals' }), { red: 0, blue: 30 });
});

test('Tuỳ chọn bo3Ties: trận hoà không tính, hoặc hoà 3 lần liền thì hạt giống cao hơn thắng trận đó', () => {
  const al = [{ seed: 1, captain: 'P01', partner: 'P02' }, { seed: 2, captain: 'P03', partner: 'P04' }];
  const t = P.bracket(al, [], { finals: 'bo3' }).toCreate[0];
  const g = (n, a, b) => Object.assign({}, t, { num: n, score: a, score_blue: b });
  const games = [g(1, 10, 20), g(2, 5, 5), g(3, 5, 5), g(4, 5, 5)];   // xanh (2) thắng 1, rồi hoà 3 lần
  assert.equal(P.bracket(al, games, { finals: 'bo3' }).champion, null);                     // replay: chưa ai thắng 2
  const r = P.bracket(al, games, { finals: 'bo3', bo3Ties: 'game' });
  assert.equal(r.champion, null);                                                           // 1–1, đánh tiếp
  assert.equal(P.bracket(al, games.concat([g(5, 30, 10)]), { finals: 'bo3', bo3Ties: 'game' }).champion.seed, 1);
});

test('Achieve không đổi khi thêm tuỳ chọn của ADC Pro', () => {
  const A = require('../js/achieve.js');
  const al = [{ seed: 1, captain: 'P01', partner: 'P02' }, { seed: 2, captain: 'P03', partner: 'P04' }];
  const t = A.bracket(al, [], { finals: 'bo3' }).toCreate[0];
  const g = n => Object.assign({}, t, { num: n, score: 5, score_blue: 5 });
  assert.equal(A.bracket(al, [1, 2, 3, 4, 5, 6].map(g), { finals: 'bo3' }).champion.seed, 1);   // 6 trận hoà → hạt giống
});
