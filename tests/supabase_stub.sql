-- Giả lập phần tối thiểu của Supabase để kiểm thử supabase/schema.sql trên Postgres thường.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- pg_net giả: ghi lại các lần gọi để kiểm tra thông báo email
create schema net;
create table net.calls (id bigserial primary key, url text, body jsonb, at timestamptz default now());
create table net._http_response (id bigint, created timestamptz default now(), status_code int, error_msg text);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $$ insert into net.calls(url, body) values (url, body) returning id $$;
