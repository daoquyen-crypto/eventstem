/* Luật thi đấu RECF Achieve: Pinnacle (Game Manual v2.0, 29/09/2026).
   Khác Engage: trận Alliance là 2 đấu 2 (liên minh đỏ đấu liên minh xanh), xếp hạng bằng ranking points (5.5),
   sau vòng loại là chọn liên minh (7.4.4) và nhánh loại trực tiếp (7.4.5, 7.4.6).

   match {round:'practice'|'qual'|'elim'|'final', num, label, field, time,
          red, red2, blue, blue2, red_counts, red2_counts, blue_counts, blue2_counts,
          red_status, red2_status, blue_status, blue2_status ('ok'|'absent'|'red'),
          score (điểm đỏ), score_blue (điểm xanh), auto_red, auto_blue, end_red, end_blue, seed, seed_blue}
   Lựa chọn liên minh lưu ở event.config.selection = {n, picks:[{captain, partner}], declined:[team]} */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engage.js'));
  else root.Achieve = factory(root.Engage);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  var DEFAULTS = {
    matchesPerTeam: 6,   // 7.4.2: 5–8 trận ở giải vòng loại, 8–10 ở championship
    fields: 1,
    start: '09:00',
    cycleMin: 7,         // trận 2 phút + dọn sân
    minGap: 1,
    soloAttempts: 5,     // 7.4.1
    maxRedCards: 3,      // 1.6.4
    finals: 'bo1'        // 7.4.6: 'bo1' = 1 trận; 'bo3' = thắng 2 trong 3 (giải lấy vé World Championship)
  };
  function cfg(c) { var o = {}, k; for (k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in (c || {})) if (c[k] != null && c[k] !== '') o[k] = c[k]; return o; }
  var SLOTS = ['red', 'red2', 'blue', 'blue2'];
  function sideOf(s) { return s.indexOf('red') === 0 ? 'red' : 'blue'; }
  function teamsOf(m) { return SLOTS.map(function (s) { return m[s]; }).filter(Boolean); }
  function played(m) { return m.score != null && m.score_blue != null; }
  function hasRed(m, side) { return [side, side + '2'].some(function (s) { return m[s] && m[s + '_status'] === 'red'; }); }

  /* ---------- Lịch trận 2 đấu 2 (5.2.1, 7.4.2) ----------
     Mỗi trận 4 đội. Mỗi đội đánh đúng matchesPerTeam trận tính điểm; chỗ thừa ở cuối lịch do đội đánh thêm lấp và đánh dấu *.
     Tránh: gặp lại đồng đội (nặng), gặp lại đối thủ (nhẹ), đánh 2 lượt liền, lệch màu đỏ/xanh. */
  function schedule(teamNumbers, opts) {
    var o = cfg(opts), N = teamNumbers.length, M = Math.max(1, +o.matchesPerTeam), F = Math.max(1, +o.fields);
    if (N < 4) return { matches: [], cost: 0, stats: { teams: N } };
    var tries = o.tries || 200, budget = o.timeBudgetMs || 1500, t0 = Date.now();
    var rand = E.rng(o.seed != null ? o.seed : Date.now()), best = null;
    for (var t = 0; t < tries; t++) {
      var r = buildOnce(teamNumbers, M, F, +o.minGap, rand);
      if (!best || r.cost < best.cost) best = r;
      if (best.cost === 0 || (o.seed == null && Date.now() - t0 > budget)) break;
    }
    best.matches.forEach(function (m, i) {
      m.round = 'qual'; m.num = i + 1;
      m.field = F > 1 ? String((i % F) + 1) : '1';
      m.time = E.addMinutes(o.start, Math.floor(i / F) * (+o.cycleMin));
      SLOTS.forEach(function (s) { m[s + '_status'] = 'ok'; });
      m.score = null; m.score_blue = null; m.auto_red = m.auto_blue = m.end_red = m.end_blue = false;
    });
    return best;
  }
  function buildOnce(teams, M, F, minGap, rand) {
    var N = teams.length, total = Math.ceil(N * M / 4);
    var cnt = {}, last = {}, reds = {}, part = {}, opp = {}, matches = [];
    var st = { partnerRepeats: 0, opponentRepeats: 0, shortRest: 0 };
    teams.forEach(function (x) { cnt[x] = 0; last[x] = -99; reds[x] = 0; part[x] = {}; opp[x] = {}; });
    for (var i = 0; i < total; i++) {
      var slot = Math.floor(i / F), busy = {};
      for (var j = slot * F; j < i; j++) teamsOf(matches[j]).forEach(function (x) { busy[x] = 1; });
      var free = teams.filter(function (x) { return !busy[x]; });
      if (free.length < 4) free = teams.slice();
      var pick = [];
      while (pick.length < 4) {
        var bx = null, bc = Infinity;
        free.forEach(function (x) {
          if (pick.indexOf(x) >= 0) return;
          var c = cnt[x] * 8 + (cnt[x] >= M ? 1000 : 0), rest = slot - last[x] - 1;
          if (rest < minGap) c += 60 * (minGap - rest);
          pick.forEach(function (y) { c += (part[x][y] || 0) * 6 + (opp[x][y] || 0) * 2; });
          c += rand() * 4;
          if (c < bc) { bc = c; bx = x; }
        });
        pick.push(bx);
      }
      // chọn cách chia 4 đội thành 2 liên minh ít lặp lại nhất
      var splits = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]], bs = null, bsc = Infinity;
      splits.forEach(function (sp) {
        var a = sp[0].map(function (k) { return pick[k]; }), b = sp[1].map(function (k) { return pick[k]; });
        var c = (part[a[0]][a[1]] || 0) * 10 + (part[b[0]][b[1]] || 0) * 10 + rand();
        a.forEach(function (x) { b.forEach(function (y) { c += (opp[x][y] || 0) * 2; }); });
        if (c < bsc) { bsc = c; bs = [a, b]; }
      });
      var A = bs[0], B = bs[1];
      if (reds[A[0]] + reds[A[1]] > reds[B[0]] + reds[B[1]] || (reds[A[0]] + reds[A[1]] === reds[B[0]] + reds[B[1]] && rand() < 0.5)) { var tmp = A; A = B; B = tmp; }
      var m = { red: A[0], red2: A[1], blue: B[0], blue2: B[1] };
      SLOTS.forEach(function (s) { m[s + '_counts'] = cnt[m[s]] < M; });
      if (part[A[0]][A[1]]) st.partnerRepeats++; if (part[B[0]][B[1]]) st.partnerRepeats++;
      A.forEach(function (x) { B.forEach(function (y) { if (opp[x][y]) st.opponentRepeats++; opp[x][y] = (opp[x][y] || 0) + 1; opp[y][x] = (opp[y][x] || 0) + 1; }); });
      [A, B].forEach(function (p) { part[p[0]][p[1]] = (part[p[0]][p[1]] || 0) + 1; part[p[1]][p[0]] = (part[p[1]][p[0]] || 0) + 1; });
      teamsOf(m).forEach(function (x) { if (last[x] >= 0 && slot - last[x] - 1 < minGap) st.shortRest++; cnt[x]++; last[x] = slot; });
      reds[A[0]]++; reds[A[1]]++;
      matches.push(m);
    }
    improve(matches, F, minGap, rand, Math.min(4000, 60 * total));
    var ev = evaluate(matches, F, minGap);
    st = ev.stats; st.teams = N; st.matches = total;
    return { matches: matches, cost: ev.cost, stats: st };
  }
  /* Đếm lỗi của cả lịch: gặp lại đồng đội (×10), gặp lại đối thủ (×1), nghỉ thiếu (×5), lệch màu (×1) */
  function evaluate(matches, F, minGap) {
    var part = {}, opp = {}, last = {}, reds = {}, cnt = {}, st = { partnerRepeats: 0, opponentRepeats: 0, shortRest: 0, colorImbalance: 0 };
    var key = function (x, y) { return x < y ? x + '|' + y : y + '|' + x; };
    matches.forEach(function (m, i) {
      var slot = Math.floor(i / F), R = [m.red, m.red2], B = [m.blue, m.blue2];
      [R, B].forEach(function (p) { var k = key(p[0], p[1]); if (part[k]) st.partnerRepeats++; part[k] = 1; });
      R.forEach(function (x) { B.forEach(function (y) { var k = key(x, y); if (opp[k]) st.opponentRepeats++; opp[k] = 1; }); });
      R.concat(B).forEach(function (x) {
        if (last[x] != null && slot - last[x] - 1 < minGap) st.shortRest++;
        last[x] = slot; cnt[x] = (cnt[x] || 0) + 1;
      });
      R.forEach(function (x) { reds[x] = (reds[x] || 0) + 1; });
    });
    Object.keys(cnt).forEach(function (x) { if (Math.abs(2 * (reds[x] || 0) - cnt[x]) > 1) st.colorImbalance++; });
    return { cost: st.partnerRepeats * 10 + st.opponentRepeats + st.shortRest * 5 + st.colorImbalance, stats: st };
  }
  /* Tìm kiếm cục bộ: đổi cách chia liên minh trong 1 trận, hoặc đổi chỗ 2 đội giữa 2 trận (chỉ các chỗ tính điểm,
     không làm 1 đội đánh 2 sân cùng lượt); đổi màu cả trận để cân đỏ/xanh. Giữ thay đổi nếu tổng lỗi không tăng. */
  function improve(matches, F, minGap, rand, iters) {
    var cur = evaluate(matches, F, minGap).cost, n = matches.length;
    var inSlot = function (i, x) { var s = Math.floor(i / F) * F; for (var j = s; j < Math.min(n, s + F); j++) if (j !== i && teamsOf(matches[j]).indexOf(x) >= 0) return true; return false; };
    for (var it = 0; it < iters && cur > 0; it++) {
      var r = rand(), undo;
      if (r < 0.35) {                       // chia lại liên minh trong 1 trận
        var m = matches[Math.floor(rand() * n)], k = rand() < 0.5 ? 'blue' : 'blue2';
        if (m.red2_counts !== m[k + '_counts']) continue;
        var t = m.red2; m.red2 = m[k]; m[k] = t;
        undo = (function (m, k) { return function () { var t = m.red2; m.red2 = m[k]; m[k] = t; }; })(m, k);
      } else if (r < 0.5) {                 // đổi màu cả trận
        var mm = matches[Math.floor(rand() * n)];
        var flip = function (m) { ['', '2'].forEach(function (d) { var t = m['red' + d]; m['red' + d] = m['blue' + d]; m['blue' + d] = t; t = m['red' + d + '_counts']; m['red' + d + '_counts'] = m['blue' + d + '_counts']; m['blue' + d + '_counts'] = t; }); };
        flip(mm); undo = (function (m) { return function () { flip(m); }; })(mm);
      } else {                              // đổi 2 đội giữa 2 trận
        var i = Math.floor(rand() * n), j = Math.floor(rand() * n); if (i === j) continue;
        var p = SLOTS[Math.floor(rand() * 4)], q = SLOTS[Math.floor(rand() * 4)], a = matches[i], b = matches[j], x = a[p], y = b[q];
        if (!a[p + '_counts'] || !b[q + '_counts']) continue;
        if (teamsOf(b).indexOf(x) >= 0 || teamsOf(a).indexOf(y) >= 0) continue;
        if (inSlot(j, x) || inSlot(i, y)) continue;
        a[p] = y; b[q] = x;
        undo = (function (a, b, p, q, x, y) { return function () { a[p] = x; b[q] = y; }; })(a, b, p, q, x, y);
      }
      var c = evaluate(matches, F, minGap).cost;
      if (c <= cur) cur = c; else undo();
    }
  }

  /* ---------- Ranking points (1.6.3, 5.4.1, 5.5) ----------
     Mỗi trận, mỗi đội nhận: Autonomous RP (1) + Endgame RP (1) + Match RP (thắng 2, hoà 1) của liên minh mình.
     Thẻ đỏ hoặc vắng mặt: đội đó 0 RP; đồng đội giữ kết quả thật. Liên minh đối thủ của đội bị thẻ đỏ nhận 2 Match RP,
     trừ khi chính họ cũng có thẻ đỏ. Trận đánh dấu * không tính. Xếp theo trung bình RP/trận;
     tiebreak: TB Autonomous RP → TB Endgame RP → TB Match RP → bốc thăm. */
  function teamRP(m, s) {
    var side = sideOf(s), other = side === 'red' ? 'blue' : 'red', stt = m[s + '_status'];
    if (stt === 'absent' || stt === 'red') return { auto: 0, end: 0, match: 0, zero: true };
    var my = side === 'red' ? +m.score : +m.score_blue, their = side === 'red' ? +m.score_blue : +m.score;
    var mrp = hasRed(m, other) && !hasRed(m, side) ? 2 : my > their ? 2 : my === their ? 1 : 0;
    return { auto: m['auto_' + side] ? 1 : 0, end: m['end_' + side] ? 1 : 0, match: mrp, my: my, their: their };
  }
  function ranking(teams, matches, opts) {
    var o = cfg(opts), seed = o.seed || '', by = {};
    teams.forEach(function (t) { by[t.number] = { team: t.number, played: 0, rp: 0, auto: 0, end: 0, mrp: 0, w: 0, l: 0, t: 0 }; });
    (matches || []).forEach(function (m) {
      if (m.round !== 'qual' || !played(m)) return;
      SLOTS.forEach(function (s) {
        var r = by[m[s]]; if (!r || m[s + '_counts'] === false) return;
        var x = teamRP(m, s);
        r.played++; r.auto += x.auto; r.end += x.end; r.mrp += x.match; r.rp += x.auto + x.end + x.match;
        if (!x.zero) { if (x.my > x.their) r.w++; else if (x.my < x.their) r.l++; else r.t++; } else r.l++;
      });
    });
    var rows = Object.keys(by).map(function (k) {
      var r = by[k], n = r.played || 1;
      r.avg = r.rp / n; r.avgAuto = r.auto / n; r.avgEnd = r.end / n; r.avgMatch = r.mrp / n;
      r.draw = E.rng(seed + '|' + r.team)();
      return r;
    });
    rows.sort(function (a, b) {
      if ((b.played > 0) !== (a.played > 0)) return b.played > 0 ? 1 : -1;
      return b.avg - a.avg || b.avgAuto - a.avgAuto || b.avgEnd - a.avgEnd || b.avgMatch - a.avgMatch || a.draw - b.draw;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- Solo (3.5) ----------
     Tổng = driving cao nhất + coding cao nhất. Tiebreak: 1 coding cao nhất · 2 driving cao nhất ·
     3 stop time của trận coding cao nhất · 4 stop time của trận driving cao nhất; sau đó lượt thứ 2 của 1–4, rồi lượt thứ 3. */
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
        var keys = [[g(a.coding, k, 'score'), g(b.coding, k, 'score')], [g(a.driving, k, 'score'), g(b.driving, k, 'score')],
          [g(a.coding, k, 'stop'), g(b.coding, k, 'stop')], [g(a.driving, k, 'stop'), g(b.driving, k, 'stop')]];
        for (var i = 0; i < 4; i++) if (keys[i][0] !== keys[i][1]) return keys[i][1] - keys[i][0];
      }
      return String(a.team).localeCompare(String(b.team));
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  function redCards(matches) {
    var c = {};
    (matches || []).forEach(function (m) { SLOTS.forEach(function (s) { if (m[s] && m[s + '_status'] === 'red') c[m[s]] = (c[m[s]] || 0) + 1; }); });
    return c;
  }
  /* Đội được tham gia chọn liên minh: đã đánh vòng loại, không bị loại, dưới 3 thẻ đỏ (1.6.4, 7.2.6) */
  function eligible(rank, teams, matches, opts) {
    var o = cfg(opts), rc = redCards(matches), ex = {};
    teams.forEach(function (t) { if (t.excluded) ex[t.number] = 1; });
    return rank.filter(function (r) { return r.played > 0 && !ex[r.team] && (rc[r.team] || 0) < o.maxRedCards; });
  }

  /* ---------- Chọn liên minh (7.4.4) ---------- */
  function recommendedAlliances(nTeams) {
    var n = +nTeams || 0, a;
    if (n < 18) a = n % 2 === 0 ? n / 2 : (n - 3) / 2;
    else if (n <= 25) a = 8;
    else if (n <= 32) a = 12;
    else a = 16;
    return Math.max(n >= 4 ? 2 : 0, Math.min(Math.floor(n / 2), a));
  }
  /* Trạng thái hiện tại: đội trưởng kế tiếp = đội hạng cao nhất chưa có liên minh (kể cả đội từng từ chối lời mời);
     đội có thể mời = chưa có liên minh, chưa từng từ chối. */
  function selection(elig, sel) {
    sel = sel || {}; var picks = sel.picks || [], declined = sel.declined || [], n = +sel.n || 0, allied = {};
    picks.forEach(function (p) { allied[p.captain] = 1; allied[p.partner] = 1; });
    var alliances = picks.map(function (p, i) { return { seed: i + 1, captain: p.captain, partner: p.partner }; });
    var free = elig.filter(function (r) { return !allied[r.team]; });
    var captain = picks.length < n && free.length ? free[0].team : null;
    var available = captain ? free.filter(function (r) { return r.team !== captain && declined.indexOf(r.team) < 0; }).map(function (r) { return r.team; }) : [];
    var done = picks.length >= n || !captain || !available.length;
    return { alliances: alliances, captain: done ? null : captain, available: done ? [] : available, done: done, n: n, declined: declined };
  }

  /* ---------- Nhánh loại trực tiếp (7.4.5, 7.4.6) ----------
     Hạt giống theo thứ tự lập liên minh. Nhánh chuẩn: 1 gặp hạt giống thấp nhất…; thiếu đội thì hạt giống cao được bye.
     Mỗi cặp: thắng 1 trận; hoà thì đánh lại tối đa 2 trận, trận thứ 3 vẫn hoà thì hạt giống cao hơn đi tiếp.
     Chung kết: 'bo1' như trên; 'bo3' thắng 2 trận (trận hoà không tính, tối đa 6 trận rồi xét hạt giống).
     Thẻ đỏ ở vòng loại trực tiếp: cả liên minh 0 điểm (1.6.3). */
  function seedOrder(P) {
    var s = [1, 2];
    while (s.length < P) { var L = s.length * 2 + 1, n = []; s.forEach(function (x) { n.push(x, L - x); }); s = n; }
    return s;
  }
  function gameScores(m) {
    return { red: hasRed(m, 'red') ? 0 : +m.score || 0, blue: hasRed(m, 'blue') ? 0 : +m.score_blue || 0 };
  }
  function decide(games, hi, lo, bo3) {
    var wins = {}, ties = 0, done = 0; wins[hi] = 0; wins[lo] = 0;
    for (var i = 0; i < games.length; i++) {
      var g = games[i]; if (!played(g)) return { winner: null, pending: true };
      var sc = gameScores(g), rs = g.seed, bs = g.seed_blue; done++;
      if (sc.red === sc.blue) ties++;
      else wins[sc.red > sc.blue ? rs : bs]++;
      if (!bo3) {
        if (sc.red !== sc.blue) return { winner: sc.red > sc.blue ? rs : bs };
        if (ties >= 3) return { winner: Math.min(hi, lo), bySeed: true };
      } else {
        if (wins[hi] >= 2 || wins[lo] >= 2) return { winner: wins[hi] >= 2 ? hi : lo };
        if (done >= 6) return { winner: wins[hi] === wins[lo] ? Math.min(hi, lo) : (wins[hi] > wins[lo] ? hi : lo), bySeed: wins[hi] === wins[lo] };
      }
    }
    return { winner: null, pending: false, wins: wins, ties: ties };
  }
  function bracket(alliances, matches, opts) {
    var o = cfg(opts), n = (alliances || []).length, A = {};
    (alliances || []).forEach(function (a) { A[a.seed] = a; });
    var out = { rounds: [], champion: null, toCreate: [], size: 0 };
    if (n < 2) return out;
    var P = 1; while (P < n) P *= 2;
    var R = Math.log(P) / Math.LN2, order = seedOrder(P), elim = (matches || []).filter(function (m) { return m.round === 'elim' || m.round === 'final'; });
    out.size = P;
    var nextNum = { elim: 0, final: 0 };
    elim.forEach(function (m) { nextNum[m.round] = Math.max(nextNum[m.round], +m.num || 0); });
    var prev = null;
    for (var r = 1; r <= R; r++) {
      var nodes = [], count = P / Math.pow(2, r), isFinal = r === R;
      for (var k = 1; k <= count; k++) {
        var a, b;
        if (r === 1) { a = order[2 * k - 2]; b = order[2 * k - 1]; if (a > n) a = null; if (b > n) b = null; }
        else { a = prev[2 * k - 2].winner; b = prev[2 * k - 1].winner; }
        var label = isFinal ? 'F' : 'R' + r + '-' + k, node = { round: r, k: k, label: label, final: isFinal, a: a, b: b, winner: null, bye: false, games: [] };
        if (r === 1 && (a == null || b == null)) { node.bye = true; node.winner = a != null ? a : b; }
        else if (a != null && b != null) {
          var hi = Math.min(a, b), lo = Math.max(a, b);
          node.hi = hi; node.lo = lo;
          node.games = elim.filter(function (m) { return m.label === label; }).sort(function (x, y) { return x.num - y.num; });
          var d = decide(node.games, hi, lo, isFinal && o.finals === 'bo3');
          node.winner = d.winner; node.bySeed = !!d.bySeed;
          if (d.winner == null && !d.pending) {
            var rd = isFinal ? 'final' : 'elim';
            nextNum[rd]++;
            out.toCreate.push({ round: rd, num: nextNum[rd], label: label, field: '1', seed: hi, seed_blue: lo,
              red: A[hi].captain, red2: A[hi].partner, blue: A[lo].captain, blue2: A[lo].partner,
              red_counts: true, red2_counts: true, blue_counts: true, blue2_counts: true,
              red_status: 'ok', red2_status: 'ok', blue_status: 'ok', blue2_status: 'ok', score: null, score_blue: null });
          }
        }
        nodes.push(node);
      }
      out.rounds.push(nodes); prev = nodes;
    }
    var fin = out.rounds[out.rounds.length - 1][0];
    if (fin.winner != null) out.champion = A[fin.winner];
    return out;
  }

  /* ---------- Giải thưởng, CSV ---------- */
  function performanceAwards(matches, runs, ev) {
    var out = [], sel = (ev && ev.config && ev.config.selection) || {}, sr = soloRanking(runs);
    var al = selection([], sel).alliances, br = bracket(al, matches, ev && ev.config);
    if (br.champion) [br.champion.captain, br.champion.partner].forEach(function (t) { out.push({ team: t, name: 'Tournament Champions', judged: false, auto: true }); });
    if (sr.length && sr[0].total > 0) out.push({ team: sr[0].team, name: 'Solo Match Champion', judged: false, auto: true });
    return out;
  }
  /* Điểm Alliance của 1 đội trong trận = điểm liên minh của đội đó (0 nếu vắng hoặc thẻ đỏ) */
  function teamScore(m, s) {
    var st = m[s + '_status'];
    if (st === 'absent' || st === 'red') return 0;
    return sideOf(s) === 'red' ? +m.score || 0 : +m.score_blue || 0;
  }
  function resultRows(ev, teams, matches, runs, awards) {
    var base = E.rowMaker(ev, teams), rows = [];
    (runs || []).forEach(function (r) { rows.push(base(r.team, r.kind === 'coding' ? 'solo2' : 'solo1', +r.score || 0)); });
    (matches || []).forEach(function (m) {
      if (m.round !== 'qual' || !played(m)) return;
      SLOTS.forEach(function (s) { if (m[s] && m[s + '_counts'] !== false) rows.push(base(m[s], 'alliance', teamScore(m, s))); });
    });
    (awards || []).concat(performanceAwards(matches, runs, ev)).forEach(function (a) { rows.push(base(a.team, 'award', a.name)); });
    return rows;
  }

  return {
    DEFAULTS: DEFAULTS, SLOTS: SLOTS, cfg: cfg, teamsOf: teamsOf, played: played, hasRed: hasRed,
    schedule: schedule, teamRP: teamRP, ranking: ranking, soloRanking: soloRanking, redCards: redCards, eligible: eligible,
    recommendedAlliances: recommendedAlliances, selection: selection, seedOrder: seedOrder, gameScores: gameScores, bracket: bracket,
    performanceAwards: performanceAwards, teamScore: teamScore, resultRows: resultRows
  };
});
