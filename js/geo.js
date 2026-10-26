/* Đoán quốc gia của người xem để gợi ý "giải gần bạn" và điền sẵn ô quốc gia. Không gửi gì ra ngoài.
   Thứ tự: quốc gia người dùng đã chọn trước đó → múi giờ → vùng trong ngôn ngữ trình duyệt (vd. en-AU).
   Geo.countries() trả về danh sách tên quốc gia tiếng Anh (giống cột country của dữ liệu RECF), ưu tiên trước. */
(function () {
  var KEY = 'eventstem-country';
  var TZ = {
    'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN', 'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'MO',
    'Asia/Taipei': 'TW', 'Asia/Seoul': 'KR', 'Asia/Tokyo': 'JP', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID',
    'Asia/Manila': 'PH', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Yangon': 'MM', 'Asia/Rangoon': 'MM', 'Asia/Phnom_Penh': 'KH', 'Asia/Vientiane': 'LA',
    'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Kathmandu': 'NP', 'Asia/Colombo': 'LK',
    'Asia/Almaty': 'KZ', 'Asia/Tashkent': 'UZ', 'Asia/Jerusalem': 'IL', 'Asia/Amman': 'JO', 'Asia/Ulaanbaatar': 'MN',
    'Europe/Istanbul': 'TR', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
    'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU',
    'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Athens': 'GR', 'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE', 'Europe/Helsinki': 'FI',
    'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Lisbon': 'PT', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Moscow': 'RU',
    'Africa/Tripoli': 'LY', 'Africa/Cairo': 'EG', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Casablanca': 'MA', 'Africa/Accra': 'GH',
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US', 'America/Boise': 'US', 'Pacific/Honolulu': 'US', 'America/Puerto_Rico': 'PR',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Regina': 'CA',
    'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE',
    'America/Panama': 'PA', 'America/Guatemala': 'GT', 'America/Costa_Rica': 'CR', 'America/Caracas': 'VE',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
    'Australia/Darwin': 'AU', 'Pacific/Auckland': 'NZ'
  };
  /* Tên Intl khác với tên trong dữ liệu RECF */
  var ALIAS = { 'Türkiye': 'Turkey', 'Myanmar (Burma)': 'Myanmar', 'Hong Kong SAR China': 'Hong Kong', 'Macao SAR China': 'Macau', 'Czechia': 'Czech Republic' };
  function name(code) {
    try { var n = new Intl.DisplayNames(['en'], { type: 'region' }).of(code); return ALIAS[n] || n; } catch (x) { return null; }
  }
  window.Geo = {
    countries: function () {
      var out = [], add = function (n) { if (n && out.indexOf(n) < 0) out.push(n); };
      try { add(localStorage.getItem(KEY)); } catch (x) {}
      try { var tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ[tz]) add(name(TZ[tz])); } catch (x) {}
      (navigator.languages || [navigator.language]).forEach(function (l) { var m = /[-_]([A-Za-z]{2})(\b|$)/.exec(l || ''); if (m) add(name(m[1].toUpperCase())); });
      return out;
    },
    guess: function () { return this.countries()[0] || ''; },
    remember: function (n) { try { if (n) localStorage.setItem(KEY, n); } catch (x) {} }
  };
})();
