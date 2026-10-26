/* Luật RECF Aerial Drone Competition Pro, Mission 2026-2027: Off Grid (Game Manual v2.0, 29/09/2026).
   Trận Alliance giống Achieve: 2 đấu 2, liên minh đỏ đấu liên minh xanh, trận 2 phút (5.0). Khác Achieve:
   - Ranking points chỉ có match RP: thắng 2, hoà 1; không có Autonomous / Endgame RP (5.5).
     Tiebreak: TB ranking points → TB điểm trận → điểm trận cao nhất → cao thứ 2 → bốc thăm (5.5).
   - Thẻ đỏ ở vòng loại: đội bị thẻ 0 điểm, đồng đội nhận điểm thật của trận (1.6.3); liên minh đối thủ không được xử thắng.
   - Solo: tổng 5 lượt, tự chia giữa Piloting và Autonomous (3.0, 4.0, 7.4.1). Xếp theo Piloting cao nhất + Autonomous cao nhất;
     tiebreak: Autonomous cao nhất → Piloting cao nhất → stop time của trận Piloting cao nhất, rồi lượt thứ 2, thứ 3 (3.5).
   - Chọn liên minh (7.4.4) và nhánh loại trực tiếp (7.4.5, 7.4.6) giống hệt Achieve: dùng lại Achieve.selection / Achieve.bracket.
   - Cấp học: 19U / high school và collegiate (1.4.2).

   Lưu dữ liệu dùng lại cột sẵn có của Achieve, không cần đổi cơ sở dữ liệu:
     solo.kind 'driving' = Piloting, 'coding' = Autonomous; solo.stop_time = solo piloting stop time (3.1.10)
     điểm thành phần (nếu ban tổ chức chọn nhập chi tiết): matches.detail = {red: {...}, blue: {...}}, solo_runs.detail = {...} */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engage.js'), require('./achieve.js'));
  else root.ADCPro = factory(root.Engage, root.Achieve);
})(typeof self !== 'undefined' ? self : this, function (E, A) {
  'use strict';

  var DEFAULTS = {
    matchesPerTeam: 6,   // 7.4.2: 5–8 trận ở giải vòng loại, 8–10 ở championship
    fields: 1,
    start: '09:00',
    cycleMin: 6,         // trận 2 phút (5.0) + dọn sân
    minGap: 1,
    soloAttempts: 5,     // 7.4.1: tổng 5 lượt, tự chia giữa 2 loại
    maxRedCards: 3,      // 1.6.4
    finals: 'bo1',       // 7.4.6: 'bo1' = giải vòng loại; 'bo3' = championship / signature (thắng 2 trận)
    scoreEntry: 'total', // 'total' = chỉ nhập điểm tổng; 'detail' = nhập điểm thành phần, phần mềm tự cộng (3.1, 4.2, 5.1)
    /* Các điểm luật chưa nói rõ: để ban tổ chức chọn (lý do ghi cạnh mỗi tuỳ chọn trong form giải) */
    qualRedCard: 'actual', // thẻ đỏ ở vòng loại: 'actual' = đối thủ giữ kết quả thật (1.6.3 "actual score"); 'win' = đối thủ được xử thắng như Achieve
    elimRedCard: 'all',    // thẻ đỏ ở loại trực tiếp: 'all' = mọi trận, cả liên minh 0 điểm; 'finals' = chỉ trận chung kết (1.6.3 chỉ ghi "finals matches")
    bo3Ties: 'replay'      // chung kết bo3 có trận hoà: 'replay' = trận hoà không tính, đánh tiếp (tối đa 6 trận rồi xét hạt giống, như Achieve);
                           // 'game' = mỗi trận hoà đánh lại như 7.4.5, hoà 3 lần liền thì hạt giống cao hơn thắng trận đó
  };
  function cfg(c) { var o = {}, k; for (k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in (c || {})) if (c[k] != null && c[k] !== '') o[k] = c[k]; return o; }
  var SLOTS = A.SLOTS;
  function sideOf(s) { return s.indexOf('red') === 0 ? 'red' : 'blue'; }

  /* ---------- Bảng điểm thành phần (3.1, 4.2, 5.1) ----------
     Mỗi mục: [khoá, điểm mỗi lần, số lần tối đa (0 = không giới hạn), tên EN, tên VI].
     landing = 1 lựa chọn duy nhất (ở đây: vùng khử nhiễm của ống, 3.1.7). Số tối đa trên sân Alliance theo hình 5.0:
     3 pump, 1 comms tower và 10 power cell mỗi liên minh, 36 fuel. */
  function soloItems(x) {
    return [['p1l', 5 * x, 1, 'Cleared panel 1: large hole', 'Qua panel 1: lỗ lớn'], ['p1s', 10 * x, 1, 'Cleared panel 1: small hole', 'Qua panel 1: lỗ nhỏ'],
      ['pad1', 10 * x, 1, 'Color match: pad 1', 'Khớp màu: pad 1'], ['arch', 5 * x, 1, 'Cleared arch gate', 'Qua cổng vòm'],
      ['blue', 5 * x, 1, 'Cleared blue keyhole', 'Qua vòng xanh dương'], ['teal', 5 * x, 1, 'Cleared teal keyhole', 'Qua vòng xanh ngọc'],
      ['p2l', 5 * x, 1, 'Cleared panel 2: large hole', 'Qua panel 2: lỗ lớn'], ['p2s', 10 * x, 1, 'Cleared panel 2: small hole', 'Qua panel 2: lỗ nhỏ'],
      ['pad2', 10 * x, 1, 'Color match: pad 2', 'Khớp màu: pad 2'], ['parked', 5 * x, 2, 'Parked vehicles', 'Xe đỗ trong containment bay'],
      ['docked', 10 * x, 1, 'Docked drone', 'Drone đậu trên robot']];
  }
  function zones(x) {
    return [['z1', 5 * x, 'Canister in zone 1', 'Ống ở vùng 1'], ['z2', 10 * x, 'Canister in zone 2', 'Ống ở vùng 2'], ['z3', 15 * x, 'Canister in zone 3', 'Ống ở vùng 3']];
  }
  var SHEETS = {
    alliance: {
      title: ['Alliance match (5.1)', 'Trận Alliance (5.1)'],
      items: [['pump', 10, 3, 'Scored pumps', 'Pump đã ghi'], ['drop', 15, 1, 'Power cell on the drop zone', 'Power cell trên drop zone'],
        ['supply', 5, 10, 'Power cells in the supply station', 'Power cell trong supply station'],
        ['fuelIn', 1, 36, 'Fuel in the opponent\'s cooling pool goals', 'Fuel trong cooling pool goal bên đối thủ'],
        ['fuelOut', 2, 36, 'Fuel elsewhere in the opponent\'s field zone', 'Fuel ở chỗ khác bên sân đối thủ'],
        ['docked', 5, 2, 'Docked drones', 'Drone đậu trên robot'], ['parked', 1, 4, 'Vehicles parked on a recovery pad', 'Xe đỗ trên recovery pad']],
      landing: []
    },
    driving: { title: ['Solo piloting (3.1)', 'Solo piloting (3.1)'], items: soloItems(1), landing: zones(1), choice: ['Canister (3.1.7)', 'Ống (3.1.7)'], none: ['Not in a zone', 'Không ở vùng nào'], stop: true },
    coding: { title: ['Solo autonomous (4.2)', 'Solo autonomous (4.2)'], items: soloItems(2), landing: zones(2), choice: ['Canister (4.2.2)', 'Ống (4.2.2)'], none: ['Not in a zone', 'Không ở vùng nào'] }
  };
  function nonNeg(v) { v = Math.floor(+v || 0); return v > 0 ? v : 0; }
  function sheetOf(kind) { return SHEETS[kind === 'alliance' ? 'alliance' : kind === 'coding' ? 'coding' : 'driving']; }
  /* Chuẩn hoá điểm thành phần: cắt theo số lần tối đa; trả về {detail, score}.
     Solo piloting: stop time chỉ tính khi đã xong mọi nhiệm vụ khác, làm tròn xuống số chẵn, 1 điểm mỗi giây (3.1.10). */
  function calc(kind, d) {
    var sh = sheetOf(kind), out = {}, score = 0, all = true;
    d = d || {};
    sh.items.forEach(function (it) { var v = Math.min(nonNeg(d[it[0]]), it[2] || Infinity); out[it[0]] = v; score += v * it[1]; if (v < it[2]) all = false; });
    if (sh.landing.length) {
      var L = sh.landing.find(function (l) { return l[0] === d.landing; });
      out.landing = L ? L[0] : ''; score += L ? L[1] : 0; if (!L) all = false;
    }
    if (sh.stop) {
      var s = Math.min(60, nonNeg(d.stop)); s -= s % 2;
      out.stop = all ? s : 0; score += out.stop;
    }
    return { detail: out, score: score };
  }
  /* Kiểm tra chéo 2 liên minh của 1 trận: tổng pump ≤ 3, tổng fuel ≤ 36 (hình 5.0). Trả về danh sách lỗi [en, vi]. */
  function matchIssues(detail) {
    var r = (detail && detail.red) || {}, b = (detail && detail.blue) || {}, out = [];
    if ((r.pump || 0) + (b.pump || 0) > 3) out.push(['Only 3 pumps on the field (5.1.1).', 'Sân chỉ có 3 pump (5.1.1).']);
    if ((r.fuelIn || 0) + (r.fuelOut || 0) + (b.fuelIn || 0) + (b.fuelOut || 0) > 36) out.push(['Only 36 fuel on the field (figure 5.0).', 'Sân chỉ có 36 fuel (hình 5.0).']);
    return out;
  }
  /* Mô tả ngắn điểm thành phần để hiện khi rê chuột vào điểm */
  function describe(kind, d, en) {
    if (!d) return '';
    if (kind === 'alliance' && (d.red || d.blue)) return ['red', 'blue'].map(function (s) { return d[s] ? (en ? (s === 'red' ? 'Red: ' : 'Blue: ') : (s === 'red' ? 'Đỏ: ' : 'Xanh: ')) + describe('alliance', d[s], en) : ''; }).filter(Boolean).join(' | ');
    var sh = sheetOf(kind), k = en ? 3 : 4, parts = [];
    sh.items.forEach(function (it) { if (d[it[0]]) parts.push(it[k] + ': ' + d[it[0]]); });
    sh.landing.forEach(function (l) { if (d.landing === l[0]) parts.push(l[k - 1]); });
    if (d.stop) parts.push('Stop time: ' + d.stop);
    return parts.join(' · ');
  }

  /* ---------- Vòng loại (5.5, 7.4.2) ---------- */
  function schedule(teamNumbers, opts) { return A.schedule(teamNumbers, cfg(opts)); }
  /* Mỗi trận, mỗi đội nhận match RP của liên minh mình (thắng 2, hoà 1) và điểm trận của liên minh.
     Thẻ đỏ hoặc vắng mặt: đội đó 0 RP và 0 điểm; đồng đội và đối thủ giữ kết quả thật (1.6.3, 5.4.1). Trận đánh dấu * không tính (7.4.2). */
  function teamRP(m, s, o) {
    var side = sideOf(s), stt = m[s + '_status'];
    var my = side === 'red' ? +m.score || 0 : +m.score_blue || 0, their = side === 'red' ? +m.score_blue || 0 : +m.score || 0;
    if (stt === 'absent' || stt === 'red') return { match: 0, score: 0, zero: true, my: my, their: their };
    var other = side === 'red' ? 'blue' : 'red', win = o && o.qualRedCard === 'win' && A.hasRed(m, other) && !A.hasRed(m, side);
    return { match: win || my > their ? 2 : my === their ? 1 : 0, score: my, my: my, their: their };
  }
  function ranking(teams, matches, opts) {
    var o = cfg(opts), seed = o.seed || '', by = {};
    teams.forEach(function (t) { by[t.number] = { team: t.number, played: 0, rp: 0, pts: 0, scores: [], w: 0, l: 0, t: 0 }; });
    (matches || []).forEach(function (m) {
      if (m.round !== 'qual' || !A.played(m)) return;
      SLOTS.forEach(function (s) {
        var r = by[m[s]]; if (!r || m[s + '_counts'] === false) return;
        var x = teamRP(m, s, o);
        r.played++; r.rp += x.match; r.pts += x.score; r.scores.push(x.score);
        if (x.zero) r.l++; else if (x.my > x.their) r.w++; else if (x.my < x.their) r.l++; else r.t++;
      });
    });
    var rows = Object.keys(by).map(function (k) {
      var r = by[k], n = r.played || 1;
      r.scores.sort(function (a, b) { return b - a; });
      r.avg = r.rp / n; r.avgScore = r.pts / n; r.high = r.scores[0] || 0; r.high2 = r.scores[1] || 0;
      r.draw = E.rng(seed + '|' + r.team)();
      return r;
    });
    rows.sort(function (a, b) {
      if ((b.played > 0) !== (a.played > 0)) return b.played > 0 ? 1 : -1;
      return b.avg - a.avg || b.avgScore - a.avgScore || b.high - a.high || b.high2 - a.high2 || a.draw - b.draw;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- Solo (3.5, 7.4.1) ---------- */
  function soloRanking(runs) {
    var by = {};
    (runs || []).forEach(function (r) {
      var t = by[r.team] = by[r.team] || { team: r.team, driving: [], coding: [] };
      (r.kind === 'coding' ? t.coding : t.driving).push({ score: +r.score || 0, stop: +r.stop_time || 0 });
    });
    var desc = function (a, b) { return b.score - a.score || b.stop - a.stop; };
    var rows = Object.keys(by).map(function (k) {
      var t = by[k]; t.driving.sort(desc); t.coding.sort(desc);
      t.bestDriving = t.driving.length ? t.driving[0].score : 0; t.bestCoding = t.coding.length ? t.coding[0].score : 0;
      t.total = t.bestDriving + t.bestCoding; t.attempts = t.driving.length + t.coding.length;
      return t;
    });
    var g = function (a, i, f) { return a[i] ? a[i][f] : 0; };
    rows.sort(function (a, b) {
      if (b.total !== a.total) return b.total - a.total;
      for (var k = 0; k < 5; k++) {
        var keys = [[g(a.coding, k, 'score'), g(b.coding, k, 'score')], [g(a.driving, k, 'score'), g(b.driving, k, 'score')], [g(a.driving, k, 'stop'), g(b.driving, k, 'stop')]];
        for (var i = 0; i < 3; i++) if (keys[i][0] !== keys[i][1]) return keys[i][1] - keys[i][0];
      }
      return String(a.team).localeCompare(String(b.team));
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- Chọn liên minh (7.4.4), nhánh loại trực tiếp (7.4.5, 7.4.6): giống Achieve ---------- */
  function eligible(rank, teams, matches, opts) { return A.eligible(rank, teams, matches, cfg(opts)); }
  /* Điểm 1 trận loại trực tiếp: thẻ đỏ làm cả liên minh 0 điểm (1.6.3), ở mọi trận hoặc chỉ trận chung kết tuỳ elimRedCard */
  function gameScores(m, opts) {
    if (cfg(opts).elimRedCard === 'finals' && m.round !== 'final') return { red: +m.score || 0, blue: +m.score_blue || 0 };
    return A.gameScores(m);
  }
  function bracket(alliances, matches, opts) { return A.bracket(alliances, matches, Object.assign(cfg(opts), { gameScores: gameScores })); }

  /* ---------- Giải thưởng, CSV ---------- */
  /* Giải thành tích: Tournament Champions (7.4.6), Solo Match Champion (7.4.1) */
  function performanceAwards(matches, runs, ev) {
    var out = [], sel = (ev && ev.config && ev.config.selection) || {}, sr = soloRanking(runs);
    var br = bracket(A.selection([], sel).alliances, matches, ev && ev.config);
    if (br.champion) [br.champion.captain, br.champion.partner].forEach(function (t) { out.push({ team: t, name: 'Tournament Champions', judged: false, auto: true }); });
    if (sr.length && sr[0].total > 0) out.push({ team: sr[0].team, name: 'Solo Match Champion', judged: false, auto: true });
    return out;
  }
  function resultRows(ev, teams, matches, runs, awards) {
    var base = E.rowMaker(Object.assign({ program: 'ADC Pro' }, ev), teams), rows = [];
    (runs || []).forEach(function (r) { rows.push(base(r.team, r.kind === 'coding' ? 'solo2' : 'solo1', +r.score || 0)); });
    (matches || []).forEach(function (m) {
      if (m.round !== 'qual' || !A.played(m)) return;
      SLOTS.forEach(function (s) { if (m[s] && m[s + '_counts'] !== false) rows.push(base(m[s], 'alliance', A.teamScore(m, s))); });
    });
    (awards || []).concat(performanceAwards(matches, runs, ev)).forEach(function (a) { rows.push(base(a.team, 'award', a.name)); });
    return rows;
  }

  return {
    DEFAULTS: DEFAULTS, cfg: cfg, SLOTS: SLOTS, schedule: schedule, teamRP: teamRP, ranking: ranking, soloRanking: soloRanking,
    redCards: A.redCards, eligible: eligible, recommendedAlliances: A.recommendedAlliances, selection: A.selection, bracket: bracket, gameScores: gameScores,
    SHEETS: SHEETS, calc: calc, matchIssues: matchIssues, describe: describe, performanceAwards: performanceAwards, resultRows: resultRows
  };
});
