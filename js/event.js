/* Trang công khai: danh sách giải đang diễn ra và trang trực tiếp của từng giải (event.html?id=…).
   Tự kiểm tra cập nhật mỗi 20 giây; chỉ tải lại khi ban tổ chức vừa nhập dữ liệu mới. */
(function () {
  'use strict';
  var S = window.Store, E = window.Engage, app = $id('app');
  function R() { return Rules.of(B.event); }
  function cfg() { return R().cfg(B.event.config); }
  function rank() { return R().ranking(B.teams, B.matches, Object.assign({ seed: B.event.id }, cfg())); }
  function slotsOf(m) { return ['red', 'red2', 'blue', 'blue2'].filter(function (s) { return m[s]; }); }
  function sideOf(m, n) { var s = slotsOf(m).find(function (x) { return m[x] === n; }); return s ? (s.indexOf('red') === 0 ? 'red' : 'blue') : null; }
  var id = new URLSearchParams(location.search).get('id'), B = null, stamp = null, tab = null, myTeam = '';
  try { myTeam = localStorage.getItem('eventstem-myteam') || ''; } catch (x) {}
  var POLL_MS = 20000;
  $id('demoBanner').hidden = S.mode !== 'demo';

  function fail(e) { if (!e || !e.code || e.code === 'unknown') console.error(e); app.innerHTML = '<div class="banner err">' + esc(errText(e)) + '</div>'; }

  /* ---------- danh sách giải ---------- */
  function renderList() {
    S.listPublicEvents().then(function (list) {
      var today = new Date().toISOString().slice(0, 10);
      var live = list.filter(function (e) { return e.status === 'live'; });
      var up = list.filter(function (e) { return e.status === 'published' && (!e.date || e.date >= today); }).reverse();
      var done = list.filter(function (e) { return e.status === 'completed' || (e.status === 'published' && e.date && e.date < today); });
      var item = function (e) {
        return '<a class="ev-item" href="event.html?id=' + esc(e.id) + '"><div style="min-width:0"><div class="t">' + esc(e.name) + '</div><div class="m"><span>' + esc(fmtDate(e.date)) + '</span>' +
          (e.location ? '<span>' + esc(e.location) + '</span>' : '') + (e.organizer_name ? '<span>' + esc(e.organizer_name) + '</span>' : '') + '<span>' + esc(e.program === 'Custom' ? tr('Independent', 'Tự tổ chức') : 'RECF ' + e.program) + '</span></div></div>' +
          '<span class="pill s-' + esc(e.status) + '">' + esc(statusName(e.status)) + '</span></a>';
      };
      var sec = function (title, l) { return l.length ? '<h3 class="t">' + title + ' (' + l.length + ')</h3><div class="ev-list">' + l.map(item).join('') + '</div>' : ''; };
      app.innerHTML = '<div class="spread"><h2 class="t" style="margin:0">' + tr('Live & upcoming tournaments', 'Giải đang diễn ra và sắp tới') + '</h2><a class="btn" href="manage.html">' + tr('Run a tournament', 'Tổ chức giải') + '</a></div>' +
        (list.length ? sec(tr('Live now', 'Đang diễn ra'), live) + sec(tr('Upcoming', 'Sắp tới'), up) + sec(tr('Completed', 'Đã kết thúc'), done)
          : '<div class="card" style="margin-top:14px">' + tr('No tournaments published yet. Schools and Event Partners can create one in ', 'Chưa có giải nào được công bố. Nhà trường và Event Partner có thể tạo giải ở ') + '<a href="manage.html">' + tr('Organize', 'Tổ chức giải') + '</a>.</div>');
    }).catch(fail);
  }

  /* ---------- trang 1 giải ---------- */
  var TABS = [['rankings', 'Rankings', 'Xếp hạng'], ['schedule', 'Matches', 'Trận đấu'], ['solo', 'Solo', 'Solo'], ['finals', 'Finals', 'Chung kết'], ['awards', 'Awards', 'Giải thưởng'], ['teams', 'Teams', 'Đội']];
  function load() {
    return S.getEvent(id).then(function (b) {
      B = b; stamp = b && b.event.updated_at;
      if (!B) { app.innerHTML = '<p class="empty">' + tr('This event does not exist or is not public.', 'Giải không tồn tại hoặc chưa được công bố.') + ' <a href="event.html">' + tr('All events', 'Tất cả giải') + '</a></p>'; return; }
      document.title = B.event.name + ' · EventSTEM';
      if (!tab) tab = (location.hash.slice(1) || (B.matches.some(function (m) { return m.score != null; }) ? 'rankings' : 'schedule'));
      paint();
    });
  }
  function paint() {
    var e = B.event;
    var pos = window.scrollY;
    app.innerHTML = '<a class="small mut" href="event.html">← ' + tr('All events', 'Tất cả giải') + '</a>' +
      '<div class="spread" style="margin-top:4px"><div><h2 class="t" style="margin:0 0 2px">' + esc(e.name) + '</h2><div class="small mut">' + esc(fmtDate(e.date)) + (e.end_date && e.end_date !== e.date ? ' – ' + esc(fmtDate(e.end_date)) : '') +
      (e.location ? ' · ' + esc(e.location) : '') + (e.organizer_name ? ' · ' + esc(e.organizer_name) : '') + ' · <span class="pill s-' + esc(e.status) + '">' + esc(statusName(e.status)) + '</span>' +
      (e.verified ? ' <span style="color:var(--ok)">✓ ' + tr('Verified', 'Đã xác minh') + '</span>' : '') + '</div></div>' +
      '<label class="f no-print" style="width:180px"><span>' + tr('Follow a team', 'Theo dõi đội') + '</span><input type="search" id="myTeam" list="tl" value="' + esc(myTeam) + '" placeholder="VN1234A" autocomplete="off"></label>' +
      '<datalist id="tl">' + B.teams.map(function (t) { return '<option value="' + esc(t.number) + '">' + esc(t.name) + '</option>'; }).join('') + '</datalist></div>' +
      '<div id="mine"></div>' +
      '<div class="tabs" role="tablist" style="margin-top:12px">' + TABS.map(function (t) {
        var lb = t[0] === 'finals' && (R().format === 'versus' || R().eliminations === 'rounds') ? tr('Eliminations', 'Loại trực tiếp') : tr(t[1], t[2]);
        return '<a role="tab" href="#' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + esc(lb) + '</a>'; }).join('') + '</div>' +
      '<div id="pane"></div><p class="small mut" id="upd"></p>';
    (PANES[tab] || PANES.rankings)();
    paintMine(); highlight();
    $id('upd').textContent = tr('Updates automatically. Last checked ', 'Tự động cập nhật. Kiểm tra lần cuối ') + new Date().toLocaleTimeString(I18N.loc());
    $id('myTeam').onchange = $id('myTeam').oninput = function () {
      myTeam = this.value.trim().toUpperCase(); try { localStorage.setItem('eventstem-myteam', myTeam); } catch (x) {}
      paintMine(); highlight();
    };
    window.scrollTo(0, pos);
  }
  /* Ô tóm tắt cho đội đang theo dõi: hạng, trận kế tiếp */
  function paintMine() {
    var box = $id('mine'), t = B.teams.find(function (x) { return x.number === myTeam; });
    if (!t) { box.innerHTML = ''; return; }
    var vs = R().format === 'versus', rk = rank().find(function (r) { return r.team === t.number; });
    var sr = R().solo(B.solo).find(function (r) { return r.team === t.number; });
    var ord = { practice: 0, qual: 1, elim: 2, final: 3 };
    var next = B.matches.filter(function (m) { return m.score == null && sideOf(m, t.number); }).sort(function (a, b) { return ord[a.round] - ord[b.round] || a.num - b.num; })[0];
    box.innerHTML = '<div class="card" style="margin:12px 0 0;border-left:4px solid var(--signal)"><div class="spread"><b>' + esc(t.number) + (t.name ? ' · ' + esc(t.name) : '') + '</b>' +
      '<span class="small">' + (rk && rk.played ? (vs ? tr('Rank ', 'Hạng ') : tr('Alliance rank ', 'Hạng Alliance ')) + '<b>#' + rk.rank + '</b> (' + (vs ? rk.avg.toFixed(2) + ' RP' : rk.avg.toFixed(1)) + ')' : '') +
      (sr ? ' · ' + tr('Solo rank ', 'Hạng Solo ') + '<b>#' + sr.rank + '</b> (' + sr.total + ')' : '') + '</span></div>' +
      (next ? (function () {
        var sd = sideOf(next, t.number), mates = slotsOf(next).filter(function (s) { return next[s] !== t.number && (vs ? s.indexOf(sd) === 0 : true); }).map(function (s) { return next[s]; });
        var opp = vs ? slotsOf(next).filter(function (s) { return s.indexOf(sd) !== 0; }).map(function (s) { return next[s]; }) : [];
        return '<div class="small" style="margin-top:4px">' + tr('Next match: ', 'Trận tiếp theo: ') + '<b>' + Views.matchCode(next, B.matches) + '</b>' + (next.time ? ' · ' + esc(next.time) : '') + (next.field ? ' · ' + tr('Field ', 'Sân ') + esc(next.field) : '') +
          ' · ' + tr('with ', 'cùng ') + esc(mates.join(', ')) + (opp.length ? ' · ' + tr('vs ', 'gặp ') + esc(opp.join(' + ')) : '') + ' · ' + (sd === 'red' ? '<span class="tm-r">' + tr('Red', 'Đỏ') + '</span>' : '<span class="tm-b">' + tr('Blue', 'Xanh') + '</span>') + '</div>';
      })() : '') + '</div>';
  }
  function highlight() {
    document.querySelectorAll('#pane [data-hl]').forEach(function (r) {
      var on = !!myTeam && (' ' + r.dataset.hl + ' ').indexOf(' ' + myTeam + ' ') >= 0;
      r.style.outline = on ? '2px solid var(--signal)' : ''; r.style.outlineOffset = on ? '-2px' : '';
    });
  }
  function pane(h) { $id('pane').innerHTML = h; }
  var PANES = {
    rankings: function () {
      var c = cfg(), vs = R().format === 'versus', adc = !!R().soloPerKind, rc = R().redCards(B.matches);
      pane('<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start"><div><h3 class="t">' + (vs ? tr('Qualification rankings', 'Xếp hạng vòng loại') : tr('Alliance rankings', 'Xếp hạng Alliance')) + '</h3>' +
        (vs ? Views.rpTable(B, rank(), rc) + '<p class="small mut">' + tr('Average ranking points per match: win 2, tie 1, plus Autonomous and Endgame RP (5.5).', 'Trung bình điểm xếp hạng mỗi trận: thắng 2, hoà 1, cộng Autonomous RP và Endgame RP (5.5).') + '</p>'
          : Views.allianceTable(B, rank(), rc) +
          '<p class="small mut">' + (c.dropLowest ? tr('Average after dropping each team\'s lowest score (7.4.2). ', 'Trung bình sau khi bỏ trận thấp nhất của mỗi đội (7.4.2). ') : '') +
            (adc ? tr('Ties: 2nd, then 3rd highest score (7.4.2).', 'Bằng điểm: so điểm cao thứ 2, rồi thứ 3 (7.4.2).') : tr('Ties: 2nd, 3rd, 4th highest score (7.4.4).', 'Bằng điểm: so điểm cao thứ 2, 3, 4 (7.4.4).')) + '</p>') + '</div>' +
        '<div><h3 class="t">' + tr('Solo rankings', 'Xếp hạng Solo') + '</h3>' + Views.soloTable(B, R().solo(B.solo), c.soloAttempts * (adc ? 2 : 1)) +
        '<p class="small mut">' + (adc ? tr('Best piloting + best autonomous flight score (3.5).', 'Piloting cao nhất + Autonomous cao nhất (3.5).') : tr('Best driving + best coding (3.5).', 'Driving cao nhất + Coding cao nhất (3.5).')) + '</p></div></div>');
    },
    schedule: function () {
      var q = B.matches.filter(function (m) { return m.round === 'qual'; }).sort(function (a, b) { return a.num - b.num; });
      pane(Views.matchTable(B, q, { empty: tr('The match schedule has not been published yet.', 'Lịch trận chưa được công bố.') }) +
        (q.some(function (m) { return !m.red_counts || !m.blue_counts; }) ? '<p class="small mut"><span class="star">*</span> ' + tr('Extra match to even out match counts; does not affect ranking (7.4.2).', 'Trận đánh thêm cho đủ số trận; không tính xếp hạng (7.4.2).') + '</p>' : ''));
    },
    solo: function () {
      pane(Views.soloTable(B, R().solo(B.solo), cfg().soloAttempts * (R().soloPerKind ? 2 : 1)));
    },
    finals: function () {
      if (R().eliminations === 'rounds') {
        var sa = Achieve.selection([], (B.event.config || {}).selection), res = ADC.eliminations(sa.alliances, B.matches, cfg());
        var am = B.matches.filter(function (m) { return m.round === 'elim' || m.round === 'final'; }).sort(function (a, b) { return (a.round === 'final') - (b.round === 'final') || a.num - b.num; });
        return pane((res.champion ? '<div class="champ">🏆 ' + tr('Teamwork Champions', 'Vô địch Teamwork') + ': <b>' + esc(res.champion.captain) + ' + ' + esc(res.champion.partner) + '</b></div>' : '') +
          (res.tied.length ? '<div class="banner info">' + tr('Tie for first place: tiebreaker round coming up (7.4.5).', 'Hoà hạng nhất: sắp đánh vòng tiebreak (7.4.5).') + '</div>' : '') +
          (sa.alliances.length ? '<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start"><div><h3 class="t">' + tr('Alliances', 'Các liên minh') + '</h3>' + Views.alliancesTable(B, sa.alliances) + '</div>' +
            '<div>' + (am.length ? Views.roundsView(B, res) : '<p class="small mut">' + tr('Elimination matches start after alliance selection.', 'Các trận loại trực tiếp bắt đầu sau khi chọn liên minh.') + '</p>') + '</div></div>' +
            (am.length ? '<h3 class="t">' + tr('Matches', 'Các trận') + '</h3>' + Views.matchTable(B, am) +
              '<p class="small mut">' + tr('Played one at a time, starting with the lowest-ranked alliance; the highest scores advance to the next round (7.4.5).', 'Đánh lần lượt, bắt đầu từ liên minh xếp thấp nhất; điểm cao nhất đi tiếp vòng sau (7.4.5).') + '</p>' : '')
            : '<p class="empty">' + tr('Alliance selection has not started yet.', 'Chưa đến phần chọn liên minh.') + '</p>'));
      }
      if (R().format === 'versus') {
        var st = Achieve.selection([], (B.event.config || {}).selection), br = Achieve.bracket(st.alliances, B.matches, cfg());
        var em = B.matches.filter(function (m) { return m.round === 'elim' || m.round === 'final'; }).sort(function (a, b) { return (a.round === 'final') - (b.round === 'final') || a.num - b.num; });
        return pane((br.champion ? '<div class="champ">🏆 ' + tr('Tournament Champions', 'Vô địch giải') + ': <b>' + esc(br.champion.captain) + ' + ' + esc(br.champion.partner) + '</b></div>' : '') +
          (st.alliances.length ? '<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start"><div><h3 class="t">' + tr('Alliances', 'Các liên minh') + '</h3>' + Views.alliancesTable(B, st.alliances) + '</div>' +
            '<div><h3 class="t">' + tr('Bracket', 'Nhánh đấu') + '</h3>' + (em.length ? Views.bracketView(B, br, st.alliances) : '<p class="small mut">' + tr('Coming up after alliance selection.', 'Sẽ có sau khi chọn liên minh.') + '</p>') + '</div></div>' +
            (em.length ? '<h3 class="t">' + tr('Matches', 'Các trận') + '</h3>' + Views.matchTable(B, em, { versus: true }) : '')
            : '<p class="empty">' + tr('Alliance selection has not started yet.', 'Chưa đến phần chọn liên minh.') + '</p>'));
      }
      var f = B.matches.filter(function (m) { return m.round === 'final'; }).sort(function (a, b) { return a.num - b.num; }), r = E.finalsResult(B.matches);
      pane((r.champion ? '<div class="champ">🏆 ' + tr('Tournament Champions', 'Vô địch giải') + ': <b>' + esc(r.champion.red) + ' + ' + esc(r.champion.blue) + '</b></div>' : '') +
        (r.tied.length ? '<div class="banner info">' + tr('Tie for first place: tiebreaker round coming up.', 'Hoà hạng nhất: sắp đánh vòng tiebreak.') + '</div>' : '') +
        Views.matchTable(B, f, { empty: tr('Finals have not started yet.', 'Chung kết chưa bắt đầu.') }) +
        (f.length ? '<p class="small mut">' + tr('Finals are played one at a time, starting with the lowest-ranked alliance. Highest score wins (7.4.4).', 'Chung kết đánh lần lượt, bắt đầu từ liên minh hạng thấp nhất. Điểm cao nhất vô địch (7.4.4).') + '</p>' : ''));
    },
    awards: function () {
      var all = R().performanceAwards(B.matches, B.solo, B.event).concat(B.awards);
      pane(all.length ? '<div class="tbl"><table><thead><tr><th>' + tr('Award', 'Giải thưởng') + '</th><th>' + tr('Team', 'Đội') + '</th></tr></thead><tbody>' +
        all.map(function (a) { return '<tr data-hl="' + esc(a.team) + '"><td><b>' + esc(a.name) + '</b></td><td>' + Views.teamCell(B, a.team, 'x') + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="empty">' + tr('Awards will be announced at the end of the event.', 'Giải thưởng sẽ được công bố cuối giải.') + '</p>');
    },
    teams: function () {
      pane(B.teams.length ? '<div class="tbl"><table><thead><tr><th>' + tr('Team #', 'Mã đội') + '</th><th>' + tr('Team name', 'Tên đội') + '</th><th>' + tr('School', 'Trường') + '</th><th>' + tr('Grade', 'Cấp') + '</th></tr></thead><tbody>' +
        B.teams.map(function (t) { return '<tr data-hl="' + esc(t.number) + '"><td class="code">' + esc(t.number) + '</td><td>' + esc(t.name) + '</td><td>' + esc(t.org) + '</td><td class="small">' + esc(gradeName(t.grade)) + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="empty">' + tr('No teams yet.', 'Chưa có đội.') + '</p>');
    }
  };
  window.addEventListener('hashchange', function () { if (!B) return; tab = location.hash.slice(1) || 'rankings'; paint(); });

  function poll() {
    if (document.hidden || !B) return;
    S.lastUpdated(id).then(function (u) {
      if (u && u !== stamp) return load();
      var el = $id('upd'); if (el) el.textContent = tr('Updates automatically. Last checked ', 'Tự động cập nhật. Kiểm tra lần cuối ') + new Date().toLocaleTimeString(I18N.loc());
    }).catch(function () {});
  }

  I18N.apply(); I18N.bindToggle();
  I18N.onChange(function () { if (id) { if (B) paint(); } else renderList(); });
  if (id) { load().catch(fail); setInterval(poll, POLL_MS); document.addEventListener('visibilitychange', poll); }
  else renderList();
})();
