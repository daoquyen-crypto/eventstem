// Kiểm thử dải "Giải gần bạn" ở trang chủ (đoán quốc gia theo múi giờ / ngôn ngữ trình duyệt).  Chạy: python3 -m http.server 8767 & node tests/e2e_home.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8767';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ', m); };
(async () => {
  const b = await chromium.launch(), errs = [];
  const open = async (opts) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts));
    await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.EVENTSTEM_CONFIG = {};' }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/index.html'); await p.waitForSelector('#list .ev, #list .empty');
    return p;
  };
  const head = p => p.locator('#nearH').textContent();

  let p = await open({ timezoneId: 'Australia/Sydney', locale: 'en-AU' });
  assert(await head(p) === 'Events in Australia', 'Sydney visitor sees "Events in Australia"');
  assert(!(await p.locator('#viewEvents').innerText()).includes('Events in Vietnam'), 'no fixed Vietnam section');
  assert(/Schedules, scores and rankings for robotics tournaments worldwide/.test(await p.getAttribute('meta[property="og:description"]', 'content')), 'share description is English-only, worldwide');
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/home-au.png' });

  p = await open({ timezoneId: 'America/Chicago', locale: 'en-US' });
  assert(await head(p) === 'Events in United States', 'Chicago visitor sees US events');

  p = await open({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' });
  assert(await head(p) === 'Events in Vietnam', 'Vietnam visitor still sees local events');

  p = await open({ timezoneId: 'Africa/Nairobi', locale: 'en-KE' });
  assert(await head(p) === 'Coming up worldwide', 'country without events falls back to worldwide upcoming');
  assert(await p.locator('#nearStrip .mini').count() > 0 && await p.locator('#nearStrip .mini').count() <= 16, 'worldwide strip shows the next events');
  // Chọn quốc gia ở bộ lọc → lần sau nhớ
  await p.selectOption('#country', 'Canada');
  assert(await head(p) === 'Events in Canada', 'choosing a country updates the strip');
  await p.reload(); await p.waitForSelector('#list .ev');
  assert(await head(p) === 'Events in Canada', 'chosen country remembered on next visit');
  await p.click('#lang button[data-l=vi]');
  assert(await head(p) === 'Giải tại Canada', 'Vietnamese heading');
  await p.setViewportSize({ width: 375, height: 812 });
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'home fits a phone');

  // Công cụ tổ chức: ô quốc gia khi đăng ký lấy theo nơi người dùng
  const m = await (await b.newContext({ timezoneId: 'Asia/Seoul', locale: 'ko-KR' })).newPage();
  await m.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.EVENTSTEM_CONFIG = {};' }));
  await m.goto(BASE + '/manage.html#signup'); await m.waitForSelector('#suCountry');
  assert(await m.inputValue('#suCountry') === 'South Korea', 'sign-up country defaults to the visitor\'s country');

  console.log('PAGE ERRORS', JSON.stringify(errs));
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
