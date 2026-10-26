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
    await p.goto(BASE + '/index.html'); await p.waitForSelector('#list .mon, #list .empty');
    return p;
  };
  const head = p => p.locator('#nearH').textContent();

  let p = await open({ timezoneId: 'Australia/Sydney', locale: 'en-AU' });
  assert(await head(p) === 'Events in Australia', 'Sydney visitor sees "Events in Australia"');
  assert(!(await p.locator('#viewEvents').innerText()).includes('Events in Vietnam'), 'no fixed Vietnam section');
  assert(/Schedules, scores and rankings for robotics tournaments worldwide/.test(await p.getAttribute('meta[property="og:description"]', 'content')), 'share description is English-only, worldwide');
  assert(await p.locator('.brand .sup').innerText() !== '' && /Supporting RECF robotics & drone events/i.test(await p.locator('.brand .sup').innerText()), 'tagline under the logo: supporting RECF events');
  assert(/Developed by the STEM Education Promotion Alliance \(SEPA\)/.test(await p.locator('#foot').innerText()) && /not an official RECF site/.test(await p.locator('#foot').innerText()), 'footer credits SEPA and keeps the not-official note');
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/home-au.png' });

  p = await open({ timezoneId: 'America/Chicago', locale: 'en-US' });
  assert(await head(p) === 'Events in United States', 'Chicago visitor sees US events');

  p = await open({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' });
  assert(await head(p) === 'Events in Vietnam & nearby', 'Vietnam visitor sees local + nearby events');
  const strip = await p.locator('#nearStrip').innerText();
  assert(!/Ended/.test(strip), 'strip only shows upcoming events (past ones become a "recent results" link)');
  assert(await p.locator('#nearStrip .mini').first().locator('.far').count() === 0 && await p.locator('#nearStrip .mini').nth(2).locator('.far').count() === 1, 'local events come before nearby ones (nearby cards name their country)');
  assert(/China/.test(await p.locator('#nearSub').innerText()), 'summary names the nearby countries');
  await p.click('#nearPast');
  assert(await p.inputValue('#country') === 'Vietnam' && await p.getAttribute('#when button[data-v=past]', 'aria-pressed') === 'true', '"recent results" filters to past events in Vietnam');
  await p.click('#when button[data-v=up]'); await p.selectOption('#country', '');

  // Xem theo tháng: mặc định chỉ mở tháng đầu; bấm tháng để mở; tìm kiếm thì mở hết
  const mons = p.locator('#list details.mon');
  assert(await mons.count() >= 5, 'upcoming events grouped into months');
  assert(await p.locator('#list details.mon.now summary').count() === 1, 'leagues already running grouped as "Happening now"');
  assert(await p.locator('#list details.mon[open]').count() === 1 && await p.locator('#list details.mon:not(.now)').first().getAttribute('open') !== null, 'only the first month is open by default');
  const m2 = p.locator('#list details.mon:not(.now)').nth(1);
  assert(await m2.locator('.ev').count() === 0, 'closed months are not rendered yet');
  assert(/in Vietnam/.test(await p.locator('#list').innerText()), 'month summary flags events in the visitor\'s country');
  await m2.locator('summary').click(); await p.waitForTimeout(150);
  assert(await m2.locator('.ev').count() > 0, 'clicking a month shows its events by day');
  const n1 = +(await m2.locator('.mstat b').innerText());
  assert(await m2.locator('.ev').count() === n1, 'month count matches its list');
  await p.click('#regOpen');
  assert(!/Full|Registration closed/.test(await p.locator('#list').innerText()), '"Open for registration only" hides full / closed events');
  await p.click('#regOpen');
  await p.fill('#q', 'Hanoi');
  assert(await p.locator('#list details.mon:not([open])').count() === 0, 'search opens every matching month');
  await p.fill('#q', '');
  await p.click('#when button[data-v=past]');
  const pk = await p.locator('#list details.mon').evaluateAll(d => d.map(x => x.dataset.k));
  assert(pk.length > 1 && pk[0] > pk[1], 'past events: newest month first');
  await p.click('#when button[data-v=up]');
  await p.setViewportSize({ width: 375, height: 812 });
  assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'month view fits a phone');
  await p.setViewportSize({ width: 1280, height: 800 });

  p = await open({ timezoneId: 'Africa/Nairobi', locale: 'en-KE' });
  assert(await head(p) === 'Coming up worldwide', 'country without events falls back to worldwide upcoming');
  assert(await p.locator('#nearStrip .mini').count() > 0 && await p.locator('#nearStrip .mini').count() <= 16, 'worldwide strip shows the next events');
  // Chọn quốc gia ở bộ lọc → lần sau nhớ
  await p.selectOption('#country', 'Canada');
  assert(await head(p) === 'Events in Canada & nearby', 'choosing a country updates the strip');
  await p.reload(); await p.waitForSelector('#list .mon');
  assert(await head(p) === 'Events in Canada & nearby', 'chosen country remembered on next visit');
  await p.click('#lang button[data-l=vi]');
  assert(await head(p) === 'Giải tại Canada và lân cận', 'Vietnamese heading');
  assert(/Tháng \d+/i.test(await p.locator('#list .mn b').nth(1).innerText()), 'Vietnamese month names');
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
