# Bật công cụ quản lý giải (Supabase)

Công cụ quản lý giải (`manage.html`) và trang xem trực tiếp (`event.html`) cần một nơi lưu dữ liệu chung. EventSTEM dùng **Supabase** (gói miễn phí) cho việc này.

Khi chưa cài Supabase, công cụ chạy ở **chế độ demo**: dùng thử được đầy đủ, nhưng dữ liệu chỉ nằm trong trình duyệt của máy đang dùng.

Thời gian cài: khoảng 15 phút. Chỉ cần làm 1 lần.

## Bước 1 – Tạo project Supabase

1. Vào [supabase.com](https://supabase.com) → **Start your project** → đăng nhập bằng GitHub (tài khoản `daoquyen-crypto`).
2. **New project**:
   - Name: `eventstem`
   - Database Password: bấm **Generate**, rồi **lưu mật khẩu này lại**.
   - Region: **Southeast Asia (Singapore)**, gần Việt Nam nhất.
   - Bấm **Create new project** và chờ khoảng 2 phút.

## Bước 2 – Tạo bảng dữ liệu

1. Menu trái → **SQL Editor** → **New query**.
2. Mở file [`supabase/schema.sql`](../supabase/schema.sql) trên GitHub → bấm nút **Copy raw file** → dán vào ô soạn thảo.
3. Bấm **Run**. Thấy dòng `Success. No rows returned` là xong.

Muốn chạy lại file này (ví dụ khi có bản cập nhật) cũng được, dữ liệu cũ không bị mất.

## Bước 3 – Cấu hình đăng nhập

Menu trái → **Authentication**:

1. **URL Configuration**
   - Site URL: `https://eventstem.com/manage.html`
   - Redirect URLs: thêm `https://eventstem.com/manage.html`
2. **Sign In / Providers → Email**: giữ **Confirm email** bật. Người đăng ký phải bấm link trong email mới đăng nhập được.
3. **Emails → SMTP Settings** (nên làm trước khi mời nhiều trường):
   - Email mặc định của Supabase chỉ gửi được vài thư mỗi giờ và hay vào hộp thư rác.
   - Bật **Custom SMTP** và dùng hộp thư của SEPA. Ví dụ Gmail/Google Workspace: host `smtp.gmail.com`, port `465`, user là email SEPA, password là *App password* tạo trong cài đặt bảo mật Google.

## Bước 4 – Nối trang web với Supabase

1. Menu trái → **Project Settings → API**. Chép 2 giá trị:
   - **Project URL** (dạng `https://abcd1234.supabase.co`)
   - **anon public** key (chuỗi dài bắt đầu bằng `eyJ…`)
2. Trên GitHub, mở file `js/config.js` → biểu tượng bút chì → điền 2 giá trị:
   ```js
   window.EVENTSTEM_CONFIG = {
     supabaseUrl: 'https://abcd1234.supabase.co',
     supabaseAnonKey: 'eyJ...'
   };
   ```
3. **Commit changes**. Khoảng 1 phút sau, trang tự cập nhật.

Khoá *anon public* được thiết kế để nằm công khai trong trang web. Quyền đọc/ghi do các quy tắc trong `schema.sql` kiểm soát.

⚠ **Không bao giờ** dán khoá **service_role** vào trang web hay lên GitHub. Khoá đó có toàn quyền với dữ liệu.

## Bước 5 – Tạo tài khoản SEPA (quản trị)

1. Mở `https://eventstem.com/manage.html` → **Create account** → đăng ký bằng `daoquyen@sepa.org.vn` → bấm link xác nhận trong email.
2. Quay lại Supabase → **SQL Editor** → chạy lệnh:
   ```sql
   update public.profiles set role = 'superadmin', status = 'approved' where email = 'daoquyen@sepa.org.vn';
   ```
3. Tải lại `manage.html`. Bên cạnh tên bạn sẽ có nhãn **SEPA**, và trang có thêm các tab **Accounts**, **Approval settings** và **All events**.

Từ giờ, muốn cấp quyền SEPA cho đồng nghiệp thì bấm **Make SEPA admin** ở tab Accounts, không cần dùng SQL nữa.

## Duyệt tài khoản

Tab **Approval settings** có 3 chế độ:

| Chế độ | Khi nào dùng |
|---|---|
| Duyệt tay | Mặc định. SEPA duyệt từng tài khoản ở tab **Accounts**. |
| Tự động theo tên miền email | Ví dụ điền `sepa.org.vn`, `hanoi.edu.vn`. Giáo viên có email trường được duyệt ngay, còn lại chờ SEPA. |
| Tự động cho tất cả | Khi mở rộng cho nhiều trường tự tổ chức. Nên xem tab Accounts thường xuyên, tài khoản lạ thì bấm **Reject**. |

Tài khoản bị từ chối không tạo được giải và không sửa được giải đã có.

## Xếp hạng toàn cầu

Chỉ giải **RECF Engage** được SEPA tick **Verified** mới được tính vào bảng **Xếp hạng toàn cầu** trên trang chủ. Có hai chỗ để tick:
- Tab **All events**
- Tab **Overview** của từng giải

Giải tự tổ chức (chương trình "Independent tournament") vẫn có trang trực tiếp riêng, nhưng không trộn vào xếp hạng RECF.

## Giới hạn gói miễn phí

- **500 MB** dữ liệu, đủ cho hàng nghìn giải.
- Project **tạm dừng nếu 7 ngày không có truy cập**.
  - Workflow cập nhật dữ liệu 6 tiếng/lần đã có bước gọi Supabase để giữ project hoạt động.
  - Nếu project vẫn bị dừng: vào supabase.com → project → **Restore**.
  - Gói Pro (25 USD/tháng) không bị dừng và có sao lưu hằng ngày.
- **Không có sao lưu tự động.** Sau mỗi giải, ban tổ chức nên vào tab **Export → Download CSV** để giữ một bản.

## Kiểm tra cấu hình

Trên máy có Postgres, có thể chạy bộ test quyền truy cập:

```bash
PGHOST=localhost PGPORT=5432 bash tests/schema_test.sh
```

Bộ test này cũng chạy tự động trên GitHub Actions mỗi khi có Pull Request (workflow `tests.yml`).
