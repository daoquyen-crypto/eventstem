/* Luật thi đấu RECF Engage: Tier Takeover (Game Manual v2.0, 29/09/2026).
   Không phụ thuộc giao diện hay cơ sở dữ liệu: chạy được trong trình duyệt (window.Engage) và trong node (require).

   Dữ liệu vào:
     team   {number, name, org, country, grade, excluded}
     match  {round:'practice'|'qual'|'final', num, field, time, red, blue, red_counts, blue_counts,
             score (null = chưa đánh), red_status, blue_status ('ok'|'absent'|'red'), stop_time}
     solo   {team, kind:'driving'|'coding', score, stop_time}
     award  {team, name, judged}
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Cấu hình mặc định theo luật. Giải tự tổ chức (không phải RECF) có thể đổi các con số này. */
  var DEFAULTS = {
    matchesPerTeam: 6,   // 7.4.2: 5–8 trận ở giải vòng loại, 8–10 ở championship
    fields: 1,
    start: '09:00',
    cycleMin: 4,         // phút giữa 2 lượt trận
    minGap: 1,           // số lượt nghỉ tối thiểu giữa 2 trận của cùng 1 đội
    dropLowest: true,    // 7.4.2: bỏ trận thấp nhất
    soloAttempts: 5,     // 7.4.1: tối đa 5 lượt solo, chia tuỳ ý giữa driving và coding
    maxRedCards: 3       // 1.6.4: từ 3 thẻ đỏ trở lên không được vào chung kết
  };
  function cfg(c) { var o = {}, k; for (k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in (c || {})) if (c[k] != null && c[k] !== '') o[k] = c[k]; return o; }

  /* Số ngẫu nhiên có seed, để cùng seed cho cùng lịch (dễ kiểm tra, dễ tạo lại). */
  function rng(seed) {
    var h = 1779033703 ^ String(seed).length;
    for (var i = 0; i < String(seed).length; i++) { h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return function () {
      h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  function hashNum(s) { return rng(s)(); }

  function addMinutes(hhmm, min) {
    var p = String(hhmm || '09:00').split(':'), t = (+p[0]) * 60 + (+p[1] || 0) + min;
    t = ((t % 1440) + 1440) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  /* ---------- Lịch trận Alliance (5.0, 7.2.3, 7.4.2) ----------
     Mỗi trận 2 đội hợp tác (đỏ + xanh). Mỗi đội đánh đúng matchesPerTeam trận tính điểm.
     Nếu tổng số chỗ lẻ, trận cuối có 1 đội đánh thêm và được đánh dấu * (không tính xếp hạng).
     Thử nhiều lịch ngẫu nhiên, giữ lịch ít lỗi nhất: gặp lại đồng đội, nghỉ quá ngắn, lệch màu. */
  function schedule(teamNumbers, opts) {
    var o = cfg(opts), N = teamNumbers.length, M = Math.max(1, +o.matchesPerTeam), F = Math.max(1, +o.fields);
    if (N < 2) return { matches: [], cost: 0, stats: { teams: N } };
    var tries = o.tries || 300, budget = o.timeBudgetMs || 1500, t0 = Date.now();
    var rand = rng(o.seed != null ? o.seed : Date.now()), best = null;
    for (var t = 0; t < tries; t++) {
      var r = buildOnce(teamNumbers, M, F, +o.minGap, rand);
      if (!best || r.cost < best.cost) best = r;
      if (best.cost === 0 || (o.seed == null && Date.now() - t0 > budget)) break;
    }
    best.matches.forEach(function (m, i) {
      m.round = 'qual'; m.num = i + 1;
      m.field = F > 1 ? String((i % F) + 1) : '1';
      m.time = addMinutes(o.start, Math.floor(i / F) * (+o.cycleMin));
      m.score = null; m.red_status = 'ok'; m.blue_status = 'ok'; m.stop_time = null;
    });
    return best;
  }

  function buildOnce(teams, M, F, minGap, rand) {
    var N = teams.length, total = Math.ceil(N * M / 2);
    var cnt = {}, last = {}, reds = {}, partners = {}, matches = [], cost = 0, repeats = 0, shortRest = 0;
    teams.forEach(function (x) { cnt[x] = 0; last[x] = -99; reds[x] = 0; partners[x] = {}; });
    for (var i = 0; i < total; i++) {
      var slot = Math.floor(i / F), busy = {};
      for (var j = slot * F; j < i; j++) { busy[matches[j].red] = 1; busy[matches[j].blue] = 1; }
      var need = teams.filter(function (x) { return cnt[x] < M && !busy[x]; });
      var pool = need.length >= 2 ? need : teams.filter(function (x) { return !busy[x]; });
      if (pool.length < 2) pool = teams.slice();
      var bestPair = null, bestC = Infinity;
      for (var a = 0; a < pool.length; a++) for (var b = a + 1; b < pool.length; b++) {
        var x = pool[a], y = pool[b], c = 0;
        c += (cnt[x] + cnt[y]) * 4;                                   // ưu tiên đội đánh ít trận
        if (cnt[x] >= M) c += 1000; if (cnt[y] >= M) c += 1000;        // đội đã đủ trận chỉ dùng để lấp chỗ lẻ
        if (busy[x] || busy[y]) c += 100000;
        var rx = slot - last[x] - 1, ry = slot - last[y] - 1;
        if (rx < minGap) c += 60 * (minGap - rx); if (ry < minGap) c += 60 * (minGap - ry);
        c += (partners[x][y] || 0) * 80;                              // hạn chế gặp lại đồng đội
        c += rand() * 3;
        if (c < bestC) { bestC = c; bestPair = [x, y]; }
      }
      var p = bestPair, u = p[0], v = p[1];
      if (slot - last[u] - 1 < minGap && last[u] >= 0) shortRest++;
      if (slot - last[v] - 1 < minGap && last[v] >= 0) shortRest++;
      if (partners[u][v]) repeats++;
      var uCounts = cnt[u] < M, vCounts = cnt[v] < M;
      cnt[u]++; cnt[v]++; last[u] = slot; last[v] = slot;
      partners[u][v] = (partners[u][v] || 0) + 1; partners[v][u] = (partners[v][u] || 0) + 1;
      var redFirst = reds[u] < reds[v] || (reds[u] === reds[v] && rand() < 0.5);
      var R = redFirst ? u : v, B = redFirst ? v : u;
      reds[R]++;
      matches.push({ red: R, blue: B, red_counts: R === u ? uCounts : vCounts, blue_counts: B === u ? uCounts : vCounts });
    }
    // Cân lại màu: đổi đỏ/xanh của một trận nếu việc đó làm 2 đội lệch ít hơn.
    var off = function (x) { return Math.abs(2 * reds[x] - cnt[x]); };
    for (var pass = 0, changed = true; changed && pass < 10; pass++) {
      changed = false;
      matches.forEach(function (m) {
        var before = off(m.red) + off(m.blue);
        reds[m.red]--; reds[m.blue]++;
        if (off(m.red) + off(m.blue) < before) {
          var tmp = m.red; m.red = m.blue; m.blue = tmp;
          tmp = m.red_counts; m.red_counts = m.blue_counts; m.blue_counts = tmp; changed = true;
        } else { reds[m.red]++; reds[m.blue]--; }
      });
    }
    var imbalance = 0; teams.forEach(function (x) { imbalance += off(x) > 1 ? 1 : 0; });
    cost = repeats * 10 + shortRest * 5 + imbalance;
    return { matches: matches, cost: cost, stats: { teams: N, matches: total, repeats: repeats, shortRest: shortRest, colorImbalance: imbalance } };
  }

  /* ---------- Xếp hạng Alliance (7.4.2, 7.4.4) ----------
     Điểm của đội trong 1 trận = điểm chung của trận; vắng mặt hoặc thẻ đỏ = 0 (1.6.3, 5.2.1).
     Bỏ trận thấp nhất (kể cả trận 0). Xếp theo trung bình; bằng nhau thì so điểm cao thứ 2, 3, 4, rồi bốc thăm. */
  function teamScore(m, side) {
    var st = m[side + '_status'];
    return st === 'absent' || st === 'red' ? 0 : (+m.score || 0);
  }
  function allianceRanking(teams, matches, opts) {
    var o = cfg(opts), seed = o.seed || '', by = {};
    teams.forEach(function (t) { by[t.number] = { team: t.number, scores: [], played: 0 }; });
    (matches || []).forEach(function (m) {
      if (m.round !== 'qual' || m.score == null) return;
      ['red', 'blue'].forEach(function (s) {
        var r = by[m[s]]; if (!r || m[s + '_counts'] === false) return;
        r.scores.push(teamScore(m, s)); r.played++;
      });
    });
    var rows = Object.keys(by).map(function (k) {
      var r = by[k], s = r.scores.slice().sort(function (a, b) { return b - a; });
      var kept = o.dropLowest && s.length > 1 ? s.slice(0, -1) : s;
      r.sorted = s; r.dropped = kept.length < s.length ? s[s.length - 1] : null;
      r.avg = kept.length ? kept.reduce(function (a, b) { return a + b; }, 0) / kept.length : 0;
      r.high = s[0] || 0; r.draw = hashNum(seed + '|' + r.team);
      return r;
    });
    rows.sort(function (a, b) {
      if ((b.played > 0) !== (a.played > 0)) return b.played > 0 ? 1 : -1;
      if (b.avg !== a.avg) return b.avg - a.avg;
      for (var i = 1; i <= (+o.tiebreakDepth || 3); i++) { var x = a.sorted[i] || 0, y = b.sorted[i] || 0; if (x !== y) return y - x; }
      return a.draw - b.draw;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- Xếp hạng Solo (3.5, 7.4.1) ----------
     Tổng = driving cao nhất + coding cao nhất. Tiebreak:
     1 coding cao nhất · 2 coding thứ 2 · 3 driving thứ 2 · 4 stop time của trận driving cao nhất ·
     5 coding thứ 3 · 6 driving thứ 3 · sau đó so tiếp các lượt còn lại. */
  function soloRanking(runs) {
    var by = {};
    (runs || []).forEach(function (r) {
      var t = by[r.team] = by[r.team] || { team: r.team, driving: [], coding: [] };
      (r.kind === 'coding' ? t.coding : t.driving).push({ score: +r.score || 0, stop: +r.stop_time || 0 });
    });
    var rows = Object.keys(by).map(function (k) {
      var t = by[k], desc = function (a, b) { return b.score - a.score || b.stop - a.stop; };
      t.driving.sort(desc); t.coding.sort(desc);
      t.d = t.driving.map(function (x) { return x.score; }); t.c = t.coding.map(function (x) { return x.score; });
      t.bestDriving = t.d[0] || 0; t.bestCoding = t.c[0] || 0; t.total = t.bestDriving + t.bestCoding;
      t.stop = t.driving.length ? t.driving[0].stop : 0;
      t.attempts = t.driving.length + t.coding.length;
      return t;
    });
    var g = function (a, i) { return a[i] || 0; };
    rows.sort(function (a, b) {
      var keys = [
        [a.total, b.total], [g(a.c, 0), g(b.c, 0)], [g(a.c, 1), g(b.c, 1)], [g(a.d, 1), g(b.d, 1)],
        [a.stop, b.stop], [g(a.c, 2), g(b.c, 2)], [g(a.d, 2), g(b.d, 2)]
      ];
      for (var i = 0; i < keys.length; i++) if (keys[i][0] !== keys[i][1]) return keys[i][1] - keys[i][0];
      for (var j = 3; j < 6; j++) { if (g(a.c, j) !== g(b.c, j)) return g(b.c, j) - g(a.c, j); if (g(a.d, j) !== g(b.d, j)) return g(b.d, j) - g(a.d, j); }
      return String(a.team).localeCompare(String(b.team));
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- Chung kết (1.6.4, 7.2.6, 7.4.4) ----------
     Ghép từ trên xuống: hạng 1 + hạng 2, hạng 3 + hạng 4… Bỏ đội bị loại hoặc có từ 3 thẻ đỏ.
     Đánh lần lượt, bắt đầu từ liên minh hạng thấp nhất. */
  function redCards(matches) {
    var c = {};
    (matches || []).forEach(function (m) { ['red', 'blue'].forEach(function (s) { if (m[s + '_status'] === 'red') c[m[s]] = (c[m[s]] || 0) + 1; }); });
    return c;
  }
  function finalsEligible(ranking, teams, matches, opts) {
    var o = cfg(opts), rc = redCards(matches), ex = {};
    teams.forEach(function (t) { if (t.excluded) ex[t.number] = 1; });
    return ranking.filter(function (r) { return r.played > 0 && !ex[r.team] && (rc[r.team] || 0) < o.maxRedCards; });
  }
  function finalsMatches(eligible, nAlliances) {
    var n = Math.min(Math.floor(eligible.length / 2), Math.max(1, +nAlliances || Math.floor(eligible.length / 2)));
    var al = [];
    for (var i = 0; i < n; i++) al.push({ seed: i + 1, red: eligible[2 * i].team, blue: eligible[2 * i + 1].team });
    return al.reverse().map(function (a, i) {
      return { round: 'final', num: i + 1, field: '1', time: null, red: a.red, blue: a.blue, seed: a.seed,
        red_counts: true, blue_counts: true, score: null, red_status: 'ok', blue_status: 'ok', stop_time: null };
    });
  }
  /* Thẻ đỏ trong chung kết làm cả liên minh 0 điểm (1.6.3). Hoà hạng nhất thì đánh thêm trận tiebreak giữa các liên minh hoà. */
  function finalsResult(matches) {
    var fm = (matches || []).filter(function (m) { return m.round === 'final'; }).sort(function (a, b) { return a.num - b.num; });
    var al = {}, order = [];
    fm.forEach(function (m) {
      var k = m.red + '+' + m.blue;
      if (!al[k]) { al[k] = { red: m.red, blue: m.blue, scores: [], stops: [] }; order.push(k); }
      if (m.score != null) {
        al[k].scores.push(m.red_status === 'red' || m.blue_status === 'red' ? 0 : +m.score || 0);
        al[k].stops.push(+m.stop_time || 0);
      }
    });
    var list = order.map(function (k) { return al[k]; });
    if (!list.length || list.some(function (a) { return !a.scores.length; })) return { alliances: list, done: false, champion: null, tied: [] };
    var lead = list.slice(), round = 0;
    while (lead.length > 1) {
      var have = lead.filter(function (a) { return a.scores.length > round; });
      if (have.length < lead.length) break;
      var mx = Math.max.apply(null, lead.map(function (a) { return a.scores[round]; }));
      lead = lead.filter(function (a) { return a.scores[round] === mx; });
      if (round > 0 && lead.length > 1) {   // vòng tiebreak thứ 2 trở đi: xét stop time sớm (5.1.4)
        var ms = Math.max.apply(null, lead.map(function (a) { return a.stops[round]; }));
        if (ms > 0) lead = lead.filter(function (a) { return a.stops[round] === ms; });
      }
      round++;
    }
    return { alliances: list, done: lead.length === 1, champion: lead.length === 1 ? lead[0] : null, tied: lead.length > 1 ? lead : [] };
  }

  /* ---------- Giải thưởng (6.3, 7.2.7) ---------- */
  var JUDGED_AWARDS = ['Excellence Award', 'Design Award', 'Innovate Award', 'Think Award', 'Amaze Award', 'Build Award',
    'Create Award', 'Judges Award', 'Energy Award', 'Sportsmanship Award'];
  function awardConflicts(awards) {
    var n = {};
    (awards || []).forEach(function (a) { if (a.judged) n[a.team] = (n[a.team] || 0) + 1; });
    return Object.keys(n).filter(function (k) { return n[k] > 1; });
  }
  /* Giải thành tích do phần mềm tự xác định: vô địch chung kết, vô địch solo. */
  function performanceAwards(matches, runs) {
    var out = [], fr = finalsResult(matches), sr = soloRanking(runs);
    if (fr.champion) { out.push({ team: fr.champion.red, name: 'Tournament Champions', judged: false, auto: true }); out.push({ team: fr.champion.blue, name: 'Tournament Champions', judged: false, auto: true }); }
    if (sr.length && sr[0].total > 0) out.push({ team: sr[0].team, name: 'Solo Match Champion', judged: false, auto: true });
    return out;
  }

  /* ---------- Xuất CSV theo mẫu results/_MAU_KET_QUA.csv ---------- */
  function season(date) {
    var d = String(date || ''), y = +d.slice(0, 4), m = +d.slice(5, 7);
    if (!y) return '';
    return m >= 5 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
  }
  var CSV_COLS = ['event_code', 'event_name', 'program', 'season', 'date', 'country', 'partner', 'verified',
    'team', 'team_name', 'organization', 'team_country', 'grade', 'type', 'value'];
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  /* Hàm tạo 1 dòng CSV cho giải ev (dùng chung với js/achieve.js) */
  function rowMaker(ev, teams) {
    var T = {}; teams.forEach(function (t) { T[t.number] = t; });
    return function (team, type, value) {
      var t = T[team] || {};
      return [ev.recf_code || ev.code || ('ES-' + String(ev.id || '').slice(0, 8).toUpperCase()), ev.name, ev.program || 'Engage', season(ev.date), ev.date || '', ev.country || '',
        ev.partner || '', ev.verified ? 'yes' : 'no', team, t.name || '', t.org || '', t.country || ev.country || '', t.grade || '', type, value];
    };
  }
  function resultRows(ev, teams, matches, runs, awards) {
    var base = rowMaker(ev, teams), rows = [];
    (runs || []).forEach(function (r) { rows.push(base(r.team, r.kind === 'coding' ? 'solo2' : 'solo1', +r.score || 0)); });
    (matches || []).forEach(function (m) {
      if (m.round !== 'qual' || m.score == null) return;
      ['red', 'blue'].forEach(function (s) { if (m[s + '_counts'] !== false) rows.push(base(m[s], 'alliance', teamScore(m, s))); });
    });
    (awards || []).concat(performanceAwards(matches, runs)).forEach(function (a) { rows.push(base(a.team, 'award', a.name)); });
    return rows;
  }
  function toCSV(rows) { return [CSV_COLS].concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n'; }

  /* ---------- Nhập danh sách đội ----------
     Mỗi dòng: mã đội, tên đội, đơn vị, cấp (ES/MS/HS/UNI), quốc gia. Phân tách bằng dấu phẩy, tab hoặc chấm phẩy. */
  function parseTeams(text, defaults) {
    var d = defaults || {}, seen = {}, out = [], bad = [];
    String(text || '').split(/\r?\n/).forEach(function (line, i) {
      line = line.trim(); if (!line || /^#/.test(line)) return;
      var p = line.split(/\t|;|,/).map(function (s) { return s.trim(); });
      if (/^(team|mã|ma doi|number)/i.test(p[0] || '')) return;   // dòng tiêu đề
      var num = (p[0] || '').toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9_\-]{2,20}$/.test(num)) { bad.push(i + 1); return; }
      if (seen[num]) return; seen[num] = 1;
      var g = (p[3] || d.grade || '').toUpperCase();
      out.push({ number: num, name: p[1] || '', org: p[2] || '', grade: /^(ES|MS|HS|UNI)$/.test(g) ? g : (d.grade || 'ES'), country: p[4] || d.country || '' });
    });
    return { teams: out, badLines: bad };
  }

  return {
    DEFAULTS: DEFAULTS, JUDGED_AWARDS: JUDGED_AWARDS, cfg: cfg, rng: rng, addMinutes: addMinutes,
    schedule: schedule, teamScore: teamScore, allianceRanking: allianceRanking, soloRanking: soloRanking,
    redCards: redCards, finalsEligible: finalsEligible, finalsMatches: finalsMatches, finalsResult: finalsResult,
    awardConflicts: awardConflicts, performanceAwards: performanceAwards, season: season,
    resultRows: resultRows, rowMaker: rowMaker, toCSV: toCSV, CSV_COLS: CSV_COLS, parseTeams: parseTeams
  };
});
