"""Crawler lịch sự cho recfevents.org – chỉ các trang robots.txt cho phép
(/Events/ApprovedEvents, /Events/Details/). Xuất events.json."""
import json, re, sys, time, html
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup

BASE = 'https://recfevents.org'
UA = 'RECF-World-VN/0.1 (SEPA - RECF International Authorized Representative Vietnam; daoquyen@sepa.org.vn)'
S = requests.Session(); S.headers['User-Agent'] = UA
PROGRAMS = {1: 'Engage', 2: 'Achieve', 4: 'Inspire', 5: 'ADC Pro', 6: 'ADC', 7: 'Launch'}

def get(url, tries=3):
    for i in range(tries):
        try:
            r = S.get(url, timeout=30)
            if r.status_code == 200: return r.text
        except Exception as e:
            pass
        time.sleep(2 * (i + 1))
    print('FAIL', url, file=sys.stderr); return None

def txt(el): return re.sub(r'\s+', ' ', el.get_text(' ', strip=True)) if el else ''

def parse_list(h, prog, view):
    soup = BeautifulSoup(h, 'lxml'); out = []
    for c in soup.select('#eventList .event-card'):
        a = c.select_one('.ec-title a');
        if not a: continue
        eid = int(re.search(r'/Details/(\d+)', a['href']).group(1))
        where = c.select_one('.ec-where'); region = txt(where.select_one('span')) if where else ''
        city = txt(where).replace(region, '').strip() if where else ''
        teams = txt(c.select_one('.ec-teams'))
        m = re.search(r'(\d+)\s+of\s+(\d+)', teams)
        badge = c.select_one('.ec-date .badge .d-none') or c.select_one('.ec-date .badge')
        out.append(dict(id=eid, title=txt(a), code=txt(c.select_one('.ec-code')), program=prog, view=view,
            dates=txt(c.select_one('.ec-range')), status=txt(badge), city=city, region=region.lstrip('· ').strip(),
            reg=txt(c.select_one('.ec-reg')), tags=[txt(t) for t in c.select('.ec-tags .badge')],
            registered=int(m.group(1)) if m else None, capacity=int(m.group(2)) if m else None,
            price=txt(c.select_one('.ec-price'))))
    last = max([int(x) for x in re.findall(r'[?&]page=(\d+)', html.unescape(h))] or [1])
    return out, last

def crawl_lists():
    events = {}
    for pid, pname in PROGRAMS.items():
        for view in ['', 'upcoming', 'past']:
            q = f'{BASE}/Events/ApprovedEvents?programTypeId={pid}' + (f'&view={view}' if view else '')
            h = get(q);
            if not h: continue
            evs, last = parse_list(h, pname, view or 'current')
            for p in range(2, last + 1):
                time.sleep(0.4); h2 = get(q + f'&page={p}')
                if h2: evs += parse_list(h2, pname, view or 'current')[0]
            for e in evs: events.setdefault(e['id'], e)
            print(pname, view or 'current', len(evs), file=sys.stderr)
    return events

def parse_teams(soup):
    rows = []
    for tr in soup.select('[data-app-grid="registered-teams"] tbody tr'):
        tds = tr.select('td')
        if len(tds) >= 1: rows.append({'team': txt(tds[0]), 'name': txt(tds[1]) if len(tds) > 1 else '', 'org': txt(tds[2]) if len(tds) > 2 else ''})
    return rows

def detail(e):
    time.sleep(0.3)
    h = get(f"{BASE}/Events/Details/{e['id']}")
    if not h: return e
    soup = BeautifulSoup(h, 'lxml')
    ld = soup.find('script', type='application/ld+json')
    if ld:
        try:
            j = json.loads(ld.string)
            loc = j.get('location') or {}; ad = loc.get('address') or {}; geo = loc.get('geo') or {}
            e.update(start=j.get('startDate'), end=j.get('endDate'), venue=loc.get('name'),
                     address=', '.join(x for x in [ad.get('streetAddress'), ad.get('addressLocality'), ad.get('addressRegion')] if x),
                     country=ad.get('addressCountry'), lat=geo.get('latitude'), lng=geo.get('longitude'),
                     currency=(j.get('offers') or {}).get('priceCurrency'))
        except Exception: pass
    sections = {}
    for card in soup.select('.card-body'):
        h2 = card.find('h2')
        if not h2: continue
        k = txt(h2); ut = card.select_one('.user-text')
        if ut: sections[k] = txt(ut)[:1500]
    e['awards'] = []
    for card in soup.select('.card-body'):
        h2 = card.find('h2')
        if h2 and 'Awards' in txt(h2):
            e['awards'] = [txt(p) for p in card.select('.user-text p, .user-text li') if txt(p)]
    e['info'] = sections.get('General information', '')[:600]
    e['agenda'] = sections.get('Agenda', '')[:600]
    grid = soup.select_one('[data-app-grid="registered-teams"]')
    total = int(grid['data-app-grid-total']) if grid and grid.get('data-app-grid-total') else 0
    teams = parse_teams(soup)
    if total > len(teams):
        for q in ['?pageSize=200', '?size=200', '?ps=200']:
            h2 = get(f"{BASE}/Events/Details/{e['id']}{q}")
            if h2:
                t2 = parse_teams(BeautifulSoup(h2, 'lxml'))
                if len(t2) > len(teams): teams = t2
            if len(teams) >= total: break
        e['teams_partial'] = len(teams) < total
    e['teams'] = teams
    return e



def slim(d):
    """Gọn dữ liệu cho trang web + điền quốc gia còn thiếu."""
    countries = {e.get('country') for e in d['events'] if e.get('country')}
    for e in d['events']:
        e['info'] = (e.get('info') or '')[:420]; e['agenda'] = (e.get('agenda') or '')[:420]
        e['teams'] = [[t['team'], t['name'], t['org']] for t in e.get('teams', [])]
        for k in ['view', 'teams_partial']: e.pop(k, None)
        e['code'] = (e.get('code') or '').split(' ')[0]
        if not e.get('country'):
            reg = (e.get('region') or '').replace(' region', '').strip()
            e['country'] = reg if reg in countries and reg != 'United States' else 'United States'
    return d

if __name__ == '__main__':
    ev = crawl_lists()
    print('events', len(ev), file=sys.stderr)
    with ThreadPoolExecutor(3) as ex:
        res = list(ex.map(detail, ev.values()))
    out = {'fetched': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'source': BASE, 'events': sorted(res, key=lambda e: (e.get('start') or '9999', e['id']))}
    if len(res) < 50:
        sys.exit('Lấy được quá ít giải (%d) – giữ nguyên dữ liệu cũ.' % len(res))
    out['fetched'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    json.dump(slim(out), open(sys.argv[1] if len(sys.argv) > 1 else 'events.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('done', len(res), sum(len(e.get('teams', [])) for e in res), sum(1 for e in res if e.get('teams_partial')), file=sys.stderr)
