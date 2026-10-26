#!/bin/bash
# Kiểm thử schema + RLS trên Postgres local.  Dùng: PGHOST=... PGPORT=... bash tests/schema_test.sh
set -u
export PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")/.."
DB=eventstem_test
psql -q -U postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P="psql -q -U postgres -d $DB -v ON_ERROR_STOP=1"
$P -f tests/supabase_stub.sql >/dev/null && $P -f supabase/schema.sql >/dev/null || { echo "FAIL: không nạp được schema"; exit 1; }
# chạy lại lần 2 để chắc file chạy lại an toàn
$P -f supabase/schema.sql >/dev/null || { echo "FAIL: chạy lại schema lỗi"; exit 1; }

pass=0; fail=0
# as <uid|anon> <sql>  → in kết quả 1 dòng (hoặc ERR:...)
as() {
  local who=$1; shift
  local pre
  if [ "$who" = anon ]; then pre="set role anon;"; else pre="set request.jwt.claim.sub = '$who'; set role authenticated;"; fi
  psql -U postgres -d $DB -Atq -c "$pre" -c "$*" 2>&1 | tr '\n' ' ' | sed 's/ $//'
}
check() { # check <tên> <kỳ vọng (regex)> <thực tế>
  if [[ "$3" =~ $2 ]]; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1  → '$3' (cần ~ /$2/)"; fi
}
su() { psql -U postgres -d $DB -Atq -c "$*"; }

SEPA=00000000-0000-0000-0000-00000000000a; ORG=00000000-0000-0000-0000-00000000000b; NEW=00000000-0000-0000-0000-00000000000c; DOM=00000000-0000-0000-0000-00000000000d
su "insert into auth.users(id,email,raw_user_meta_data) values ('$SEPA','daoquyen@sepa.org.vn','{}'),('$ORG','gv@truong-a.edu.vn','{\"display_name\":\"Cô A\",\"organization\":\"Trường A\"}'),('$NEW','x@gmail.com','{}')"
check "đăng ký mới → pending" '^pending pending pending$' "$(su "select string_agg(status,' ' order by email) from profiles")"
check "metadata đăng ký được lưu" '^Cô A\|Trường A$' "$(su "select display_name||'|'||organization from profiles where id='$ORG'")"
su "update profiles set role='superadmin',status='approved' where email='daoquyen@sepa.org.vn'"

check "tài khoản pending không tạo được giải" 'ERR|violates row-level security' "$(as $ORG "insert into events(name) values ('Giải X')")"
check "người dùng không tự duyệt mình" 'permission denied' "$(as $ORG "update profiles set status='approved' where id='$ORG'")"
check "người dùng sửa được tên hiển thị" '^$' "$(as $ORG "update profiles set display_name='Cô An' where id='$ORG'")"
check "organizer không xem được danh sách người khác" '^1$' "$(as $ORG "select count(*) from profiles")"
check "organizer không gọi được admin_set_user" 'Chỉ SEPA' "$(as $ORG "select admin_set_user('$ORG','approved')")"
check "SEPA xem mọi tài khoản" '^3$' "$(as $SEPA "select count(*) from profiles")"
as $SEPA "select admin_set_user('$ORG','approved')" >/dev/null
check "SEPA duyệt tài khoản" '^approved$' "$(su "select status from profiles where id='$ORG'")"
check "SEPA không tự hạ quyền" 'Không tự hạ' "$(as $SEPA "select admin_set_user('$SEPA','rejected')")"
check "organizer không đọc cài đặt" '^$' "$(as $ORG "select auto_approve_mode from app_settings")"

as $SEPA "update app_settings set auto_approve_mode='domains', auto_approve_domains='{edu.vn,truong-b.edu.vn}'" >/dev/null
su "insert into auth.users(id,email) values ('$DOM','hs@truong-b.edu.vn'),(gen_random_uuid(),'y@yahoo.com')"
check "duyệt tự động theo tên miền" '^approved\|pending$' "$(su "select (select status from profiles where email='hs@truong-b.edu.vn')||'|'||(select status from profiles where email='y@yahoo.com')")"
as $SEPA "update app_settings set auto_approve_mode='all'" >/dev/null
su "insert into auth.users(email) values ('z@hotmail.com')"
check "duyệt tự động tất cả" '^approved$' "$(su "select status from profiles where email='z@hotmail.com'")"

EV=$(as $ORG "insert into events(name,date,status,verified,config) values ('Giải Engage HN','2026-11-01','draft',true,'{\"soloAttempts\":2}') returning id")
check "organizer tạo được giải" '^[0-9a-f-]{36}$' "$EV"
check "organizer không tự xác minh giải" '^false\|'$ORG'$' "$(su "select verified||'|'||owner from events where id='$EV'")"
check "khách không thấy giải nháp" '^0$' "$(as anon "select count(*) from events")"
check "tài khoản khác không thấy giải nháp" '^0$' "$(as $DOM "select count(*) from events")"
as $ORG "insert into teams(event_id,number,name,grade) values ('$EV','VN1A','Sao','ES'),('$EV','VN2B','Mai','MS'),('$EV','VN3C','',  'ES')" >/dev/null
check "mã đội sai định dạng bị chặn" 'violates check' "$(as $ORG "insert into teams(event_id,number) values ('$EV','vn 1')")"
check "cấp học sai bị chặn" 'violates check' "$(as $ORG "insert into teams(event_id,number,grade) values ('$EV','VN9','K12')")"
as $ORG "insert into matches(event_id,round,num,red,blue) values ('$EV','qual',1,'VN1A','VN2B'),('$EV','qual',2,'VN2B','VN3C')" >/dev/null
check "trận phải có đội có trong giải" 'violates foreign key' "$(as $ORG "insert into matches(event_id,num,red,blue) values ('$EV',3,'VN1A','XX9')")"
check "trận không trùng số" 'duplicate key' "$(as $ORG "insert into matches(event_id,num,red,blue) values ('$EV',1,'VN1A','VN3C')")"
check "một đội không đánh với chính mình" 'violates check' "$(as $ORG "insert into matches(event_id,num,red,blue) values ('$EV',4,'VN1A','VN1A')")"
check "nhập điểm trận" '^$' "$(as $ORG "update matches set score=85, blue_status='red' where event_id='$EV' and num=1")"
check "điểm âm bị chặn" 'violates check' "$(as $ORG "update matches set score=-1 where event_id='$EV' and num=2")"
as $ORG "insert into solo_runs(event_id,team,kind,score) values ('$EV','VN1A','driving',90),('$EV','VN1A','coding',40)" >/dev/null
check "quá số lượt solo (config=2) bị chặn" 'hết 2 lượt' "$(as $ORG "insert into solo_runs(event_id,team,kind,score) values ('$EV','VN1A','driving',95)")"
EVA=$(as $ORG "insert into events(name,date,ruleset,program) values ('Giải ADC','2026-12-01','adc-2027','ADC') returning id")
as $ORG "insert into teams(event_id,number) values ('$EVA','DR1')" >/dev/null
as $ORG "insert into solo_runs(event_id,team,kind,score) values ('$EVA','DR1','driving',10),('$EVA','DR1','driving',20),('$EVA','DR1','driving',30),('$EVA','DR1','coding',40)" >/dev/null
check "ADC: lượt Autonomous tính riêng với Piloting (7.4.1)" '^$' "$(as $ORG "insert into solo_runs(event_id,team,kind,score) values ('$EVA','DR1','coding',50)")"
check "ADC: lượt Piloting thứ 4 bị chặn" 'hết 3 lượt solo driving' "$(as $ORG "insert into solo_runs(event_id,team,kind,score) values ('$EVA','DR1','driving',95)")"
as $ORG "insert into awards(event_id,team,name,judged) values ('$EV','VN1A','Think Award',true),('$EV','VN1A','Tournament Champions',false)" >/dev/null
check "1 đội tối đa 1 giải giám khảo" 'duplicate key' "$(as $ORG "insert into awards(event_id,team,name,judged) values ('$EV','VN1A','Design Award',true)")"
check "tài khoản khác không sửa được giải" '^0$' "$(as $DOM "with u as (update teams set name='hack' where event_id='$EV' returning 1) select count(*) from u")"
check "khách không ghi được" 'permission denied|row-level' "$(as anon "insert into teams(event_id,number) values ('$EV','ZZ1')")"

as $ORG "update events set status='published' where id='$EV'" >/dev/null
check "khách thấy giải đã công bố + dữ liệu con" '^1\|3\|2\|2\|2$' "$(as anon "select (select count(*) from events)||'|'||(select count(*) from teams)||'|'||(select count(*) from matches)||'|'||(select count(*) from solo_runs)||'|'||(select count(*) from awards)")"
check "khách không thấy email người tạo" 'permission denied|^0$' "$(as anon "select count(*) from profiles")"
as $SEPA "update events set verified=true where id='$EV'" >/dev/null
check "SEPA xác minh giải" '^t$' "$(su "select verified from events where id='$EV'")"
as $ORG "update events set name='Giải Engage Hà Nội' where id='$EV'" >/dev/null
check "organizer sửa giải không làm mất xác minh" '^t$' "$(su "select verified from events where id='$EV'")"
check "đổi mã đội cập nhật lịch trận" '^VN1X$' "$(as $ORG "update teams set number='VN1X' where event_id='$EV' and number='VN1A'"; su "select red from matches where event_id='$EV' and num=1")"
# Achieve: trận 2 đấu 2, nhánh loại trực tiếp
as $ORG "insert into teams(event_id,number) values ('$EV','VN4D')" >/dev/null
check "Achieve: trận 4 đội + 2 điểm + RP" '^qual\|30\|45\|true$' "$(as $ORG "insert into matches(event_id,num,red,red2,blue,blue2,score,score_blue,auto_red) values ('$EV',10,'VN1X','VN2B','VN3C','VN4D',30,45,true) returning round||'|'||score||'|'||score_blue||'|'||auto_red")"
check "Achieve: 4 đội phải khác nhau" 'matches_distinct_teams' "$(as $ORG "insert into matches(event_id,num,red,red2,blue,blue2) values ('$EV',11,'VN1X','VN2B','VN3C','VN2B')")"
check "Achieve: đội thứ 2 phải có trong giải" 'matches_red2_fkey' "$(as $ORG "insert into matches(event_id,num,red,red2,blue,blue2) values ('$EV',12,'VN1X','ZZ9','VN3C','VN4D')")"
check "Achieve: vòng loại trực tiếp có nhãn nhánh" '^elim\|R1-1$' "$(as $ORG "insert into matches(event_id,round,num,label,seed,seed_blue,red,red2,blue,blue2) values ('$EV','elim',1,'R1-1',1,4,'VN1X','VN2B','VN3C','VN4D') returning round||'|'||label")"
check "Achieve: điểm xanh âm bị chặn" 'violates check' "$(as $ORG "update matches set score_blue=-1 where event_id='$EV' and num=10")"
check "Achieve: khách xem được trận 2v2" '^2$' "$(as anon "select count(*) from matches where red2 is not null")"
check "tài khoản bị từ chối mất quyền sửa" '^0$' "$(as $SEPA "select admin_set_user('$ORG','rejected')" >/dev/null; as $ORG "with u as (update teams set name='x' where event_id='$EV' returning 1) select count(*) from u")"
check "xoá giải xoá cả dữ liệu con" '^0\|0$' "$(as $SEPA "delete from events where id in ('$EV','$EVA')" >/dev/null; su "select (select count(*) from teams)||'|'||(select count(*) from matches)")"

echo "pass=$pass fail=$fail"; [ $fail -eq 0 ]
