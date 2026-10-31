/* Đồng hồ trọng tài (timer.html). Logic đếm giờ ở js/timing.js.
   Danh sách bảng giờ: bảng của giải (event.config.timer, nếu mở bằng ?id=) hoặc bảng có sẵn (Achieve Driving, Achieve Coding),
   cộng các bảng trọng tài tự lưu trên máy này. Chỉnh nhanh ("Áp dụng") cũng chỉ lưu trên máy này, bấm "Về mặc định" để bỏ.
   Lưu trên máy: localStorage 'eventstem-timer-v1' = {mine: [bảng tự lưu], over: {id: bảng đã chỉnh}, last: {mã giải: id bảng chọn lần trước}}. */
(function () {
  'use strict';
  var T = window.Timing, S = window.Store;
  var P = new URLSearchParams(location.search), id = P.get('id');
  var KEY = 'eventstem-timer-v1', EB = null, conf = {}, base = [], list = [], cur = null, st = null, lastSec = null, wake = null;

  function loadLocal() { try { var d = JSON.parse(localStorage.getItem(KEY) || '{}'); return { mine: Array.isArray(d.mine) ? d.mine : [], over: d.over || {}, last: d.last && typeof d.last === 'object' ? d.last : {} }; } catch (x) { return { mine: [], over: {}, last: {} }; } }
  function saveLocal(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (x) {} }
  var L = loadLocal();

  function KIND() {
    return { lead: tr('GET READY', 'CHUẨN BỊ'), auto: tr('AUTONOMOUS', 'TỰ HÀNH'), driver: tr('DRIVER CONTROL', 'ĐIỀU KHIỂN'), done: tr('TIME', 'HẾT GIỜ') };
  }
  function MODE() {
    return { match: tr('Autonomous, then driver control', 'Tự hành rồi điều khiển'), auto: tr('Autonomous only (coding)', 'Chỉ tự hành (coding)'), driver: tr('Driver control only', 'Chỉ điều khiển') };
  }
  function summary(p) { return T.phases(p).filter(function (x) { return x.kind !== 'lead'; }).map(function (x) { return T.fmt(x.sec); }).join(' + '); }

  /* Danh sách bảng: bảng của giải / có sẵn (đã áp chỉnh nhanh nếu có) + bảng tự lưu trên máy */
  function buildList() {
    base = T.presetsOf(conf);
    var mine = L.mine.map(function (p) { var x = T.normalize(p); x.id = 'my-' + x.id.replace(/^my-/, ''); x.mine = true; return x; });
    list = base.map(function (p) { var o = L.over[p.id]; if (!o) return p; var x = T.normalize(Object.assign({}, o, { id: p.id })); x.changed = true; return x; }).concat(mine);
  }
  function pick(pid) {
    var p = list.find(function (x) { return x.id === pid; }) || list.find(function (x) { return x.id === T.defaultOf(conf, base); }) || list[0];
    cur = p; st = T.create(p); lastSec = null;
    L.last[id || ''] = p.id; saveLocal(L);
    P.set('preset', p.id); try { history.replaceState(null, '', location.pathname + '?' + P.toString()); } catch (x) {}
    paintPicker(); paintForm(); paint();
  }
  function paintPicker() {
    $id('tmPreset').innerHTML = list.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (cur && p.id === cur.id ? ' selected' : '') + '>' + esc(p.name + ' · ' + summary(p) + (p.changed ? tr(' (adjusted)', ' (đã chỉnh)') : '') + (p.mine ? tr(' (this device)', ' (máy này)') : '')) + '</option>';
    }).join('');
  }

  /* ---------- Hiển thị ---------- */
  function paint() {
    var now = performance.now(), v = T.view(st, now), K = KIND(), m = $id('tmMain');
    m.dataset.kind = v.kind; m.dataset.status = v.status;
    m.dataset.warn = v.status === 'run' && v.kind !== 'lead' && v.rem <= 10 ? '1' : '';
    var n = st.ph.filter(function (x) { return x.kind !== 'lead'; }).length, idx = st.ph.slice(0, st.i + 1).filter(function (x) { return x.kind !== 'lead'; }).length;
    var lbl = K[v.kind] + (n > 1 && v.kind !== 'lead' && v.kind !== 'done' ? ' · ' + idx + '/' + n : '');
    if (v.status === 'wait') lbl = tr('Autonomous over · press Start for driver control', 'Hết tự hành · bấm Bắt đầu để sang điều khiển');
    else if (v.status === 'pause') lbl += ' · ' + tr('PAUSED', 'TẠM DỪNG');
    if ($id('tmPhase').textContent !== lbl) $id('tmPhase').textContent = lbl;
    $id('tmTime').textContent = v.text;
    $id('tmBar').style.width = (v.status === 'done' ? 100 : Math.min(100, v.frac * 100)).toFixed(2) + '%';
    $id('tmSteps').innerHTML = st.ph.filter(function (x) { return x.kind !== 'lead'; }).map(function (x) {
      var on = v.kind === x.kind, past = v.kind === 'done' || (x.kind === 'auto' && v.kind === 'driver');
      return '<li class="' + (on ? 'on' : past ? 'past' : '') + '">' + esc(K[x.kind]) + ' <b>' + T.fmt(x.sec) + '</b></li>';
    }).join('');
    var go = $id('tmGo');
    go.textContent = v.status === 'run' ? tr('Pause', 'Tạm dừng') : v.status === 'pause' ? tr('Resume', 'Chạy tiếp') : v.status === 'done' ? tr('Start again', 'Bắt đầu lại') : v.status === 'wait' ? tr('Start driver control', 'Bắt đầu điều khiển') : tr('Start', 'Bắt đầu');
    $id('tmSkip').disabled = v.status === 'done' || v.status === 'ready';
    $id('tmReset').disabled = v.status === 'run' || v.status === 'ready';
    $id('tmPreset').disabled = v.status === 'run';
  }

  /* ---------- Âm thanh (Web Audio, không cần file) ---------- */
  var ac = null;
  function beep(freq, ms, vol) {
    if (!cur.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = 'square'; o.frequency.value = freq; g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch (x) {}
  }
  var SND = { start: function () { beep(1046, 450, 0.25); }, phase: function () { beep(1318, 700, 0.25); }, count: function () { beep(784, 140, 0.18); }, done: function () { beep(392, 1400, 0.3); } };

  /* Giữ màn hình sáng khi đang chạy (điện thoại / máy tính bảng) */
  function keepAwake(on) {
    if (on && !wake && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }).catch(function () {});
    if (!on && wake) { wake.release().catch(function () {}); wake = null; }
  }

  function loop() {
    var now = performance.now(), ev = T.tick(st, now);
    if (ev.indexOf('done') >= 0) { SND.done(); keepAwake(false); }
    else if (ev.indexOf('phase') >= 0 || ev.indexOf('wait') >= 0) SND.phase();
    if (st.status === 'run') {
      // bíp mỗi giây ở 3 giây cuối của mỗi phần, và mỗi giây khi đếm "Chuẩn bị"
      var s = Math.ceil(T.remaining(st, now) - 1e-9), key = st.i + ':' + s;
      if (s >= 1 && s <= 3 && key !== lastSec) { lastSec = key; SND.count(); }
    }
    paint();
  }

  function act(a) {
    var now = performance.now();
    if (a === 'go') {
      if (st.status === 'run') { T.pause(st, now); keepAwake(false); }
      else {
        if (st.status === 'done') T.reset(st);
        var fresh = st.status === 'ready' || st.status === 'wait';
        T.start(st, now); keepAwake(true);
        if (fresh && st.ph[st.i].kind !== 'lead') SND.start();
      }
    } else if (a === 'reset' && st.status !== 'run') { T.reset(st); lastSec = null; keepAwake(false); }
    else if (a === 'skip' && st.status !== 'ready') { var was = st.status; T.skip(st, now); if (st.status === 'done' && was === 'run') { SND.done(); keepAwake(false); } else if (st.status === 'run') SND.phase(); }
    paint();
  }

  /* ---------- Tuỳ chỉnh ---------- */
  function paintForm() {
    var p = cur, M = MODE();
    $id('fTimer').innerHTML =
      '<label class="f"><span>' + tr('Timer name', 'Tên bảng') + '</span><input type="text" id="tfName" maxlength="60" value="' + esc(p.name) + '"></label>' +
      '<label class="f"><span>' + tr('Format', 'Hình thức') + '</span><select id="tfMode">' + T.MODES.map(function (k) { return '<option value="' + k + '"' + (p.mode === k ? ' selected' : '') + '>' + esc(M[k]) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f" id="tfAutoW"><span>' + tr('Autonomous (m:ss or seconds)', 'Tự hành (phút:giây hoặc số giây)') + '</span><input type="text" id="tfAuto" inputmode="numeric" value="' + T.fmt(p.auto || 15) + '"></label>' +
      '<label class="f" id="tfDrvW"><span>' + tr('Driver control (m:ss or seconds)', 'Điều khiển (phút:giây hoặc số giây)') + '</span><input type="text" id="tfDrv" inputmode="numeric" value="' + T.fmt(p.driver || 105) + '"></label>' +
      '<label class="f" id="tfBetW"><span>' + tr('Between the two periods', 'Giữa 2 phần') + '</span><select id="tfBet">' +
        '<option value="go"' + (p.between === 'go' ? ' selected' : '') + '>' + tr('Continue straight into driver control', 'Chạy liền sang điều khiển') + '</option>' +
        '<option value="wait"' + (p.between === 'wait' ? ' selected' : '') + '>' + tr('Stop and wait for the referee', 'Dừng, chờ trọng tài bấm') + '</option></select></label>' +
      '<label class="f"><span>' + tr('Get-ready countdown', 'Đếm ngược chuẩn bị') + '</span><select id="tfLead">' + [0, 3, 5, 10].map(function (n) {
        return '<option value="' + n + '"' + (p.lead === n ? ' selected' : '') + '>' + (n ? n + tr(' seconds', ' giây') : tr('None', 'Không')) + '</option>'; }).join('') + '</select></label>' +
      '<label class="ck"><input type="checkbox" id="tfSound"' + (p.sound ? ' checked' : '') + '> ' + tr('Beeps (start, change of period, last 3 seconds, time)', 'Tiếng bíp (bắt đầu, đổi phần, 3 giây cuối, hết giờ)') + '</label>' +
      '<p class="small mut" id="tfErr" role="alert"></p>' +
      '<div class="row"><button class="btn pri" type="submit">' + tr('Apply', 'Áp dụng') + '</button>' +
        '<button class="btn" type="button" id="tfNew">' + tr('Save as a new timer', 'Lưu thành bảng mới') + '</button>' +
        (p.changed ? '<button class="btn" type="button" id="tfDef">' + tr('Back to default', 'Về mặc định') + '</button>' : '') +
        (p.mine ? '<button class="btn danger" type="button" id="tfDel">' + tr('Delete', 'Xoá') + '</button>' : '') + '</div>' +
      '<p class="small mut">' + (id ? tr('Changes here are saved on this device only. The organizer sets the event\'s timers in the manage tool (Logo & show tab).', 'Thay đổi ở đây chỉ lưu trên máy này. Ban tổ chức đặt bảng giờ của giải trong công cụ tổ chức (tab Logo & trình chiếu).')
        : tr('Changes here are saved on this device only.', 'Thay đổi ở đây chỉ lưu trên máy này.')) + '</p>';
    var sync = function () { var m = $id('tfMode').value; $id('tfAutoW').hidden = m === 'driver'; $id('tfDrvW').hidden = m === 'auto'; $id('tfBetW').hidden = m !== 'match'; };
    $id('tfMode').onchange = sync; sync();
    if ($id('tfDef')) $id('tfDef').onclick = function () { delete L.over[cur.id]; saveLocal(L); buildList(); pick(cur.id); toast(tr('Back to default', 'Đã về mặc định')); };
    if ($id('tfDel')) $id('tfDel').onclick = function () {
      if (!confirm(tr('Delete this timer from this device?', 'Xoá bảng giờ này khỏi máy?'))) return;
      var k = cur.id.replace(/^my-/, ''); L.mine = L.mine.filter(function (x) { return T.normalize(x).id !== k; }); saveLocal(L); buildList(); pick(null);
    };
    $id('tfNew').onclick = function () { var p = read(); if (!p) return;
      var ids = list.map(function (x) { return x.id; }), k = T.slug(p.name), n = 2, k0 = k; while (ids.indexOf('my-' + k) >= 0) k = k0 + '-' + n++;
      p.id = k; L.mine.push(p); saveLocal(L); buildList(); pick('my-' + k); toast(tr('Saved on this device', 'Đã lưu trên máy này'));
    };
  }
  function read() {
    var mode = $id('tfMode').value, a = T.parseTime($id('tfAuto').value), d = T.parseTime($id('tfDrv').value), err = '';
    if (mode !== 'driver' && !(a > 0)) err = tr('Enter the autonomous time, e.g. 0:15 or 15.', 'Nhập thời gian tự hành, ví dụ 0:15 hoặc 15.');
    else if (mode !== 'auto' && !(d > 0)) err = tr('Enter the driver control time, e.g. 1:45 or 105.', 'Nhập thời gian điều khiển, ví dụ 1:45 hoặc 105.');
    $id('tfErr').textContent = err; if (err) return null;
    return T.normalize({ name: $id('tfName').value, mode: mode, auto: a, driver: d, between: $id('tfBet').value, lead: +$id('tfLead').value, sound: $id('tfSound').checked });
  }
  $id('fTimer').addEventListener('submit', function (ev) {
    ev.preventDefault(); var p = read(); if (!p) return;
    if (cur.mine) { var k = cur.id.replace(/^my-/, ''); L.mine = L.mine.map(function (x) { return T.normalize(x).id === k ? Object.assign(p, { id: k }) : x; }); }
    else L.over[cur.id] = p;
    saveLocal(L); buildList(); pick(cur.id); toast(tr('Applied', 'Đã áp dụng'));
  });

  /* ---------- Khởi động ---------- */
  function paintHead(b) {
    var e = b && b.event;
    $id('tmName').innerHTML = (S.rehearsal ? '<span class="show-rh">' + tr('REHEARSAL', 'TẬP DƯỢT') + '</span> ' : '') + esc(e ? e.name : 'EventSTEM');
    $id('tmOrg').innerHTML = b && b.assets && b.assets.organizer ? '<img src="' + esc(b.assets.organizer) + '" alt="">' : '';
    document.title = (e ? e.name + ' · ' : '') + tr('Timer', 'Đồng hồ') + ' · EventSTEM';
  }
  function init(b) {
    conf = (b && b.event.config) || {}; paintHead(b); buildList();
    var last = L.last[id || ''];   // bảng chọn lần trước trên máy này, nhớ riêng cho từng giải
    pick(P.get('preset') || (list.some(function (x) { return x.id === last; }) ? last : null));
  }
  I18N.apply(); I18N.bindToggle();
  I18N.onChange(function () { if (st) { paintHead(EB); paintPicker(); paintForm(); paint(); } });
  $id('tmPreset').addEventListener('change', function () { if (st.status !== 'run') pick(this.value); });
  $id('tmGo').onclick = function () { act('go'); };
  $id('tmSkip').onclick = function () { act('skip'); };
  $id('tmReset').onclick = function () { act('reset'); };
  $id('tmFull').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); };
  document.addEventListener('keydown', function (ev) {
    var t = ev.target, k = ev.key;
    if (t.closest('input,select,textarea') || ((k === ' ' || k === 'Enter') && t.closest('button,summary'))) return;
    if (k === ' ') { ev.preventDefault(); act('go'); }
    else if (k === 'r' || k === 'R') act('reset');
    else if (k === 'n' || k === 'N') act('skip');
    else if (k === 'f' || k === 'F') $id('tmFull').click();
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && st && st.status === 'run') keepAwake(true); });
  setInterval(function () { if (st) loop(); }, 100);

  if (!id) init(null);
  else S.getEvent(id).then(function (b) {
    EB = b;
    if (!b) toast(tr('Event not found or not public: using the standard timers.', 'Không tìm thấy giải hoặc giải chưa công bố: dùng bảng giờ có sẵn.'), true);
    init(b);
  }).catch(function (e) { toast(errText(e), true); init(null); });
  window.EventSTEMTimer = { state: function () { return st && { preset: cur.id, status: st.status, i: st.i, kind: T.view(st, performance.now()).kind }; }, list: function () { return list.map(function (x) { return x.id; }); } };   // cho kiểm thử
})();
