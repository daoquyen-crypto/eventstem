-- EventSTEM: cơ sở dữ liệu cho công cụ quản lý giải.
-- Chạy 1 lần trong Supabase → SQL Editor. Chạy lại cũng an toàn (dùng IF NOT EXISTS / OR REPLACE).
--
-- Vai trò:
--   khách (anon)        xem giải đã công bố: đội, lịch trận, điểm, giải thưởng
--   organizer           tạo và quản lý giải của mình, sau khi tài khoản được duyệt
--   superadmin (SEPA)   duyệt tài khoản, bật duyệt tự động, xác minh giải để tính vào xếp hạng toàn cầu

create extension if not exists pgcrypto;

-- ---------- Tài khoản ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null default '',
  organization  text not null default '',
  country       text not null default '',
  role          text not null default 'organizer' check (role in ('organizer', 'superadmin')),
  status        text not null default 'pending'   check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid
);

-- Duyệt tự động: 'off' = SEPA duyệt tay · 'all' = duyệt mọi tài khoản · 'domains' = duyệt email thuộc các tên miền trong danh sách
create table if not exists public.app_settings (
  id                    int primary key default 1 check (id = 1),
  auto_approve_mode     text not null default 'off' check (auto_approve_mode in ('off', 'all', 'domains')),
  auto_approve_domains  text[] not null default '{}'
);
insert into public.app_settings (id) values (1) on conflict do nothing;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'superadmin' and status = 'approved');
$$;
create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s app_settings;
  dom text := lower(split_part(new.email, '@', 2));
  st text := 'pending';
begin
  select * into s from app_settings where id = 1;
  if s.auto_approve_mode = 'all' or (s.auto_approve_mode = 'domains' and dom = any (s.auto_approve_domains)) then
    st := 'approved';
  end if;
  insert into profiles (id, email, display_name, organization, country, status, reviewed_at)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'display_name', ''),
          coalesce(new.raw_user_meta_data ->> 'organization', ''),
          coalesce(new.raw_user_meta_data ->> 'country', ''),
          st, case when st = 'approved' then now() end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- SEPA duyệt / từ chối / cấp quyền
create or replace function public.admin_set_user(uid uuid, new_status text, new_role text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Chỉ SEPA (superadmin) được duyệt tài khoản' using errcode = '42501'; end if;
  if uid = auth.uid() and (new_status <> 'approved' or coalesce(new_role, 'superadmin') <> 'superadmin') then
    raise exception 'Không tự hạ quyền của chính mình' using errcode = '42501';
  end if;
  update profiles set status = new_status, role = coalesce(new_role, role), reviewed_at = now(), reviewed_by = auth.uid()
  where id = uid;
end $$;

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or is_superadmin());
-- Người dùng chỉ được sửa thông tin hiển thị của mình, không sửa role/status
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (display_name, organization, country) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select using (is_superadmin());
drop policy if exists settings_update on public.app_settings;
create policy settings_update on public.app_settings for update using (is_superadmin()) with check (is_superadmin());
revoke insert, delete on public.app_settings from anon, authenticated;

-- ---------- Giải đấu ----------
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name            text not null check (length(name) between 2 and 200),
  program         text not null default 'Engage',
  ruleset         text not null default 'engage-2026',
  config          jsonb not null default '{}',
  date            date,
  end_date        date,
  location        text not null default '',
  country         text not null default '',
  organizer_name  text not null default '',
  recf_code       text not null default '',
  grades          text[] not null default '{ES,MS}',
  status          text not null default 'draft' check (status in ('draft', 'published', 'live', 'completed')),
  verified        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists events_owner_idx on public.events (owner);

-- Chỉ SEPA được đổi verified và owner
create or replace function public.events_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then
    if tg_op = 'INSERT' then new.verified := false; new.owner := auth.uid();
    else new.verified := old.verified; new.owner := old.owner; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists events_guard on public.events;
create trigger events_guard before insert or update on public.events for each row execute function public.events_guard();

create or replace function public.can_edit_event(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e where e.id = eid and ((e.owner = auth.uid() and is_approved()) or is_superadmin()));
$$;
create or replace function public.can_view_event(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e where e.id = eid and (e.status <> 'draft' or e.owner = auth.uid() or is_superadmin()));
$$;

alter table public.events enable row level security;
drop policy if exists events_select on public.events;
create policy events_select on public.events for select using (status <> 'draft' or owner = auth.uid() or is_superadmin());
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert with check (is_approved());
drop policy if exists events_update on public.events;
create policy events_update on public.events for update using ((owner = auth.uid() and is_approved()) or is_superadmin());
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete using ((owner = auth.uid() and is_approved()) or is_superadmin());

-- ---------- Đội ----------
create table if not exists public.teams (
  event_id     uuid not null references public.events(id) on delete cascade,
  number       text not null check (number ~ '^[A-Z0-9_-]{2,20}$'),
  name         text not null default '',
  org          text not null default '',
  country      text not null default '',
  grade        text not null default 'ES' check (grade in ('ES', 'MS', 'HS', 'UNI')),
  checked_in   boolean not null default false,
  inspected    boolean not null default false,
  excluded     boolean not null default false,   -- 7.2.6: không tham gia được chung kết
  primary key (event_id, number)
);

-- ---------- Trận Alliance (vòng loại, tập, chung kết) ----------
create table if not exists public.matches (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  round        text not null default 'qual' check (round in ('practice', 'qual', 'final')),
  num          int  not null check (num > 0),
  field        text not null default '1',
  time         text,
  red          text not null,
  blue         text not null,
  red_counts   boolean not null default true,    -- false = trận * (7.4.2), không tính xếp hạng
  blue_counts  boolean not null default true,
  seed         int,                               -- thứ hạng liên minh ở chung kết
  score        int check (score >= 0),            -- null = chưa đánh
  red_status   text not null default 'ok' check (red_status  in ('ok', 'absent', 'red')),
  blue_status  text not null default 'ok' check (blue_status in ('ok', 'absent', 'red')),
  stop_time    int check (stop_time between 0 and 60),
  updated_at   timestamptz not null default now(),
  unique (event_id, round, num),
  check (red <> blue),
  foreign key (event_id, red)  references public.teams (event_id, number) on update cascade,
  foreign key (event_id, blue) references public.teams (event_id, number) on update cascade
);

-- ---------- Achieve (Pinnacle): trận 2 đấu 2, ranking points, nhánh loại trực tiếp ----------
-- Thêm cột vào bảng matches. Chạy lại file này trên project đã có dữ liệu cũng an toàn: cột đã có thì bỏ qua.
--   red/red2 = liên minh đỏ, blue/blue2 = liên minh xanh; score = điểm đỏ, score_blue = điểm xanh
--   auto_* / end_* = Autonomous / Endgame ranking point của từng liên minh (5.5.1, 5.5.2)
--   label = vị trí trong nhánh đấu (R1-2, F…); seed / seed_blue = hạt giống 2 liên minh
alter table public.matches add column if not exists red2         text;
alter table public.matches add column if not exists blue2        text;
alter table public.matches add column if not exists red2_counts  boolean not null default true;
alter table public.matches add column if not exists blue2_counts boolean not null default true;
alter table public.matches add column if not exists red2_status  text not null default 'ok' check (red2_status  in ('ok', 'absent', 'red'));
alter table public.matches add column if not exists blue2_status text not null default 'ok' check (blue2_status in ('ok', 'absent', 'red'));
alter table public.matches add column if not exists score_blue   int check (score_blue >= 0);
alter table public.matches add column if not exists auto_red     boolean not null default false;
alter table public.matches add column if not exists auto_blue    boolean not null default false;
alter table public.matches add column if not exists end_red      boolean not null default false;
alter table public.matches add column if not exists end_blue     boolean not null default false;
alter table public.matches add column if not exists seed_blue    int;
alter table public.matches add column if not exists label        text;
alter table public.matches drop constraint if exists matches_round_check;
alter table public.matches add constraint matches_round_check check (round in ('practice', 'qual', 'elim', 'final'));
alter table public.matches drop constraint if exists matches_distinct_teams;
alter table public.matches add constraint matches_distinct_teams check (
  (red2  is null or (red2 <> red and red2 <> blue)) and
  (blue2 is null or (blue2 <> red and blue2 <> blue and blue2 is distinct from red2)));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_red2_fkey') then
    alter table public.matches add constraint matches_red2_fkey foreign key (event_id, red2) references public.teams (event_id, number) on update cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_blue2_fkey') then
    alter table public.matches add constraint matches_blue2_fkey foreign key (event_id, blue2) references public.teams (event_id, number) on update cascade;
  end if;
end $$;

-- ---------- Trận Solo (3.0, 4.0, 7.4.1) ----------
create table if not exists public.solo_runs (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  team        text not null,
  kind        text not null check (kind in ('driving', 'coding')),
  score       int  not null check (score >= 0),
  stop_time   int  check (stop_time between 0 and 60),
  created_at  timestamptz not null default now(),
  foreign key (event_id, team) references public.teams (event_id, number) on update cascade on delete cascade
);
create index if not exists solo_runs_event_idx on public.solo_runs (event_id, team);

-- Tối đa N lượt solo mỗi đội (mặc định 5, đổi được trong config.soloAttempts).
-- ADC (ruleset adc-2027): N lượt cho mỗi loại, mặc định 3 Piloting + 3 Autonomous (ADC 7.4.1).
create or replace function public.solo_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int; per_kind boolean;
begin
  select ruleset = 'adc-2027', coalesce((config ->> 'soloAttempts')::int, case when ruleset = 'adc-2027' then 3 else 5 end)
    into per_kind, lim from events where id = new.event_id;
  select count(*) into n from solo_runs where event_id = new.event_id and team = new.team and (not per_kind or kind = new.kind);
  if n >= lim then raise exception 'Đội % đã dùng hết % lượt solo%', new.team, lim, case when per_kind then ' ' || new.kind else '' end using errcode = '23514'; end if;
  return new;
end $$;
drop trigger if exists solo_limit on public.solo_runs;
create trigger solo_limit before insert on public.solo_runs for each row execute function public.solo_limit();

-- ---------- ADC (Fast Track) ----------
--   detail = điểm thành phần (số bóng mỗi goal, phase, cổng…) khi ban tổ chức chọn nhập chi tiết; score vẫn là điểm tổng
--   stop_time của trận Alliance ADC tới 90 giây (trận 90 giây, 5.3.1)
alter table public.matches   add column if not exists detail jsonb;
alter table public.solo_runs add column if not exists detail jsonb;
alter table public.matches drop constraint if exists matches_stop_time_check;
alter table public.matches add constraint matches_stop_time_check check (stop_time between 0 and 90);

-- ---------- Giải thưởng (6.3, 7.2.7) ----------
create table if not exists public.awards (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references public.events(id) on delete cascade,
  team      text not null,
  name      text not null check (length(name) between 2 and 80),
  judged    boolean not null default true,
  foreign key (event_id, team) references public.teams (event_id, number) on update cascade on delete cascade
);
-- 6.3: mỗi đội nhận tối đa 1 giải do giám khảo chấm
create unique index if not exists awards_one_judged on public.awards (event_id, team) where judged;

-- ---------- Logo của giải (ban tổ chức + nhà tài trợ) ----------
-- Ảnh đã được thu nhỏ trong trình duyệt, lưu dạng data URL. Bảng riêng để danh sách giải không phải tải ảnh.
--   organizer = logo đơn vị tổ chức; sponsors = [{src, name}], tối đa 8
create or replace function public.is_image_data(t text) returns boolean
language sql immutable as $$
  select t is null or (t ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$' and length(t) <= 400000)
$$;
create or replace function public.valid_sponsors(j jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= 8 and
    not exists (select 1 from jsonb_array_elements(j) x
                where jsonb_typeof(x) <> 'object' or not public.is_image_data(x ->> 'src') or x ->> 'src' is null
                   or length(coalesce(x ->> 'name', '')) > 80)
$$;
create table if not exists public.event_assets (
  event_id   uuid primary key references public.events(id) on delete cascade,
  organizer  text check (public.is_image_data(organizer)),
  sponsors   jsonb not null default '[]' check (public.valid_sponsors(sponsors))
);

-- ---------- Quyền cho các bảng con ----------
do $$
declare t text;
begin
  foreach t in array array['teams', 'matches', 'solo_runs', 'awards', 'event_assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (can_view_event(event_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (can_edit_event(event_id)) with check (can_edit_event(event_id))', t || '_write', t);
  end loop;
end $$;

-- Mỗi lần sửa dữ liệu con, cập nhật events.updated_at để trang xem biết cần tải lại
create or replace function public.touch_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update events set updated_at = now() where id = coalesce(new.event_id, old.event_id);
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['teams', 'matches', 'solo_runs', 'awards', 'event_assets'] loop
    execute format('drop trigger if exists touch_event on public.%I', t);
    execute format('create trigger touch_event after insert or update or delete on public.%I for each row execute function public.touch_event()', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.events, public.teams, public.matches, public.solo_runs, public.awards, public.event_assets to anon, authenticated;
grant insert, update, delete on public.events, public.teams, public.matches, public.solo_runs, public.awards, public.event_assets to authenticated;
grant select on public.profiles, public.app_settings to authenticated;
grant update on public.app_settings to authenticated;
grant execute on function public.admin_set_user(uuid, text, text) to authenticated;

-- ---------- Sau khi chạy file này ----------
-- 1. Đăng ký tài khoản SEPA trên trang manage.html.
-- 2. Chạy lệnh sau (đổi email nếu cần) để cấp quyền superadmin:
--    update public.profiles set role = 'superadmin', status = 'approved' where email = 'daoquyen@sepa.org.vn';
