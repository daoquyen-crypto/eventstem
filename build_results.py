"""Gộp mọi file CSV kết quả trong thư mục results/ thành results.json cho trang Xếp hạng.

Mỗi dòng CSV là 1 bản ghi điểm hoặc giải thưởng của 1 đội tại 1 giải.
Cột (xem results/_MAU_KET_QUA.csv):
  event_code, event_name, program, season, date, country, partner, verified,
  team, team_name, organization, team_country, grade, type, value

type:
  solo1   – Solo Driving (Engage/Achieve/Inspire) hoặc Piloting Skills (ADC)
  solo2   – Solo Coding  (Engage/Achieve/Inspire) hoặc Autonomous Flight (ADC)
  alliance – điểm 1 trận Alliance / Teamwork
  award   – value = tên giải thưởng (Excellence Award, Tournament Champions…)
grade: ES (Tiểu học) · MS (THCS) · HS (THPT) · UNI (Đại học)
verified: yes / no  – chỉ giải "yes" mới được tính xếp hạng.
File có tên bắt đầu bằng "_" (ví dụ file mẫu trống) sẽ được bỏ qua.
"""
import csv, glob, json, os, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROGRAMS = {'Engage', 'Achieve', 'Inspire', 'ADC', 'ADC Pro'}
GRADES = {'ES', 'MS', 'HS', 'UNI'}
TYPES = {'solo1', 'solo2', 'alliance', 'award'}


def main(out_path):
    events, records, sample, problems = {}, [], False, []
    for path in sorted(glob.glob(os.path.join(ROOT, 'results', '*.csv'))):
        name = os.path.basename(path)
        if name.startswith('_'):
            continue
        is_sample = name.lower().startswith('sample') or name.lower().startswith('mau')
        sample = sample or is_sample
        with open(path, encoding='utf-8-sig', newline='') as f:
            for i, r in enumerate(csv.DictReader(f), start=2):
                r = {k.strip(): (v or '').strip() for k, v in r.items() if k}
                where = f'{name} dòng {i}'
                if r.get('program') not in PROGRAMS: problems.append(f'{where}: program "{r.get("program")}" không hợp lệ'); continue
                if r.get('grade') not in GRADES: problems.append(f'{where}: grade "{r.get("grade")}" không hợp lệ'); continue
                if r.get('type') not in TYPES: problems.append(f'{where}: type "{r.get("type")}" không hợp lệ'); continue
                if not r.get('event_code') or not r.get('team'): problems.append(f'{where}: thiếu event_code hoặc team'); continue
                if r['type'] != 'award':
                    try: r['value'] = float(r['value'])
                    except ValueError: problems.append(f'{where}: điểm "{r["value"]}" không phải số'); continue
                ev = events.setdefault(r['event_code'], {
                    'code': r['event_code'], 'name': r.get('event_name') or r['event_code'], 'program': r['program'],
                    'season': r.get('season') or '2026-2027', 'date': r.get('date', ''), 'country': r.get('country', ''),
                    'partner': r.get('partner', ''), 'verified': r.get('verified', '').lower() in ('yes', 'true', '1', 'có'),
                    'sample': is_sample})
                records.append([r['event_code'], r['team'].upper(), r.get('team_name', ''), r.get('organization', ''),
                                r.get('team_country') or ev['country'], r['grade'], r['type'], r['value']])
    out = {'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'sample': sample,
           'events': list(events.values()), 'records': records}
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(events)} giải, {len(records)} bản ghi -> {out_path}')
    for p in problems[:50]:
        print('BỎ QUA', p, file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'results.json'))
