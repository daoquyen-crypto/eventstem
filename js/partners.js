/* RECF Spotlight Partners: logo chạy liên tục ở chân màn hình trình chiếu (show.js).
   Ảnh ở assets/partners/<id>.png. Thêm / bớt đối tác: sửa danh sách dưới và thêm / xoá file ảnh tương ứng.
   Cài đặt của ban tổ chức ở event.config.show.spotlight = {mode, pick}:
     mode  'seq'  lần lượt theo thứ tự danh sách (mặc định)
           'rand' ngẫu nhiên: mỗi vòng đủ mặt các đối tác, không lặp liền nhau
           'pick' tuỳ chọn: chỉ các đối tác trong pick, theo thứ tự của pick */
(function () {
  'use strict';
  var LIST = [
    { id: 'recf', name: 'RECF' },
    { id: 'amazon', name: 'Amazon' },
    { id: 'chevron', name: 'Chevron' },
    { id: 'eaton', name: 'Eaton' },
    { id: 'gdit', name: 'General Dynamics Information Technology' },
    { id: 'google', name: 'Google' },
    { id: 'kettering', name: 'Kettering University' },
    { id: 'nasa', name: 'NASA' },
    { id: 'robolink', name: 'Robolink' },
    { id: 'tesla', name: 'Tesla' },
    { id: 'ti', name: 'Texas Instruments' }
  ];
  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  /* Cài đặt đã chuẩn hoá: mode hợp lệ, pick chỉ gồm id có thật */
  function cfg(c) {
    c = c || {};
    var mode = c.mode === 'rand' || c.mode === 'pick' ? c.mode : 'seq';
    var pick = (Array.isArray(c.pick) ? c.pick : []).filter(function (id, i, a) { return byId(id) && a.indexOf(id) === i; });
    return { mode: mode, pick: pick };
  }
  /* Danh sách đối tác sẽ chạy theo cài đặt; 'pick' rỗng thì dùng cả danh sách để dải logo luôn có */
  function active(c) {
    c = cfg(c);
    var l = c.mode === 'pick' ? c.pick.map(byId) : LIST.slice();
    return l.length ? l : LIST.slice();
  }
  /* Bộ phát logo kế tiếp: lần lượt vòng tròn, hoặc "rút túi" ngẫu nhiên */
  function feeder(c, rnd) {
    var list = active(c), rand = cfg(c).mode === 'rand', i = 0, bag = [], last = null;
    rnd = rnd || Math.random;
    return function () {
      if (!rand) return list[i++ % list.length];
      if (!bag.length) {
        bag = list.slice();
        for (var k = bag.length - 1; k > 0; k--) { var j = Math.floor(rnd() * (k + 1)), t = bag[k]; bag[k] = bag[j]; bag[j] = t; }
        if (bag.length > 1 && bag[bag.length - 1] === last) bag.unshift(bag.pop());
      }
      return (last = bag.pop());
    };
  }
  var api = { LIST: LIST, byId: byId, cfg: cfg, active: active, feeder: feeder, src: function (p) { return 'assets/partners/' + p.id + '.png'; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.Partners = api;
})();
