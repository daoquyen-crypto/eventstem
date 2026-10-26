/* Công cụ quản lý giải: đăng nhập, tạo giải, nhập đội, tạo lịch, chấm điểm, chung kết, giải thưởng, xuất CSV.
   SEPA (superadmin): duyệt tài khoản, duyệt tự động, xác minh giải. */
(function () {
  'use strict';
  var S = window.Store, E = window.Engage;
  var me = null, B = null, app = $id('app');
  var TABS = [['overview', 'Overview', 'Tổng quan'], ['teams', 'Teams', 'Đội'], ['schedule', 'Schedule', 'Lịch trận'], ['scoring', 'Scoring', 'Chấm điểm'],
    ['solo', 'Solo', 'Solo'], ['rankings', 'Rankings', 'Xếp hạng'], ['finals', 'Finals', 'Chung kết'], ['awards', 'Awards', 'Giải thưởng'], ['export', 'Export', 'Xuất kết quả']];

  function isSA() { return me && me.profile.role === 'superadmin' && me.profile.status === 'approved'; }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function busy(btn, on) { if (btn) btn.disabled = on; }
  function fail(e) { if (!e || !e.code || e.code === 'unknown') console.error(e); toast(errText(e), true); }
  function val(id) { var el = $id(id); return el ? el.value.trim() : ''; }
  function num(id, d) { var v = parseInt(val(id), 10); return isNaN(v) ? d : v; }
  function cfgOf(ev) { return E.cfg(ev.config); }
  /* Bảng dùng chung với trang công khai (js/views.js) */
  function teamCell(n, side, counts) { return Views.teamCell(B, n, side, counts); }
  function matchTable(list, opts) { return Views.matchTable(B, list, opts); }
  function soloTable(rk, lim) { return Views.soloTable(B, rk, lim); }
  function allianceTable(rk, rc) { return Views.allianceTable(B, rk, rc); }

  /* ---------- header ---------- */
  function paintHeader() {
    var w = $id('who');
    if (me) {
      w.hidden = false;
      w.innerHTML = '<a href="#account" style="color:inherit">' + esc(me.profile.display_name || me.email) + '</a>' + (isSA() ? ' <span class="tag" style="background:var(--signal);color:#fff">SEPA</span>' : '') +
        '<button type="button" id="signOut">' + tr('Sign out', 'Đăng xuất') + '</button>';
      $id('signOut').onclick = function () { S.signOut().then(function () { me = null; location.hash = ''; route(); }); };
    } else w.hidden = true;
    var d = $id('demoBanner');
    d.hidden = S.mode !== 'demo';
    if (S.mode === 'demo') d.innerHTML = tr('<b>Demo mode.</b> Data is saved only in this browser. The first account you create becomes the SEPA admin. To go live, connect Supabase (see docs/SUPABASE_SETUP.md).',
      '<b>Chế độ demo.</b> Dữ liệu chỉ lưu trong trình duyệt này. Tài khoản tạo đầu tiên là quản trị SEPA. Để chạy thật, kết nối Supabase (xem docs/SUPABASE_SETUP.md).') +
      ' <button type="button" class="linkbtn" id="resetDemo">' + tr('Reset demo data', 'Xoá dữ liệu demo') + '</button>';
    var r = $id('resetDemo'); if (r) r.onclick = function () { if (confirm(tr('Delete all demo data in this browser?', 'Xoá toàn bộ dữ liệu demo trong trình duyệt này?'))) S.resetDemo().then(function () { me = null; location.hash = ''; route(); }); };
  }

  /* ---------- router ---------- */
  function route() {
    paintHeader();
    var p = location.hash.replace(/^#\/?/, '').split('/');
    if (!me) return renderLogin(p[0] === 'signup');
    if (p[0] === 'account') return renderAccount();
    if (me.profile.status !== 'approved') return renderPending();
    if (p[0] === 'new') return renderNew();
    if (p[0] === 'e' && p[1]) return openEvent(p[1], p[2] || 'overview');
    if (p[0] === 'admin' && isSA()) return renderAdmin(p[1] || 'users');
    return renderHome();
  }
  window.addEventListener('hashchange', route);
  I18N.onChange(route);

  /* ---------- đăng nhập / đăng ký ---------- */
  function renderLogin(signup) {
    app.innerHTML = '<div class="narrow"><div class="card">' +
      '<div class="tabs" role="tablist"><a href="#" role="tab" aria-selected="' + !signup + '">' + tr('Sign in', 'Đăng nhập') + '</a><a href="#signup" role="tab" aria-selected="' + !!signup + '">' + tr('Create account', 'Tạo tài khoản') + '</a></div>' +
      (signup ?
        '<p class="small mut" style="margin-top:0">' + tr('For schools and Event Partners who run tournaments. SEPA reviews new accounts before they can create events.', 'Dành cho nhà trường và Event Partner tổ chức giải. SEPA duyệt tài khoản mới trước khi được tạo giải.') + '</p>' +
        '<form id="fSignup" class="grid2" style="grid-template-columns:1fr">' +
        '<label class="f"><span>' + tr('Your name', 'Họ tên') + '</span><input type="text" id="suName" required autocomplete="name"></label>' +
        '<label class="f"><span>' + tr('School / organization', 'Trường / đơn vị') + '</span><input type="text" id="suOrg" required autocomplete="organization"></label>' +
        '<label class="f"><span>' + tr('Country', 'Quốc gia') + '</span><input type="text" id="suCountry" value="Vietnam" autocomplete="country-name"></label>' +
        '<label class="f"><span>Email</span><input type="email" id="suEmail" required autocomplete="email"></label>' +
        '<label class="f"><span>' + tr('Password (6+ characters)', 'Mật khẩu (từ 6 ký tự)') + '</span><input type="password" id="suPw" required minlength="6" autocomplete="new-password"></label>' +
        '<div class="row"><button class="btn pri" type="submit">' + tr('Create account', 'Tạo tài khoản') + '</button></div></form>'
        :
        '<form id="fLogin" class="grid2" style="grid-template-columns:1fr">' +
        '<label class="f"><span>Email</span><input type="email" id="liEmail" required autocomplete="email"></label>' +
        '<label class="f"><span>' + tr('Password', 'Mật khẩu') + '</span><input type="password" id="liPw" required autocomplete="current-password"></label>' +
        '<div class="spread"><button class="btn pri" type="submit">' + tr('Sign in', 'Đăng nhập') + '</button>' +
        (S.mode === 'supabase' ? '<button type="button" class="linkbtn" id="forgot">' + tr('Forgot password?', 'Quên mật khẩu?') + '</button>' : '') + '</div></form>') +
      '</div><p class="small mut">' + tr('Just want to follow a tournament? No account needed: ', 'Chỉ muốn xem giải? Không cần tài khoản: ') + '<a href="event.html">' + tr('see live events', 'xem giải trực tiếp') + '</a>.</p></div>';
    var f = $id('fLogin');
    if (f) f.onsubmit = function (ev) {
      ev.preventDefault(); var b = f.querySelector('button[type=submit]'); busy(b, true);
      S.signIn(val('liEmail'), $id('liPw').value).then(function (m) { me = m; location.hash = ''; route(); }).catch(fail).then(function () { busy(b, false); });
    };
    var fg = $id('forgot');
    if (fg) fg.onclick = function () {
      var e = val('liEmail') || prompt('Email'); if (!e) return;
      S.resetPassword(e).then(function () { toast(tr('Check your email for a reset link.', 'Kiểm tra email để đặt lại mật khẩu.')); }).catch(fail);
    };
    var s = $id('fSignup');
    if (s) s.onsubmit = function (ev) {
      ev.preventDefault(); var b = s.querySelector('button[type=submit]'); busy(b, true);
      S.signUp({ email: val('suEmail'), password: $id('suPw').value, display_name: val('suName'), organization: val('suOrg'), country: val('suCountry') })
        .then(function (r) {
          if (r.needsConfirm) {
            app.innerHTML = '<div class="narrow card"><h2 class="t">' + tr('Check your email', 'Kiểm tra email') + '</h2><p>' +
              tr('We sent a confirmation link to ', 'Đã gửi link xác nhận tới ') + '<b>' + esc(val('suEmail') || '') + '</b>. ' +
              tr('After confirming, sign in here. SEPA will then review your account.', 'Sau khi xác nhận, quay lại đây đăng nhập. SEPA sẽ duyệt tài khoản của bạn.') + '</p></div>';
          } else return S.session().then(function (m) { me = m; location.hash = ''; route(); });
        }).catch(fail).then(function () { busy(b, false); });
    };
  }

  function renderPending() {
    var rej = me.profile.status === 'rejected';
    app.innerHTML = '<div class="narrow card"><h2 class="t">' + (rej ? tr('Account not approved', 'Tài khoản chưa được chấp nhận') : tr('Waiting for approval', 'Đang chờ duyệt')) + '</h2><p>' +
      (rej ? tr('SEPA did not approve this account. Contact SEPA if you think this is a mistake.', 'SEPA chưa chấp nhận tài khoản này. Liên hệ SEPA nếu bạn nghĩ có nhầm lẫn.')
        : tr('Your account was created. SEPA will review it shortly; you can create events once it is approved. Reload this page to check.', 'Tài khoản đã được tạo. SEPA sẽ sớm duyệt; sau khi được duyệt bạn có thể tạo giải. Tải lại trang để kiểm tra.')) +
      '</p><p class="small mut">' + esc(me.email) + ' · ' + esc(me.profile.organization || '') + '</p><a class="btn" href="#account">' + tr('Edit profile', 'Sửa hồ sơ') + '</a></div>';
  }

  function renderAccount() {
    var p = me.profile;
    app.innerHTML = '<div class="narrow"><div class="card"><h2 class="t">' + tr('Your profile', 'Hồ sơ của bạn') + '</h2><form id="fAcc" class="grid2" style="grid-template-columns:1fr">' +
      '<p class="small mut" style="margin:0">' + esc(me.email) + ' · <span class="pill s-' + esc(p.status) + '">' + esc(statusUser(p.status)) + '</span></p>' +
      '<label class="f"><span>' + tr('Your name', 'Họ tên') + '</span><input type="text" id="acName" value="' + esc(p.display_name) + '"></label>' +
      '<label class="f"><span>' + tr('School / organization', 'Trường / đơn vị') + '</span><input type="text" id="acOrg" value="' + esc(p.organization) + '"></label>' +
      '<label class="f"><span>' + tr('Country', 'Quốc gia') + '</span><input type="text" id="acCountry" value="' + esc(p.country) + '"></label>' +
      '<div class="row"><button class="btn pri" type="submit">' + tr('Save', 'Lưu') + '</button><a class="btn" href="#">' + tr('Back', 'Quay lại') + '</a></div></form></div>' +
      '<div class="card"><h3 style="margin-top:0">' + tr('Change password', 'Đổi mật khẩu') + '</h3><form id="fPw" class="row"><input type="password" id="newPw" minlength="6" autocomplete="new-password" style="flex:1" placeholder="' + esc(tr('New password', 'Mật khẩu mới')) + '"><button class="btn" type="submit">' + tr('Update', 'Cập nhật') + '</button></form></div></div>';
    $id('fAcc').onsubmit = function (ev) {
      ev.preventDefault();
      S.updateProfile({ display_name: val('acName'), organization: val('acOrg'), country: val('acCountry') })
        .then(S.session).then(function (m) { me = m; paintHeader(); toast(tr('Saved', 'Đã lưu')); }).catch(fail);
    };
    $id('fPw').onsubmit = function (ev) {
      ev.preventDefault(); var pw = $id('newPw').value;
      if (pw.length < 6) return toast(errText({ code: 'weak_password' }), true);
      S.updatePassword(pw).then(function () { $id('newPw').value = ''; toast(tr('Password updated', 'Đã đổi mật khẩu')); }).catch(fail);
    };
  }
  function statusUser(s) { return { pending: tr('Pending', 'Chờ duyệt'), approved: tr('Approved', 'Đã duyệt'), rejected: tr('Rejected', 'Từ chối') }[s] || s; }

  /* ---------- trang chủ: giải của tôi ---------- */
  function adminTabs(cur) {
    if (!isSA()) return '';
    return '<div class="tabs"><a href="#" ' + (cur === 'home' ? 'aria-current="page"' : '') + '>' + tr('My events', 'Giải của tôi') + '</a>' +
      '<a href="#admin/events" ' + (cur === 'events' ? 'aria-current="page"' : '') + '>' + tr('All events', 'Tất cả giải') + '</a>' +
      '<a href="#admin/users" ' + (cur === 'users' ? 'aria-current="page"' : '') + '>' + tr('Accounts', 'Tài khoản') + ' <span id="pendBadge"></span></a>' +
      '<a href="#admin/settings" ' + (cur === 'settings' ? 'aria-current="page"' : '') + '>' + tr('Approval settings', 'Cài đặt duyệt') + '</a></div>';
  }
  function pendingBadge() {
    if (!isSA()) return;
    S.listUsers().then(function (u) { var n = u.filter(function (x) { return x.status === 'pending'; }).length, b = $id('pendBadge'); if (b && n) b.innerHTML = '<span class="pill s-pending">' + n + '</span>'; });
  }
  function eventItem(e, href) {
    return '<a class="ev-item" href="' + href + '"><div style="min-width:0"><div class="t">' + esc(e.name) + '</div><div class="m"><span>' + esc(fmtDate(e.date)) + '</span>' +
      (e.location ? '<span>' + esc(e.location) + '</span>' : '') + '<span>' + esc(e.program) + '</span>' + (e.recf_code ? '<span class="code">' + esc(e.recf_code) + '</span>' : '') +
      (e.verified ? '<span style="color:var(--ok)">✓ ' + tr('Verified', 'Đã xác minh') + '</span>' : '') + '</div></div>' +
      '<span class="pill s-' + esc(e.status) + '">' + esc(statusName(e.status)) + '</span></a>';
  }
  function renderHome() {
    app.innerHTML = adminTabs('home') + '<div class="spread" style="margin-bottom:12px"><h2 class="t" style="margin:0">' + tr('My events', 'Giải của tôi') + '</h2><a class="btn acc" href="#new">+ ' + tr('New event', 'Tạo giải') + '</a></div><div id="myList" class="ev-list"><p class="empty">…</p></div>';
    pendingBadge();
    S.listMyEvents().then(function (list) {
      $id('myList').innerHTML = list.length ? list.map(function (e) { return eventItem(e, '#e/' + e.id); }).join('')
        : '<div class="card"><p style="margin:0">' + tr('You have not created any events yet. Start with ', 'Bạn chưa tạo giải nào. Bắt đầu bằng ') + '<a href="#new">' + tr('New event', 'Tạo giải') + '</a>.</p></div>';
    }).catch(fail);
  }

  /* ---------- form giải (tạo mới + tổng quan) ---------- */
  function eventForm(e) {
    var c = cfgOf(e || {}), g = (e && e.grades) || ['ES', 'MS'], prog = (e && e.program) || 'Engage';
    var gradeCk = ['ES', 'MS', 'HS', 'UNI'].map(function (x) { return '<label class="ck"><input type="checkbox" name="grade" value="' + x + '"' + (g.indexOf(x) >= 0 ? ' checked' : '') + '> ' + esc(gradeName(x)) + '</label>'; }).join(' ');
    return '<div class="grid2">' +
      '<label class="f" style="grid-column:1/-1"><span>' + tr('Event name', 'Tên giải') + ' *</span><input type="text" id="evName" required maxlength="200" value="' + esc(e ? e.name : '') + '"></label>' +
      '<label class="f"><span>' + tr('Program', 'Chương trình') + '</span><select id="evProg">' +
        '<option value="Engage"' + (prog === 'Engage' ? ' selected' : '') + '>RECF Engage (Tier Takeover)</option>' +
        '<option value="Custom"' + (prog !== 'Engage' ? ' selected' : '') + '>' + tr('Independent tournament (Engage format)', 'Giải tự tổ chức (thể thức Engage)') + '</option></select></label>' +
      '<label class="f"><span>' + tr('RECF event code (if listed on RECF Events)', 'Mã giải RECF (nếu có trên RECF Events)') + '</span><input type="text" id="evCode" placeholder="ENG2026xxxx" value="' + esc(e ? e.recf_code : '') + '"></label>' +
      '<label class="f"><span>' + tr('Date', 'Ngày thi') + '</span><input type="date" id="evDate" value="' + esc(e && e.date ? e.date : '') + '"></label>' +
      '<label class="f"><span>' + tr('End date (optional)', 'Ngày kết thúc (nếu nhiều ngày)') + '</span><input type="date" id="evEnd" value="' + esc(e && e.end_date ? e.end_date : '') + '"></label>' +
      '<label class="f"><span>' + tr('Venue / city', 'Địa điểm / thành phố') + '</span><input type="text" id="evLoc" value="' + esc(e ? e.location : '') + '"></label>' +
      '<label class="f"><span>' + tr('Country', 'Quốc gia') + '</span><input type="text" id="evCountry" value="' + esc(e ? e.country : (me.profile.country || 'Vietnam')) + '"></label>' +
      '<label class="f"><span>' + tr('Organizer', 'Đơn vị tổ chức') + '</span><input type="text" id="evOrg" value="' + esc(e ? e.organizer_name : (me.profile.organization || '')) + '"></label>' +
      '<div class="f"><span>' + tr('Grade levels', 'Cấp học') + '</span><div class="row">' + gradeCk + '</div></div>' +
      '</div><h3 class="t">' + tr('Match rules', 'Thông số thi đấu') + '</h3><div class="grid2">' +
      '<label class="f"><span>' + tr('Alliance matches per team', 'Số trận Alliance mỗi đội') + '</span><input type="number" id="cMpt" min="1" max="20" value="' + c.matchesPerTeam + '"><small>' + tr('RECF: 5–8 at qualifiers, 8–10 at championships (7.4.2)', 'RECF: 5–8 ở vòng loại, 8–10 ở championship (7.4.2)') + '</small></label>' +
      '<label class="f"><span>' + tr('Solo attempts per team', 'Số lượt Solo mỗi đội') + '</span><input type="number" id="cSolo" min="1" max="20" value="' + c.soloAttempts + '"><small>' + tr('RECF: 5 total, driving + coding (7.4.1)', 'RECF: tổng 5 lượt, driving + coding (7.4.1)') + '</small></label>' +
      '<label class="f"><span>' + tr('Alliance fields', 'Số sân Alliance') + '</span><input type="number" id="cFields" min="1" max="12" value="' + c.fields + '"></label>' +
      '<label class="f"><span>' + tr('First match at', 'Trận đầu lúc') + '</span><input type="time" id="cStart" value="' + esc(c.start) + '"></label>' +
      '<label class="f"><span>' + tr('Minutes per match cycle', 'Số phút mỗi lượt trận') + '</span><input type="number" id="cCycle" min="1" max="60" value="' + c.cycleMin + '"></label>' +
      '<label class="f"><span>' + tr('Min. rest between a team\'s matches (rounds)', 'Nghỉ tối thiểu giữa 2 trận của 1 đội (lượt)') + '</span><input type="number" id="cGap" min="0" max="10" value="' + c.minGap + '"></label>' +
      '<label class="ck" style="grid-column:1/-1"><input type="checkbox" id="cDrop"' + (c.dropLowest ? ' checked' : '') + '> ' + tr('Drop each team\'s lowest alliance score (7.4.2)', 'Bỏ trận Alliance thấp nhất của mỗi đội (7.4.2)') + '</label></div>';
  }
  function readEventForm() {
    var grades = Array.prototype.map.call(document.querySelectorAll('input[name=grade]:checked'), function (x) { return x.value; });
    return {
      name: val('evName'), program: val('evProg'), recf_code: val('evCode').toUpperCase(), date: val('evDate') || null, end_date: val('evEnd') || null,
      location: val('evLoc'), country: val('evCountry'), organizer_name: val('evOrg'), grades: grades.length ? grades : ['ES', 'MS'],
      config: { matchesPerTeam: num('cMpt', 6), soloAttempts: num('cSolo', 5), fields: num('cFields', 1), start: val('cStart') || '09:00', cycleMin: num('cCycle', 4), minGap: num('cGap', 1), dropLowest: $id('cDrop').checked }
    };
  }
  function renderNew() {
    app.innerHTML = '<h2 class="t">' + tr('New event', 'Tạo giải mới') + '</h2><form class="card" id="fNew">' + eventForm(null) +
      '<div class="row" style="margin-top:16px"><button class="btn acc" type="submit">' + tr('Create event', 'Tạo giải') + '</button><a class="btn" href="#">' + tr('Cancel', 'Huỷ') + '</a></div>' +
      '<p class="small mut">' + tr('The event starts as a draft that only you can see. Publish it from the Overview tab when ready.', 'Giải mới ở dạng nháp, chỉ bạn thấy. Công bố ở tab Tổng quan khi sẵn sàng.') + '</p></form>';
    $id('fNew').onsubmit = function (ev) {
      ev.preventDefault(); var f = readEventForm(); if (f.name.length < 2) return;
      var b = this.querySelector('button[type=submit]'); busy(b, true);
      S.createEvent(Object.assign(f, { status: 'draft' })).then(function (e) { toast(tr('Event created', 'Đã tạo giải')); go('#e/' + e.id + '/teams'); }).catch(fail).then(function () { busy(b, false); });
    };
  }

  /* ---------- không gian làm việc của 1 giải ---------- */
  var curTab = 'overview';
  function reload() { return S.getEvent(B.event.id).then(function (b) { B = b; }); }
  function openEvent(id, tab, cached) {
    curTab = tab;
    var p = cached && B && B.event.id === id ? Promise.resolve(B) : S.getEvent(id);
    p.then(function (b) {
      B = b;
      if (!B) { app.innerHTML = '<p class="empty">' + tr('Event not found, or you do not have access.', 'Không tìm thấy giải, hoặc bạn không có quyền.') + '</p>'; return; }
      var e = B.event, mine = e.owner === me.id || isSA();
      if (!mine) { app.innerHTML = '<p class="empty">' + tr('Only the organizer of this event can manage it.', 'Chỉ đơn vị tổ chức mới quản lý được giải này.') + ' <a href="event.html?id=' + esc(e.id) + '">' + tr('View public page', 'Xem trang công khai') + '</a></p>'; return; }
      app.innerHTML = '<div class="spread no-print"><div><a class="small mut" href="#">← ' + tr('My events', 'Giải của tôi') + '</a>' +
        '<h2 class="t" style="margin:4px 0 2px">' + esc(e.name) + '</h2><div class="small mut">' + esc(fmtDate(e.date)) + (e.location ? ' · ' + esc(e.location) : '') +
        ' · <span class="pill s-' + esc(e.status) + '">' + esc(statusName(e.status)) + '</span>' + (e.verified ? ' <span style="color:var(--ok)">✓ ' + tr('Verified by SEPA', 'SEPA đã xác minh') + '</span>' : '') + '</div></div>' +
        '<a class="btn" href="event.html?id=' + esc(e.id) + '" target="_blank" rel="noopener">' + tr('Public page ↗', 'Trang công khai ↗') + '</a></div>' +
        '<div class="tabs" role="tablist" style="margin-top:12px">' + TABS.map(function (t) {
          return '<a role="tab" href="#e/' + esc(e.id) + '/' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + esc(tr(t[1], t[2])) + '</a>'; }).join('') + '</div><div id="pane"></div>';
      (PANES[tab] || PANES.overview)();
    }).catch(fail);
  }
  function refresh() { return reload().then(function () { openEvent(B.event.id, curTab, true); }); }
  function pane(html) { $id('pane').innerHTML = html; }
  function qual() { return B.matches.filter(function (m) { return m.round === 'qual'; }).sort(function (a, b) { return a.num - b.num; }); }
  function finals() { return B.matches.filter(function (m) { return m.round === 'final'; }).sort(function (a, b) { return a.num - b.num; }); }
  function aRank() { return E.allianceRanking(B.teams, B.matches, Object.assign({ seed: B.event.id }, cfgOf(B.event))); }

  var PANES = {};

  PANES.overview = function () {
    var e = B.event, sc = qual().filter(function (m) { return m.score != null; }).length;
    var steps = [
      [B.teams.length > 0, tr('Add teams', 'Nhập đội'), 'teams', B.teams.length + ' ' + tr('teams', 'đội')],
      [qual().length > 0, tr('Generate the alliance schedule', 'Tạo lịch trận Alliance'), 'schedule', qual().length + ' ' + tr('matches', 'trận')],
      [e.status !== 'draft', tr('Publish so teams and parents can follow', 'Công bố để đội và phụ huynh theo dõi'), 'overview', statusName(e.status)],
      [qual().length > 0 && sc === qual().length, tr('Score all alliance matches', 'Chấm hết trận Alliance'), 'scoring', sc + '/' + qual().length],
      [finals().length > 0, tr('Run the finals', 'Đánh chung kết'), 'finals', finals().length + ' ' + tr('matches', 'trận')],
      [B.awards.length > 0, tr('Enter award winners', 'Nhập giải thưởng'), 'awards', B.awards.length + ''],
      [e.status === 'completed', tr('Mark completed and export results', 'Đánh dấu kết thúc và xuất kết quả'), 'export', '']
    ];
    pane('<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start"><div>' +
      '<div class="card"><h3 style="margin-top:0">' + tr('Visibility', 'Trạng thái công bố') + '</h3>' +
      '<div class="row"><select id="evStatus" style="width:auto">' + ['draft', 'published', 'live', 'completed'].map(function (s) { return '<option value="' + s + '"' + (e.status === s ? ' selected' : '') + '>' + esc(statusName(s)) + '</option>'; }).join('') + '</select>' +
      '<button class="btn pri" id="saveStatus" type="button">' + tr('Update', 'Cập nhật') + '</button></div>' +
      '<p class="small mut">' + tr('Draft: only you. Published / Live / Completed: anyone can see teams, schedule, scores and rankings on the public page.', 'Nháp: chỉ bạn thấy. Đã công bố / Đang diễn ra / Đã kết thúc: ai cũng xem được đội, lịch, điểm và xếp hạng ở trang công khai.') + '</p>' +
      (isSA() ? '<label class="ck"><input type="checkbox" id="evVerified"' + (e.verified ? ' checked' : '') + '> <b>' + tr('SEPA: verified, include in global rankings', 'SEPA: đã xác minh, tính vào xếp hạng toàn cầu') + '</b></label>' : '') +
      '</div><div class="card"><h3 style="margin-top:0">' + tr('Checklist', 'Các bước') + '</h3><ol style="margin:0;padding-left:20px">' + steps.map(function (s) {
        return '<li style="margin:4px 0">' + (s[0] ? '✅ ' : '⬜ ') + '<a href="#e/' + esc(e.id) + '/' + s[2] + '">' + esc(s[1]) + '</a>' + (s[3] ? ' <span class="small mut">(' + esc(s[3]) + ')</span>' : '') + '</li>'; }).join('') + '</ol></div></div>' +
      '<form class="card" id="fEv"><h3 style="margin-top:0">' + tr('Event details', 'Thông tin giải') + '</h3>' + eventForm(e) +
      '<div class="spread" style="margin-top:16px"><button class="btn pri" type="submit">' + tr('Save changes', 'Lưu thay đổi') + '</button><button class="btn danger" type="button" id="delEv">' + tr('Delete event', 'Xoá giải') + '</button></div></form></div>');
    $id('saveStatus').onclick = function () {
      var f = { status: val('evStatus') }; if (isSA()) f.verified = $id('evVerified').checked;
      S.updateEvent(e.id, f).then(function () { toast(tr('Saved', 'Đã lưu')); return refresh(); }).catch(fail);
    };
    $id('fEv').onsubmit = function (ev) {
      ev.preventDefault(); var f = readEventForm(); if (f.name.length < 2) return;
      S.updateEvent(e.id, f).then(function () { toast(tr('Saved', 'Đã lưu')); return refresh(); }).catch(fail);
    };
    $id('delEv').onclick = function () {
      var n = prompt(tr('This deletes the event with all teams, matches and scores. Type the event name to confirm:', 'Thao tác này xoá giải cùng toàn bộ đội, trận và điểm. Gõ tên giải để xác nhận:'));
      if (n == null) return;
      if (n.trim() !== e.name) return toast(tr('Name does not match. Nothing was deleted.', 'Tên không khớp. Chưa xoá gì.'), true);
      S.deleteEvent(e.id).then(function () { B = null; toast(tr('Event deleted', 'Đã xoá giải')); go('#'); }).catch(fail);
    };
  };

  PANES.teams = function () {
    var e = B.event, ci = B.teams.filter(function (t) { return t.checked_in; }).length, ins = B.teams.filter(function (t) { return t.inspected; }).length;
    var gOpt = function (sel) { return (e.grades || ['ES', 'MS']).concat(sel && (e.grades || []).indexOf(sel) < 0 ? [sel] : []).map(function (g) { return '<option value="' + g + '"' + (g === sel ? ' selected' : '') + '>' + esc(gradeName(g)) + '</option>'; }).join(''); };
    pane('<div class="card no-print"><h3 style="margin-top:0">' + tr('Add teams', 'Thêm đội') + '</h3>' +
      '<p class="small mut" style="margin-top:0">' + tr('One team per line: <code>team number, team name, school, grade (ES/MS/HS/UNI), country</code>. Only the team number is required. You can paste straight from Excel or Google Sheets.',
        'Mỗi dòng 1 đội: <code>mã đội, tên đội, trường, cấp (ES/MS/HS/UNI), quốc gia</code>. Chỉ mã đội là bắt buộc. Có thể dán thẳng từ Excel hoặc Google Sheets.') + '</p>' +
      '<textarea id="tmPaste" placeholder="VN1234A, Sao Mai, Trường TH Kim Liên, ES&#10;VN5678B, Rồng Xanh, Trường THCS Giảng Võ, MS"></textarea>' +
      '<div class="row" style="margin-top:8px"><label class="f" style="flex-direction:row;align-items:center;gap:6px"><span>' + tr('Default grade', 'Cấp mặc định') + '</span><select id="tmGrade" style="width:auto">' + gOpt((e.grades || ['ES'])[0]) + '</select></label>' +
      '<button class="btn pri" id="tmAdd" type="button">' + tr('Add teams', 'Thêm đội') + '</button>' +
      '<span class="mut small">' + tr('or', 'hoặc') + '</span><input type="text" id="tmCode" placeholder="' + esc(tr('RECF event code', 'Mã giải RECF')) + '" value="' + esc(e.recf_code) + '" style="width:170px">' +
      '<button class="btn" id="tmRecf" type="button">' + tr('Import registered teams from RECF Events', 'Lấy đội đã đăng ký trên RECF Events') + '</button></div></div>' +
      '<div class="spread" style="margin:4px 0 8px"><b>' + B.teams.length + ' ' + tr('teams', 'đội') + '</b><span class="small mut">' + tr('Checked in', 'Đã check-in') + ': ' + ci + ' · ' + tr('Inspected', 'Đã kiểm tra robot') + ': ' + ins + '</span></div>' +
      (B.teams.length ? '<div class="tbl"><table><thead><tr><th>' + tr('Team #', 'Mã đội') + '</th><th>' + tr('Team name', 'Tên đội') + '</th><th>' + tr('School', 'Trường') + '</th><th>' + tr('Grade', 'Cấp') + '</th>' +
        '<th class="c" title="7.2.1">' + tr('Check-in', 'Check-in') + '</th><th class="c" title="7.2.2">' + tr('Inspected', 'Kiểm tra') + '</th><th class="c" title="7.2.6">' + tr('Not in finals', 'Không vào CK') + '</th><th></th></tr></thead><tbody>' +
        B.teams.map(function (t) {
          return '<tr data-team="' + esc(t.number) + '"><td><input type="text" class="code" data-f="number" value="' + esc(t.number) + '" style="width:110px"></td>' +
            '<td><input type="text" data-f="name" value="' + esc(t.name) + '"></td><td><input type="text" data-f="org" value="' + esc(t.org) + '"></td>' +
            '<td><select data-f="grade" class="st">' + gOpt(t.grade) + '</select></td>' +
            '<td class="c"><input type="checkbox" data-f="checked_in"' + (t.checked_in ? ' checked' : '') + '></td><td class="c"><input type="checkbox" data-f="inspected"' + (t.inspected ? ' checked' : '') + '></td>' +
            '<td class="c"><input type="checkbox" data-f="excluded"' + (t.excluded ? ' checked' : '') + '></td>' +
            '<td><button class="btn sm danger" data-del="' + esc(t.number) + '" type="button" aria-label="' + esc(tr('Remove', 'Xoá')) + '">✕</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">' + tr('No teams yet.', 'Chưa có đội nào.') + '</p>'));
    $id('tmAdd').onclick = function () {
      var r = E.parseTeams($id('tmPaste').value, { grade: val('tmGrade'), country: e.country });
      if (!r.teams.length) return toast(tr('No valid team numbers found.', 'Không tìm thấy mã đội hợp lệ.'), true);
      S.upsertTeams(e.id, r.teams).then(function () {
        toast(tr('Added ', 'Đã thêm ') + r.teams.length + tr(' teams', ' đội') + (r.badLines.length ? tr('. Skipped lines: ', '. Bỏ qua dòng: ') + r.badLines.join(', ') : ''), !!r.badLines.length);
        return refresh();
      }).catch(fail);
    };
    $id('tmRecf').onclick = function () {
      var code = val('tmCode').toUpperCase(); if (!code) return;
      fetch('events.json').then(function (r) { return r.json(); }).then(function (d) {
        var x = d.events.find(function (v) { return v.code === code; });
        if (!x) return toast(tr('Event code not found in the RECF list.', 'Không tìm thấy mã giải trong danh sách RECF.'), true);
        if (!(x.teams || []).length) return toast(tr('No teams have registered for this event on RECF Events yet.', 'Chưa có đội nào đăng ký giải này trên RECF Events.'), true);
        var list = x.teams.map(function (t) { return { number: String(t[0]).replace(/^[A-Za-z]+_/, '').toUpperCase().replace(/[^A-Z0-9_-]/g, ''), name: t[1] || '', org: t[2] || '', grade: val('tmGrade'), country: x.country || e.country }; })
          .filter(function (t) { return /^[A-Z0-9_-]{2,20}$/.test(t.number); });
        return S.upsertTeams(e.id, list).then(function () {
          var p = e.recf_code ? null : S.updateEvent(e.id, { recf_code: code });
          toast(tr('Imported ', 'Đã lấy ') + list.length + tr(' teams from RECF Events', ' đội từ RECF Events')); return Promise.resolve(p).then(refresh);
        });
      }).catch(fail);
    };
    var tb = app.querySelector('#pane tbody');
    if (tb) {
      tb.addEventListener('change', function (ev) {
        var el = ev.target, tr_ = el.closest('tr'), f = el.dataset.f; if (!f) return;
        var v = el.type === 'checkbox' ? el.checked : el.value.trim(), patch = {};
        if (f === 'number') { v = v.toUpperCase(); if (v === tr_.dataset.team) return; }
        patch[f] = v;
        S.updateTeam(e.id, tr_.dataset.team, patch).then(function () {
          if (f === 'number') return refresh();
          return reload().then(function () { toast(tr('Saved', 'Đã lưu')); });
        }).catch(function (x) { fail(x); refresh(); });
      });
      tb.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-del]'); if (!b) return;
        if (!confirm(tr('Remove team ', 'Xoá đội ') + b.dataset.del + '?')) return;
        S.deleteTeam(e.id, b.dataset.del).then(refresh).catch(fail);
      });
    }
  };


  PANES.schedule = function () {
    var e = B.event, c = cfgOf(e), q = qual(), scored = q.filter(function (m) { return m.score != null; }).length;
    var ready = B.teams.filter(function (t) { return t.checked_in && t.inspected; }).length;
    pane('<div class="card no-print"><h3 style="margin-top:0">' + tr('Generate alliance schedule', 'Tạo lịch trận Alliance') + '</h3>' +
      '<p class="small mut" style="margin-top:0">' + tr('Random schedule following rule 7.4.2: every team plays the same number of counted matches with 2 teams per match. The software avoids repeat partners, back-to-back matches, and balances red/blue. If the total is odd, one team plays an extra match marked * that does not count.',
        'Lịch ngẫu nhiên theo luật 7.4.2: mỗi đội đánh cùng số trận tính điểm, mỗi trận 2 đội. Phần mềm tránh gặp lại đồng đội, tránh đánh 2 trận liền nhau và cân bằng đỏ/xanh. Nếu tổng số chỗ lẻ, 1 đội đánh thêm 1 trận đánh dấu * (không tính điểm).') + '</p>' +
      '<div class="grid2"><label class="f"><span>' + tr('Matches per team', 'Số trận mỗi đội') + '</span><input type="number" id="sMpt" min="1" max="20" value="' + c.matchesPerTeam + '"></label>' +
      '<label class="f"><span>' + tr('Fields', 'Số sân') + '</span><input type="number" id="sFields" min="1" max="12" value="' + c.fields + '"></label>' +
      '<label class="f"><span>' + tr('First match at', 'Trận đầu lúc') + '</span><input type="time" id="sStart" value="' + esc(c.start) + '"></label>' +
      '<label class="f"><span>' + tr('Minutes per cycle', 'Phút mỗi lượt') + '</span><input type="number" id="sCycle" min="1" max="60" value="' + c.cycleMin + '"></label>' +
      '<label class="f"><span>' + tr('Min. rest (rounds)', 'Nghỉ tối thiểu (lượt)') + '</span><input type="number" id="sGap" min="0" max="10" value="' + c.minGap + '"></label></div>' +
      '<label class="ck" style="margin-top:10px"><input type="checkbox" id="sReady"' + (ready && ready < B.teams.length ? ' checked' : '') + '> ' +
        tr('Only teams that are checked in and inspected (7.2.3)', 'Chỉ đội đã check-in và đã kiểm tra robot (7.2.3)') + ' <span class="mut">(' + ready + '/' + B.teams.length + ')</span></label>' +
      '<div class="row" style="margin-top:12px"><button class="btn acc" id="genSch" type="button">' + (q.length ? tr('Regenerate schedule', 'Tạo lại lịch') : tr('Generate schedule', 'Tạo lịch')) + '</button>' +
      (q.length ? '<button class="btn danger" id="clrSch" type="button">' + tr('Clear schedule', 'Xoá lịch') + '</button><button class="btn" type="button" onclick="window.print()">' + tr('Print', 'In lịch') + '</button>' : '') +
      '<span id="schStats" class="small mut"></span></div></div>' +
      '<div class="spread no-print" style="margin:4px 0 8px"><b>' + q.length + ' ' + tr('qualification matches', 'trận vòng loại') + '</b><input type="search" id="schFind" placeholder="' + esc(tr('Find team…', 'Tìm đội…')) + '" style="width:200px"></div>' +
      '<h2 class="t" style="display:none">' + esc(e.name) + '</h2><div id="schTable">' + matchTable(q) + '</div>');
    function save(list) {
      return S.replaceMatches(e.id, 'qual', list).then(function () {
        return S.updateEvent(e.id, { config: Object.assign({}, e.config, { matchesPerTeam: num('sMpt', 6), fields: num('sFields', 1), start: val('sStart') || '09:00', cycleMin: num('sCycle', 4), minGap: num('sGap', 1) }) });
      });
    }
    $id('genSch').onclick = function () {
      var pool = $id('sReady').checked ? B.teams.filter(function (t) { return t.checked_in && t.inspected; }) : B.teams;
      if (pool.length < 2) return toast(tr('Need at least 2 teams.', 'Cần ít nhất 2 đội.'), true);
      if (scored && !confirm(tr('This erases ', 'Thao tác này xoá ') + scored + tr(' scored matches. Continue?', ' trận đã chấm điểm. Tiếp tục?'))) return;
      if (!scored && q.length && !confirm(tr('Replace the current schedule?', 'Thay lịch hiện tại?'))) return;
      var b = this; busy(b, true); $id('schStats').textContent = tr('Generating…', 'Đang tạo…');
      setTimeout(function () {
        var r = E.schedule(pool.map(function (t) { return t.number; }), { matchesPerTeam: num('sMpt', 6), fields: num('sFields', 1), start: val('sStart') || '09:00', cycleMin: num('sCycle', 4), minGap: num('sGap', 1) });
        save(r.matches).then(function () {
          toast(tr('Schedule created: ', 'Đã tạo lịch: ') + r.matches.length + tr(' matches', ' trận') + ' · ' + tr('repeat partners', 'gặp lại đồng đội') + ': ' + r.stats.repeats + ' · ' + tr('short rests', 'nghỉ thiếu') + ': ' + r.stats.shortRest);
          return refresh();
        }).catch(fail).then(function () { busy(b, false); });
      }, 30);
    };
    var clr = $id('clrSch');
    if (clr) clr.onclick = function () {
      if (!confirm(scored ? tr('Delete the schedule and ', 'Xoá lịch và ') + scored + tr(' scored matches?', ' trận đã chấm?') : tr('Delete the schedule?', 'Xoá lịch?'))) return;
      S.replaceMatches(e.id, 'qual', []).then(refresh).catch(fail);
    };
    $id('schFind').oninput = function () {
      var s = this.value.trim().toUpperCase();
      document.querySelectorAll('#schTable tbody tr').forEach(function (r) { r.hidden = !!s && r.dataset.hl.indexOf(s) < 0; });
    };
  };

  /* Dòng nhập điểm dùng chung cho vòng loại và chung kết */
  function scoreRows(list, isFinal) {
    var opt = function (v) {
      return '<option value="ok"' + (v === 'ok' ? ' selected' : '') + '>✓</option><option value="red"' + (v === 'red' ? ' selected' : '') + '>' + tr('Red card', 'Thẻ đỏ') + '</option>' +
        (isFinal ? '' : '<option value="absent"' + (v === 'absent' ? ' selected' : '') + '>' + tr('Absent', 'Vắng') + '</option>');
    };
    return '<div class="tbl"><table><thead><tr><th>#</th><th class="hide-sm">' + tr('Time', 'Giờ') + '</th><th>' + tr('Red', 'Đỏ') + '</th><th>' + tr('Blue', 'Xanh') + '</th><th class="n">' + tr('Score', 'Điểm') + '</th>' +
      (isFinal ? '<th class="n" title="5.1.4">' + tr('Stop time', 'Stop time') + '</th>' : '') + '</tr></thead><tbody>' +
      list.map(function (m) {
        return '<tr data-id="' + esc(m.id) + '" data-hl="' + esc(m.red + ' ' + m.blue) + '"' + (m.score != null ? ' class="done"' : '') + '><td class="code">' + (isFinal ? 'F' : 'Q') + m.num + '</td><td class="hide-sm small">' + [m.time ? esc(m.time) : '', m.field ? tr('Field ', 'Sân ') + esc(m.field) : ''].filter(Boolean).join(' · ') + '</td>' +
          '<td>' + teamCell(m.red, 'red', m.red_counts) + '<br><select class="st" data-f="red_status" aria-label="' + esc(tr('Red team status', 'Trạng thái đội đỏ')) + '">' + opt(m.red_status) + '</select></td>' +
          '<td>' + teamCell(m.blue, 'blue', m.blue_counts) + '<br><select class="st" data-f="blue_status" aria-label="' + esc(tr('Blue team status', 'Trạng thái đội xanh')) + '">' + opt(m.blue_status) + '</select></td>' +
          '<td class="n"><div class="sc"><input type="number" inputmode="numeric" min="0" class="score-in" data-f="score" value="' + (m.score == null ? '' : m.score) + '" aria-label="' + esc(tr('Score', 'Điểm')) + '">' +
          (isFinal ? '' : '<button class="btn sm pri" data-save type="button">' + tr('Save', 'Lưu') + '</button>') + '</div></td>' +
          (isFinal ? '<td class="n"><div class="sc"><input type="number" inputmode="numeric" min="0" max="60" class="stop-in" data-f="stop_time" value="' + (m.stop_time == null ? '' : m.stop_time) + '" aria-label="Stop time"><button class="btn sm pri" data-save type="button">' + tr('Save', 'Lưu') + '</button></div></td>' : '') +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function bindScoreRows(root, after) {
    function saveRow(row) {
      var g = function (f) { var el = row.querySelector('[data-f=' + f + ']'); return el ? el.value.trim() : undefined; };
      var sc = g('score'), st = g('stop_time');
      if (sc !== '' && (!/^\d+$/.test(sc))) return toast(errText({ code: 'bad_score' }), true);
      var patch = { score: sc === '' ? null : +sc, red_status: g('red_status'), blue_status: g('blue_status') };
      if (st !== undefined) patch.stop_time = st === '' ? null : Math.max(0, Math.min(60, +st));
      var b = row.querySelector('[data-save]'); busy(b, true);
      return S.updateMatch(row.dataset.id, patch).then(function () {
        var m = B.matches.find(function (x) { return x.id === row.dataset.id; }); Object.assign(m, patch);
        row.classList.toggle('done', patch.score != null); toast(tr('Saved ', 'Đã lưu ') + row.cells[0].textContent);
        var nx = row.nextElementSibling; while (nx && nx.hidden) nx = nx.nextElementSibling;
        var inp = nx && nx.querySelector('.score-in'); if (inp && patch.score != null) inp.focus();
        if (after) after();
      }).catch(fail).then(function () { busy(b, false); });
    }
    root.addEventListener('click', function (ev) { var b = ev.target.closest('[data-save]'); if (b) saveRow(b.closest('tr')); });
    root.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.matches('input')) { ev.preventDefault(); saveRow(ev.target.closest('tr')); } });
  }

  PANES.scoring = function () {
    var q = qual();
    if (!q.length) return pane('<p class="empty">' + tr('Generate the schedule first.', 'Hãy tạo lịch trận trước.') + ' <a href="#e/' + esc(B.event.id) + '/schedule">' + tr('Schedule', 'Lịch trận') + '</a></p>');
    var done = q.filter(function (m) { return m.score != null; }).length;
    pane('<div class="banner info small">' + tr('Enter the shared alliance score after each match, confirmed with both drive teams (7.2.5). A red card or absence gives that team 0; the partner keeps the score (1.6.3, 5.2.1). Press Enter to save and jump to the next match.',
        'Nhập điểm chung của trận sau khi xác nhận với 2 đội (7.2.5). Thẻ đỏ hoặc vắng mặt: đội đó 0 điểm, đội cùng trận giữ nguyên điểm (1.6.3, 5.2.1). Nhấn Enter để lưu và chuyển trận kế tiếp.') + '</div>' +
      '<div class="spread" style="margin-bottom:8px"><b id="scProg">' + done + '/' + q.length + ' ' + tr('scored', 'đã chấm') + '</b><div class="row"><label class="ck"><input type="checkbox" id="onlyOpen"> ' + tr('Unscored only', 'Chỉ trận chưa chấm') + '</label>' +
      '<input type="search" id="scFind" placeholder="' + esc(tr('Find team…', 'Tìm đội…')) + '" style="width:170px"></div></div><div id="scRows">' + scoreRows(q, false) + '</div>');
    function filt() {
      var s = val('scFind').toUpperCase(), only = $id('onlyOpen').checked;
      document.querySelectorAll('#scRows tbody tr').forEach(function (r) { r.hidden = (!!s && r.dataset.hl.indexOf(s) < 0) || (only && r.classList.contains('done')); });
    }
    $id('scFind').oninput = filt; $id('onlyOpen').onchange = filt;
    bindScoreRows($id('scRows'), function () { var d = qual().filter(function (m) { return m.score != null; }).length; $id('scProg').textContent = d + '/' + q.length + ' ' + tr('scored', 'đã chấm'); });
  };

  PANES.solo = function () {
    var e = B.event, lim = cfgOf(e).soloAttempts, rk = E.soloRanking(B.solo);
    var used = {}; B.solo.forEach(function (r) { used[r.team] = (used[r.team] || 0) + 1; });
    pane('<div class="card no-print"><h3 style="margin-top:0">' + tr('Record a solo match', 'Ghi điểm trận Solo') + '</h3>' +
      '<p class="small mut" style="margin-top:0">' + tr('Solo matches are not scheduled. Each team has ', 'Trận Solo không xếp lịch. Mỗi đội có ') + lim + tr(' attempts in total, split between driving and coding as they like (7.4.1).', ' lượt, tự chia giữa driving và coding (7.4.1).') + '</p>' +
      '<form id="fSolo" class="row"><input type="text" id="soTeam" list="teamList" placeholder="' + esc(tr('Team #', 'Mã đội')) + '" style="width:140px" required autocomplete="off">' +
      '<datalist id="teamList">' + B.teams.map(function (t) { return '<option value="' + esc(t.number) + '">' + esc(t.name) + '</option>'; }).join('') + '</datalist>' +
      '<select id="soKind" style="width:auto"><option value="driving">' + tr('Driving', 'Driving (lái)') + '</option><option value="coding">' + tr('Coding', 'Coding (lập trình)') + '</option></select>' +
      '<input type="number" id="soScore" min="0" inputmode="numeric" placeholder="' + esc(tr('Score', 'Điểm')) + '" style="width:100px" required>' +
      '<input type="number" id="soStop" min="0" max="60" inputmode="numeric" placeholder="' + esc(tr('Stop time (s)', 'Stop time (giây)')) + '" style="width:140px" title="3.3.6">' +
      '<button class="btn acc" type="submit">' + tr('Add', 'Thêm') + '</button><span id="soLeft" class="small mut"></span></form></div>' +
      '<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start"><div><h3 class="t">' + tr('Solo rankings (3.5)', 'Xếp hạng Solo (3.5)') + '</h3>' + soloTable(rk, lim) + '</div>' +
      '<div><h3 class="t">' + tr('All solo runs', 'Tất cả lượt Solo') + ' (' + B.solo.length + ')</h3>' + (B.solo.length ? '<div class="tbl"><table><thead><tr><th>' + tr('Team', 'Đội') + '</th><th>' + tr('Type', 'Loại') + '</th><th class="n">' + tr('Score', 'Điểm') + '</th><th class="n">Stop</th><th></th></tr></thead><tbody>' +
        B.solo.slice().reverse().map(function (r) { return '<tr><td class="code">' + esc(r.team) + '</td><td>' + (r.kind === 'coding' ? 'Coding' : 'Driving') + '</td><td class="n">' + r.score + '</td><td class="n">' + (r.stop_time == null ? '' : r.stop_time) + '</td><td><button class="btn sm danger" data-del="' + esc(r.id) + '" type="button">✕</button></td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="empty">' + tr('No solo runs yet.', 'Chưa có lượt Solo nào.') + '</p>') + '</div></div>');
    $id('soTeam').oninput = function () { var t = this.value.trim().toUpperCase(); $id('soLeft').textContent = B.teams.some(function (x) { return x.number === t; }) ? tr('Attempts left: ', 'Còn ') + (lim - (used[t] || 0)) + tr('', ' lượt') : ''; };
    $id('fSolo').onsubmit = function (ev) {
      ev.preventDefault(); var t = val('soTeam').toUpperCase();
      if (!B.teams.some(function (x) { return x.number === t; })) return toast(tr('Unknown team ', 'Không có đội ') + t, true);
      var st = val('soStop');
      S.addSolo(e.id, { team: t, kind: val('soKind'), score: num('soScore', 0), stop_time: st === '' ? null : +st }).then(function () {
        toast(tr('Saved', 'Đã lưu')); return refresh();
      }).then(function () { $id('soTeam').focus(); }).catch(fail);
    };
    app.querySelector('#pane').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-del]'); if (!b || !confirm(tr('Delete this solo run?', 'Xoá lượt Solo này?'))) return;
      S.deleteSolo(b.dataset.del).then(refresh).catch(fail);
    });
  };
  PANES.rankings = function () {
    pane('<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start"><div><h3 class="t">' + tr('Alliance rankings (7.4.4)', 'Xếp hạng Alliance (7.4.4)') + '</h3>' + allianceTable(aRank(), E.redCards(B.matches)) +
      '<p class="small mut">' + tr('Average of alliance scores after dropping the lowest. Ties: 2nd, 3rd, 4th highest score, then a random draw.', 'Trung bình điểm Alliance sau khi bỏ trận thấp nhất. Bằng điểm: so điểm cao thứ 2, 3, 4, rồi bốc thăm.') + '</p></div>' +
      '<div><h3 class="t">' + tr('Solo rankings (3.5)', 'Xếp hạng Solo (3.5)') + '</h3>' + soloTable(E.soloRanking(B.solo), cfgOf(B.event).soloAttempts) + '</div></div>');
  };

  PANES.finals = function () {
    var e = B.event, rk = aRank(), el = E.finalsEligible(rk, B.teams, B.matches, cfgOf(e)), fm = finals(), res = E.finalsResult(B.matches);
    var maxA = Math.floor(el.length / 2), open = qual().filter(function (m) { return m.score == null; }).length;
    var out = '';
    if (res.champion) out += '<div class="champ">🏆 ' + tr('Tournament Champions', 'Vô địch giải') + ': <b>' + esc(res.champion.red) + ' + ' + esc(res.champion.blue) + '</b></div>';
    else if (res.tied.length) out += '<div class="banner err">' + tr('Tie for first place between ', 'Hoà hạng nhất giữa ') + res.tied.map(function (a) { return '<b>' + esc(a.red + ' + ' + a.blue) + '</b>'; }).join(', ') +
      '. ' + tr('Play a tiebreaker round (7.4.4).', 'Đánh vòng tiebreak (7.4.4).') + ' <button class="btn sm acc" id="addTb" type="button">' + tr('Add tiebreaker matches', 'Thêm trận tiebreak') + '</button></div>';
    out += '<div class="card no-print"><h3 style="margin-top:0">' + tr('Create finals', 'Tạo chung kết') + '</h3>' +
      (open ? '<p class="banner err small">' + open + tr(' qualification matches are not scored yet.', ' trận vòng loại chưa có điểm.') + '</p>' : '') +
      '<p class="small mut" style="margin-top:0">' + tr('Teams are paired from the top of the alliance rankings: #1 + #2, #3 + #4… Teams marked "Not in finals" or with 3+ red cards are skipped (1.6.4, 7.2.6). Finals are played one at a time, starting with the lowest-ranked alliance; the highest score wins.',
        'Ghép đội từ trên xuống theo xếp hạng Alliance: hạng 1 + 2, 3 + 4… Bỏ qua đội đánh dấu "Không vào CK" hoặc có từ 3 thẻ đỏ (1.6.4, 7.2.6). Chung kết đánh lần lượt từng trận, bắt đầu từ liên minh hạng thấp nhất; điểm cao nhất vô địch.') + '</p>' +
      '<div class="row"><label class="f" style="flex-direction:row;align-items:center;gap:6px"><span>' + tr('Number of alliances', 'Số liên minh') + '</span><input type="number" id="nAll" min="1" max="' + maxA + '" value="' + maxA + '" style="width:80px"></label>' +
      '<span class="small mut">' + tr('max ', 'tối đa ') + maxA + ' (' + el.length + tr(' eligible teams', ' đội đủ điều kiện') + ')</span>' +
      '<button class="btn acc" id="genF" type="button"' + (maxA < 1 ? ' disabled' : '') + '>' + (fm.length ? tr('Recreate finals', 'Tạo lại chung kết') : tr('Create finals matches', 'Tạo các trận chung kết')) + '</button></div></div>';
    out += fm.length ? '<h3 class="t">' + tr('Finals matches', 'Các trận chung kết') + '</h3><div class="banner info small">' + tr('A red card in a finals match gives the whole alliance 0 (1.6.3). Stop time is only used for a second tiebreaker round.', 'Thẻ đỏ ở chung kết: cả liên minh 0 điểm (1.6.3). Stop time chỉ dùng cho vòng tiebreak thứ 2.') + '</div><div id="fRows">' + scoreRows(fm, true) + '</div>' : '';
    pane(out);
    $id('genF').onclick = function () {
      var n = Math.max(1, Math.min(maxA, num('nAll', maxA)));
      if (fm.some(function (m) { return m.score != null; }) && !confirm(tr('This erases scored finals matches. Continue?', 'Thao tác này xoá các trận chung kết đã chấm. Tiếp tục?'))) return;
      var list = E.finalsMatches(el, n);
      S.replaceMatches(e.id, 'final', list).then(function () { toast(list.length + tr(' finals matches created', ' trận chung kết đã tạo')); return refresh(); }).catch(fail);
    };
    var tb = $id('addTb');
    if (tb) tb.onclick = function () {
      var n = fm.length ? Math.max.apply(null, fm.map(function (m) { return m.num; })) : 0;
      var adds = res.tied.slice().reverse().map(function (a, i) {
        var o = fm.find(function (m) { return m.red === a.red && m.blue === a.blue; });
        return { round: 'final', num: n + i + 1, field: '1', red: a.red, blue: a.blue, seed: o && o.seed };
      });
      adds.reduce(function (p, m) { return p.then(function () { return S.addMatch(e.id, m); }); }, Promise.resolve()).then(refresh).catch(fail);
    };
    if ($id('fRows')) bindScoreRows($id('fRows'), function () { refresh(); });
  };

  PANES.awards = function () {
    var e = B.event, auto = E.performanceAwards(B.matches, B.solo), conf = E.awardConflicts(B.awards);
    pane('<div class="card no-print"><h3 style="margin-top:0">' + tr('Add award winner', 'Thêm đội đoạt giải') + '</h3>' +
      '<p class="small mut" style="margin-top:0">' + tr('Judges pick winners using the RECF Guide to Judging. A team can receive at most one judged award (6.3). Performance awards (Tournament Champions, Solo Match Champion) are added automatically from scores (7.2.7).',
        'Giám khảo chọn đội theo RECF Guide to Judging. Mỗi đội nhận tối đa 1 giải do giám khảo chấm (6.3). Giải thành tích (Vô địch giải, Vô địch Solo) được tự động thêm từ điểm số (7.2.7).') + '</p>' +
      '<form id="fAw" class="row"><input type="text" id="awTeam" list="teamList2" placeholder="' + esc(tr('Team #', 'Mã đội')) + '" style="width:140px" required autocomplete="off">' +
      '<datalist id="teamList2">' + B.teams.map(function (t) { return '<option value="' + esc(t.number) + '">' + esc(t.name) + '</option>'; }).join('') + '</datalist>' +
      '<input type="text" id="awName" list="awList" placeholder="' + esc(tr('Award', 'Giải thưởng')) + '" style="flex:1;min-width:180px" required>' +
      '<datalist id="awList">' + E.JUDGED_AWARDS.map(function (a) { return '<option value="' + esc(a) + '">'; }).join('') + '</datalist>' +
      '<label class="ck"><input type="checkbox" id="awJudged" checked> ' + tr('Judged award', 'Giải giám khảo') + '</label><button class="btn acc" type="submit">' + tr('Add', 'Thêm') + '</button></form></div>' +
      (conf.length ? '<div class="banner err">' + tr('These teams have more than one judged award: ', 'Các đội sau có nhiều hơn 1 giải giám khảo: ') + esc(conf.join(', ')) + '</div>' : '') +
      '<div class="tbl"><table><thead><tr><th>' + tr('Award', 'Giải thưởng') + '</th><th>' + tr('Team', 'Đội') + '</th><th>' + tr('Type', 'Loại') + '</th><th></th></tr></thead><tbody>' +
      auto.map(function (a) { return '<tr><td><b>' + esc(a.name) + '</b></td><td>' + teamCell(a.team, 'x') + '</td><td class="small mut">' + tr('Performance (automatic)', 'Thành tích (tự động)') + '</td><td></td></tr>'; }).join('') +
      B.awards.map(function (a) { return '<tr><td><b>' + esc(a.name) + '</b></td><td>' + teamCell(a.team, 'x') + '</td><td class="small mut">' + (a.judged ? tr('Judged', 'Giám khảo') : tr('Other', 'Khác')) + '</td><td><button class="btn sm danger" data-del="' + esc(a.id) + '" type="button">✕</button></td></tr>'; }).join('') +
      (auto.length + B.awards.length ? '' : '<tr><td colspan="4" class="empty">' + tr('No awards yet.', 'Chưa có giải thưởng.') + '</td></tr>') + '</tbody></table></div>');
    $id('fAw').onsubmit = function (ev) {
      ev.preventDefault(); var t = val('awTeam').toUpperCase();
      if (!B.teams.some(function (x) { return x.number === t; })) return toast(tr('Unknown team ', 'Không có đội ') + t, true);
      S.addAward(e.id, { team: t, name: val('awName'), judged: $id('awJudged').checked }).then(function () { toast(tr('Saved', 'Đã lưu')); return refresh(); }).catch(fail);
    };
    app.querySelector('#pane').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-del]'); if (!b || !confirm(tr('Delete this award?', 'Xoá giải thưởng này?'))) return;
      S.deleteAward(b.dataset.del).then(refresh).catch(fail);
    });
  };

  PANES.export = function () {
    var e = B.event, rows = E.resultRows(e, B.teams, B.matches, B.solo, B.awards);
    pane('<div class="card"><h3 style="margin-top:0">' + tr('Results file', 'File kết quả') + '</h3>' +
      '<p>' + tr('Download all scores and awards as a CSV in the EventSTEM results format (', 'Tải toàn bộ điểm và giải thưởng thành file CSV theo mẫu kết quả EventSTEM (') + '<code>results/_MAU_KET_QUA.csv</code>). ' + rows.length + tr(' rows.', ' dòng.') + '</p>' +
      '<p class="small mut">' + (e.verified ? tr('This event is verified by SEPA, so its results already appear in the global rankings automatically.', 'Giải đã được SEPA xác minh nên kết quả đã tự vào xếp hạng toàn cầu.')
        : tr('Once SEPA verifies this event, its results appear in the global rankings automatically. You can also send this file to SEPA.', 'Khi SEPA xác minh giải này, kết quả sẽ tự vào xếp hạng toàn cầu. Bạn cũng có thể gửi file này cho SEPA.')) + '</p>' +
      '<div class="row"><button class="btn acc" id="dlCsv" type="button">' + tr('Download CSV', 'Tải CSV') + '</button>' +
      (e.status !== 'completed' ? '<button class="btn" id="markDone" type="button">' + tr('Mark event completed', 'Đánh dấu giải đã kết thúc') + '</button>' : '') + '</div></div>');
    $id('dlCsv').onclick = function () {
      var blob = new Blob(['﻿' + E.toCSV(rows)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (e.recf_code || e.name.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'event') + '.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };
    var md = $id('markDone'); if (md) md.onclick = function () { S.updateEvent(e.id, { status: 'completed' }).then(refresh).catch(fail); };
  };

  /* ---------- SEPA ---------- */
  function renderAdmin(tab) {
    app.innerHTML = adminTabs(tab) + '<div id="adm"><p class="empty">…</p></div>';
    pendingBadge();
    if (tab === 'users') S.listUsers().then(function (us) {
      us.sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1); });
      $id('adm').innerHTML = '<div class="tbl"><table><thead><tr><th>Email</th><th>' + tr('Name', 'Họ tên') + '</th><th>' + tr('Organization', 'Đơn vị') + '</th><th class="hide-sm">' + tr('Signed up', 'Ngày đăng ký') + '</th><th>' + tr('Status', 'Trạng thái') + '</th><th></th></tr></thead><tbody>' +
        us.map(function (u) {
          var self = u.id === me.id;
          return '<tr><td>' + esc(u.email) + (u.role === 'superadmin' ? ' <span class="tag" style="background:var(--signal);color:#fff">SEPA</span>' : '') + '</td><td>' + esc(u.display_name) + '</td><td>' + esc(u.organization) + (u.country ? ' · ' + esc(u.country) : '') + '</td>' +
            '<td class="hide-sm small">' + esc(fmtDate(u.created_at)) + '</td><td><span class="pill s-' + esc(u.status) + '">' + esc(statusUser(u.status)) + '</span></td><td><div class="row">' +
            (self ? '' : (u.status !== 'approved' ? '<button class="btn sm pri" data-u="' + esc(u.id) + '" data-s="approved" type="button">' + tr('Approve', 'Duyệt') + '</button>' : '') +
              (u.status !== 'rejected' ? '<button class="btn sm danger" data-u="' + esc(u.id) + '" data-s="rejected" type="button">' + tr('Reject', 'Từ chối') + '</button>' : '') +
              (u.status === 'approved' ? (u.role === 'superadmin' ? '<button class="btn sm" data-u="' + esc(u.id) + '" data-s="approved" data-r="organizer" type="button">' + tr('Remove SEPA role', 'Bỏ quyền SEPA') + '</button>'
                : '<button class="btn sm" data-u="' + esc(u.id) + '" data-s="approved" data-r="superadmin" type="button">' + tr('Make SEPA admin', 'Cấp quyền SEPA') + '</button>') : '')) +
            '</div></td></tr>';
        }).join('') + '</tbody></table></div>';
      $id('adm').onclick = function (ev) {
        var b = ev.target.closest('[data-u]'); if (!b) return;
        if (b.dataset.r === 'superadmin' && !confirm(tr('Give this account full SEPA admin rights?', 'Cấp toàn quyền SEPA cho tài khoản này?'))) return;
        S.setUser(b.dataset.u, b.dataset.s, b.dataset.r).then(function () { toast(tr('Updated', 'Đã cập nhật')); renderAdmin('users'); }).catch(fail);
      };
    }).catch(fail);
    if (tab === 'settings') S.getSettings().then(function (s) {
      s = s || { auto_approve_mode: 'off', auto_approve_domains: [] };
      var r = function (v, en, vi, hint) { return '<label class="ck" style="align-items:flex-start;margin:6px 0"><input type="radio" name="aam" value="' + v + '"' + (s.auto_approve_mode === v ? ' checked' : '') + '> <span><b>' + tr(en, vi) + '</b><br><span class="small mut">' + hint + '</span></span></label>'; };
      $id('adm').innerHTML = '<form class="card" id="fSet" style="max-width:640px"><h3 style="margin-top:0">' + tr('New account approval', 'Duyệt tài khoản mới') + '</h3>' +
        r('off', 'Manual', 'Duyệt tay', tr('SEPA approves each new account in the Accounts tab.', 'SEPA duyệt từng tài khoản ở tab Tài khoản.')) +
        r('domains', 'Automatic for trusted email domains', 'Tự động cho tên miền email tin cậy', tr('Accounts with an email in the list below are approved immediately; others wait for SEPA.', 'Tài khoản có email thuộc danh sách dưới được duyệt ngay; còn lại chờ SEPA.')) +
        r('all', 'Automatic for everyone', 'Tự động cho tất cả', tr('Any new account can create events right away. Use for open school tournaments; review the Accounts tab regularly.', 'Mọi tài khoản mới tạo giải được ngay. Dùng khi mở rộng cho nhiều trường; nên xem tab Tài khoản thường xuyên.')) +
        '<label class="f" style="margin-top:10px"><span>' + tr('Trusted domains, one per line (e.g. sepa.org.vn, hanoi.edu.vn)', 'Tên miền tin cậy, mỗi dòng 1 tên (vd. sepa.org.vn, hanoi.edu.vn)') + '</span><textarea id="aDom" style="min-height:90px">' + esc((s.auto_approve_domains || []).join('\n')) + '</textarea></label>' +
        '<p class="small mut">' + tr('Only affects accounts created after you save. Existing pending accounts still need approval.', 'Chỉ áp dụng cho tài khoản tạo sau khi lưu. Tài khoản đang chờ vẫn cần duyệt tay.') + '</p>' +
        '<button class="btn pri" type="submit">' + tr('Save', 'Lưu') + '</button></form>';
      $id('fSet').onsubmit = function (ev) {
        ev.preventDefault();
        var mode = (document.querySelector('input[name=aam]:checked') || {}).value || 'off';
        var doms = $id('aDom').value.split(/[\s,;]+/).map(function (d) { return d.trim().toLowerCase().replace(/^@/, ''); }).filter(Boolean);
        S.saveSettings({ auto_approve_mode: mode, auto_approve_domains: doms }).then(function () { toast(tr('Saved', 'Đã lưu')); }).catch(fail);
      };
    }).catch(fail);
    if (tab === 'events') S.listAllEvents().then(function (list) {
      $id('adm').innerHTML = '<p class="small mut">' + tr('Verified events count towards the global rankings on the home page.', 'Giải đã xác minh được tính vào xếp hạng toàn cầu ở trang chủ.') + '</p>' +
        (list.length ? '<div class="tbl"><table><thead><tr><th>' + tr('Event', 'Giải') + '</th><th>' + tr('Date', 'Ngày') + '</th><th>' + tr('Organizer', 'Đơn vị') + '</th><th>' + tr('Status', 'Trạng thái') + '</th><th class="c">' + tr('Verified', 'Xác minh') + '</th></tr></thead><tbody>' +
        list.map(function (e) { return '<tr><td><a href="#e/' + esc(e.id) + '">' + esc(e.name) + '</a>' + (e.recf_code ? ' <span class="code mut">' + esc(e.recf_code) + '</span>' : '') + '</td><td>' + esc(fmtDate(e.date)) + '</td><td>' + esc(e.organizer_name) + '</td><td><span class="pill s-' + esc(e.status) + '">' + esc(statusName(e.status)) + '</span></td>' +
          '<td class="c"><input type="checkbox" data-v="' + esc(e.id) + '"' + (e.verified ? ' checked' : '') + ' aria-label="' + esc(tr('Verified', 'Xác minh')) + '"></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">' + tr('No events yet.', 'Chưa có giải nào.') + '</p>');
      $id('adm').onchange = function (ev) {
        var c = ev.target.closest('[data-v]'); if (!c) return;
        S.updateEvent(c.dataset.v, { verified: c.checked }).then(function () { toast(tr('Saved', 'Đã lưu')); if (B && B.event.id === c.dataset.v) B = null; }).catch(fail);
      };
    }).catch(fail);
  }

  /* ---------- khởi động ---------- */
  I18N.apply(); I18N.bindToggle();
  S.onAuth(function (m) { me = m; route(); });
  S.session().then(function (m) { me = m; route(); }).catch(function (e) { app.innerHTML = '<div class="banner err">' + esc(errText(e)) + '</div>'; });
})();
