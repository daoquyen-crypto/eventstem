# EventSTEM: hướng dẫn cho Claude

Trang tĩnh **eventstem.com** của **SEPA** (Việt Nam). Trang có 3 phần:
- Lịch các giải RECF trên toàn thế giới, kèm bảng xếp hạng toàn cầu.
- Công cụ để nhà trường và Event Partner tự tổ chức giải robot.
- Trang xem trực tiếp cho người xem.

Người dùng chính là SEPA (`daoquyen@sepa.org.vn`), không phải lập trình viên. Khi làm việc:
- Trả lời bằng **tiếng Việt** đơn giản.
- Hướng dẫn từng bước bấm vào đâu trên GitHub hoặc Supabase.
- Không để người dùng tự chạy lệnh trên máy.

## Kiến trúc

- **GitHub Pages** phục vụ nhánh `main`, thư mục gốc. Không có bước build, không dùng framework. Chỉ có HTML, CSS và JS thuần (ES5, kiểu `var` và `function`). Mỗi PR merge xong khoảng 1–2 phút là lên trang.
- **Supabase** (gói miễn phí) lo tài khoản và dữ liệu giải.
  - URL và khoá *publishable* nằm trong `js/config.js`. Khoá này công khai, đó là chủ ý.
  - Quyền truy cập do RLS trong `supabase/schema.sql` kiểm soát.
  - Để trống `js/config.js` thì trang chạy **chế độ demo**, lưu dữ liệu trong `localStorage`.
- **GitHub Actions**:
  - `update-events.yml` chạy mỗi 6 tiếng: lấy dữ liệu recfevents.org vào `events.json`, gộp `results/*.csv` thành `results.json`, và gọi Supabase để project miễn phí không bị tạm dừng.
  - `tests.yml` chạy test trên mỗi PR.

## File chính

| File | Vai trò |
|---|---|
| `index.html` | Trang chủ, 1 file chứa cả CSS và JS: lịch giải RECF và xếp hạng toàn cầu. Lịch giải: dải "Gần bạn" (giải sắp tới ở nước người xem, rồi nước lân cận trong `NEAR_KM`; giải đã qua chỉ là link "đã diễn ra"), danh sách **nhóm theo tháng** (`<details class="mon">`, chỉ dựng khi mở; "Đang diễn ra" cho league đã bắt đầu; mặc định mở tháng đầu, tìm kiếm / lọc ≤ 40 giải thì mở hết), lọc "Chỉ giải đang mở đăng ký". Bảng xếp hạng gộp `results.json` với các giải đã được SEPA xác minh từ Supabase (`toolResults()`, `mergeTool()`) |
| `manage.html` + `js/manage.js` | Công cụ ban tổ chức: đăng nhập, tạo giải, đội, lịch, chấm điểm, Solo, xếp hạng, chung kết / loại trực tiếp, giải thưởng, xuất CSV; SEPA duyệt tài khoản |
| `event.html` + `js/event.js` | Trang xem trực tiếp, tự kiểm tra cập nhật mỗi 20 giây |
| `show.html` + `js/show.js` | Màn hình trình chiếu tại sân, tự cập nhật mỗi 15 giây. Các slide: `next`, `sched` (lịch các trận còn lại), `rank`, `solo`, `elim`, `awards`, `events` (giải RECF sắp tới trong nước + lân cận, từ `events.json`), `sponsors`. Chọn màn bằng `&screen=`: `all` (luân phiên các slide bật trong `event.config.show`), `matches`, `standings`, `events`, `sponsors`, hoặc `overlay` (lớp phủ livestream cho OBS: nền trong suốt, `&bg=green` / `&bg=dark`, `&field=2`). Đổi màn được ngay trên thanh điều khiển. Ghi đè khác: `&s=10`, `&only=rank,solo`, `&spot=seq` / `rand` / `nasa,google`. Chân màn hình luôn có dải logo **Spotlight Partners** chạy liên tục (`paintSpot()`; chỉ dựng lại khi cài đặt đổi) |
| `js/partners.js` | Danh sách Spotlight Partners (ảnh ở `assets/partners/<id>.png`) và bộ phát logo kế tiếp. Ban tổ chức chọn trong tab Logo & trình chiếu, lưu ở `event.config.show.spotlight = {mode, pick}`: `seq` lần lượt, `rand` ngẫu nhiên (mỗi vòng đủ mặt, không lặp liền nhau), `pick` tuỳ chọn (chỉ các đối tác đã tích, theo thứ tự đã xếp) |
| `js/engage.js` | Luật **RECF Engage: Tier Takeover** (Game Manual v2.0) |
| `js/achieve.js` | Luật **RECF Achieve: Pinnacle** (Game Manual v2.0): 2 đấu 2, ranking points, chọn liên minh, nhánh loại trực tiếp |
| `js/adc.js` | Luật **RECF ADC Mission 2027: Fast Track** (Game Manual v1.1): Alliance hợp tác như Engage, Solo 3 Piloting + 3 Autonomous, chọn liên minh, loại trực tiếp theo vòng (tứ kết → bán kết → chung kết, `eliminations: 'rounds'`) |
| `js/adcpro.js` | Luật **RECF ADC Pro Mission 2026-2027: Off Grid** (Game Manual v2.0): 2 đấu 2 như Achieve (dùng lại lịch, chọn liên minh, nhánh đấu), nhưng ranking points chỉ có thắng 2 / hoà 1 (5.5), Solo tổng 5 lượt chia tuỳ ý giữa Piloting và Autonomous, cấp HS + đại học, bảng điểm thành phần 3.1 / 4.2 / 5.1 |
| `js/rules.js` | `Rules.of(event)` chọn bộ luật theo `event.ruleset` (`engage-2026` / `achieve-2026` / `adc-2027` / `adcpro-2027`). Giao diện chỉ gọi qua lớp này. Cờ trong mỗi bộ luật: `format` (`coop` / `versus`), `eliminations: 'rounds'` (ADC), `soloPerKind` (ADC), `rpBonus` (Achieve: có Autonomous / Endgame RP), `scoring` (module có `SHEETS` / `calc` / `describe` cho nút 🧮: ADC, ADC Pro) |
| `js/store.js` | Lưu dữ liệu, cùng một giao diện cho `SupabaseStore` và `DemoStore`. Bản demo phải áp đúng các ràng buộc của `schema.sql` |
| `js/views.js` | Bảng dùng chung cho 2 trang (lịch trận, xếp hạng, nhánh đấu) |
| `js/geo.js` | Đoán quốc gia người xem (quốc gia đã chọn trước → múi giờ → ngôn ngữ trình duyệt), không gửi gì ra ngoài. Dùng cho dải "Giải gần bạn" ở trang chủ và ô quốc gia mặc định |
| `js/i18n.js`, `css/app.css` | Ngôn ngữ và giao diện chung của `manage.html` và `event.html` |
| `js/vendor/supabase-2.117.3.js` | supabase-js đóng gói sẵn (MIT); không dùng CDN |
| `scripts/notify-mailer.gs` | Google Apps Script gửi email thông báo bằng tài khoản Google của SEPA. Supabase gọi qua `pg_net` (`notify_send` trong `schema.sql`): `signup` → SEPA (`notify_emails`, trống = mọi superadmin), `decision` duyệt / từ chối → người đăng ký (nếu `notify_users`), `test`. Khoá bí mật `notify_secret` chỉ superadmin đọc được; tab Approval settings chép mã đã điền sẵn khoá (`notifyCard()` trong `manage.js`). `notify_url` chỉ nhận link `script.google.com/macros/s/…/exec`. Hướng dẫn cài: `docs/SUPABASE_SETUP.md` |
| `supabase/schema.sql` | Bảng, RLS, trigger duyệt tài khoản, ràng buộc luật. **Phải chạy lại an toàn nhiều lần** (`if not exists`, `drop … if exists`) |
| `scripts/crawler.py`, `scripts/build_results.py` | Lấy dữ liệu RECF; gộp CSV kết quả |
| `docs/` | `SUPABASE_SETUP.md` (cài đặt), `BRAND.md` (logo, tagline, màu), `HUONG_DAN_TRIEN_KHAI.md` (cũ, viết theo Cloudflare Pages) |

## Quy ước

- **Song ngữ, tiếng Anh là mặc định.**
  - Chữ tĩnh viết tiếng Anh trong HTML, bản tiếng Việt đặt trong `data-vi`, `data-vi-ph`, `data-vi-aria`.
  - Chữ do JS sinh ra dùng `tr(en, vi)`.
  - Mọi chữ mới hiển thị cho người dùng phải có đủ cả hai ngôn ngữ.
- **Theo đúng Game Manual.** Code và chữ trên giao diện ghi số điều luật, ví dụ `(7.4.2)`.
- **Chỗ nào luật không rõ thì làm thành tuỳ chọn của ban tổ chức** (SEPA đã chốt), không tự đoán một cách duy nhất. Tuỳ chọn lưu trong `event.config` (thêm vào `DEFAULTS` của module luật). Ngay dưới tuỳ chọn trong form giải phải có dòng nhỏ **"Why this option: … / Vì sao có tuỳ chọn: …"**, ghi số điều luật và chỗ chưa rõ. Mặc định chọn cách bám sát chữ trong Game Manual nhất.
- **Thêm luật mới** (ví dụ Inspire, Aerial Drone):
  - Viết thành một module riêng giống `achieve.js`.
  - Thêm vào `Rules.byId` và `Rules.CHOICES`.
  - Dùng lại `Views` và cách hiển thị theo `format` (`coop` / `versus`).
- **Tập dượt** (`?rehearsal=1` trên `manage.html`, `event.html`, `show.html`): `DemoStore` dùng kho riêng `eventstem-rehearsal-v1` trong localStorage, tự đăng nhập tài khoản tập (ban tổ chức), không bao giờ gọi Supabase. Link nội bộ phải bọc `Rehearsal.url(...)` để giữ tham số. `Rehearsal.seedFrom(B)` chép cài đặt + đội + logo của giải thật (không chép trận, điểm, chọn liên minh).
- **Logo:** bảng `event_assets` (logo đơn vị + tối đa 8 logo nhà tài trợ), ảnh thu nhỏ trong trình duyệt (`shrinkImage` trong `manage.js`) và lưu dạng data URL ≤ 400 KB; schema chặn mọi thứ không phải `data:image/...`. Không lấy bảng này trong các truy vấn danh sách giải.
- **Đổi cơ sở dữ liệu:** thêm `alter table … add column if not exists` vào `schema.sql`. Trong mô tả PR ghi rõ "cần chạy lại schema.sql". Cập nhật luôn `DemoStore` (`MATCH_COLS`, `MATCH_DEFAULTS`).
- **Hướng ra toàn cầu:** không mặc định hay nhấn mạnh riêng Việt Nam trên giao diện. Quốc gia mặc định lấy từ `Geo.guess()`.
- Không đưa họ tên, ngày sinh hay liên lạc của học sinh vào kho. Kho để public.
- Không ghép logo hay thương hiệu RECF/VEX vào nhận diện EventSTEM.

## Kiểm thử (chạy trước mỗi PR)

```bash
node --test tests/*.test.js                       # luật Engage + Achieve + ADC + ADC Pro, Spotlight Partners, script gửi email
PGHOST=... PGPORT=... bash tests/schema_test.sh   # schema + RLS trên Postgres thường (giả lập Supabase bằng tests/supabase_stub.sql)
python3 -m http.server 8767 &                     # rồi:
node tests/e2e_manage.js                          # E2E luồng Engage (chế độ demo)
node tests/e2e_achieve.js                         # E2E luồng Achieve (chế độ demo)
node tests/e2e_adc.js                             # E2E luồng ADC (chế độ demo)
node tests/e2e_adc_pro.js                         # E2E luồng ADC Pro, nhập điểm thành phần (chế độ demo)
node tests/e2e_show.js                            # E2E logo + màn hình trình chiếu (chế độ demo)
node tests/e2e_rehearsal.js                       # E2E chế độ tập dượt
node tests/e2e_home.js                            # E2E trang chủ: "Gần bạn" theo quốc gia, xem theo tháng
```

- Các test E2E chặn `js/config.js` để luôn chạy ở chế độ demo, **không ghi dữ liệu thử lên Supabase thật**.
- Môi trường cloud của Claude không kết nối được tới supabase.co. Vì vậy chỉ kiểm thử được bản demo và schema trên Postgres local. Khi báo cáo, phải nói rõ phần nào chưa thử được trên Supabase thật.
- Để kiểm tra giao diện, chụp màn hình bằng Playwright ở bề rộng 1280 và 375 (điện thoại), và kiểm tra trang không tràn ngang.

## Git và PR

- Mỗi việc làm trên một nhánh riêng, mở PR vào `main` để SEPA xem và merge.
- Mô tả PR viết bằng tiếng Việt, có phần **Tóm tắt** và **Kiểm tra**.
- Tạo PR bằng `gh api repos/daoquyen-crypto/eventstem/pulls`, vì GraphQL (`gh pr create`) bị chặn.

## Việc còn dang dở

- SEPA chưa cài **SMTP** riêng cho email xác nhận của Supabase. Email mặc định bị giới hạn vài thư mỗi giờ.
- Thông báo email (Apps Script) mới thử trên Postgres local với `pg_net` giả và bản demo; chưa thử gửi thật qua Supabase + Google. Lần đầu cài nên bấm **Send test email** và xem **Recent sends**.
- Chưa chạy một giải thật đầy đủ trên Supabase thật. Lần đầu dùng nên theo dõi lỗi.
- Chưa có luật **Inspire**. Nếu cần, xin SEPA file Game Manual PDF.
- ADC Pro: điểm thành phần trận Alliance lưu ở `matches.detail = {red, blue}`; kiểm tra chéo tổng pump ≤ 3, fuel ≤ 36 (`ADCPro.matchIssues`). Tuỳ chọn của ban tổ chức (xem `ADCPro.DEFAULTS`): `scoreEntry`, `qualRedCard` (`actual` / `win`, 1.6.3), `elimRedCard` (`all` / `finals`, 1.6.3), `bo3Ties` (`replay` / `game`, 7.4.6). Nhánh đấu gọi qua `R().bracket` / `R().gameScores`, không gọi thẳng `Achieve.bracket`.
- ADC: chỗ nào Game Manual chưa rõ thì để thành **tuỳ chọn của ban tổ chức** trong `event.config` (xem `ADC.DEFAULTS`): `scoreEntry` (điểm tổng / điểm thành phần), `goals` (số goal, mặc định 4), `stopTimeTiebreak`, `finalTie` (`replay` / `seed`). Danh sách gợi ý giải giám khảo vẫn là của Engage (chưa có ADC Guide to Judging); ô tên giải nhập tự do.
- `tests/e2e_manage.js` đôi khi hỏng chập chờn ở bước `#pendBadge .pill` (có từ trước khi có ADC; chạy lại thì qua).
- Giải Achieve 8 đội: lịch vẫn có vài trận một đội phải đánh 2 lượt liền nhau. Không tránh được khi vừa muốn không gặp lại đồng đội vừa có ít đội.
- `docs/HUONG_DAN_TRIEN_KHAI.md` vẫn viết theo Cloudflare Pages, trong khi trang đang chạy GitHub Pages.
- Chưa có: nhiều trọng tài cùng chấm một giải (hiện chỉ tài khoản tạo giải và SEPA được sửa), giải nhiều buổi (league, 7.4.5 / 7.4.7).
