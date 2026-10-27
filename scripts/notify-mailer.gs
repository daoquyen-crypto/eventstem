/* EventSTEM: gửi email thông báo bằng tài khoản Google của SEPA (Google Apps Script).
   Supabase (supabase/schema.sql, notify_send) gọi web app này khi:
     signup    có tài khoản mới đăng ký        → email cho SEPA
     decision  tài khoản được duyệt / từ chối  → email cho người đăng ký
     test      SEPA bấm "Gửi email thử"        → email cho SEPA
   Cài đặt: xem docs/SUPABASE_SETUP.md, mục "Thông báo email". Công cụ quản lý (Cài đặt duyệt) chép sẵn file này kèm khoá bí mật. */
var SECRET = '__SECRET__';               // phải trùng "Khoá bí mật" trong Cài đặt duyệt
var SITE = 'https://eventstem.com';
var MAX_TO = 20;

function doPost(e) {
  var msg;
  try { msg = JSON.parse(e.postData.contents); } catch (x) { return reply('bad json'); }
  return reply(handle(msg));
}

function reply(text) { return ContentService.createTextOutput(text); }

/* Kiểm tra khoá, dựng nội dung và gửi; trả về 'ok' hoặc lý do bỏ qua */
function handle(msg) {
  if (!msg || SECRET === '__SECRET__' || !sameSecret(String(msg.secret || ''), SECRET)) return 'forbidden';
  var to = (msg.to || []).filter(function (x) { return /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(String(x)); }).slice(0, MAX_TO);
  if (!to.length) return 'no recipients';
  var m = compose(String(msg.kind || ''), msg.data || {});
  if (!m) return 'unknown kind';
  MailApp.sendEmail({ to: to.join(','), subject: m.subject, body: m.text, htmlBody: m.html, name: 'EventSTEM' });
  return 'ok';
}

function sameSecret(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

/* Nội dung email song ngữ: tiếng Việt trước, tiếng Anh sau */
function compose(kind, d) {
  var who = [d.name, d.organization].filter(Boolean).join(' · ') || d.email || '';
  var rows = [['Họ tên / Name', d.name], ['Email', d.email], ['Trường / Organization', d.organization], ['Quốc gia / Country', d.country]]
    .filter(function (r) { return r[1]; });
  var table = '<table style="border-collapse:collapse;margin:12px 0">' + rows.map(function (r) {
    return '<tr><td style="padding:4px 12px 4px 0;color:#5a6a7e">' + esc(r[0]) + '</td><td style="padding:4px 0"><b>' + esc(r[1]) + '</b></td></tr>'; }).join('') + '</table>';
  var plainRows = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n');
  var btn = function (href, label) { return '<p><a href="' + href + '" style="display:inline-block;background:#1b365d;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">' + esc(label) + '</a></p>'; };
  var wrap = function (inner) { return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f1b2d;max-width:560px">' + inner +
    '<p style="color:#5a6a7e;font-size:12px;margin-top:24px">EventSTEM · SEPA · ' + esc(SITE.replace(/^https?:\/\//, '')) + '</p></div>'; };
  var admin = SITE + '/manage.html#admin/users', tool = SITE + '/manage.html';

  if (kind === 'signup') {
    var auto = d.status === 'approved';
    return {
      subject: (auto ? '[EventSTEM] Tài khoản mới (đã tự duyệt): ' : '[EventSTEM] Tài khoản mới chờ duyệt: ') + who,
      html: wrap('<p><b>' + (auto ? 'Có tài khoản mới, đã được duyệt tự động theo cài đặt.' : 'Có tài khoản mới đang chờ SEPA duyệt.') + '</b><br>' +
        '<span style="color:#5a6a7e">' + (auto ? 'A new account was approved automatically.' : 'A new account is waiting for approval.') + '</span></p>' + table +
        btn(admin, auto ? 'Xem tài khoản / View accounts' : 'Duyệt tài khoản / Review account')),
      text: (auto ? 'Có tài khoản mới, đã được duyệt tự động.' : 'Có tài khoản mới đang chờ SEPA duyệt.') + '\n\n' + plainRows + '\n\n' + admin
    };
  }
  if (kind === 'decision' && d.status === 'approved') {
    return {
      subject: 'EventSTEM: tài khoản đã được duyệt / Your account is approved',
      html: wrap('<p>Xin chào' + (d.name ? ' ' + esc(d.name) : '') + ',</p><p>Tài khoản EventSTEM của bạn đã được duyệt. Bây giờ bạn có thể đăng nhập và tạo giải đấu.</p>' +
        '<p style="color:#5a6a7e">Your EventSTEM account has been approved. You can now sign in and create tournaments.</p>' + btn(tool, 'Mở công cụ tổ chức giải / Open organizer tool')),
      text: 'Tài khoản EventSTEM của bạn đã được duyệt. Bây giờ bạn có thể đăng nhập và tạo giải đấu.\nYour EventSTEM account has been approved.\n\n' + tool
    };
  }
  if (kind === 'decision' && d.status === 'rejected') {
    return {
      subject: 'EventSTEM: tài khoản chưa được chấp nhận / Account not approved',
      html: wrap('<p>Xin chào' + (d.name ? ' ' + esc(d.name) : '') + ',</p><p>SEPA chưa chấp nhận tài khoản EventSTEM của bạn. Nếu bạn nghĩ có nhầm lẫn, hãy trả lời email này.</p>' +
        '<p style="color:#5a6a7e">SEPA did not approve your EventSTEM account. If you think this is a mistake, reply to this email.</p>'),
      text: 'SEPA chưa chấp nhận tài khoản EventSTEM của bạn. Nếu bạn nghĩ có nhầm lẫn, hãy trả lời email này.\nSEPA did not approve your EventSTEM account.'
    };
  }
  if (kind === 'test') {
    return {
      subject: '[EventSTEM] Email thử / Test email',
      html: wrap('<p>Thông báo email của EventSTEM đã hoạt động.' + (d.email ? ' Gửi thử bởi ' + esc(d.email) + '.' : '') + '</p><p style="color:#5a6a7e">EventSTEM email notifications are working.</p>'),
      text: 'Thông báo email của EventSTEM đã hoạt động.\nEventSTEM email notifications are working.'
    };
  }
  return null;
}
