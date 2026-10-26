/* Kết nối Supabase. Lấy ở Supabase → nút Connect (hoặc Project Settings → Data API / API Keys).
   Khoá publishable (sb_publishable_…) hoặc anon được thiết kế để nằm công khai trong trang web;
   quyền truy cập do RLS trong supabase/schema.sql quyết định. KHÔNG dán khoá secret / service_role vào đây.
   Để trống cả hai thì công cụ chạy ở CHẾ ĐỘ DEMO: dữ liệu chỉ lưu trong trình duyệt đang dùng. */
window.EVENTSTEM_CONFIG = {
  supabaseUrl: 'https://tlsqtgoxsgamfbrnwsvi.supabase.co',
  supabaseAnonKey: 'sb_publishable_07grHicsLGhIGuOhoavGdQ_WOa7TGib'
};
