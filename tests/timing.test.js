// Đồng hồ trọng tài (js/timing.js).  Chạy: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/timing.js');

test('bảng có sẵn: Achieve Driving 0:15 + 1:45, Achieve Coding 2:00', () => {
  const [d, c] = T.presetsOf({});
  assert.equal(d.name, 'Achieve Driving'); assert.deepEqual(T.phases(d), [{ kind: 'auto', sec: 15 }, { kind: 'driver', sec: 105 }]);
  assert.equal(T.total(d), 120);
  assert.equal(c.name, 'Achieve Coding'); assert.deepEqual(T.phases(c), [{ kind: 'auto', sec: 120 }]);
  assert.equal(T.defaultOf({}, T.presetsOf({})), 'achieve-driving');
});

test('đọc và ghi giờ', () => {
  assert.equal(T.parseTime('1:45'), 105); assert.equal(T.parseTime('2:00'), 120); assert.equal(T.parseTime('15'), 15); assert.equal(T.parseTime(' 0:05 '), 5);
  assert.ok(isNaN(T.parseTime('abc'))); assert.ok(isNaN(T.parseTime('1:75')));
  assert.equal(T.fmt(105), '1:45'); assert.equal(T.fmt(9), '0:09'); assert.equal(T.fmt(0), '0:00');
});

test('làm sạch bảng giờ: hình thức lạ, số âm, id trùng, bảng của giải và bảng mặc định', () => {
  assert.deepEqual(T.normalize({ name: '  Đấu thử  ', mode: 'xyz', auto: -5, driver: 99999, between: 'x', lead: 50 }),
    { id: 'dau-thu', name: 'Đấu thử', mode: 'match', auto: 1, driver: 3600, between: 'go', lead: 10, sound: true });
  assert.equal(T.normalize({ mode: 'driver', auto: 15, driver: 60 }).auto, 0);
  const conf = { timer: { presets: [{ id: 'a', name: 'A', mode: 'auto', auto: 60 }, { id: 'a', name: 'B', mode: 'driver', driver: 90 }], def: 'a-2' } };
  const list = T.presetsOf(conf);
  assert.deepEqual(list.map(p => p.id), ['a', 'a-2']);
  assert.equal(T.defaultOf(conf, list), 'a-2');
  assert.equal(T.defaultOf({ timer: { def: 'none' } }, list), 'a');
});

test('trận Driving chạy liền: 15 giây tự hành rồi 1:45 điều khiển, rồi hết giờ', () => {
  const st = T.create(T.presetsOf({})[0]);
  assert.equal(T.view(st, 0).text, '0:15');
  T.start(st, 1000);
  assert.equal(T.view(st, 1000 + 400).text, '0:15');         // còn 14,6 giây vẫn hiện 0:15
  assert.equal(T.view(st, 1000 + 14200).text, '0:01');
  assert.deepEqual(T.tick(st, 1000 + 15500), ['phase']);    // sang điều khiển, giữ phần dư 0,5 giây
  const v = T.view(st, 1000 + 15500);
  assert.equal(v.kind, 'driver'); assert.equal(v.rem, 104.5); assert.equal(v.text, '1:45');
  assert.deepEqual(T.tick(st, 1000 + 120000), ['done']);
  assert.equal(T.view(st, 1000 + 130000).kind, 'done'); assert.equal(T.view(st, 1000 + 130000).text, '0:00');
});

test('tạm dừng không tính thời gian dừng; nhảy cóc nhiều phần khi máy ngủ', () => {
  const st = T.create(T.normalize({ mode: 'match', auto: 15, driver: 105 }));
  T.start(st, 0); T.pause(st, 5000);
  assert.equal(st.status, 'pause'); assert.equal(T.remaining(st, 60000), 10);
  T.start(st, 60000); assert.equal(T.remaining(st, 62000), 8);
  assert.deepEqual(T.tick(st, 60000 + 200000), ['phase', 'done']);
  T.reset(st); assert.equal(st.status, 'ready'); assert.equal(T.view(st, 0).text, '0:15');
});

test('chờ trọng tài giữa 2 phần; đếm "Chuẩn bị" thì luôn chạy liền', () => {
  const st = T.create(T.normalize({ mode: 'match', auto: 15, driver: 105, between: 'wait', lead: 3 }));
  assert.deepEqual(st.ph.map(p => p.kind), ['lead', 'auto', 'driver']);
  T.start(st, 0);
  assert.deepEqual(T.tick(st, 3000), ['phase']); assert.equal(T.view(st, 3000).kind, 'auto');
  assert.deepEqual(T.tick(st, 20000), ['wait']);
  assert.equal(st.status, 'wait'); assert.equal(T.view(st, 50000).text, '1:45');   // đứng yên chờ bấm
  T.start(st, 50000); T.tick(st, 51000); assert.equal(T.remaining(st, 51000), 104);
});

test('bỏ qua phần đang chạy', () => {
  const st = T.create(T.presetsOf({})[0]);
  T.start(st, 0); T.skip(st, 4000);
  assert.equal(st.status, 'run'); assert.equal(T.view(st, 4000).kind, 'driver'); assert.equal(T.remaining(st, 5000), 104);
  T.skip(st, 6000); assert.equal(st.status, 'done');
});
