// Spotlight Partners (js/partners.js).  Chạy: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../js/partners.js');

const take = (f, n) => Array.from({ length: n }, () => f().id);

test('mỗi đối tác có file logo', () => {
  P.LIST.forEach(p => assert.ok(fs.existsSync(path.join(__dirname, '..', P.src(p))), P.src(p)));
});

test('cài đặt: mặc định lần lượt, bỏ id lạ và id trùng', () => {
  assert.deepEqual(P.cfg(), { mode: 'seq', pick: [] });
  assert.deepEqual(P.cfg({ mode: 'xyz', pick: ['nasa', 'abc', 'nasa', 'google'] }), { mode: 'seq', pick: ['nasa', 'google'] });
});

test('lần lượt: chạy vòng tròn theo thứ tự danh sách', () => {
  const ids = P.LIST.map(p => p.id);
  assert.deepEqual(take(P.feeder({ mode: 'seq' }), ids.length * 2), ids.concat(ids));
});

test('ngẫu nhiên: mỗi vòng đủ mặt, không lặp liền nhau', () => {
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = P.LIST.length, seq = take(P.feeder({ mode: 'rand' }, rnd), n * 6);
  for (let r = 0; r < 6; r++) assert.equal(new Set(seq.slice(r * n, (r + 1) * n)).size, n, 'vòng ' + r);
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
  assert.notDeepEqual(seq.slice(0, n), P.LIST.map(p => p.id));
});

test('tuỳ chọn: chỉ các đối tác đã chọn, theo thứ tự đã chọn; chọn rỗng thì hiện tất cả', () => {
  assert.deepEqual(take(P.feeder({ mode: 'pick', pick: ['nasa', 'google'] }), 4), ['nasa', 'google', 'nasa', 'google']);
  assert.equal(P.active({ mode: 'pick', pick: [] }).length, P.LIST.length);
});
