# EventSTEM

Trang tĩnh tại **[eventstem.com](https://eventstem.com)**. Trang tổng hợp lịch giải RECF (VEX IQ, VEX V5, Aerial Drone…) trên toàn thế giới. Trang cũng có **bảng xếp hạng toàn cầu**, dựng từ kết quả mà Event Partner gửi về.

- Dữ liệu giải được tự động lấy từ recfevents.org mỗi 6 tiếng.
- Trang chạy bằng GitHub Pages, từ nhánh `main`, thư mục gốc.

## Cấu trúc thư mục

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | Trang web (một file duy nhất) |
| `events.json` | Dữ liệu giải, tự sinh bởi `scripts/crawler.py` |
| `results.json` | Dữ liệu xếp hạng, tự sinh bởi `scripts/build_results.py` |
| `results/` | Các file CSV kết quả giải do Event Partner gửi |
| `scripts/crawler.py` | Lấy dữ liệu giải từ recfevents.org |
| `scripts/build_results.py` | Gộp các CSV trong `results/` thành `results.json` |
| `.github/workflows/update-events.yml` | Chạy tự động mỗi 6 tiếng, khi có thay đổi trong `results/`, hoặc khi bấm chạy tay |
| `docs/HUONG_DAN_TRIEN_KHAI.md` | Hướng dẫn triển khai chi tiết |
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

## Chạy thử trên máy

```bash
pip install -r requirements.txt
python scripts/build_results.py /tmp/test.json   # dựng thử results.json
python -m http.server 8000                       # mở http://localhost:8000
```
