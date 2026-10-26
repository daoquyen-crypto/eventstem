# EventSTEM

Trang tĩnh tại **[eventstem.com](https://eventstem.com)**. Trang tổng hợp lịch giải RECF (VEX IQ, VEX V5, Aerial Drone…) trên toàn thế giới. Trang cũng có **bảng xếp hạng toàn cầu**, dựng từ kết quả mà Event Partner gửi về.

- Dữ liệu giải được tự động lấy từ recfevents.org mỗi 6 tiếng.
- Trang chạy bằng GitHub Pages, từ nhánh `main`, thư mục gốc.
- **Công cụ tổ chức giải** (`manage.html`): nhà trường và Event Partner đăng ký tài khoản, SEPA duyệt, rồi tự tạo giải, nhập đội, tạo lịch trận, chấm điểm, đánh chung kết và trao giải theo luật RECF Engage. Người xem theo dõi trực tiếp ở `event.html`. Cài đặt: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
- Trang có 2 ngôn ngữ: **tiếng Anh (mặc định)** và tiếng Việt. Người xem chuyển bằng nút **EN / VI** ở đầu trang, lựa chọn được nhớ trong trình duyệt. Có thể gửi link thẳng bản tiếng Việt: `https://eventstem.com/?lang=vi`.

## Cấu trúc thư mục

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | Trang chủ: lịch giải RECF và xếp hạng toàn cầu |
| `manage.html` | Công cụ tổ chức giải (cần đăng nhập) |
| `event.html` | Trang xem trực tiếp: lịch trận, điểm, xếp hạng của từng giải |
| `js/engage.js` | Luật Engage: tạo lịch, xếp hạng Alliance/Solo, chung kết, giải thưởng, xuất CSV |
| `js/store.js` | Lưu dữ liệu: Supabase, hoặc chế độ demo trong trình duyệt |
| `js/config.js` | Địa chỉ và khoá công khai của Supabase (để trống = chế độ demo) |
| `js/manage.js`, `js/event.js`, `js/views.js`, `js/i18n.js`, `css/app.css` | Giao diện của 2 trang trên |
| `js/vendor/` | Thư viện supabase-js 2.45.4 (MIT), để sẵn trong kho để không phụ thuộc CDN |
| `supabase/schema.sql` | Cơ sở dữ liệu và phân quyền (chạy 1 lần trong Supabase) |
| `tests/` | Kiểm thử luật, phân quyền và giao diện; chạy tự động bằng `.github/workflows/tests.yml` |
| `events.json` | Dữ liệu giải, tự sinh bởi `scripts/crawler.py` |
| `results.json` | Dữ liệu xếp hạng, tự sinh bởi `scripts/build_results.py` |
| `results/` | Các file CSV kết quả giải do Event Partner gửi |
| `scripts/crawler.py` | Lấy dữ liệu giải từ recfevents.org |
| `scripts/build_results.py` | Gộp các CSV trong `results/` thành `results.json` |
| `.github/workflows/update-events.yml` | Chạy tự động mỗi 6 tiếng, khi có thay đổi trong `results/`, hoặc khi bấm chạy tay |
| `docs/HUONG_DAN_TRIEN_KHAI.md` | Hướng dẫn triển khai chi tiết |
| `docs/SUPABASE_SETUP.md` | Hướng dẫn bật công cụ tổ chức giải |
| `CNAME`, `robots.txt`, `sitemap.xml` | Cấu hình tên miền và SEO |
| `requirements.txt` | Thư viện Python cho các script |

## Event Partner thêm kết quả giải

1. Tải file mẫu `results/_MAU_KET_QUA.csv`. Điền theo mẫu, mỗi dòng là 1 điểm hoặc 1 giải thưởng của 1 đội.
   - `program`: `Engage`, `Achieve`, `Inspire`, `ADC`, `ADC Pro`
   - `grade`: `ES` (Tiểu học), `MS` (THCS), `HS` (THPT), `UNI` (Đại học)
   - `type`: `solo1`, `solo2`, `alliance` (cột `value` là số điểm), hoặc `award` (cột `value` là tên giải thưởng)
   - `verified`: `yes` hoặc `no`. Chỉ giải có `yes` mới được tính vào xếp hạng.
2. Gửi file cho SEPA. SEPA kiểm tra rồi đặt `verified` = `yes`.
3. Trên GitHub, vào thư mục `results/` → **Add file → Upload files** → tải file lên → **Commit changes**.
   - Mỗi giải nên có 1 file, đặt tên theo mã giải, ví dụ `ENG20261234.csv`.
   - File có tên bắt đầu bằng `_` sẽ bị bỏ qua.
4. GitHub Actions tự dựng lại `results.json`. Khoảng vài phút sau, trang được cập nhật.

Lưu ý: `results/mau_2026-2027.csv` là dữ liệu mẫu, nên trang đang hiện dòng cảnh báo "Dữ liệu mẫu". Khi đã có kết quả thật, xoá file này thì cảnh báo sẽ tự mất.

## Tổ chức giải bằng công cụ EventSTEM

1. Vào `https://eventstem.com/manage.html` → **Create account** (họ tên, trường, email). Chờ SEPA duyệt, hoặc được duyệt ngay nếu SEPA bật duyệt tự động.
2. **New event** → điền tên giải, ngày, địa điểm, số trận mỗi đội, số sân.
3. **Teams**: dán danh sách đội từ Excel, hoặc lấy đội đã đăng ký trên RECF Events theo mã giải. Đánh dấu check-in và kiểm tra robot.
4. **Schedule**: bấm **Generate schedule** để tạo lịch ngẫu nhiên theo luật 7.4.2 (mỗi đội cùng số trận, tránh gặp lại đồng đội, có thời gian nghỉ). Bấm **Print** để in.
5. **Overview** → chuyển trạng thái sang **Live**. Gửi link trang công khai cho đội và phụ huynh.
6. **Scoring**: nhập điểm từng trận, kể cả thẻ đỏ hoặc vắng mặt. **Solo**: ghi từng lượt driving/coding (tối đa 5 lượt mỗi đội). Bảng xếp hạng tự tính theo luật 3.5 và 7.4.4.
7. **Finals**: tạo các cặp 1+2, 3+4…, đánh từ cặp hạng thấp nhất, nhập điểm. Hoà hạng nhất thì thêm trận tiebreak.
8. **Awards**: nhập giải giám khảo (mỗi đội tối đa 1 giải). Vô địch giải và vô địch Solo được tự động thêm.
9. **Export**: tải file CSV kết quả. Khi SEPA đánh dấu giải **Verified**, kết quả tự vào xếp hạng toàn cầu.

Nhà trường cũng có thể tổ chức giải riêng, không thuộc RECF: chọn chương trình **Independent tournament**, rồi đổi số trận, số lượt solo và cách tính theo ý.

## Chạy thử trên máy

```bash
pip install -r requirements.txt
python scripts/build_results.py /tmp/test.json   # dựng thử results.json
python -m http.server 8000                       # mở http://localhost:8000
node --test tests/*.test.js                      # kiểm thử luật Engage
```

Chưa điền `js/config.js` thì `manage.html` chạy ở chế độ demo: tài khoản tạo đầu tiên là quản trị SEPA, dữ liệu lưu trong trình duyệt.
