// Luật RECF Achieve: Pinnacle (Game Manual v2.0).  Chạy: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/achieve.js');
const Rules = require('../js/rules.js');

const teams = n => Array.from({ length: n }, (_, i) => 'A' + String(i + 1).padStart(2, '0'));
const T = ns => ns.map(number => ({ number }));
// trận vòng loại: [đỏ1, đỏ2] vs [xanh1, xanh2]
const qm = (r, b, sr, sb, x) => Object.assign({ round: 'qual', red: r[0], red2: r[1], blue: b[0], blue2: b[1],
  red_counts: true, red2_counts: true, blue_counts: true, blue2_counts: true,
  red_status: 'ok', red2_status: 'ok', blue_status: 'ok', blue2_status: 'ok', score: sr, score_blue: sb,
  auto_red: false, auto_blue: false, end_red: false, end_blue: false }, x);

test('lịch 2v2: 4 đội khác nhau/trận, mỗi đội đúng số trận tính điểm', () => {
  const r = A.schedule(teams(16), { matchesPerTeam: 6, seed: 1 });
  assert.equal(r.matches.length, 24);
  const c = {};
  r.matches.forEach(m => {
    assert.equal(new Set(A.teamsOf(m)).size, 4);
    A.SLOTS.forEach(s => { if (m[s + '_counts']) c[m[s]] = (c[m[s]] || 0) + 1; });
  });
  teams(16).forEach(t => assert.equal(c[t], 6));
  assert.equal(r.stats.partnerRepeats, 0);
});

test('lịch 2v2: số chỗ không chia hết cho 4 → chỗ thừa đánh dấu *', () => {
  const r = A.schedule(teams(10), { matchesPerTeam: 5, seed: 2 });   // 50 chỗ → 13 trận = 52 chỗ, 2 chỗ *
  assert.equal(r.matches.length, 13);
  const star = r.matches.flatMap(m => A.SLOTS.filter(s => !m[s + '_counts']));
  assert.equal(star.length, 2);
  const c = {};
  r.matches.forEach(m => A.SLOTS.forEach(s => { if (m[s + '_counts']) c[m[s]] = (c[m[s]] || 0) + 1; }));
  teams(10).forEach(t => assert.equal(c[t], 5));
});

test('lịch 2v2: nhiều sân không trùng đội cùng lượt; dưới 4 đội không có trận', () => {
  const r = A.schedule(teams(24), { matchesPerTeam: 6, fields: 2, seed: 3, cycleMin: 7 });
  const by = {};
  r.matches.forEach(m => { (by[m.time] = by[m.time] || []).push(...A.teamsOf(m)); });
  Object.values(by).forEach(ts => assert.equal(new Set(ts).size, ts.length));
  assert.equal(r.matches[2].time, '09:07');
  assert.equal(A.schedule(teams(3), {}).matches.length, 0);
});

test('RP (5.5): thắng 2, hoà 1, thua 0, cộng Autonomous và Endgame', () => {
  const ms = [qm(['A', 'B'], ['C', 'D'], 50, 40, { auto_red: true, end_blue: true }), qm(['A', 'C'], ['B', 'D'], 30, 30)];
  const r = A.ranking(T(['A', 'B', 'C', 'D']), ms);
  const g = t => r.find(x => x.team === t);
  assert.equal(g('A').rp, 2 + 1 + 1);       // thắng + auto, rồi hoà
  assert.equal(g('C').rp, 0 + 1 + 1);       // thua nhưng có endgame, rồi hoà
  assert.equal(g('A').avg, 2);
  assert.equal(r[0].team, 'A');
  assert.deepEqual([g('A').w, g('A').l, g('A').t], [1, 0, 1]);
});

test('thẻ đỏ (1.6.3): đội bị thẻ 0 RP, đồng đội giữ kết quả thật, đối thủ được 2 match RP', () => {
  // đỏ thắng 60-20 nhưng A bị thẻ đỏ
  const ms = [qm(['A', 'B'], ['C', 'D'], 60, 20, { red_status: 'red', auto_red: true })];
  const r = A.ranking(T(['A', 'B', 'C', 'D']), ms), g = t => r.find(x => x.team === t);
  assert.equal(g('A').rp, 0);
  assert.equal(g('B').rp, 2 + 1);   // thắng thật + auto
  assert.equal(g('C').rp, 2);       // đối thủ của đội bị thẻ đỏ: 2 match RP dù thua
  assert.equal(g('C').mrp, 2);
  // cả hai bên đều có thẻ đỏ → tính theo điểm thật
  const r2 = A.ranking(T(['A', 'B', 'C', 'D']), [qm(['A', 'B'], ['C', 'D'], 60, 20, { red_status: 'red', blue2_status: 'red' })]);
  assert.equal(r2.find(x => x.team === 'C').rp, 0);
  assert.equal(r2.find(x => x.team === 'B').rp, 2);
});

test('vắng mặt (5.4.1): đội vắng 0 RP, vẫn tính 1 trận; trận * và trận chưa đánh không tính', () => {
  const ms = [qm(['A', 'B'], ['C', 'D'], 10, 5, { red2_status: 'absent' }), qm(['A', 'B'], ['C', 'D'], 10, 5, { red_counts: false }), qm(['A', 'B'], ['C', 'D'], null, null)];
  const r = A.ranking(T(['A', 'B', 'C', 'D']), ms), g = t => r.find(x => x.team === t);
  assert.deepEqual([g('B').played, g('B').rp], [2, 2]);   // vắng trận 1 (0), thắng trận 2 (2)
  assert.deepEqual([g('A').played, g('A').rp], [1, 2]);   // trận 2 là * với A
});

test('tiebreak RP: TB Autonomous → Endgame → Match → bốc thăm', () => {
  // A và C cùng 2 RP/trận: A = auto+end (thua), C = thắng không bonus → A có auto cao hơn
  const ms = [qm(['A', 'B'], ['C', 'D'], 10, 20, { auto_red: true, end_red: true })];
  const r = A.ranking(T(['A', 'B', 'C', 'D']), ms);
  assert.ok(r.findIndex(x => x.team === 'A') < r.findIndex(x => x.team === 'C'));
});

test('solo Achieve (3.5): tiebreak coding cao nhất, rồi driving cao nhất, rồi stop time coding', () => {
  const runs = [
    { team: 'X', kind: 'driving', score: 100 }, { team: 'X', kind: 'coding', score: 50 },
    { team: 'Y', kind: 'driving', score: 90 }, { team: 'Y', kind: 'coding', score: 60 },
    { team: 'Z', kind: 'driving', score: 90 }, { team: 'Z', kind: 'coding', score: 60, stop_time: 12 }
  ];
  assert.deepEqual(A.soloRanking(runs).map(r => r.team), ['Z', 'Y', 'X']);   // cùng 150; Y,Z coding 60 > X; Z stop time cao hơn
  const r2 = A.soloRanking([{ team: 'P', kind: 'driving', score: 80 }, { team: 'P', kind: 'coding', score: 40 }, { team: 'Q', kind: 'driving', score: 70 }, { team: 'Q', kind: 'coding', score: 50 }]);
  assert.equal(r2[0].team, 'Q');
});

test('số liên minh đề xuất (7.4.4)', () => {
  assert.equal(A.recommendedAlliances(12), 6);
  assert.equal(A.recommendedAlliances(13), 5);     // lẻ: (13-3)/2
  assert.equal(A.recommendedAlliances(20), 8);
  assert.equal(A.recommendedAlliances(30), 12);
  assert.equal(A.recommendedAlliances(40), 16);
});

test('chọn liên minh (7.4.4): đội hạng cao mời; đội từ chối không được mời lại nhưng vẫn làm đội trưởng được', () => {
  const el = ['A', 'B', 'C', 'D', 'E', 'F'].map(team => ({ team }));
  let s = A.selection(el, { n: 2, picks: [], declined: [] });
  assert.equal(s.captain, 'A');
  assert.deepEqual(s.available, ['B', 'C', 'D', 'E', 'F']);
  s = A.selection(el, { n: 2, picks: [], declined: ['B'] });            // B từ chối A
  assert.deepEqual(s.available, ['C', 'D', 'E', 'F']);
  s = A.selection(el, { n: 2, picks: [{ captain: 'A', partner: 'C' }], declined: ['B'] });
  assert.equal(s.captain, 'B');                                          // B hạng cao nhất còn lại → làm đội trưởng
  assert.ok(!s.available.includes('B') && !s.available.includes('C'));
  s = A.selection(el, { n: 2, picks: [{ captain: 'A', partner: 'C' }, { captain: 'B', partner: 'D' }] });
  assert.equal(s.done, true);
  assert.deepEqual(s.alliances.map(a => a.seed), [1, 2]);
});

test('nhánh đấu: thứ tự hạt giống chuẩn và bye cho hạt giống cao', () => {
  assert.deepEqual(A.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const al = [1, 2, 3, 4, 5, 6].map(seed => ({ seed, captain: 'C' + seed, partner: 'P' + seed }));
  const b = A.bracket(al, [], {});
  assert.equal(b.size, 8);
  const r1 = b.rounds[0];
  assert.deepEqual(r1.filter(n => n.bye).map(n => n.winner), [1, 2]);   // 1 và 2 được bye
  assert.deepEqual(b.toCreate.map(m => [m.label, m.seed, m.seed_blue]), [['R1-2', 4, 5], ['R1-4', 3, 6]]);
  assert.equal(b.toCreate[0].red, 'C4'); assert.equal(b.toCreate[0].blue2, 'P5');
});

const em = (label, num, hi, lo, sr, sb, x, round) => Object.assign({ round: round || 'elim', label, num, seed: hi, seed_blue: lo,
  red_status: 'ok', red2_status: 'ok', blue_status: 'ok', blue2_status: 'ok', score: sr, score_blue: sb, red: 'C' + hi, red2: 'P' + hi, blue: 'C' + lo, blue2: 'P' + lo }, x);

test('nhánh đấu: thắng đi tiếp, hoà đánh lại tối đa 2 trận, hoà lần 3 thì hạt giống cao thắng (7.4.5)', () => {
  const al = [1, 2, 3, 4].map(seed => ({ seed, captain: 'C' + seed, partner: 'P' + seed }));
  let b = A.bracket(al, [em('R1-1', 1, 1, 4, 50, 60), em('R1-2', 2, 2, 3, 40, 40)], {});
  assert.equal(b.rounds[0][0].winner, 4);                     // hạt giống 4 thắng
  assert.equal(b.rounds[0][1].winner, null);
  assert.deepEqual(b.toCreate.map(m => [m.label, m.num]), [['R1-2', 3]]);   // trận đánh lại
  b = A.bracket(al, [em('R1-1', 1, 1, 4, 50, 60), em('R1-2', 2, 2, 3, 40, 40), em('R1-2', 3, 2, 3, 20, 20), em('R1-2', 4, 2, 3, 0, 0)], {});
  assert.equal(b.rounds[0][1].winner, 2);
  assert.equal(b.rounds[0][1].bySeed, true);
  assert.deepEqual(b.toCreate.map(m => [m.round, m.label, m.seed, m.seed_blue, m.num]), [['final', 'F', 2, 4, 1]]);
});

test('nhánh đấu: thẻ đỏ làm cả liên minh 0 điểm (1.6.3)', () => {
  const al = [1, 2].map(seed => ({ seed, captain: 'C' + seed, partner: 'P' + seed }));
  const b = A.bracket(al, [em('F', 1, 1, 2, 90, 30, { red2_status: 'red' }, 'final')], {});
  assert.equal(b.champion.seed, 2);
});

test('chung kết bo3 (7.4.6): cần thắng 2 trận, trận hoà không tính', () => {
  const al = [1, 2].map(seed => ({ seed, captain: 'C' + seed, partner: 'P' + seed }));
  const F = (num, a, b) => em('F', num, 1, 2, a, b, {}, 'final');
  let b = A.bracket(al, [F(1, 50, 40)], { finals: 'bo3' });
  assert.equal(b.champion, null);
  assert.equal(b.toCreate[0].num, 2);
  b = A.bracket(al, [F(1, 50, 40), F(2, 30, 60), F(3, 20, 20)], { finals: 'bo3' });
  assert.equal(b.champion, null);
  b = A.bracket(al, [F(1, 50, 40), F(2, 30, 60), F(3, 20, 20), F(4, 10, 70)], { finals: 'bo3' });
  assert.equal(b.champion.seed, 2);
  b = A.bracket(al, [F(1, 50, 40)], { finals: 'bo1' });
  assert.equal(b.champion.seed, 1);
});

test('giải thưởng và CSV: vô địch là 2 đội liên minh thắng; điểm alliance = điểm liên minh mình', () => {
  const ev = { name: 'Pinnacle HN', program: 'Achieve', ruleset: 'achieve-2026', date: '2026-12-01', verified: true,
    config: { selection: { n: 2, picks: [{ captain: 'A', partner: 'B' }, { captain: 'C', partner: 'D' }] } } };
  const ms = [qm(['A', 'B'], ['C', 'D'], 30, 40, { blue_status: 'absent' }),
    { round: 'final', label: 'F', num: 1, seed: 1, seed_blue: 2, red: 'A', red2: 'B', blue: 'C', blue2: 'D', red_status: 'ok', red2_status: 'ok', blue_status: 'ok', blue2_status: 'ok', score: 80, score_blue: 70 }];
  const aw = A.performanceAwards(ms, [{ team: 'D', kind: 'coding', score: 10 }], ev);
  assert.deepEqual(aw.map(a => [a.team, a.name]), [['A', 'Tournament Champions'], ['B', 'Tournament Champions'], ['D', 'Solo Match Champion']]);
  const rows = A.resultRows(ev, T(['A', 'B', 'C', 'D']), ms, [], []);
  const al = rows.filter(r => r[13] === 'alliance').map(r => [r[8], r[14]]);
  assert.deepEqual(al, [['A', 30], ['B', 30], ['C', 0], ['D', 40]]);
  assert.equal(rows[0][2], 'Achieve');
});

test('Rules.of chọn đúng luật', () => {
  assert.equal(Rules.of({ ruleset: 'achieve-2026' }).format, 'versus');
  assert.equal(Rules.of({}).format, 'coop');
  assert.equal(Rules.choiceOf({ program: 'Custom', ruleset: 'achieve-2026' }).key, 'Custom-versus');
});
