/* Bảng hiển thị dùng chung cho manage.html (ban tổ chức) và event.html (người xem). */
(function () {
  'use strict';
  var B = null;
  function teamName(n) { var t = B && B.teams.find(function (x) { return x.number === n; }); return t && t.name ? t.name : ''; }
  function teamCell(n, side, counts) {
    return '<span class="code ' + (side === 'red' ? 'tm-r' : side === 'blue' ? 'tm-b' : '') + '">' + esc(n) + (counts === false ? '<span class="star" title="' + esc(tr('Extra match, not counted in rankings (7.4.2)', 'Trận đánh thêm, không tính xếp hạng (7.4.2)')) + '">*</span>' : '') + '</span>' +
      (teamName(n) ? ' <span class="small mut hide-sm">' + esc(teamName(n)) + '</span>' : '');
  }
  /* Mã trận: Q5 (vòng loại), R1-2·2 (nhánh, trận thứ 2 của cặp), F1 (chung kết) */
  function matchCode(m, list) {
    if (m.label && (m.round === 'elim' || /^TB/.test(m.label))) {
      var g = (list || []).filter(function (x) { return x.label === m.label && x.round === m.round && x.num <= m.num; }).length;
      return esc(m.label) + (g > 1 ? '·' + g : '');
    }
    return (m.round === 'final' ? 'F' : m.round === 'practice' ? 'P' : 'Q') + m.num;
  }
  function rpTags(m, side) {
    return (m['auto_' + side] ? '<span class="tag" title="Autonomous RP (5.5.1)">A</span>' : '') + (m['end_' + side] ? '<span class="tag" title="Endgame RP (5.5.2)">E</span>' : '');
  }
  function pair(m, side) {
    return teamCell(m[side], side, m[side + '_counts']) + stTag(m[side + '_status']) + (m[side + '2'] ? '<br>' + teamCell(m[side + '2'], side, m[side + '2_counts']) + stTag(m[side + '2_status']) : '');
  }
  /* Điểm thành phần (ADC / ADC Pro) hiện khi rê chuột vào điểm */
  function scoreTitle(m, side) {
    var X = B && B.event && Rules.of(B.event).scoring, d = m.detail;
    if (!X || !d) return '';
    if (side) d = d[side];
    return d ? ' title="' + esc(X.describe('alliance', d, I18N.lang !== 'vi')) + '"' : '';
  }
  function versusTable(list, opts) {
    return '<div class="tbl"><table><thead><tr><th>#</th><th class="hide-sm">' + tr('Time', 'Giờ') + '</th><th>' + tr('Red alliance', 'Liên minh đỏ') + '</th><th class="n">' + tr('Red', 'Đỏ') + '</th><th class="n">' + tr('Blue', 'Xanh') + '</th><th>' + tr('Blue alliance', 'Liên minh xanh') + '</th></tr></thead><tbody>' +
      list.map(function (m) {
        var done = m.score != null && m.score_blue != null, rw = done && m.score > m.score_blue, bw = done && m.score_blue > m.score;
        return '<tr' + (done ? ' class="done"' : '') + ' data-hl="' + esc([m.red, m.red2, m.blue, m.blue2].filter(Boolean).join(' ')) + '"><td class="code">' + matchCode(m, list) + '</td>' +
          '<td class="hide-sm small">' + [m.time ? esc(m.time) : '', m.field ? tr('Field ', 'Sân ') + esc(m.field) : ''].filter(Boolean).join(' · ') + '</td>' +
          '<td>' + pair(m, 'red') + '</td><td class="n"><span class="big"' + scoreTitle(m, 'red') + ' style="' + (rw ? 'color:var(--red)' : '') + '">' + (m.score == null ? '' : m.score) + '</span> ' + rpTags(m, 'red') + '</td>' +
          '<td class="n"><span class="big"' + scoreTitle(m, 'blue') + ' style="' + (bw ? 'color:var(--blue)' : '') + '">' + (m.score_blue == null ? '' : m.score_blue) + '</span> ' + rpTags(m, 'blue') + '</td><td>' + pair(m, 'blue') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function matchTable(list, opts) {
    opts = opts || {};
    if (!list.length) return '<p class="empty">' + (opts.empty || tr('No matches yet.', 'Chưa có trận nào.')) + '</p>';
    if (opts.versus || list.some(function (m) { return m.red2 || m.score_blue != null; })) return versusTable(list, opts);
    return '<div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Time', 'Giờ') + '</th><th>' + tr('Field', 'Sân') + '</th><th>' + tr('Red', 'Đỏ') + '</th><th>' + tr('Blue', 'Xanh') + '</th><th class="n">' + tr('Score', 'Điểm') + '</th></tr></thead><tbody>' +
      list.map(function (m) {
        return '<tr' + (m.score != null ? ' class="done"' : '') + ' data-hl="' + esc(m.red + ' ' + m.blue) + '"><td class="code">' + matchCode(m, list) + '</td><td>' + esc(m.time || '') + '</td><td>' + esc(m.field || '') + '</td>' +
          '<td>' + teamCell(m.red, 'red', m.red_counts) + stTag(m.red_status) + '</td><td>' + teamCell(m.blue, 'blue', m.blue_counts) + stTag(m.blue_status) + '</td><td class="n big"' + scoreTitle(m) + '>' + (m.score == null ? '' : m.score) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function stTag(s) { return s === 'absent' ? ' <span class="tag">' + tr('absent', 'vắng') + '</span>' : s === 'red' ? ' <span class="tag" style="background:var(--bad);color:#fff">' + tr('red card', 'thẻ đỏ') + '</span>' : ''; }
  function soloTable(rk, lim) {
    var L = (B && B.event && Rules.of(B.event).solo2) || ['Driving', 'Coding'];
    if (!rk.length) return '<p class="empty">' + tr('No solo scores yet.', 'Chưa có điểm Solo.') + '</p>';
    return '<div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Team', 'Đội') + '</th><th class="n">' + L[0] + '</th><th class="n">' + L[1] + '</th><th class="n">' + tr('Total', 'Tổng') + '</th><th class="n">' + tr('Tries', 'Lượt') + '</th></tr></thead><tbody>' +
      rk.map(function (r) { return '<tr data-hl="' + esc(r.team) + '"><td class="pos top">' + r.rank + '</td><td>' + teamCell(r.team, 'x') + '</td><td class="n">' + r.bestDriving + '</td><td class="n">' + r.bestCoding + '</td><td class="n big">' + r.total + '</td><td class="n">' + r.attempts + '/' + lim + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function allianceTable(rk, rc) {
    if (!rk.length) return '<p class="empty">' + tr('No teams yet.', 'Chưa có đội.') + '</p>';
    return '<div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Team', 'Đội') + '</th><th class="n">' + tr('Played', 'Đã đánh') + '</th><th class="n" title="7.4.4">' + tr('Average', 'Trung bình') + '</th><th class="n">' + tr('High', 'Cao nhất') + '</th><th class="n hide-sm" title="7.4.2">' + tr('Dropped', 'Bỏ') + '</th><th class="n hide-sm">' + tr('Red cards', 'Thẻ đỏ') + '</th></tr></thead><tbody>' +
      rk.map(function (r) { return '<tr data-hl="' + esc(r.team) + '"><td class="pos top">' + r.rank + '</td><td>' + teamCell(r.team, 'x') + '</td><td class="n">' + r.played + '</td><td class="n big">' + (r.played ? r.avg.toFixed(1) : '–') + '</td><td class="n">' + (r.played ? r.high : '–') + '</td><td class="n hide-sm mut">' + (r.dropped == null ? '' : r.dropped) + '</td><td class="n hide-sm">' + (rc[r.team] || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  /* Xếp hạng theo ranking points (5.5): Achieve có cột Autonomous / Endgame RP; ADC Pro có TB điểm trận, cao nhất, cao thứ 2 */
  function rpTable(rk, rc) {
    if (!rk.length) return '<p class="empty">' + tr('No teams yet.', 'Chưa có đội.') + '</p>';
    var f = function (x) { return x.toFixed(2); };
    if (B && B.event && Rules.of(B.event).rpBonus === false) {
      return '<div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Team', 'Đội') + '</th><th class="n">' + tr('Played', 'Đã đánh') + '</th><th class="n hide-sm">' + tr('W-L-T', 'T-B-H') + '</th>' +
        '<th class="n" title="5.5">' + tr('Avg RP', 'TB RP') + '</th><th class="n hide-sm" title="5.5">' + tr('Avg score', 'TB điểm') + '</th><th class="n hide-sm" title="5.5">' + tr('High', 'Cao nhất') + '</th><th class="n hide-sm" title="5.5">' + tr('2nd', 'Thứ 2') + '</th><th class="n hide-sm">' + tr('Red cards', 'Thẻ đỏ') + '</th></tr></thead><tbody>' +
        rk.map(function (r) {
          return '<tr data-hl="' + esc(r.team) + '"><td class="pos top">' + r.rank + '</td><td>' + teamCell(r.team, 'x') + '</td><td class="n">' + r.played + '</td><td class="n hide-sm">' + r.w + '-' + r.l + '-' + r.t + '</td>' +
            '<td class="n big">' + (r.played ? f(r.avg) : '–') + '</td><td class="n hide-sm">' + (r.played ? r.avgScore.toFixed(1) : '') + '</td><td class="n hide-sm">' + (r.played ? r.high : '') + '</td><td class="n hide-sm">' + (r.played > 1 ? r.high2 : '') + '</td><td class="n hide-sm">' + (rc[r.team] || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return '<div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Team', 'Đội') + '</th><th class="n">' + tr('Played', 'Đã đánh') + '</th><th class="n hide-sm">' + tr('W-L-T', 'T-B-H') + '</th>' +
      '<th class="n" title="5.5">' + tr('Avg RP', 'TB RP') + '</th><th class="n hide-sm" title="5.5.1">Auto</th><th class="n hide-sm" title="5.5.2">Endgame</th><th class="n hide-sm" title="5.5.3">Match</th><th class="n hide-sm">' + tr('Red cards', 'Thẻ đỏ') + '</th></tr></thead><tbody>' +
      rk.map(function (r) {
        return '<tr data-hl="' + esc(r.team) + '"><td class="pos top">' + r.rank + '</td><td>' + teamCell(r.team, 'x') + '</td><td class="n">' + r.played + '</td><td class="n hide-sm">' + r.w + '-' + r.l + '-' + r.t + '</td>' +
          '<td class="n big">' + (r.played ? f(r.avg) : '–') + '</td><td class="n hide-sm">' + (r.played ? f(r.avgAuto) : '') + '</td><td class="n hide-sm">' + (r.played ? f(r.avgEnd) : '') + '</td><td class="n hide-sm">' + (r.played ? f(r.avgMatch) : '') + '</td><td class="n hide-sm">' + (rc[r.team] || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function alliancesTable(al) {
    if (!al.length) return '';
    return '<div class="tbl"><table><thead><tr><th>' + tr('Seed', 'Hạt giống') + '</th><th>' + tr('Captain', 'Đội trưởng') + '</th><th>' + tr('Partner', 'Đồng đội') + '</th></tr></thead><tbody>' +
      al.map(function (a) { return '<tr data-hl="' + esc(a.captain + ' ' + a.partner) + '"><td class="pos">' + a.seed + '</td><td>' + teamCell(a.captain, 'x') + '</td><td>' + teamCell(a.partner, 'x') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function roundName(r, R) {
    var left = R - r;
    return left === 0 ? tr('Finals', 'Chung kết') : left === 1 ? tr('Semifinals', 'Bán kết') : left === 2 ? tr('Quarterfinals', 'Tứ kết') : tr('Round of ', 'Vòng ') + Math.pow(2, left + 1);
  }
  /* Nhánh đấu: mỗi vòng 1 cột; mỗi cặp hiện 2 liên minh, điểm từng trận, đội thắng in đậm */
  function bracketView(br, al) {
    if (!br.rounds.length) return '';
    var A = {}; al.forEach(function (a) { A[a.seed] = a; });
    var lab = function (sd) { return sd == null ? '<span class="mut">' + tr('TBD', 'Chưa rõ') + '</span>' : '<b>#' + sd + '</b> ' + esc(A[sd].captain) + ' + ' + esc(A[sd].partner); };
    return '<div style="display:grid;grid-auto-flow:column;grid-auto-columns:minmax(220px,1fr);gap:12px;overflow-x:auto;padding-bottom:6px">' +
      br.rounds.map(function (nodes, i) {
        return '<div><h3 class="t" style="margin-top:0">' + roundName(i + 1, br.rounds.length) + '</h3>' + nodes.map(function (n) {
          if (n.bye && i === 0) return '<div class="card small" style="padding:8px 12px;margin-bottom:8px">' + lab(n.winner) + ' <span class="mut">· ' + tr('bye', 'đi thẳng') + '</span></div>';
          var games = n.games.filter(function (g) { return g.score != null && g.score_blue != null; }).map(function (g) { var sc = Achieve.gameScores(g); return (g.seed === n.hi ? sc.red + '–' + sc.blue : sc.blue + '–' + sc.red); });
          var row = function (sd) { return '<div style="' + (n.winner === sd && sd != null ? 'font-weight:700;color:var(--ink)' : 'color:var(--mut)') + '">' + (n.winner === sd && sd != null ? '🏆 ' : '') + lab(sd) + '</div>'; };
          return '<div class="card small" style="padding:8px 12px;margin-bottom:8px" data-hl="' + esc([n.a, n.b].filter(function (x) { return x != null; }).map(function (x) { return A[x].captain + ' ' + A[x].partner; }).join(' ')) + '">' +
            row(n.hi != null ? n.hi : n.a) + row(n.lo != null ? n.lo : n.b) + (games.length ? '<div class="mut" style="margin-top:4px">' + games.join(' · ') + (n.bySeed ? ' · ' + tr('higher seed advances', 'hạt giống cao hơn đi tiếp') : '') + '</div>' : '') + '</div>';
        }).join('') + '</div>';
      }).join('') + '</div>';
  }
  /* ADC (7.4.5): mỗi vòng 1 bảng điểm; liên minh đi tiếp có dấu ✓, vô địch có cúp */
  function stageName(label) {
    return label === 'QF' ? tr('Quarterfinals', 'Tứ kết') : label === 'SF' ? tr('Semifinals', 'Bán kết') : label === 'F' ? tr('Finals', 'Chung kết') : tr('Tiebreaker ', 'Tiebreak ') + label.slice(2);
  }
  function roundsView(res) {
    var champ = res.champion && res.champion.seed;
    var stages = res.stages.concat(res.tiebreaks);
    if (!stages.length) return '';
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:start">' + stages.map(function (st) {
      return '<div><h3 class="t" style="margin-top:0">' + stageName(st.label) + '</h3><div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Alliance', 'Liên minh') + '</th><th class="n">' + tr('Score', 'Điểm') + '</th></tr></thead><tbody>' +
        st.rows.map(function (r) {
          var win = st.done && (r.advance || (r.seed === champ && st === stages[stages.length - 1]));
          return '<tr data-hl="' + esc(r.captain + ' ' + r.partner) + '"' + (win ? ' style="font-weight:700"' : '') + '><td class="pos">' + r.seed + '</td><td>' + teamCell(r.captain, 'x') + ' + ' + teamCell(r.partner, 'x') + '</td>' +
            '<td class="n">' + (r.score == null ? '<span class="mut">–</span>' : '<span class="big">' + r.score + '</span>') + (r.advance ? ' ✓' : '') + (st.done && r.seed === champ && st === stages[stages.length - 1] ? ' 🏆' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }).join('') + '</div>';
  }
  function withB(fn) { return function (b) { B = b; return fn.apply(null, Array.prototype.slice.call(arguments, 1)); }; }
  window.Views = { teamCell: withB(teamCell), matchTable: withB(matchTable), soloTable: withB(soloTable), allianceTable: withB(allianceTable),
    rpTable: withB(rpTable), alliancesTable: withB(alliancesTable), bracketView: withB(bracketView), roundsView: withB(roundsView), stageName: stageName, matchCode: matchCode, stTag: stTag, roundName: roundName };
})();
