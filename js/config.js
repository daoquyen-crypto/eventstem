/* Kết nối Supabase. Lấy 2 giá trị này ở Supabase → Project Settings → API.
   Khoá "anon public" được thiết kế để nằm công khai trong trang web; quyền truy cập do RLS trong supabase/schema.sql quyết định.
   Để trống cả hai thì công cụ chạy ở CHẾ ĐỘ DEMO: dữ liệu chỉ lưu trong trình duyệt đang dùng. */
window.EVENTSTEM_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
