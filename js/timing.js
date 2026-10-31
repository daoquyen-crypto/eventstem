/* Đồng hồ trọng tài (timer.html): bảng giờ và bộ đếm, không phụ thuộc giao diện (chạy được trong node để kiểm thử).

   Bảng giờ (preset) = {id, name, mode, auto, driver, between, lead, sound}
     mode     'match'  = tự hành rồi điều khiển (trận Driving); 'auto' = chỉ tự hành (Coding); 'driver' = chỉ điều khiển
     auto     số giây phần tự hành;  driver = số giây phần điều khiển
     between  'go'   = hết tự hành chạy liền sang điều khiển; 'wait' = dừng, chờ trọng tài bấm bắt đầu phần điều khiển
     lead     số giây đếm ngược "Chuẩn bị" trước khi bắt đầu (0 = không đếm)
     sound    true = phát tiếng bíp (bắt đầu, đổi phần, 3 giây cuối, hết giờ)
   Ban tổ chức lưu danh sách bảng ở event.config.timer = {presets: [...], def: id} (tab Logo & trình chiếu).
   Trọng tài chỉnh nhanh ngay trên đồng hồ; chỉnh nhanh chỉ lưu trên máy đó (localStorage), không đổi cài đặt của giải. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Timing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MODES = ['match', 'auto', 'driver'];
  /* Bảng có sẵn (SEPA chốt): Achieve Driving = 15 giây tự hành + 1:45 điều khiển; Achieve Coding = 2 phút tự hành */
  var BUILTIN = [
    { id: 'achieve-driving', name: 'Achieve Driving', mode: 'match', auto: 15, driver: 105, between: 'go', lead: 0, sound: true },
    { id: 'achieve-coding', name: 'Achieve Coding', mode: 'auto', auto: 120, driver: 0, between: 'go', lead: 0, sound: true }
  ];
  var MAX_SEC = 3600, MAX_PRESETS = 20;

  function clampSec(v, d) { v = Math.round(+v); return isNaN(v) ? d : Math.max(0, Math.min(MAX_SEC, v)); }
  /* "1:45" → 105, "105" → 105, "2:00" → 120; sai → NaN */
  function parseTime(s) {
    s = String(s == null ? '' : s).trim();
    var m = /^(\d{1,3}):([0-5]?\d)$/.exec(s); if (m) return +m[1] * 60 + +m[2];
    return /^\d{1,4}$/.test(s) ? +s : NaN;
  }
  /* 105 → "1:45", 9 → "0:09" */
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2); }
  function slug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'timer'; }

  /* Làm sạch 1 bảng giờ (dữ liệu từ config / localStorage / form) */
  function normalize(p) {
    p = p || {};
    var mode = MODES.indexOf(p.mode) >= 0 ? p.mode : 'match';
    var o = {
      id: String(p.id || slug(p.name)).slice(0, 40),
      name: String(p.name || '').trim().slice(0, 60) || 'Timer',
      mode: mode,
      auto: mode === 'driver' ? 0 : clampSec(p.auto, 15),
      driver: mode === 'auto' ? 0 : clampSec(p.driver, 105),
      between: p.between === 'wait' ? 'wait' : 'go',
      lead: Math.max(0, Math.min(10, Math.round(+p.lead) || 0)),
      sound: p.sound !== false
    };
    if (mode !== 'driver' && !o.auto) o.auto = 1;
    if (mode !== 'auto' && !o.driver) o.driver = 1;
    return o;
  }
  /* Danh sách bảng của giải: event.config.timer.presets, không có thì dùng bảng có sẵn. Bỏ id trùng. */
  function presetsOf(conf) {
    var t = (conf && conf.timer) || {}, src = Array.isArray(t.presets) && t.presets.length ? t.presets : BUILTIN, seen = {}, out = [];
    src.slice(0, MAX_PRESETS).forEach(function (p) {
      var x = normalize(p), id = x.id, n = 2;
      while (seen[x.id]) x.id = id + '-' + n++;
      seen[x.id] = true; out.push(x);
    });
    return out;
  }
  function defaultOf(conf, list) {
    var d = conf && conf.timer && conf.timer.def;
    return (list.find(function (p) { return p.id === d; }) || list[0]).id;
  }

  /* Các phần của 1 lượt: [{kind:'lead'|'auto'|'driver', sec}] */
  function phases(p) {
    var out = [];
    if (p.lead) out.push({ kind: 'lead', sec: p.lead });
    if (p.mode !== 'driver') out.push({ kind: 'auto', sec: p.auto });
    if (p.mode !== 'auto') out.push({ kind: 'driver', sec: p.driver });
    return out;
  }
  function total(p) { return (p.mode !== 'driver' ? p.auto : 0) + (p.mode !== 'auto' ? p.driver : 0); }

  /* ---------- Bộ đếm ----------
     Trạng thái: {i (phần đang chạy), acc (ms đã chạy của phần này trước lần bấm gần nhất), t0 (mốc bắt đầu chạy, null = đang dừng),
                  status: 'ready' | 'run' | 'pause' | 'wait' (chờ bấm sang phần sau) | 'done'}
     Tính theo đồng hồ thật (now), không đếm số lần tick, nên không bị trôi khi trình duyệt chạy chậm. */
  function create(p) { return { p: p, ph: phases(p), i: 0, acc: 0, t0: null, status: 'ready' }; }
  function elapsed(st, now) { return st.acc + (st.t0 != null ? now - st.t0 : 0); }
  function start(st, now) {
    if (st.status === 'ready' || st.status === 'pause' || st.status === 'wait') { st.t0 = now; st.status = 'run'; }
    return st;
  }
  function pause(st, now) {
    if (st.status === 'run') { st.acc = elapsed(st, now); st.t0 = null; st.status = 'pause'; }
    return st;
  }
  function reset(st) { st.i = 0; st.acc = 0; st.t0 = null; st.status = 'ready'; return st; }
  /* Cập nhật theo thời gian; trả về các sự kiện vừa xảy ra để giao diện phát tiếng: 'phase' (sang phần mới), 'wait', 'done' */
  function tick(st, now) {
    var ev = [];
    while (st.status === 'run') {
      var dur = st.ph[st.i].sec * 1000, el = elapsed(st, now);
      if (el < dur) break;
      if (st.i === st.ph.length - 1) { st.acc = dur; st.t0 = null; st.status = 'done'; ev.push('done'); break; }
      var leftover = el - dur, wasLead = st.ph[st.i].kind === 'lead';
      st.i++; st.acc = 0;
      // Hết tự hành, chọn "chờ trọng tài": dừng ở đầu phần điều khiển (phần "Chuẩn bị" thì luôn chạy liền)
      if (!wasLead && st.p.between === 'wait') { st.t0 = null; st.status = 'wait'; ev.push('wait'); break; }
      st.t0 = now - leftover; ev.push('phase');
    }
    return ev;
  }
  /* Bỏ qua phần đang chạy (ví dụ tự hành xong sớm, trọng tài cho sang điều khiển ngay) */
  function skip(st, now) {
    if (st.status === 'done') return st;
    if (st.i === st.ph.length - 1) { st.acc = st.ph[st.i].sec * 1000; st.t0 = null; st.status = 'done'; return st; }
    var run = st.status === 'run';
    st.i++; st.acc = 0; st.t0 = run ? now : null;
    if (!run && st.status !== 'ready') st.status = 'pause';
    return st;
  }
  /* Số giây còn lại của phần đang chạy (làm tròn lên: 0.2 giây còn lại vẫn hiện 0:01) */
  function remaining(st, now) {
    var ph = st.ph[st.i]; if (!ph) return 0;
    return Math.max(0, ph.sec * 1000 - elapsed(st, now)) / 1000;
  }
  function view(st, now) {
    var ph = st.ph[st.i], rem = remaining(st, now);
    return { kind: st.status === 'done' ? 'done' : ph.kind, status: st.status, i: st.i, rem: rem, text: fmt(Math.ceil(rem - 1e-9)),
      frac: ph.sec ? 1 - rem / ph.sec : 1, next: st.ph[st.i + 1] || null };
  }

  return {
    MODES: MODES, BUILTIN: BUILTIN, MAX_PRESETS: MAX_PRESETS,
    parseTime: parseTime, fmt: fmt, slug: slug, normalize: normalize, presetsOf: presetsOf, defaultOf: defaultOf,
    phases: phases, total: total,
    create: create, start: start, pause: pause, reset: reset, tick: tick, skip: skip, remaining: remaining, view: view
  };
});
