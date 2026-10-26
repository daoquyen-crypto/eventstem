/* Màn hình trình chiếu tại sân (show.html?id=…): các màn tự chuyển, dữ liệu tự cập nhật.
   Cài đặt của ban tổ chức ở event.config.show = {seconds, rows, slides: {next, sched, rank, solo, elim, awards, events, sponsors}}.
   Chọn màn bằng &screen=:
     all (mặc định)  chạy luân phiên các màn đã bật trong cài đặt
     matches         Lịch trận: trận sắp đánh, kết quả mới nhất, lịch các trận còn lại
     standings       Kết quả & xếp hạng: xếp hạng vòng loại, Solo, loại trực tiếp, giải thưởng
     events          Các giải RECF sắp tới ở nước này và lân cận (từ events.json)
     sponsors        Cảm ơn nhà tài trợ
     overlay         Lớp phủ livestream: nền trong suốt (&bg=green nền xanh để tách nền, &bg=dark), logo + trận đang đánh; &field=2 chọn sân
   Ghi đè khác: &s=10 (giây mỗi màn), &only=rank,solo (chỉ hiện các màn này),
   &spot=seq / rand / amazon,nasa (cách chạy dải logo Spotlight Partners ở chân màn hình). */
(function () {
  'use strict';
  var S = window.Store, E = window.Engage;
  var P = new URLSearchParams(location.search), id = P.get('id');
  var B = null, stamp = null, slides = [], cur = 0, paused = false, timer = null, POLL_MS = 15000;
  var SLIDES = ['next', 'sched', 'rank', 'solo', 'elim', 'awards', 'events', 'sponsors'];
  var SCREENS = { matches: ['next', 'sched'], standings: ['rank', 'solo', 'elim', 'awards'], events: ['events'], sponsors: ['sponsors'] };
  var SCREEN_NAMES = [['all', 'All screens (rotate)', 'Tất cả (luân phiên)'], ['matches', 'Match schedule', 'Lịch trận'], ['standings', 'Results & standings', 'Kết quả & xếp hạng'],
    ['events', 'Upcoming events', 'Giải sắp tới'], ['sponsors', 'Sponsors', 'Nhà tài trợ'], ['overlay', 'Livestream overlay', 'Lớp phủ livestream']];
  function screen() { var x = P.get('screen'); return SCREENS[x] || x === 'overlay' ? x : 'all'; }
  var EVJ = null;   // events.json (giải RECF), tải 1 lần cho màn "Giải sắp tới"

  function R() { return Rules.of(B.event); }
  function cfg() { return R().cfg(B.event.config); }
  /* Cài đặt trình chiếu: mặc định → event.config.show → tham số đường dẫn */
  function showCfg() {
    var c = (B.event.config || {}).show || {}, on = {};
    SLIDES.forEach(function (k) { on[k] = !c.slides || c.slides[k] !== false; });
    var sc = SCREENS[screen()];
    if (sc) SLIDES.forEach(function (k) { on[k] = sc.indexOf(k) >= 0; });
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
    var open = openMatches();
    var done = B.matches.filter(scored).sort(function (a, b) { return String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || ORD[b.round] - ORD[a.round] || b.num - a.num; });
    var n = Math.max(2, Math.min(6, (+cfg().fields || 1) * 2));
    if (!open.length && !done.length) return null;
    return { key: 'next', title: tr('Matches', 'Trận đấu'), html: '<div class="show-cols">' +
      (open.length ? '<section><h2>' + tr('Up next', 'Sắp đánh') + '</h2>' + open.slice(0, n).map(function (m) { return matchCard(m, false); }).join('') + '</section>' : '') +
      (done.length ? '<section><h2>' + tr('Latest results', 'Kết quả mới nhất') + '</h2>' + done.slice(0, Math.min(4, n)).map(function (m) { return matchCard(m, true); }).join('') + '</section>' : '') + '</div>' };
  }
  function openMatches() { return B.matches.filter(function (m) { return !scored(m) && m.round !== 'practice'; }).sort(function (a, b) { return ORD[a.round] - ORD[b.round] || a.num - b.num; }); }
  /* Lịch các trận còn lại, chia trang */
  function schedSlides(c) {
    var open = openMatches(); if (!open.length) return [];
    var vs = R().format === 'versus';
    return pages('sched', tr('Match schedule', 'Lịch trận'), open, Math.max(6, c.rows), function (part) { return Views.matchTable(B, part, { versus: vs }); });
  }
  /* Giải RECF sắp tới ở nước của giải này, rồi các nước trong 3.500 km (giống "Gần bạn" ở trang chủ) */
  function km(a, b) { var r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2), y = Math.sin((b.lng - a.lng) * r / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a.lat * r) * Math.cos(b.lat * r) * y * y)); }
  function eventsSlide() {
    if (!EVJ || !B.event.country) return null;
    var today = new Date().toISOString().slice(0, 10), code = (B.event.recf_code || '').toUpperCase(), ctry = B.event.country;
    var up = EVJ.filter(function (e) { return e.start && e.start >= today && e.code !== code; });
    var mine = EVJ.filter(function (e) { return e.country === ctry && e.lat != null; });
    var c = mine.length ? { lat: mine.reduce(function (s, e) { return s + e.lat; }, 0) / mine.length, lng: mine.reduce(function (s, e) { return s + e.lng; }, 0) / mine.length } : null;
    var local = up.filter(function (e) { return e.country === ctry; }), near = c ? up.filter(function (e) { return e.country !== ctry && e.lat != null && km(c, e) <= 3500; }) : [];
    var by = function (a, b) { return a.start.localeCompare(b.start); }, list = local.sort(by).concat(near.sort(by)).slice(0, 8);
    if (!list.length) return null;
    var cn = function (x) { return I18N.lang === 'vi' && x === 'Vietnam' ? 'Việt Nam' : x; };
    return { key: 'events', title: tr('Upcoming RECF events', 'Các giải RECF sắp tới') + ' · ' + cn(ctry) + (near.length ? tr(' & nearby', ' và lân cận') : ''),
      html: '<div class="show-events">' + list.map(function (e) {
        return '<div class="show-ev"><div class="show-ev-d">' + esc(fmtDate(e.start)) + '</div><div class="show-ev-p">' + esc(e.program === 'ADC' ? 'Aerial Drone' : e.program) + '</div>' +
          '<div class="show-ev-t">' + esc(e.title) + '</div><div class="show-ev-m">' + esc([e.city, e.country !== ctry ? cn(e.country) : ''].filter(Boolean).join(', ')) +
          (e.status === 'Registration Open' ? ' · <b>' + tr('Registration open', 'Đang mở đăng ký') + '</b>' : '') + '</div></div>';
      }).join('') + '</div><p class="show-ev-foot">' + tr('Details and registration: eventstem.com', 'Xem chi tiết và đăng ký: eventstem.com') + '</p>' };
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
      var br = R().bracket(st.alliances, B.matches, cfg()), has = B.matches.some(function (m) { return m.round === 'elim' || m.round === 'final'; });
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
    if (c.on.sched) out = out.concat(schedSlides(c));
    if (c.on.rank) out = out.concat(rankSlides(c));
    if (c.on.solo) out = out.concat(soloSlides(c));
    if (c.on.elim) { var el = elimSlide(); if (el) out.push(el); }
    if (c.on.awards) { var aw = awardsSlide(); if (aw) out.push(aw); }
    if (c.on.events) { var ev = eventsSlide(); if (ev) out.push(ev); }
    if (c.on.sponsors) { var sp = sponsorSlide(); if (sp) out.push(sp); }
    if (!out.length) out.push({ key: 'welcome', title: '', html: '<div class="show-welcome">' + (B.assets && B.assets.organizer ? '<img src="' + esc(B.assets.organizer) + '" alt="">' : '') +
      '<h2>' + esc(B.event.name) + '</h2><p>' + tr('Matches and rankings will appear here.', 'Lịch trận và bảng xếp hạng sẽ hiện ở đây.') + '</p></div>' });
    return out;
  }

  /* ---------- Lớp phủ livestream (&screen=overlay) ----------
     Dùng làm "Browser Source" trong OBS / vMix, đặt trên hình camera (1920×1080). Nền trong suốt; &bg=green cho bộ trộn hình cần tách nền xanh.
     Góc trên: logo đơn vị + tên giải, logo nhà tài trợ đổi lần lượt. Dải dưới: trận đang đánh (trận chưa chấm đầu tiên, theo sân nếu có &field=),
     kết quả trận vừa xong, và 2 trận kế tiếp. */
  var spIdx = 0, spTimer = null;
  function overlay() {
    var a = B.assets || {}, f = P.get('field'), open = openMatches().filter(function (m) { return !f || String(m.field) === f; });
    var done = B.matches.filter(function (m) { return scored(m) && (!f || String(m.field) === f); }).sort(function (x, y) { return String(y.updated_at || '').localeCompare(String(x.updated_at || '')) || ORD[y.round] - ORD[x.round] || y.num - x.num; });
    var now = open[0], last = done[0];
    var teams = function (m, sd) { return teamsOf(m).filter(function (s) { return s.indexOf(sd) === 0; }).map(function (s) { return '<span><b>' + esc(m[s]) + '</b> ' + esc(teamName(m[s])) + '</span>'; }).join(''); };
    var head = function (m) { return Views.matchCode(m, B.matches) + (m.field && (+cfg().fields || 1) > 1 ? ' · ' + tr('Field ', 'Sân ') + esc(m.field) : ''); };
    var vs = function (m) { return !!(m.red2 || m.blue2 || m.score_blue != null); };
    $id('ovTop').innerHTML = (a.organizer ? '<img src="' + esc(a.organizer) + '" alt="">' : '') + '<div><b>' + esc(B.event.name) + '</b><span>' + esc([B.event.location].filter(Boolean).join(' · ')) + '</span></div>';
    $id('ovBar').innerHTML = now ? '<div class="ov-now"><div class="ov-tag">' + tr('NOW', 'ĐANG ĐÁNH') + '<small>' + head(now) + '</small></div>' +
        '<div class="ov-al red">' + teams(now, 'red') + '</div><div class="ov-vs">' + (vs(now) ? 'VS' : '+') + '</div><div class="ov-al blue">' + teams(now, 'blue') + '</div></div>' +
        (open.length > 1 ? '<div class="ov-next">' + tr('Next: ', 'Tiếp theo: ') + open.slice(1, 3).map(function (m) { return '<span><b>' + Views.matchCode(m, B.matches) + '</b> ' + esc(teamsOf(m).map(function (s) { return m[s]; }).join(' · ')) + '</span>'; }).join('') + '</div>' : '')
      : '<div class="ov-now"><div class="ov-tag">' + esc(B.event.name) + '</div></div>';
    $id('ovLast').innerHTML = last ? '<small>' + tr('Last result', 'Kết quả vừa xong') + ' · ' + head(last) + '</small>' + (vs(last) ? '<b class="r">' + last.score + '</b><b>–</b><b class="b">' + last.score_blue + '</b>' : '<b>' + last.score + '</b>') : '';
    $id('ovLast').hidden = !last;
    var sp = a.sponsors || [];
    clearInterval(spTimer);
    var paintSp = function () { $id('ovSpons').innerHTML = sp.length ? '<img src="' + esc(sp[spIdx % sp.length].src) + '" alt="' + esc(sp[spIdx % sp.length].name || '') + '">' : ''; spIdx++; };
    paintSp(); if (sp.length > 1) spTimer = setInterval(paintSp, 8000);
  }

  /* ---------- Spotlight Partners (js/partners.js): dải logo chạy liên tục ở chân màn hình ----------
     Cài đặt: event.config.show.spotlight; ghi đè bằng &spot=seq / &spot=rand / &spot=amazon,nasa (tuỳ chọn, theo thứ tự này).
     Logo đầu chạy hết khỏi khung thì bị bỏ đi và nạp logo kế tiếp vào cuối, nên chế độ ngẫu nhiên đổi thứ tự liên tục. */
  var SPOT_SPEED = 0.06;   // khung hình / giây tính theo bề ngang màn hình (≈ 115 px/giây trên 1920)
  var spot = { key: null, x: 0, next: null, raf: 0, tick: 0, t0: 0 };
  function spotCfg() {
    var c = ((B.event.config || {}).show || {}).spotlight || {}, u = P.get('spot');
    if (u === 'seq' || u === 'rand') c = { mode: u, pick: c.pick };
    else if (u) c = { mode: 'pick', pick: u.split(',') };
    return Partners.cfg(c);
  }
  function spotImg(p) { var i = document.createElement('img'); i.src = Partners.src(p); i.alt = p.name; i.title = p.name; i.dataset.p = p.id; return i; }
  function spotFill() {
    var tr = $id('shSpotTrack'), w = tr.parentNode.clientWidth;
    for (var n = 0; tr.scrollWidth + spot.x < w * 1.3 && n < 60; n++) tr.appendChild(spotImg(spot.next()));
  }
  function spotStep(t) {
    var tr = $id('shSpotTrack'), dt = spot.t0 ? Math.min(0.1, (t - spot.t0) / 1000) : 0;
    spot.t0 = t;
    if (!document.hidden) {
      spot.x -= SPOT_SPEED * innerWidth * dt;
      var f = tr.firstElementChild, gap = parseFloat(getComputedStyle(tr).columnGap) || 0;
      if (f && -spot.x >= f.offsetWidth + gap) { spot.x += f.offsetWidth + gap; tr.removeChild(f); spotFill(); }
      tr.style.transform = 'translateX(' + spot.x.toFixed(1) + 'px)';
    }
    spot.raf = requestAnimationFrame(spotStep);
  }
  /* Chỉ dựng lại khi cài đặt đổi, để dải logo không giật mỗi lần dữ liệu giải tự cập nhật */
  function paintSpot() {
    var c = spotCfg(), key = JSON.stringify(c);
    if (key === spot.key) return;
    spot.key = key; spot.x = 0; spot.t0 = 0; spot.next = Partners.feeder(c);
    cancelAnimationFrame(spot.raf); clearInterval(spot.tick);
    var tr = $id('shSpotTrack'); tr.innerHTML = ''; tr.style.transform = '';
    spotFill();
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // giảm chuyển động: đổi từng logo mỗi 4 giây thay vì trượt
      spot.tick = setInterval(function () { var f = tr.firstElementChild; if (f) { tr.removeChild(f); spotFill(); } }, 4000);
    } else spot.raf = requestAnimationFrame(spotStep);
  }

  /* ---------- khung trang ---------- */
  function paintFrame() {
    var e = B.event, a = B.assets || {};
    document.title = e.name + ' · EventSTEM Show';
    $id('shName').innerHTML = (S.rehearsal ? '<span class="show-rh">' + tr('REHEARSAL', 'TẬP DƯỢT') + '</span> ' : '') + esc(e.name);
    $id('shSub').textContent = [fmtDate(e.date), e.location, e.organizer_name].filter(Boolean).join(' · ');
    $id('shOrg').innerHTML = a.organizer ? '<img src="' + esc(a.organizer) + '" alt="' + esc(e.organizer_name || '') + '">' : '';
    $id('shSpons').innerHTML = (a.sponsors || []).map(function (x) { return '<img src="' + esc(x.src) + '" alt="' + esc(x.name || '') + '" title="' + esc(x.name || '') + '">'; }).join('');
    paintSpot();
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
    var ov = screen() === 'overlay';
    document.body.classList.toggle('overlay', ov);
    document.body.dataset.bg = P.get('bg') || '';
    $id('shOverlay').hidden = !ov;
    if (ov) { clearTimeout(timer); cancelAnimationFrame(spot.raf); clearInterval(spot.tick); spot.key = null; overlay(); return; }
    clearInterval(spTimer);
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

  function paintPicker() {
    $id('shScreen').innerHTML = SCREEN_NAMES.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === screen() ? ' selected' : '') + '>' + esc(tr(x[1], x[2])) + '</option>'; }).join('');
  }
  $id('shScreen').addEventListener('change', function () {
    if (this.value === 'all') P.delete('screen'); else P.set('screen', this.value);
    try { history.replaceState(null, '', location.pathname + '?' + P.toString()); } catch (x) {}
    if (B) rebuild(false);
  });
  I18N.apply(); I18N.bindToggle(); paintPicker();
  I18N.onChange(function () { paintPicker(); if (B) rebuild(true); });
  /* Danh sách giải RECF cho màn "Giải sắp tới"; không có cũng không sao */
  fetch('events.json').then(function (r) { return r.json(); }).then(function (d) { EVJ = d.events || []; if (B && screen() !== 'overlay') rebuild(true); }).catch(function () {});
  $id('shCtl').addEventListener('click', function (ev) { var b = ev.target.closest('[data-a]'); if (b) act(b.dataset.a); });
  document.addEventListener('keydown', function (ev) {
    var k = ev.key;
    if (k === 'ArrowRight' || k === 'PageDown') act('next');
    else if (k === 'ArrowLeft' || k === 'PageUp') act('prev');
    else if (k === ' ') { ev.preventDefault(); act('pause'); }
    else if (k === 'f' || k === 'F') act('full');
  });
  /* Ẩn thanh điều khiển và con trỏ khi không động chuột */
  var idle = setTimeout(function () { document.body.classList.add('idle'); }, 3000);   // OBS không có chuột: tự ẩn sau 3 giây
  document.addEventListener('mousemove', function () { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(function () { document.body.classList.add('idle'); }, 3000); });
  window.addEventListener('resize', fit);
  clock(); setInterval(clock, 10000);
  if (!id) $id('shMain').innerHTML = '<p class="empty">' + tr('Open this page from the organizer tool (Logo & show tab).', 'Mở trang này từ công cụ tổ chức giải (tab Logo & trình chiếu).') + '</p>';
  else { load(false).catch(function (e) { $id('shMain').innerHTML = '<div class="banner err">' + esc(errText(e)) + '</div>'; }); setInterval(poll, POLL_MS); }
  window.EventSTEMShow = { slides: function () { return slides.map(function (s) { return s.key; }); }, go: show, ready: function () { return !!EVJ; },
    spot: function () { return [].map.call($id('shSpotTrack').children, function (i) { return i.dataset.p; }); } };   // cho kiểm thử
})();
