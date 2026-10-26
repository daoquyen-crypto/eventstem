/* Bảng hiển thị dùng chung cho manage.html (ban tổ chức) và event.html (người xem). */
(function () {
  'use strict';
  var B = null;
  function teamName(n) { var t = B && B.teams.find(function (x) { return x.number === n; }); return t && t.name ? t.name : ''; }
  function teamCell(n, side, counts) {
    return '<span class="code ' + (side === 'red' ? 'tm-r' : side === 'blue' ? 'tm-b' : '') + '">' + esc(n) + (counts === false ? '<span class="star" title="' + esc(tr('Extra match, not counted in rankings (7.4.2)', 'Trận đánh thêm, không tính xếp hạng (7.4.2)')) + '">*</span>' : '') + '</span>' +
      (teamName(n) ? ' <span class="small mut hide-sm">' + esc(teamName(n)) + '</span>' : '');
  }
  function matchTable(list, opts) {
    opts = opts || {};
    if (!list.length) return '<p class="empty">' + (opts.empty || tr('No matches yet.', 'Chưa có trận nào.')) + '</p>';
    return '<div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Time', 'Giờ') + '</th><th>' + tr('Field', 'Sân') + '</th><th>' + tr('Red', 'Đỏ') + '</th><th>' + tr('Blue', 'Xanh') + '</th><th class="n">' + tr('Score', 'Điểm') + '</th></tr></thead><tbody>' +
      list.map(function (m) {
        return '<tr' + (m.score != null ? ' class="done"' : '') + ' data-hl="' + esc(m.red + ' ' + m.blue) + '"><td class="code">' + (m.round === 'final' ? 'F' : 'Q') + m.num + '</td><td>' + esc(m.time || '') + '</td><td>' + esc(m.field || '') + '</td>' +
          '<td>' + teamCell(m.red, 'red', m.red_counts) + stTag(m.red_status) + '</td><td>' + teamCell(m.blue, 'blue', m.blue_counts) + stTag(m.blue_status) + '</td><td class="n big">' + (m.score == null ? '' : m.score) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function stTag(s) { return s === 'absent' ? ' <span class="tag">' + tr('absent', 'vắng') + '</span>' : s === 'red' ? ' <span class="tag" style="background:var(--bad);color:#fff">' + tr('red card', 'thẻ đỏ') + '</span>' : ''; }
  function soloTable(rk, lim) {
    if (!rk.length) return '<p class="empty">' + tr('No solo scores yet.', 'Chưa có điểm Solo.') + '</p>';
    return '<div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Team', 'Đội') + '</th><th class="n">Driving</th><th class="n">Coding</th><th class="n">' + tr('Total', 'Tổng') + '</th><th class="n">' + tr('Tries', 'Lượt') + '</th></tr></thead><tbody>' +
      rk.map(function (r) { return '<tr data-hl="' + esc(r.team) + '"><td class="pos top">' + r.rank + '</td><td>' + teamCell(r.team, 'x') + '</td><td class="n">' + r.bestDriving + '</td><td class="n">' + r.bestCoding + '</td><td class="n big">' + r.total + '</td><td class="n">' + r.attempts + '/' + lim + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function allianceTable(rk, rc) {
    if (!rk.length) return '<p class="empty">' + tr('No teams yet.', 'Chưa có đội.') + '</p>';
    return '<div class="tbl"><table><thead><tr><th>#</th><th>' + tr('Team', 'Đội') + '</th><th class="n">' + tr('Played', 'Đã đánh') + '</th><th class="n" title="7.4.4">' + tr('Average', 'Trung bình') + '</th><th class="n">' + tr('High', 'Cao nhất') + '</th><th class="n hide-sm" title="7.4.2">' + tr('Dropped', 'Bỏ') + '</th><th class="n hide-sm">' + tr('Red cards', 'Thẻ đỏ') + '</th></tr></thead><tbody>' +
      rk.map(function (r) { return '<tr data-hl="' + esc(r.team) + '"><td class="pos top">' + r.rank + '</td><td>' + teamCell(r.team, 'x') + '</td><td class="n">' + r.played + '</td><td class="n big">' + (r.played ? r.avg.toFixed(1) : '–') + '</td><td class="n">' + (r.played ? r.high : '–') + '</td><td class="n hide-sm mut">' + (r.dropped == null ? '' : r.dropped) + '</td><td class="n hide-sm">' + (rc[r.team] || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function withB(fn) { return function (b) { B = b; return fn.apply(null, Array.prototype.slice.call(arguments, 1)); }; }
  window.Views = { teamCell: withB(teamCell), matchTable: withB(matchTable), soloTable: withB(soloTable), allianceTable: withB(allianceTable), stTag: stTag };
})();
