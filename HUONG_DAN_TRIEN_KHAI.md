# Đưa EventSTEM lên tên miền riêng (eventstem.com)

Mô hình: **GitHub** giữ mã và tự lấy dữ liệu mỗi 6 tiếng → **Cloudflare Pages** đăng trang lên web → **tên miền riêng** trỏ vào Cloudflare.
Chi phí duy nhất là tiền tên miền. GitHub và Cloudflare Pages đều miễn phí ở mức dùng này.

## Trong thư mục này

| File | Vai trò |
|---|---|
| `index.html` | Trang web |
| `events.json` | Dữ liệu giải (sẽ được tự động cập nhật) |
| `scripts/crawler.py` | Script lấy dữ liệu từ recfevents.org |
| `requirements.txt` | Thư viện Python cho script |
| `.github/workflows/update-events.yml` | Lịch chạy script tự động mỗi 6 tiếng |
| `results/` | File CSV kết quả giải do Event Partner gửi |
| `scripts/build_results.py` | Gộp các CSV kết quả thành `results.json` cho trang Xếp hạng |
| `results.json` | Dữ liệu bảng xếp hạng (tự sinh) |

---

## Bước 1 – Mua tên miền

- **.com / .org / .net**: mua ở Cloudflare Registrar (giá gốc, gắn vào Cloudflare nhanh nhất) hoặc Namecheap.
- **.vn / .com.vn**: mua qua nhà đăng ký Việt Nam (iNET, Mắt Bão, PA Vietnam, Nhân Hòa…). Phải khai thông tin tổ chức/cá nhân.
- ⚠ **Lưu ý thương hiệu:** "RECF" là thương hiệu của REC Foundation. Nếu tên miền có chữ `recf` (ví dụ recfvietnam.org), nên xin RECF đồng ý bằng văn bản trước. Nếu không, chọn tên trung tính.

## Bước 2 – Đưa mã lên GitHub

1. Tạo tài khoản tại github.com (nên dùng email của SEPA).
2. Bấm **New repository**:
   - Tên ví dụ: `recf-world`
   - Chọn **Public** (Actions miễn phí không giới hạn)
   - Bấm Create.
3. Bấm **uploading an existing file** → kéo thả `index.html`, `events.json`, `results.json`, `requirements.txt` và hai thư mục `scripts`, `results` → **Commit changes**.
4. Thư mục `.github` là thư mục ẩn, kéo thả thường bị bỏ sót. Tạo tay như sau:
   - **Add file → Create new file**
   - Ô tên file gõ đúng: `.github/workflows/update-events.yml`
   - Dán nội dung file `update-events.yml` → **Commit**.
5. **Settings → Actions → General → Workflow permissions** → chọn **Read and write permissions** → Save.
6. Tab **Actions** → chọn "Cập nhật dữ liệu giải RECF" → **Run workflow** để chạy thử.
   - Chạy khoảng 5–10 phút, xong có dấu ✓ xanh.
   - `events.json` có commit mới là thành công.

## Bước 3 – Đăng trang bằng Cloudflare Pages

1. Tạo tài khoản tại dash.cloudflare.com.
2. **Workers & Pages → Create → Pages → Connect to Git** → cấp quyền GitHub → chọn kho `recf-world`.
3. Cấu hình build:
   - Framework preset: **None**
   - Build command: *để trống*
   - Build output directory: `/`
4. **Save and Deploy** → trang chạy ở địa chỉ dạng `recf-world.pages.dev`.

Từ giờ, mỗi lần GitHub Actions cập nhật `events.json`, Cloudflare tự đăng lại trang trong khoảng 1 phút.

## Bước 4 – Gắn tên miền riêng

Trong dự án Pages, vào **Custom domains → Set up a custom domain** → gõ tên miền (ví dụ `tenmien.org` hoặc `www.tenmien.vn`). Có 3 trường hợp:

- **Tên miền mua ở Cloudflare:** Cloudflare tự cấu hình. Xong.
- **Tên miền mua nơi khác, muốn chuyển DNS về Cloudflare (khuyên dùng):**
  1. Cloudflare → **Add a site** → nhập tên miền → gói Free.
  2. Cloudflare cho 2 nameserver.
  3. Vào trang quản lý của nhà đăng ký, thay nameserver bằng 2 cái đó.
  4. Chờ từ vài giờ đến 24 giờ, rồi thêm Custom domain như trên.
- **Giữ DNS ở nhà đăng ký Việt Nam:** thêm bản ghi `CNAME` cho `www` trỏ tới `recf-world.pages.dev`. Sau đó thêm `www.tenmien.vn` trong Custom domains.

Cloudflare tự cấp chứng chỉ HTTPS, không cần làm gì thêm.

## Vận hành

- **Dữ liệu tự cập nhật** mỗi 6 tiếng. Muốn cập nhật ngay: tab Actions → Run workflow.
- **Khi lỗi:**
  - Nếu recfevents.org lỗi hoặc đổi giao diện, script dừng lại và **giữ nguyên dữ liệu cũ**. Trang không bị trắng.
  - GitHub gửi email báo lần chạy lỗi. Khi đó gửi email này cho người kỹ thuật (hoặc Claude) để sửa script.
- **Sửa giao diện:** chỉnh `index.html` trực tiếp trên GitHub (biểu tượng bút chì) → Commit → 1 phút sau trang đổi.
- **Lịch sự với máy chủ RECF:** script chỉ đọc các trang công khai mà robots.txt cho phép, có nghỉ giữa các lần tải và ghi danh SEPA. Không nên đặt lịch dày hơn 6 tiếng.

## Bảng xếp hạng toàn cầu

- **Mục "Xếp hạng toàn cầu"** gồm 3 bảng cho từng chương trình và cấp học:
  - **Solo**: điểm Driving cao nhất + Coding cao nhất. Với ADC là Piloting + Autonomous.
  - **Alliance**: trung bình 3 trận cao nhất.
  - **Thành tích**: điểm cộng từ các giải thưởng.
- **Đang chạy bằng dữ liệu mẫu:** file `results/mau_2026-2027.csv`. Trang có dòng cảnh báo "Dữ liệu mẫu".
- **Khi có kết quả thật:**
  1. Event Partner điền file theo mẫu `results/_MAU_KET_QUA.csv` (mỗi dòng 1 điểm hoặc 1 giải thưởng) và gửi cho SEPA.
  2. SEPA kiểm tra, đặt cột `verified` = `yes`, rồi tải file lên thư mục `results/` trên GitHub. Mỗi giải nên có 1 file, ví dụ `ENG20261234.csv`.
  3. GitHub Actions tự dựng lại `results.json`, khoảng 2 phút sau trang cập nhật.
  4. **Xóa file `results/mau_2026-2027.csv`** khi đã có dữ liệu thật. Dòng cảnh báo "Dữ liệu mẫu" sẽ tự biến mất.
- **Chưa xác minh:** giải có `verified` = `no` vẫn hiện trong hồ sơ đội, nhưng không được tính vào xếp hạng.

## Bước tiếp theo

- Thêm nút **Xuất CSV kết quả cho EventSTEM** vào hệ thống chấm điểm Engage (Google Sheet và bản offline) để Event Partner khỏi phải điền tay.
- Thêm trang tiếng Anh, trang hồ sơ từng đội, bản đồ giải.
