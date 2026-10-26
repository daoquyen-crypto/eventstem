/* Màn hình trình chiếu tại sân (show.html?id=…): các màn tự chuyển, dữ liệu tự cập nhật.
   Cài đặt của ban tổ chức ở event.config.show = {seconds, rows, slides: {next, rank, solo, elim, awards, sponsors}}.
   Có thể ghi đè bằng tham số trên đường dẫn: &s=10 (giây mỗi màn), &only=rank,solo (chỉ hiện các màn này). */
(function () {
  'use strict';
  var S = window.Store, E = window.Engage;
  var P = new URLSearchParams(location.search), id = P.get('id');
  var B = null, stamp = null, slides = [], cur = 0, paused = false, timer = null, POLL_MS = 15000;
  var SLIDES = ['next', 'rank', 'solo', 'elim', 'awards', 'sponsors'];

  function R() { return Rules.of(B.event); }
  function cfg() { return R().cfg(B.event.config); }
  /* Cài đặt trình chiếu: mặc định → event.config.show → tham số đường dẫn */
  function showCfg() {
    var c = (B.event.config || {}).show || {}, on = {};
    SLIDES.forEach(function (k) { on[k] = !c.slides || c.slides[k] !== false; });
    if (P.get('only')) { var only = P.get('only').split(','); SLIDES.forEach(function (k) { on[k] = only.indexOf(k) >= 0; }); }
    var sec = +P.get('s') || +c.seconds || 12;
    return { seconds: Math.max(4, Math.min(120, sec)), rows: Math.max(5, Math.min(20, +c.rows || 10)), on: on };
  }

  /* ---------- các màn ---------- */
  var ORD = { practice: 0, qual: 1, elim: 2, final: 3 };
  function scored(m) { return m.score != null && (!(m.red2 || m.blue2) || m.score_blue != null); }
  function teamsOf(m) { return ['red', 'red2', 'blue', 'blue2'].filter(function (s) { return m[s]; }); }
  function teamName(n) { var t = B.teams.find(function (x) { return x.number === n; }); return t && t.name ? t.name : ''; }
  function side(m, sd) {
    return '<div class="show-side ' + sd + '">' + teamsOf(m).filter(function (s) { return s.indexOf(sd) === 0; }).map(function (s) {
      return '<div><b class="code">' + esc(m[s]) + '</b> <span>' + esc(teamName(m[s])) + '</span></div>'; }).join('') + '</div>';
  }
  function matchCard(m, withScore) {
    var vs = !!(m.red2 || m.blue2 || m.score_blue != null);
    var sc = withScore ? (vs ? '<div class="show-score"><span class="r">' + m.score + '</span>–<span class="b">' + m.score_blue + '</span></div>' : '<div class="show-score">' + m.score + '</div>') : '';
    return '<div class="show-match"><div class="show-mhead"><b>' + Views.matchCode(m, B.matches) + '</b><span>' + [m.time ? esc(m.time) : '', m.field ? tr('Field ', 'Sân ') + esc(m.field) : ''].filter(Boolean).join(' · ') + '</span></div>' +
      '<div class="show-mbody">' + side(m, 'red') + '<div class="show-vs">' + (vs ? 'vs' : '+') + '</div>' + side(m, 'blue') + '</div>' + sc + '</div>';
  }
  function nextSlide(c) {
    var open = B.matches.filter(function (m) { return !scored(m) && m.round !== 'practice'; }).sort(function (a, b) { return ORD[a.round] - ORD[b.round] || a.num - b.num; });
    var done = B.matches.filter(scored).sort(function (a, b) { return String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || ORD[b.round] - ORD[a.round] || b.num - a.num; });
    var n = Math.max(2, Math.min(6, (+cfg().fields || 1) * 2));
    if (!open.length && !done.length) return null;
    return { key: 'next', title: tr('Matches', 'Trận đấu'), html: '<div class="show-cols">' +
      (open.length ? '<section><h2>' + tr('Up next', 'Sắp đánh') + '</h2>' + open.slice(0, n).map(function (m) { return matchCard(m, false); }).join('') + '</section>' : '') +
      (done.length ? '<section><h2>' + tr('Latest results', 'Kết quả mới nhất') + '</h2>' + done.slice(0, Math.min(4, n)).map(function (m) { return matchCard(m, true); }).join('') + '</section>' : '') + '</div>' };
  }
  function pages(key, title, list, rows, render) {
    var out = [], total = Math.ceil(list.length / rows);
    for (var i = 0; i < total; i++) out.push({ key: key, title: title + (total > 1 ? ' (' + (i + 1) + '/' + total + ')' : ''), html: render(list.slice(i * rows, (i + 1) * rows)) });
    return out;
  }
  function rankSlides(c) {
    if (!B.matches.some(function (m) { return m.round === 'qual' && scored(m); })) return [];
    var rk = R().ranking(B.teams, B.matches, Object.assign({ seed: B.event.id }, cfg())).filter(function (r) { return r.played > 0; }), rc = R().redCards(B.matches);
    var vs = R().format === 'versus';
    return pages('rank', vs ? tr('Qualification rankings', 'Xếp hạng vòng loại') : tr('Alliance rankings', 'Xếp hạng Alliance'), rk, c.rows,
      function (part) { return vs ? Views.rpTable(B, part, rc) : Views.allianceTable(B, part, rc); });
  }
  function soloSlides(c) {
    var rk = R().solo(B.solo); if (!rk.length) return [];
    var lim = cfg().soloAttempts * (R().soloPerKind ? 2 : 1);
    return pages('solo', R().soloPerKind ? tr('Skills (solo) rankings', 'Xếp hạng Solo') : tr('Solo rankings', 'Xếp hạng Solo'), rk, c.rows, function (part) { return Views.soloTable(B, part, lim); });
  }
  function champ(label, a, b) { return '<div class="champ">🏆 ' + label + ': <b>' + esc(a) + ' + ' + esc(b) + '</b></div>'; }
  function elimSlide() {
    var html = '', ev = B.event;
    if (R().eliminations === 'rounds') {
      var sa = Achieve.selection([], (ev.config || {}).selection); if (!sa.alliances.length) return null;
      var res = ADC.eliminations(sa.alliances, B.matches, cfg());
      html = (res.champion ? champ(tr('Teamwork Champions', 'Vô địch Teamwork'), res.champion.captain, res.champion.partner) : '') +
        (res.stages.length ? Views.roundsView(B, res) : Views.alliancesTable(B, sa.alliances));
    } else if (R().format === 'versus') {
      var st = Achieve.selection([], (ev.config || {}).selection); if (!st.alliances.length) return null;
      var br = Achieve.bracket(st.alliances, B.matches, cfg()), has = B.matches.some(function (m) { return m.round === 'elim' || m.round === 'final'; });
      html = (br.champion ? champ(tr('Tournament Champions', 'Vô địch giải'), br.champion.captain, br.champion.partner) : '') +
        (has ? Views.bracketView(B, br, st.alliances) : Views.alliancesTable(B, st.alliances));
    } else {
      var f = B.matches.filter(function (m) { return m.round === 'final'; }).sort(function (a, b) { return a.num - b.num; }); if (!f.length) return null;
      var r = E.finalsResult(B.matches);
      html = (r.champion ? champ(tr('Tournament Champions', 'Vô địch giải'), r.champion.red, r.champion.blue) : '') + Views.matchTable(B, f);
    }
    return { key: 'elim', title: R().format === 'versus' || R().eliminations ? tr('Eliminations', 'Loại trực tiếp') : tr('Finals', 'Chung kết'), html: html };
  }
  function awardsSlide() {
    var list = R().performanceAwards(B.matches, B.solo, B.event).concat(B.awards);
    if (!list.length) return null;
    return { key: 'awards', title: tr('Awards', 'Giải thưởng'), html: '<div class="show-awards">' + list.map(function (a) {
      return '<div class="show-award"><span>🏅 ' + esc(a.name) + '</span><b class="code">' + esc(a.team) + '</b> <span class="mut">' + esc(teamName(a.team)) + '</span></div>'; }).join('') + '</div>' };
  }
  function sponsorSlide() {
    var sp = (B.assets || {}).sponsors || []; if (!sp.length) return null;
    return { key: 'sponsors', title: tr('Thank you to our sponsors', 'Cảm ơn các nhà tài trợ'), html: '<div class="show-sponsor-grid">' + sp.map(function (x) {
      return '<figure><img src="' + esc(x.src) + '" alt="' + esc(x.name || '') + '">' + (x.name ? '<figcaption>' + esc(x.name) + '</figcaption>' : '') + '</figure>'; }).join('') + '</div>' };
  }
  function build() {
    var c = showCfg(), out = [];
    if (c.on.next) { var n = nextSlide(c); if (n) out.push(n); }
    if (c.on.rank) out = out.concat(rankSlides(c));
    if (c.on.solo) out = out.concat(soloSlides(c));
    if (c.on.elim) { var el = elimSlide(); if (el) out.push(el); }
    if (c.on.awards) { var aw = awardsSlide(); if (aw) out.push(aw); }
    if (c.on.sponsors) { var sp = sponsorSlide(); if (sp) out.push(sp); }
    if (!out.length) out.push({ key: 'welcome', title: '', html: '<div class="show-welcome">' + (B.assets && B.assets.organizer ? '<img src="' + esc(B.assets.organizer) + '" alt="">' : '') +
      '<h2>' + esc(B.event.name) + '</h2><p>' + tr('Matches and rankings will appear here.', 'Lịch trận và bảng xếp hạng sẽ hiện ở đây.') + '</p></div>' });
    return out;
  }

  /* ---------- khung trang ---------- */
  function paintFrame() {
    var e = B.event, a = B.assets || {};
    document.title = e.name + ' · EventSTEM Show';
    $id('shName').innerHTML = (S.rehearsal ? '<span class="show-rh">' + tr('REHEARSAL', 'TẬP DƯỢT') + '</span> ' : '') + esc(e.name);
    $id('shSub').textContent = [fmtDate(e.date), e.location, e.organizer_name].filter(Boolean).join(' · ');
    $id('shOrg').innerHTML = a.organizer ? '<img src="' + esc(a.organizer) + '" alt="' + esc(e.organizer_name || '') + '">' : '';
    $id('shSpons').innerHTML = (a.sponsors || []).map(function (x) { return '<img src="' + esc(x.src) + '" alt="' + esc(x.name || '') + '" title="' + esc(x.name || '') + '">'; }).join('');
  }
  function show(i) {
    if (!slides.length) return;
    cur = (i + slides.length) % slides.length;
    var s = slides[cur];
    $id('shMain').innerHTML = (s.title ? '<h2 class="show-h">' + esc(s.title) + '</h2>' : '') + '<div class="show-slide" data-k="' + s.key + '">' + s.html + '</div>';
    $id('shPage').textContent = (cur + 1) + '/' + slides.length + (paused ? ' ❚❚' : '');
    fit();
    schedule();
  }
  /* Thu nhỏ nội dung nếu dài hơn màn hình (bảng nhiều dòng, nhánh đấu lớn) */
  function fit() {
    var m = $id('shMain'), sl = m.querySelector('.show-slide'); if (!sl) return;
    sl.style.transform = ''; sl.style.width = '';
    var avail = m.clientHeight - (m.querySelector('.show-h') ? m.querySelector('.show-h').offsetHeight : 0) - 8, h = sl.scrollHeight;
    if (h > avail && avail > 0) { var k = Math.max(0.5, avail / h); sl.style.transform = 'scale(' + k + ')'; sl.style.width = (100 / k) + '%'; }
  }
  function schedule() {
    clearTimeout(timer);
    if (!paused && slides.length > 1) timer = setTimeout(function () { show(cur + 1); }, showCfg().seconds * 1000);
  }
  function rebuild(keepKey) {
    var key = slides[cur] && slides[cur].key;
    slides = build(); paintFrame();
    var j = keepKey ? slides.findIndex(function (s) { return s.key === key; }) : 0;
    show(j < 0 ? 0 : j);
  }
  function load(keep) {
    return S.getEvent(id).then(function (b) {
      if (!b) { $id('shMain').innerHTML = '<p class="empty">' + tr('This event does not exist or is not public.', 'Giải không tồn tại hoặc chưa được công bố.') + '</p>'; return; }
      B = b; stamp = b.event.updated_at; rebuild(keep);
    });
  }
  function poll() {
    if (!B) return;
    S.lastUpdated(id).then(function (u) { if (u && u !== stamp) return load(true); }).catch(function () {});
  }
  function clock() { $id('shClock').textContent = new Date().toLocaleTimeString(I18N.loc(), { hour: '2-digit', minute: '2-digit' }); }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  }
  function act(a) {
    if (a === 'prev') show(cur - 1);
    else if (a === 'next') show(cur + 1);
    else if (a === 'pause') { paused = !paused; $id('shPause').textContent = paused ? '▶︎' : '❚❚'; show(cur); }
    else if (a === 'full') toggleFull();
  }

  I18N.apply(); I18N.bindToggle();
  I18N.onChange(function () { if (B) rebuild(true); });
  $id('shCtl').addEventListener('click', function (ev) { var b = ev.target.closest('[data-a]'); if (b) act(b.dataset.a); });
  document.addEventListener('keydown', function (ev) {
    var k = ev.key;
    if (k === 'ArrowRight' || k === 'PageDown') act('next');
    else if (k === 'ArrowLeft' || k === 'PageUp') act('prev');
    else if (k === ' ') { ev.preventDefault(); act('pause'); }
    else if (k === 'f' || k === 'F') act('full');
  });
  /* Ẩn thanh điều khiển và con trỏ khi không động chuột */
  var idle = null;
  document.addEventListener('mousemove', function () { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(function () { document.body.classList.add('idle'); }, 3000); });
  window.addEventListener('resize', fit);
  clock(); setInterval(clock, 10000);
  if (!id) $id('shMain').innerHTML = '<p class="empty">' + tr('Open this page from the organizer tool (Logo & show tab).', 'Mở trang này từ công cụ tổ chức giải (tab Logo & trình chiếu).') + '</p>';
  else { load(false).catch(function (e) { $id('shMain').innerHTML = '<div class="banner err">' + esc(errText(e)) + '</div>'; }); setInterval(poll, POLL_MS); }
  window.EventSTEMShow = { slides: function () { return slides.map(function (s) { return s.key; }); }, go: show };   // cho kiểm thử
})();
