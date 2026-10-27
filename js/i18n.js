/* Ngôn ngữ cho manage.html và event.html. Dùng chung lựa chọn với index.html (localStorage 'lang', ?lang=vi).
   Chữ tĩnh: tiếng Anh trong HTML, tiếng Việt ở data-vi / data-vi-ph / data-vi-aria.  Chữ do JS sinh: tr(en, vi). */
(function () {
  var LANG = (function () {
    var q = /[?&]lang=(en|vi)\b/.exec(location.search); if (q) return q[1];
    try { var v = localStorage.getItem('lang'); if (v === 'en' || v === 'vi') return v; } catch (x) {}
    return 'en';
  })();
  var subs = [];
  window.I18N = {
    get lang() { return LANG; },
    loc: function () { return LANG === 'vi' ? 'vi-VN' : 'en-US'; },
    onChange: function (cb) { subs.push(cb); },
    set: function (l) {
      if (l === LANG) return; LANG = l; try { localStorage.setItem('lang', l); } catch (x) {}
      this.apply(); subs.forEach(function (cb) { cb(l); });
    },
    apply: function (root) {
      var r = root || document;
      if (!root) document.documentElement.lang = LANG;
      r.querySelectorAll('[data-vi]').forEach(function (el) { if (el.dataset.en == null) el.dataset.en = el.innerHTML; el.innerHTML = LANG === 'vi' ? el.dataset.vi : el.dataset.en; });
      r.querySelectorAll('[data-vi-ph]').forEach(function (el) { if (el.dataset.enPh == null) el.dataset.enPh = el.placeholder; el.placeholder = LANG === 'vi' ? el.dataset.viPh : el.dataset.enPh; });
      r.querySelectorAll('[data-vi-aria]').forEach(function (el) { if (el.dataset.enAria == null) el.dataset.enAria = el.getAttribute('aria-label'); el.setAttribute('aria-label', LANG === 'vi' ? el.dataset.viAria : el.dataset.enAria); });
      document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.l === LANG); });
    },
    bindToggle: function () {
      var self = this;
      document.querySelectorAll('.lang').forEach(function (g) { g.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) self.set(b.dataset.l); }); });
    }
  };
  window.tr = function (en, vi) { return LANG === 'vi' ? vi : en; };
  window.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  window.$id = function (id) { return document.getElementById(id); };
  window.GRADES = { ES: ['Elementary', 'Tiểu học'], MS: ['Middle School', 'THCS'], HS: ['High School', 'THPT'], UNI: ['University', 'Đại học'] };
  window.gradeName = function (g) { var x = GRADES[g]; return x ? tr(x[0], x[1]) : g; };
  window.STATUS_NAMES = { draft: ['Draft', 'Nháp'], published: ['Published', 'Đã công bố'], live: ['Live', 'Đang diễn ra'], completed: ['Completed', 'Đã kết thúc'] };
  window.statusName = function (s) { var x = STATUS_NAMES[s]; return x ? tr(x[0], x[1]) : s; };
  window.fmtDate = function (d) {
    if (!d) return '';
    var x = new Date(String(d).slice(0, 10) + 'T00:00');
    return LANG === 'vi' ? x.getDate() + '/' + (x.getMonth() + 1) + '/' + x.getFullYear() : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  /* Thông báo lỗi dễ hiểu cho mã lỗi của Store */
  window.errText = function (e) {
    var m = {
      judged_dup: ['This team already has a judged award (max 1 per team, rule 6.3).', 'Đội này đã có 1 giải giám khảo (tối đa 1 giải mỗi đội, luật 6.3).'],
      solo_limit: ['This team has used all its solo attempts (rule 7.4.1).', 'Đội này đã dùng hết lượt solo (luật 7.4.1).'],
      match_dup: ['A match with this number already exists.', 'Đã có trận mang số này.'],
      team_dup: ['A team with this number already exists.', 'Đã có đội mang mã này.'],
      team_in_use: ['This team is in the match schedule. Clear the schedule first, or rename the team instead.', 'Đội này đang có trong lịch trận. Xoá lịch trước, hoặc đổi mã đội thay vì xoá.'],
      bad_team: ['Team numbers use only letters A–Z, digits, - or _ (2–20 characters).', 'Mã đội chỉ gồm chữ A–Z, số, - hoặc _ (2–20 ký tự).'],
      bad_score: ['Scores cannot be negative.', 'Điểm không được âm.'],
      bad_image: ['This image could not be saved. Use a PNG, JPG, WebP or GIF file (max 8 sponsor logos).', 'Không lưu được ảnh này. Dùng file PNG, JPG, WebP hoặc GIF (tối đa 8 logo nhà tài trợ).'],
      forbidden: ['You do not have permission to do this. Is your account approved?', 'Bạn không có quyền làm việc này. Tài khoản đã được duyệt chưa?'],
      bad_login: ['Wrong email or password.', 'Sai email hoặc mật khẩu.'],
      not_confirmed: ['Please confirm your email first (check your inbox).', 'Bạn cần xác nhận email trước (xem hộp thư).'],
      email_taken: ['This email is already registered. Sign in instead.', 'Email này đã đăng ký. Hãy đăng nhập.'],
      weak_password: ['Password must be at least 6 characters.', 'Mật khẩu cần ít nhất 6 ký tự.'],
      bad_email: ['Please enter a valid email.', 'Email không hợp lệ.'],
      self_demote: ['You cannot remove your own admin rights.', 'Không thể tự bỏ quyền quản trị của chính mình.'],
      demo_only: ['Not available in demo mode.', 'Không dùng được ở chế độ demo.'],
      bad_notify_url: ['The link must be a Google Apps Script web app link (https://script.google.com/macros/s/…/exec).', 'Link phải là link web app của Google Apps Script (https://script.google.com/macros/s/…/exec).'],
      notify_no_url: ['Paste the Apps Script link and save first.', 'Hãy dán link Apps Script và bấm Lưu trước.'],
      network: ['Network error. Check your connection and try again.', 'Lỗi mạng. Kiểm tra kết nối rồi thử lại.']
    }[e && e.code];
    return m ? tr(m[0], m[1]) : tr('Something went wrong: ', 'Có lỗi: ') + ((e && e.message) || e);
  };
  var tt;
  window.toast = function (msg, isErr) {
    var el = $id('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast' + (isErr ? ' err' : ''); el.textContent = msg; el.hidden = false;
    clearTimeout(tt); tt = setTimeout(function () { el.hidden = true; }, isErr ? 6000 : 2500);
  };
})();
