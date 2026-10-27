// Script gửi email (scripts/notify-mailer.gs) chạy trong Google Apps Script.  Chạy: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'notify-mailer.gs'), 'utf8');
function load(secret) {
  const sent = [];
  const ctx = { MailApp: { sendEmail: m => sent.push(m) }, ContentService: { createTextOutput: t => ({ text: t }) } };
  vm.createContext(ctx);
  vm.runInContext(secret ? SRC.replace("var SECRET = '__SECRET__';", "var SECRET = '" + secret + "';") : SRC, ctx);
  return { ctx, sent, post: body => ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text };
}
const K = 'a'.repeat(48);
const who = { email: 'moi@truong.edu.vn', name: 'Thầy <C>', organization: 'Trường C', country: 'Vietnam', status: 'pending' };

test('chưa điền khoá thì không gửi gì', () => {
  const m = load();
  assert.equal(m.post({ secret: '__SECRET__', kind: 'test', to: ['a@b.vn'] }), 'forbidden');
  assert.equal(m.sent.length, 0);
});

test('sai khoá thì không gửi', () => {
  const m = load(K);
  assert.equal(m.post({ secret: 'b'.repeat(48), kind: 'test', to: ['a@b.vn'] }), 'forbidden');
  assert.equal(m.post({ kind: 'test', to: ['a@b.vn'] }), 'forbidden');
  assert.equal(m.sent.length, 0);
});

test('đăng ký mới: báo SEPA, có link duyệt, chữ được thoát HTML', () => {
  const m = load(K);
  assert.equal(m.post({ secret: K, kind: 'signup', to: ['daoquyen@sepa.org.vn', 'bgk@sepa.org.vn'], data: who }), 'ok');
  const e = m.sent[0];
  assert.equal(e.to, 'daoquyen@sepa.org.vn,bgk@sepa.org.vn');
  assert.match(e.subject, /chờ duyệt: Thầy <C> · Trường C/);
  assert.match(e.htmlBody, /manage\.html#admin\/users/);
  assert.match(e.htmlBody, /Thầy &lt;C&gt;/);
  assert.doesNotMatch(e.htmlBody, /Thầy <C>/);
  assert.match(e.body, /moi@truong\.edu\.vn/);
});

test('đăng ký được duyệt tự động thì tiêu đề nói rõ', () => {
  const m = load(K);
  m.post({ secret: K, kind: 'signup', to: ['a@b.vn'], data: Object.assign({}, who, { status: 'approved' }) });
  assert.match(m.sent[0].subject, /đã tự duyệt/);
});

test('duyệt / từ chối: gửi cho người đăng ký', () => {
  const m = load(K);
  m.post({ secret: K, kind: 'decision', to: ['moi@truong.edu.vn'], data: Object.assign({}, who, { status: 'approved' }) });
  m.post({ secret: K, kind: 'decision', to: ['moi@truong.edu.vn'], data: Object.assign({}, who, { status: 'rejected' }) });
  assert.match(m.sent[0].subject, /đã được duyệt/);
  assert.match(m.sent[1].subject, /chưa được chấp nhận/);
  assert.equal(m.post({ secret: K, kind: 'decision', to: ['x@y.vn'], data: { status: 'pending' } }), 'unknown kind');
});

test('bỏ địa chỉ email sai, giới hạn số người nhận', () => {
  const m = load(K);
  assert.equal(m.post({ secret: K, kind: 'test', to: ['khong-phai-email', 'a@b.vn,c@d.vn'] }), 'no recipients');
  m.post({ secret: K, kind: 'test', to: Array.from({ length: 30 }, (_, i) => 'u' + i + '@x.vn') });
  assert.equal(m.sent[0].to.split(',').length, 20);
  assert.equal(m.ctx.doPost({ postData: { contents: '{' } }).text, 'bad json');
});
