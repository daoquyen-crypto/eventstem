/* Luật RECF Aerial Drone Competition, Mission 2027: Fast Track (Game Manual v1.1, 29/09/2026).
   Trận Alliance giống Engage: 2 đội hợp tác, chung 1 điểm (5.0). Khác Engage:
   - Solo: tối đa 3 lượt Piloting + 3 lượt Autonomous (7.4.1); xếp theo Piloting cao nhất + Autonomous cao nhất (3.5).
   - Xếp hạng Alliance: bỏ trận thấp nhất; bằng điểm so điểm cao thứ 2, thứ 3, rồi bốc thăm (7.4.2).
   - Sau vòng loại: chọn liên minh như Achieve (7.4.4), rồi đánh theo vòng: tứ kết → bán kết → chung kết.
     Mỗi liên minh đánh 1 trận mỗi vòng, các liên minh điểm cao nhất đi tiếp, hoà ở ngưỡng thì cùng đi tiếp (7.4.5).

   Lưu dữ liệu dùng lại cột sẵn có, không cần đổi cơ sở dữ liệu:
     solo.kind 'driving' = Piloting, 'coding' = Autonomous
     trận loại trực tiếp: round 'elim' (label 'QF' / 'SF') hoặc 'final' (label 'F', 'TB1', 'TB2'…),
       red = đội trưởng, blue = đồng đội, seed = hạt giống liên minh
     chọn liên minh: event.config.selection, giống Achieve
     điểm thành phần (nếu ban tổ chức chọn nhập chi tiết): cột detail (jsonb) của matches và solo_runs */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engage.js'), require('./achieve.js'));
  else root.ADC = factory(root.Engage, root.Achieve);
})(typeof self !== 'undefined' ? self : this, function (E, A) {
  'use strict';

  var DEFAULTS = {
    matchesPerTeam: 6,   // 7.4.2: 5–8 trận ở giải vòng loại, 8–10 ở championship / signature
    fields: 1,
    start: '09:00',
    cycleMin: 4,         // trận 90 giây (5.0) + dọn sân
    minGap: 1,
    dropLowest: true,    // 7.4.2: luôn bỏ trận thấp nhất, kể cả trận 0 do vắng hoặc thẻ đỏ
    tiebreakDepth: 2,    // 7.4.2: so điểm cao thứ 2, thứ 3, rồi bốc thăm
    soloAttempts: 3,     // 7.4.1: mỗi loại 3 lượt (3 Piloting + 3 Autonomous)
    maxRedCards: 3,      // 1.6.4
    /* Các điểm luật chưa nói rõ: để ban tổ chức chọn */
    scoreEntry: 'total',       // 'total' = chỉ nhập điểm tổng; 'detail' = nhập điểm thành phần, phần mềm tự cộng (3.1, 4.2, 5.1)
    goals: 4,                  // số goal trên sân Alliance, dùng tính goal bonus (5.1.2, hình 1.3.1)
    stopTimeTiebreak: false,   // 7.4.5: lần tiebreak thứ 2 "có thể" xét stop time sớm
    finalTie: 'replay'         // vẫn hoà sau khi so điểm các vòng trước: 'replay' = đánh thêm tiebreak, 'seed' = hạt giống cao hơn thắng
  };
  function cfg(c) { var o = {}, k; for (k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in (c || {})) if (c[k] != null && c[k] !== '') o[k] = c[k]; return o; }

  /* ---------- Bảng điểm thành phần (3.1, 4.2, 5.1) ----------
     Mỗi mục: [khoá, điểm mỗi lần, số lần tối đa (0 = không giới hạn), tên EN, tên VI]. Hạ cánh là 1 lựa chọn duy nhất. */
  var SHEETS = {
    alliance: {
      title: ['Alliance match (5.1)', 'Trận Alliance (5.1)'], choice: ['Landing (5.1.6)', 'Hạ cánh (5.1.6)'], goals: true,
      items: [['zone', 1, 0, 'Balls in a scoring zone', 'Bóng trong vùng ghi điểm'], ['bags', 10, 2, 'Bean bags cleared', 'Túi đậu đã gạt'],
        ['paths', 10, 2, 'Completed flight paths (1 per drone)', 'Đường bay hoàn thành (1 mỗi drone)']],
      landing: [['large', 15, 'Drone on the large cube', 'Drone trên khối lớn'], ['small', 20, 'Drone on the small cube', 'Drone trên khối nhỏ']], multiLanding: true
    },
    driving: {
      title: ['Piloting (3.1)', 'Piloting (3.1)'], choice: ['Landing (3.1.12–3.1.15)', 'Hạ cánh (3.1.12–3.1.15)'],
      items: [['takeoff', 5, 1, 'Take off', 'Cất cánh'], ['p1', 5, 0, 'Phase 1 completed', 'Hoàn thành phase 1'], ['p2', 10, 0, 'Phase 2 completed', 'Hoàn thành phase 2'],
        ['p3', 15, 0, 'Phase 3 completed', 'Hoàn thành phase 3'], ['p4', 10, 0, 'Phase 4 completed', 'Hoàn thành phase 4']],
      landing: [['pad', 5, 'Landing pad', 'Bãi đáp'], ['cube', 10, 'Any cube', 'Trên khối'], ['bull', 15, 'Bullseye', 'Hồng tâm']]
    },
    coding: {
      title: ['Autonomous flight (4.2)', 'Autonomous (4.2)'], choice: ['Landing (3.1.12–3.1.15)', 'Hạ cánh (3.1.12–3.1.15)'],
      items: [['takeoff', 5, 1, 'Take off', 'Cất cánh'], ['red', 5, 2, 'Under the red arch gate', 'Qua cổng vòm đỏ'], ['blue', 5, 2, 'Under the blue arch gate', 'Qua cổng vòm xanh'],
        ['green', 10, 2, 'Through the green keyhole', 'Qua vòng xanh lá'], ['yellow', 20, 2, 'Through the yellow keyhole', 'Qua vòng vàng'],
        ['cube', 25, 2, 'Through the large cube', 'Xuyên khối lớn'], ['m1', 15, 2, 'Mini keyhole #1 (lowest)', 'Vòng nhỏ #1 (thấp nhất)'],
        ['m2', 15, 2, 'Mini keyhole #2 (middle)', 'Vòng nhỏ #2 (giữa)'], ['m3', 15, 2, 'Mini keyhole #3 (top)', 'Vòng nhỏ #3 (cao nhất)'],
        ['spiral', 10, 2, 'Spiral bonus (1 → 2 → 3)', 'Thưởng xoắn ốc (1 → 2 → 3)'], ['tunnel', 15, 2, 'Through the tunnel', 'Qua đường hầm']],
      landing: [['pad', 5, 'Landing pad', 'Bãi đáp'], ['cube', 10, 'Any cube', 'Trên khối'], ['bull', 15, 'Bullseye', 'Hồng tâm']]
    }
  };
  function nonNeg(v) { v = Math.floor(+v || 0); return v > 0 ? v : 0; }
  /* Chuẩn hoá điểm thành phần: cắt theo số lần tối đa; trả về {detail, score}.
     Alliance: d.goals = [số bóng mỗi goal]; mỗi bóng 2 điểm + goal bonus 5 × số bóng của goal ít nhất (5.1.1, 5.1.2). */
  function calc(kind, d, opts) {
    var sh = SHEETS[kind === 'alliance' ? 'alliance' : kind === 'coding' ? 'coding' : 'driving'], o = cfg(opts), out = {}, score = 0;
    d = d || {};
    if (kind === 'alliance') {
      var n = Math.max(1, +o.goals || 4), g = [];
      for (var i = 0; i < n; i++) g.push(nonNeg((d.goals || [])[i]));
      out.goals = g;
      score += 2 * g.reduce(function (a, b) { return a + b; }, 0) + 5 * Math.min.apply(null, g);
    }
    sh.items.forEach(function (it) { var v = nonNeg(d[it[0]]); if (it[2]) v = Math.min(v, it[2]); out[it[0]] = v; score += v * it[1]; });
    if (sh.multiLanding) sh.landing.forEach(function (l) { var v = d[l[0]] ? 1 : 0; out[l[0]] = v; score += v * l[1]; });   // tối đa 1 drone mỗi khối (5.1.6)
    else { var L = sh.landing.find(function (l) { return l[0] === d.landing; }); out.landing = L ? L[0] : ''; score += L ? L[1] : 0; }
    return { detail: out, score: score };
  }
  /* Mô tả ngắn điểm thành phần để hiện khi rê chuột vào điểm */
  function describe(kind, d, en) {
    if (!d) return '';
    var sh = SHEETS[kind === 'alliance' ? 'alliance' : kind === 'coding' ? 'coding' : 'driving'], k = en ? 3 : 4, parts = [];
    if (d.goals) parts.push((en ? 'Goals ' : 'Goal ') + d.goals.join('/'));
    sh.items.forEach(function (it) { if (d[it[0]]) parts.push(it[k] + ': ' + d[it[0]]); });
    sh.landing.forEach(function (l) { if (sh.multiLanding ? d[l[0]] : d.landing === l[0]) parts.push(l[k - 1]); });
    return parts.join(' · ');
  }

  /* ---------- Vòng loại (7.4.2) ---------- */
  function schedule(teamNumbers, opts) { return E.schedule(teamNumbers, cfg(opts)); }
  function ranking(teams, matches, opts) { return E.allianceRanking(teams, matches, cfg(opts)); }

  /* ---------- Solo (3.5, 7.4.1) ----------
     Tổng = Piloting cao nhất + Autonomous cao nhất. Tiebreak:
     1 Autonomous cao nhất · 2 Autonomous thứ 2 · 3 Piloting thứ 2 · 4 Autonomous thứ 3 · 5 Piloting thứ 3. */
  function soloRanking(runs) {
    var by = {};
    (runs || []).forEach(function (r) {
      var t = by[r.team] = by[r.team] || { team: r.team, p: [], a: [] };
      (r.kind === 'coding' ? t.a : t.p).push(+r.score || 0);
    });
    var desc = function (x, y) { return y - x; };
    var rows = Object.keys(by).map(function (k) {
      var t = by[k]; t.p.sort(desc); t.a.sort(desc);
      t.bestDriving = t.p[0] || 0; t.bestCoding = t.a[0] || 0; t.total = t.bestDriving + t.bestCoding;
      t.piloting = t.p.length; t.autonomous = t.a.length; t.attempts = t.p.length + t.a.length;
      return t;
    });
    var g = function (a, i) { return a[i] || 0; };
    rows.sort(function (x, y) {
      var keys = [[x.total, y.total], [g(x.a, 0), g(y.a, 0)], [g(x.a, 1), g(y.a, 1)], [g(x.p, 1), g(y.p, 1)], [g(x.a, 2), g(y.a, 2)], [g(x.p, 2), g(y.p, 2)]];
      for (var i = 0; i < keys.length; i++) if (keys[i][0] !== keys[i][1]) return keys[i][1] - keys[i][0];
      return String(x.team).localeCompare(String(y.team));
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }
  /* Số lượt còn lại của 1 đội cho 1 loại solo (7.4.1) */
  function soloLeft(runs, team, kind, opts) {
    var used = (runs || []).filter(function (r) { return r.team === team && (r.kind === 'coding') === (kind === 'coding'); }).length;
    return Math.max(0, +cfg(opts).soloAttempts - used);
  }

  /* ---------- Chọn liên minh (7.4.4) ---------- */
  function eligible(rank, teams, matches, opts) { return E.finalsEligible(rank, teams, matches, cfg(opts)); }
  /* 20+ đội đủ điều kiện: 10 liên minh, bắt đầu từ tứ kết; 8–19: 4, bán kết; 7 trở xuống: 2, chung kết */
  function recommendedAlliances(nEligible) {
    var n = +nEligible || 0, a = n >= 20 ? 10 : n >= 8 ? 4 : 2;
    return Math.min(a, Math.floor(n / 2));
  }
  var selection = A.selection;

  /* ---------- Loại trực tiếp theo vòng (7.4.5) ----------
     Vòng đầu theo số liên minh: hơn 4 → tứ kết, 3–4 → bán kết, 2 → chung kết.
     Tứ kết lấy 4, bán kết lấy 2 liên minh điểm cao nhất; hoà điểm ở ngưỡng thì cùng đi tiếp.
     Mỗi vòng đánh từng trận, bắt đầu từ liên minh xếp thấp nhất (vòng đầu theo hạt giống, các vòng sau theo điểm vòng trước).
     Thẻ đỏ: cả liên minh 0 điểm (1.6.3).
     Chung kết hoà hạng nhất: các liên minh hoà đánh vòng tiebreak (TB1). Vẫn hoà thì TB2. Vẫn hoà nữa thì so điểm
     các vòng trước (bán kết, rồi tứ kết). Nếu vẫn bằng nhau, đánh thêm vòng tiebreak. */
  var ADVANCE = { QF: 4, SF: 2 };
  function stagesFor(n) { return n > 4 ? ['QF', 'SF', 'F'] : n > 2 ? ['SF', 'F'] : n === 2 ? ['F'] : []; }
  function allianceScore(m) { return m.red_status === 'red' || m.blue_status === 'red' ? 0 : +m.score || 0; }
  function eliminations(alliances, matches, opts) {
    var o = cfg(opts), al = (alliances || []).slice().sort(function (a, b) { return a.seed - b.seed; }), AL = {};
    al.forEach(function (a) { AL[a.seed] = a; });
    var em = (matches || []).filter(function (m) { return m.round === 'elim' || m.round === 'final'; });
    var out = { stages: [], tiebreaks: [], champion: null, tied: [], toCreate: [], done: false };
    var stages = stagesFor(al.length);
    if (!stages.length) return out;
    var nextNum = { elim: 0, final: 0 };
    em.forEach(function (m) { nextNum[m.round] = Math.max(nextNum[m.round], +m.num || 0); });
    var create = function (label, seeds) {
      var rd = label === 'QF' || label === 'SF' ? 'elim' : 'final';
      seeds.forEach(function (sd) {
        nextNum[rd]++;
        out.toCreate.push({ round: rd, num: nextNum[rd], label: label, field: '1', time: null, seed: sd, red: AL[sd].captain, blue: AL[sd].partner,
          red_counts: true, blue_counts: true, score: null, red_status: 'ok', blue_status: 'ok', stop_time: null });
      });
    };
    /* Chạy 1 vòng: trả về bảng điểm vòng đó, hoặc null nếu chưa tạo / chưa chấm xong */
    var play = function (label, order) {
      var ms = em.filter(function (m) { return m.label === label; });
      var rows = order.map(function (sd) {
        var m = ms.filter(function (x) { return +x.seed === sd; }).sort(function (a, b) { return b.num - a.num; })[0];
        return { seed: sd, captain: AL[sd].captain, partner: AL[sd].partner, match: m || null, score: m && m.score != null ? allianceScore(m) : null };
      });
      var st = { label: label, rows: rows, done: false };
      if (!ms.length) { create(label, order); return st; }
      if (rows.some(function (r) { return r.score == null; })) return st;
      rows.sort(function (a, b) { return b.score - a.score || a.seed - b.seed; });
      rows.forEach(function (r, i) { r.rank = i === 0 || r.score !== rows[i - 1].score ? i + 1 : rows[i - 1].rank; });
      st.done = true;
      return st;
    };
    /* thứ tự đánh: liên minh xếp thấp nhất trước */
    var order = al.map(function (a) { return a.seed; }).reverse(), hist = {};
    for (var i = 0; i < stages.length; i++) {
      var st = play(stages[i], order);
      out.stages.push(st);
      if (!st.done) return out;
      st.rows.forEach(function (r) { (hist[r.seed] = hist[r.seed] || []).push(r.score); });
      if (stages[i] === 'F') break;
      var K = ADVANCE[stages[i]], cut = st.rows.length > K ? st.rows[K - 1].score : -1;
      st.rows.forEach(function (r) { r.advance = r.score >= cut; });
      order = st.rows.filter(function (r) { return r.advance; }).map(function (r) { return r.seed; }).reverse();
    }
    var fin = out.stages[out.stages.length - 1].rows, top = fin[0].score;
    var lead = fin.filter(function (r) { return r.score === top; }).map(function (r) { return r.seed; });
    for (var k = 1; lead.length > 1; k++) {
      var tb = play('TB' + k, lead.slice().reverse());
      out.tiebreaks.push(tb);
      if (!tb.done) { out.tied = lead.map(function (sd) { return AL[sd]; }); return out; }
      var mx = tb.rows[0].score;
      lead = tb.rows.filter(function (r) { return r.score === mx; }).map(function (r) { return r.seed; });
      if (k === 2 && lead.length > 1 && o.stopTimeTiebreak) {   // tuỳ chọn: lần tiebreak thứ 2 xét stop time sớm (7.4.5)
        var stopOf = function (sd) { var r = tb.rows.find(function (x) { return x.seed === sd; }); return r && r.match ? +r.match.stop_time || 0 : 0; };
        var ms = Math.max.apply(null, lead.map(stopOf));
        if (ms > 0) lead = lead.filter(function (sd) { return stopOf(sd) === ms; });
      }
      if (k === 2 && lead.length > 1) {   // lần tiebreak thứ 3: so điểm các vòng trước, vòng gần nhất trước (7.4.5)
        for (var j = stages.length - 2; j >= 0 && lead.length > 1; j--) {
          var best = Math.max.apply(null, lead.map(function (sd) { return hist[sd][j]; }));
          lead = lead.filter(function (sd) { return hist[sd][j] === best; });
        }
        if (lead.length > 1 && o.finalTie === 'seed') lead = [Math.min.apply(null, lead)];   // tuỳ chọn của ban tổ chức
      }
    }
    out.champion = AL[lead[0]]; out.done = true;
    return out;
  }

  /* ---------- Giải thưởng, CSV ---------- */
  /* Giải thành tích: Teamwork Champions (7.4.5), Skills Mission Champion (7.4.1) */
  function performanceAwards(matches, runs, ev) {
    var out = [], sel = (ev && ev.config && ev.config.selection) || {}, sr = soloRanking(runs);
    var res = eliminations(selection([], sel).alliances, matches, ev && ev.config);
    if (res.champion) [res.champion.captain, res.champion.partner].forEach(function (t) { out.push({ team: t, name: 'Teamwork Champions', judged: false, auto: true }); });
    if (sr.length && sr[0].total > 0) out.push({ team: sr[0].team, name: 'Skills Mission Champion', judged: false, auto: true });
    return out;
  }
  function resultRows(ev, teams, matches, runs, awards) {
    var base = E.rowMaker(Object.assign({ program: 'ADC' }, ev), teams), rows = [];
    (runs || []).forEach(function (r) { rows.push(base(r.team, r.kind === 'coding' ? 'solo2' : 'solo1', +r.score || 0)); });
    (matches || []).forEach(function (m) {
      if (m.round !== 'qual' || m.score == null) return;
      ['red', 'blue'].forEach(function (s) { if (m[s + '_counts'] !== false) rows.push(base(m[s], 'alliance', E.teamScore(m, s))); });
    });
    (awards || []).concat(performanceAwards(matches, runs, ev)).forEach(function (a) { rows.push(base(a.team, 'award', a.name)); });
    return rows;
  }

  return {
    DEFAULTS: DEFAULTS, cfg: cfg, schedule: schedule, ranking: ranking, soloRanking: soloRanking, soloLeft: soloLeft,
    redCards: E.redCards, eligible: eligible, recommendedAlliances: recommendedAlliances, selection: selection,
    stagesFor: stagesFor, allianceScore: allianceScore, eliminations: eliminations, SHEETS: SHEETS, calc: calc, describe: describe,
    performanceAwards: performanceAwards, resultRows: resultRows
  };
});
