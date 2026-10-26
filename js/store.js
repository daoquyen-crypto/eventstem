/* Tầng dữ liệu cho công cụ quản lý giải.
   Hai chế độ cùng một giao diện:
     - Supabase: khi js/config.js có supabaseUrl + supabaseAnonKey
     - Demo: dữ liệu nằm trong localStorage của trình duyệt (để chạy thử, tập huấn)
   Mọi hàm trả về Promise. Lỗi được ném ra dạng Error có .code để giao diện dịch thành thông báo dễ hiểu. */
(function () {
  'use strict';
  var C = window.EVENTSTEM_CONFIG || {};
  var EVENT_COLS = ['name', 'program', 'ruleset', 'config', 'date', 'end_date', 'location', 'country', 'organizer_name', 'recf_code', 'grades', 'status', 'verified'];
  var TEAM_COLS = ['number', 'name', 'org', 'country', 'grade', 'checked_in', 'inspected', 'excluded'];
  var MATCH_COLS = ['round', 'num', 'label', 'field', 'time', 'red', 'red2', 'blue', 'blue2', 'red_counts', 'red2_counts', 'blue_counts', 'blue2_counts',
    'seed', 'seed_blue', 'score', 'score_blue', 'red_status', 'red2_status', 'blue_status', 'blue2_status', 'auto_red', 'auto_blue', 'end_red', 'end_blue', 'stop_time'];
  var SLOTS = ['red', 'red2', 'blue', 'blue2'];
  /* Giá trị mặc định của 1 trận (giống schema.sql) */
  var MATCH_DEFAULTS = { label: null, field: '1', time: null, red2: null, blue2: null, red_counts: true, red2_counts: true, blue_counts: true, blue2_counts: true,
    seed: null, seed_blue: null, score: null, score_blue: null, red_status: 'ok', red2_status: 'ok', blue_status: 'ok', blue2_status: 'ok',
    auto_red: false, auto_blue: false, end_red: false, end_blue: false, stop_time: null };
  function inMatch(m, n) { return SLOTS.some(function (s) { return m[s] === n; }); }

  function pick(o, cols) { var r = {}; cols.forEach(function (k) { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; }
  function fail(code, msg) { var e = new Error(msg || code); e.code = code; throw e; }

  /* Đổi lỗi Postgres/Supabase thành mã lỗi chung */
  function normErr(err) {
    if (!err) return null;
    var m = (err.message || '') + ' ' + (err.details || ''), e = new Error(err.message || String(err));
    e.code = /awards_one_judged/.test(m) ? 'judged_dup'
      : /lượt solo|hết \d+ lượt/.test(m) ? 'solo_limit'
      : /matches_event_id_round_num_key|duplicate key.*matches/.test(m) ? 'match_dup'
      : /teams_pkey|duplicate key.*teams/.test(m) ? 'team_dup'
      : /foreign key/.test(m) ? 'team_in_use'
      : /row-level security|permission denied|42501/.test(m + (err.code || '')) ? 'forbidden'
      : /Invalid login credentials/.test(m) ? 'bad_login'
      : /Email not confirmed/.test(m) ? 'not_confirmed'
      : /already registered|already been registered/.test(m) ? 'email_taken'
      : /Password should be/.test(m) ? 'weak_password'
      : /Failed to fetch|NetworkError/.test(m) ? 'network'
      : 'unknown';
    return e;
  }

  /* ================= Supabase ================= */
  function SupabaseStore() {
    var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    function q(p) { return p.then(function (r) { if (r.error) throw normErr(r.error); return r.data; }); }
    var me = null;
    function loadMe() {
      return sb.auth.getSession().then(function (r) {
        var s = r.data && r.data.session;
        if (!s) { me = null; return null; }
        return q(sb.from('profiles').select('*').eq('id', s.user.id).maybeSingle()).then(function (p) {
          me = { id: s.user.id, email: s.user.email, profile: p || { status: 'pending', role: 'organizer' } };
          return me;
        });
      });
    }
    return {
      mode: 'supabase',
      session: loadMe,
      // setTimeout: gọi API Supabase ngay trong callback này có thể bị treo (giới hạn của supabase-js)
      onAuth: function (cb) { sb.auth.onAuthStateChange(function () { setTimeout(function () { loadMe().then(cb); }); }); },
      signUp: function (f) {
        return sb.auth.signUp({ email: f.email, password: f.password,
          options: { data: { display_name: f.display_name || '', organization: f.organization || '', country: f.country || '' },
                     emailRedirectTo: location.href.split('#')[0] } })
          .then(function (r) { if (r.error) throw normErr(r.error); return { needsConfirm: !r.data.session }; });
      },
      signIn: function (email, password) { return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) { if (r.error) throw normErr(r.error); return loadMe(); }); },
      signOut: function () { return sb.auth.signOut().then(function () { me = null; }); },
      resetPassword: function (email) { return sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] }).then(function (r) { if (r.error) throw normErr(r.error); }); },
      updatePassword: function (pw) { return sb.auth.updateUser({ password: pw }).then(function (r) { if (r.error) throw normErr(r.error); }); },
      updateProfile: function (f) { return q(sb.from('profiles').update(pick(f, ['display_name', 'organization', 'country'])).eq('id', me.id)); },

      listUsers: function () { return q(sb.from('profiles').select('*').order('created_at', { ascending: false })); },
      setUser: function (uid, status, role) { return q(sb.rpc('admin_set_user', { uid: uid, new_status: status, new_role: role || null })); },
      getSettings: function () { return q(sb.from('app_settings').select('*').eq('id', 1).maybeSingle()); },
      saveSettings: function (s) { return q(sb.from('app_settings').update(pick(s, ['auto_approve_mode', 'auto_approve_domains'])).eq('id', 1)); },

      listPublicEvents: function () { return q(sb.from('events').select('*').neq('status', 'draft').order('date', { ascending: false })); },
      listMyEvents: function () { return q(sb.from('events').select('*').eq('owner', me.id).order('created_at', { ascending: false })); },
      listAllEvents: function () { return q(sb.from('events').select('*').order('created_at', { ascending: false })); },
      getEvent: function (id) {
        return Promise.all([
          q(sb.from('events').select('*').eq('id', id).maybeSingle()),
          q(sb.from('teams').select('*').eq('event_id', id).order('number')),
          q(sb.from('matches').select('*').eq('event_id', id).order('round').order('num')),
          q(sb.from('solo_runs').select('*').eq('event_id', id).order('created_at')),
          q(sb.from('awards').select('*').eq('event_id', id))
        ]).then(function (r) { return r[0] ? { event: r[0], teams: r[1], matches: r[2], solo: r[3], awards: r[4] } : null; });
      },
      /* Lấy trọn dữ liệu nhiều giải 1 lần (cho xếp hạng toàn cầu) */
      getEventsFull: function (ids) {
        if (!ids.length) return Promise.resolve([]);
        return Promise.all(['teams', 'matches', 'solo_runs', 'awards'].map(function (t) { return q(sb.from(t).select('*').in('event_id', ids)); }))
          .then(function (r) { return ids.map(function (id) { var f = function (a) { return a.filter(function (x) { return x.event_id === id; }); };
            return { teams: f(r[0]), matches: f(r[1]), solo: f(r[2]), awards: f(r[3]) }; }); });
      },
      lastUpdated: function (id) { return q(sb.from('events').select('updated_at').eq('id', id).maybeSingle()).then(function (r) { return r && r.updated_at; }); },
      createEvent: function (f) { return q(sb.from('events').insert(pick(f, EVENT_COLS)).select().single()); },
      updateEvent: function (id, f) { return q(sb.from('events').update(pick(f, EVENT_COLS)).eq('id', id).select().single()); },
      deleteEvent: function (id) { return q(sb.from('events').delete().eq('id', id)); },

      upsertTeams: function (eid, teams) { return q(sb.from('teams').upsert(teams.map(function (t) { return Object.assign(pick(t, TEAM_COLS), { event_id: eid }); }), { onConflict: 'event_id,number' })); },
      updateTeam: function (eid, number, f) { return q(sb.from('teams').update(pick(f, TEAM_COLS)).eq('event_id', eid).eq('number', number)); },
      deleteTeam: function (eid, number) { return q(sb.from('teams').delete().eq('event_id', eid).eq('number', number)); },

      replaceMatches: function (eid, round, list) {
        return q(sb.from('matches').delete().eq('event_id', eid).eq('round', round)).then(function () {
          if (!list.length) return [];
          return q(sb.from('matches').insert(list.map(function (m) { return Object.assign(pick(m, MATCH_COLS), { event_id: eid, round: round }); })));
        });
      },
      addMatch: function (eid, m) { return q(sb.from('matches').insert(Object.assign(pick(m, MATCH_COLS), { event_id: eid })).select().single()); },
      updateMatch: function (id, f) { return q(sb.from('matches').update(pick(f, MATCH_COLS)).eq('id', id)); },
      deleteMatch: function (id) { return q(sb.from('matches').delete().eq('id', id)); },

      addSolo: function (eid, r) { return q(sb.from('solo_runs').insert({ event_id: eid, team: r.team, kind: r.kind, score: r.score, stop_time: r.stop_time }).select().single()); },
      deleteSolo: function (id) { return q(sb.from('solo_runs').delete().eq('id', id)); },
      addAward: function (eid, a) { return q(sb.from('awards').insert({ event_id: eid, team: a.team, name: a.name, judged: !!a.judged }).select().single()); },
      deleteAward: function (id) { return q(sb.from('awards').delete().eq('id', id)); }
    };
  }

  /* ================= Demo (localStorage) =================
     Làm theo đúng các ràng buộc của schema.sql để hành vi giống bản thật. */
  function DemoStore() {
    var KEY = 'eventstem-demo-v1', mem = null;
    function load() {
      if (mem) return mem;
      try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (x) { mem = null; }
      if (!mem) mem = { users: [], session: null, settings: { id: 1, auto_approve_mode: 'off', auto_approve_domains: [] }, events: [], teams: [], matches: [], solo_runs: [], awards: [] };
      return mem;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (x) {} }
    function uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2)); }
    function now() { return new Date().toISOString(); }
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function ok(v) { return Promise.resolve(clone(v === undefined ? null : v)); }
    function run(fn) { try { var v = fn(); save(); return ok(v); } catch (e) { return Promise.reject(e); } }
    function cur() { var d = load(); return d.users.find(function (u) { return u.id === d.session; }) || null; }
    function meObj() { var u = cur(); return u ? { id: u.id, email: u.email, profile: u } : null; }
    function isSA() { var u = cur(); return !!u && u.role === 'superadmin' && u.status === 'approved'; }
    function ev(id) { return load().events.find(function (e) { return e.id === id; }); }
    function canEdit(id) { var e = ev(id), u = cur(); return !!e && !!u && ((e.owner === u.id && u.status === 'approved') || isSA()); }
    function canView(e) { var u = cur(); return e.status !== 'draft' || (u && (e.owner === u.id || isSA())); }
    function need(id) { if (!canEdit(id)) fail('forbidden'); }
    function touch(id) { var e = ev(id); if (e) e.updated_at = now(); }
    function hasTeam(eid, n) { return load().teams.some(function (t) { return t.event_id === eid && t.number === n; }); }
    var listeners = [];
    function emit() { listeners.forEach(function (cb) { cb(meObj()); }); }

    return {
      mode: 'demo',
      session: function () { return ok(meObj()); },
      onAuth: function (cb) { listeners.push(cb); },
      /* Demo: tài khoản đầu tiên là SEPA (superadmin) để thử được mọi chức năng; các tài khoản sau theo chế độ duyệt */
      signUp: function (f) {
        return run(function () {
          var d = load(), email = String(f.email || '').trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('bad_email');
          if (String(f.password || '').length < 6) fail('weak_password');
          if (d.users.some(function (u) { return u.email === email; })) fail('email_taken');
          var s = d.settings, dom = email.split('@')[1], first = !d.users.length;
          var st = first || s.auto_approve_mode === 'all' || (s.auto_approve_mode === 'domains' && s.auto_approve_domains.indexOf(dom) >= 0) ? 'approved' : 'pending';
          var u = { id: uid(), email: email, pw: String(f.password), display_name: f.display_name || '', organization: f.organization || '', country: f.country || '',
            role: first ? 'superadmin' : 'organizer', status: st, created_at: now() };
          d.users.push(u); d.session = u.id; setTimeout(emit);
          return { needsConfirm: false };
        });
      },
      signIn: function (email, pw) {
        return run(function () {
          var d = load(), u = d.users.find(function (x) { return x.email === String(email).trim().toLowerCase() && x.pw === pw; });
          if (!u) fail('bad_login');
          d.session = u.id; setTimeout(emit); return meObj();
        });
      },
      signOut: function () { return run(function () { load().session = null; setTimeout(emit); }); },
      resetPassword: function () { return Promise.reject(Object.assign(new Error('demo'), { code: 'demo_only' })); },
      updatePassword: function (pw) { return run(function () { var u = cur(); if (!u) fail('forbidden'); u.pw = pw; }); },
      updateProfile: function (f) { return run(function () { var u = cur(); if (!u) fail('forbidden'); Object.assign(u, pick(f, ['display_name', 'organization', 'country'])); }); },

      listUsers: function () { return run(function () { if (!isSA()) return load().users.filter(function (u) { return u.id === load().session; }); return load().users.slice().reverse().map(function (u) { var c = clone(u); delete c.pw; return c; }); }); },
      setUser: function (id, status, role) {
        return run(function () {
          if (!isSA()) fail('forbidden');
          if (id === load().session && (status !== 'approved' || (role && role !== 'superadmin'))) fail('self_demote');
          var u = load().users.find(function (x) { return x.id === id; }); if (!u) return;
          u.status = status; if (role) u.role = role; u.reviewed_at = now();
        });
      },
      getSettings: function () { return run(function () { return isSA() ? load().settings : null; }); },
      saveSettings: function (s) { return run(function () { if (!isSA()) fail('forbidden'); Object.assign(load().settings, pick(s, ['auto_approve_mode', 'auto_approve_domains'])); }); },

      listPublicEvents: function () { return run(function () { return load().events.filter(function (e) { return e.status !== 'draft'; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }); }); },
      listMyEvents: function () { return run(function () { var u = cur(); return u ? load().events.filter(function (e) { return e.owner === u.id; }).reverse() : []; }); },
      listAllEvents: function () { return run(function () { return load().events.filter(canView).reverse(); }); },
      getEvent: function (id) {
        return run(function () {
          var d = load(), e = ev(id); if (!e || !canView(e)) return null;
          var f = function (t) { return d[t].filter(function (x) { return x.event_id === id; }); };
          return { event: e, teams: f('teams').sort(function (a, b) { return a.number.localeCompare(b.number); }),
            matches: f('matches').sort(function (a, b) { return a.round.localeCompare(b.round) || a.num - b.num; }), solo: f('solo_runs'), awards: f('awards') };
        });
      },
      getEventsFull: function (ids) {
        return run(function () { var d = load(); return ids.map(function (id) { var f = function (t) { return d[t].filter(function (x) { return x.event_id === id; }); };
          return { teams: f('teams'), matches: f('matches'), solo: f('solo_runs'), awards: f('awards') }; }); });
      },
      lastUpdated: function (id) { return run(function () { var e = ev(id); return e && e.updated_at; }); },
      createEvent: function (f) {
        return run(function () {
          var u = cur(); if (!u || u.status !== 'approved') fail('forbidden');
          var e = Object.assign({ program: 'Engage', ruleset: 'engage-2026', config: {}, location: '', country: '', organizer_name: '', recf_code: '', grades: ['ES', 'MS'], status: 'draft' },
            pick(f, EVENT_COLS), { id: uid(), owner: u.id, verified: isSA() ? !!f.verified : false, created_at: now(), updated_at: now() });
          load().events.push(e); return e;
        });
      },
      updateEvent: function (id, f) {
        return run(function () {
          need(id); var e = ev(id), p = pick(f, EVENT_COLS);
          if (!isSA()) delete p.verified;
          Object.assign(e, p, { updated_at: now() }); return e;
        });
      },
      deleteEvent: function (id) {
        return run(function () {
          need(id); var d = load();
          ['teams', 'matches', 'solo_runs', 'awards'].forEach(function (t) { d[t] = d[t].filter(function (x) { return x.event_id !== id; }); });
          d.events = d.events.filter(function (e) { return e.id !== id; });
        });
      },

      upsertTeams: function (eid, list) {
        return run(function () {
          need(eid); var d = load();
          list.forEach(function (t) {
            if (!/^[A-Z0-9_-]{2,20}$/.test(t.number)) fail('bad_team');
            var ex = d.teams.find(function (x) { return x.event_id === eid && x.number === t.number; });
            if (ex) Object.assign(ex, pick(t, TEAM_COLS));
            else d.teams.push(Object.assign({ name: '', org: '', country: '', grade: 'ES', checked_in: false, inspected: false, excluded: false }, pick(t, TEAM_COLS), { event_id: eid }));
          });
          touch(eid);
        });
      },
      updateTeam: function (eid, number, f) {
        return run(function () {
          need(eid); var d = load(), t = d.teams.find(function (x) { return x.event_id === eid && x.number === number; }); if (!t) return;
          var p = pick(f, TEAM_COLS);
          if (p.number && p.number !== number) {
            if (!/^[A-Z0-9_-]{2,20}$/.test(p.number)) fail('bad_team');
            if (hasTeam(eid, p.number)) fail('team_dup');
            d.matches.forEach(function (m) { if (m.event_id === eid) SLOTS.forEach(function (s) { if (m[s] === number) m[s] = p.number; }); });
            ['solo_runs', 'awards'].forEach(function (k) { d[k].forEach(function (x) { if (x.event_id === eid && x.team === number) x.team = p.number; }); });
          }
          Object.assign(t, p); touch(eid);
        });
      },
      deleteTeam: function (eid, number) {
        return run(function () {
          need(eid); var d = load();
          if (d.matches.some(function (m) { return m.event_id === eid && inMatch(m, number); })) fail('team_in_use');
          d.teams = d.teams.filter(function (t) { return !(t.event_id === eid && t.number === number); });
          ['solo_runs', 'awards'].forEach(function (k) { d[k] = d[k].filter(function (x) { return !(x.event_id === eid && x.team === number); }); });
          touch(eid);
        });
      },

      replaceMatches: function (eid, round, list) {
        return run(function () {
          need(eid); var d = load();
          list.forEach(function (m) { SLOTS.forEach(function (s) { if (m[s] && !hasTeam(eid, m[s])) fail('team_in_use'); }); });
          d.matches = d.matches.filter(function (m) { return !(m.event_id === eid && m.round === round); });
          list.forEach(function (m) { d.matches.push(Object.assign({}, MATCH_DEFAULTS,
            pick(m, MATCH_COLS), { id: uid(), event_id: eid, round: round, updated_at: now() })); });
          touch(eid);
        });
      },
      addMatch: function (eid, m) {
        return run(function () {
          need(eid); var d = load();
          if (d.matches.some(function (x) { return x.event_id === eid && x.round === m.round && x.num === m.num; })) fail('match_dup');
          SLOTS.forEach(function (s) { if (m[s] && !hasTeam(eid, m[s])) fail('team_in_use'); });
          var r = Object.assign({}, MATCH_DEFAULTS,
            pick(m, MATCH_COLS), { id: uid(), event_id: eid, updated_at: now() });
          d.matches.push(r); touch(eid); return r;
        });
      },
      updateMatch: function (id, f) {
        return run(function () {
          var m = load().matches.find(function (x) { return x.id === id; }); if (!m) return; need(m.event_id);
          var p = pick(f, MATCH_COLS); if ((p.score != null && p.score < 0) || (p.score_blue != null && p.score_blue < 0)) fail('bad_score');
          Object.assign(m, p, { updated_at: now() }); touch(m.event_id);
        });
      },
      deleteMatch: function (id) {
        return run(function () { var d = load(), m = d.matches.find(function (x) { return x.id === id; }); if (!m) return; need(m.event_id);
          d.matches = d.matches.filter(function (x) { return x.id !== id; }); touch(m.event_id); });
      },
      addSolo: function (eid, r) {
        return run(function () {
          need(eid); var d = load(), lim = +((ev(eid).config || {}).soloAttempts || 5);
          if (!hasTeam(eid, r.team)) fail('team_in_use');
          if (d.solo_runs.filter(function (x) { return x.event_id === eid && x.team === r.team; }).length >= lim) fail('solo_limit');
          var x = { id: uid(), event_id: eid, team: r.team, kind: r.kind, score: +r.score, stop_time: r.stop_time == null ? null : +r.stop_time, created_at: now() };
          d.solo_runs.push(x); touch(eid); return x;
        });
      },
      deleteSolo: function (id) {
        return run(function () { var d = load(), r = d.solo_runs.find(function (x) { return x.id === id; }); if (!r) return; need(r.event_id);
          d.solo_runs = d.solo_runs.filter(function (x) { return x.id !== id; }); touch(r.event_id); });
      },
      addAward: function (eid, a) {
        return run(function () {
          need(eid); var d = load();
          if (!hasTeam(eid, a.team)) fail('team_in_use');
          if (a.judged && d.awards.some(function (x) { return x.event_id === eid && x.team === a.team && x.judged; })) fail('judged_dup');
          var x = { id: uid(), event_id: eid, team: a.team, name: a.name, judged: !!a.judged }; d.awards.push(x); touch(eid); return x;
        });
      },
      deleteAward: function (id) {
        return run(function () { var d = load(), a = d.awards.find(function (x) { return x.id === id; }); if (!a) return; need(a.event_id);
          d.awards = d.awards.filter(function (x) { return x.id !== id; }); touch(a.event_id); });
      },
      /* Chỉ có ở demo: xoá sạch dữ liệu thử */
      resetDemo: function () { try { localStorage.removeItem(KEY); } catch (x) {} mem = null; setTimeout(emit); return ok(); }
    };
  }

  window.Store = C.supabaseUrl && C.supabaseAnonKey && window.supabase ? SupabaseStore() : DemoStore();
})();
