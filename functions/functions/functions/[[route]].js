// ===== Shule App API core (shared by _worker.js and functions/api/[[route]].js) =====
// KV binding name: SHULE_KV
const J = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
const ERR = (msg, status = 400) => J({ error: msg }, status);

const PLAIN = ['students', 'teachers', 'classes', 'terms', 'feeStructure', 'payments', 'assessments', 'comments', 'activity'];
const SHARDED = {
  attendance: (id) => String(id).slice(0, 7), // id = "YYYY-MM-DD|STD-001"  -> shard by month
  scores: (id) => String(id).split('|')[0], // id = "termId|assessmentId|STD-001" -> shard by term
};
const TEACHER_OK = ['attendance', 'assessments', 'scores', 'comments', 'activity'];
const DAY = 86400000;

const kget = async (env, k, def) => {
  const v = await env.SHULE_KV.get(k, 'json');
  return v === null || v === undefined ? def : v;
};
const kput = (env, k, v, opts) => env.SHULE_KV.put(k, JSON.stringify(v), opts);
const todayStr = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * DAY).toISOString().slice(0, 10);
const pad = (n, l) => String(n).padStart(l, '0');
const rid = () => crypto.randomUUID().replace(/-/g, '');

async function listKeys(env, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await env.SHULE_KV.list({ prefix, cursor });
    r.keys.forEach((k) => out.push(k.name));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

// ---------- seed ----------
const CLASS_IDS = ['F1A', 'F1B', 'F2A', 'F2B', 'F3A', 'F3B', 'F4A', 'F4B'];
function defaultTerm() {
  const y = new Date(Date.now() + 3 * 3600e3).getUTCFullYear();
  const m = new Date(Date.now() + 3 * 3600e3).getUTCMonth() + 1;
  const n = m <= 6 ? 1 : 2;
  return n === 1
    ? { id: `T1-${y}`, name: `Term 1 ${y}`, start: `${y}-01-12`, end: `${y}-06-26`, notes: '' }
    : { id: `T2-${y}`, name: `Term 2 ${y}`, start: `${y}-07-06`, end: `${y}-12-04`, notes: '' };
}

async function seed(env, demo) {
  const term = defaultTerm();
  const classes = CLASS_IDS.map((id) => ({ id, name: 'Form ' + id.slice(1) }));
  const settings = {
    schoolName: 'Shule ya Mfano',
    adminPin: '1234',
    schoolPhone: '',
    payInfo: '',
    currentTermId: term.id,
    counters: { student: 0, teacher: 0, receipt: 0 },
  };
  const D = {
    classes, terms: [term], students: [], teachers: [], feeStructure: [], payments: [],
    assessments: [], comments: [], activity: [],
  };
  const att = {}, scr = {};
  const log = (sw, en) => D.activity.unshift({ id: rid(), ts: Date.now(), kind: 'sys', sw, en });
  // school fees per class (real config, not demo)
  const base = { 1: 250000, 2: 270000, 3: 300000, 4: 320000 };
  CLASS_IDS.forEach((c) =>
    D.feeStructure.push({ id: 'fee-' + c + '-' + term.id, classId: c, termId: term.id, name: 'School Fee', category: 'school', amount: base[c[1]], required: true, isDemo: false })
  );
  if (demo) {
    const st = [
      ['Aisha Mohamed', 'F2A', 'F', 'Mohamed Ali'], ['Juma Saidi', 'F2A', 'M', 'Said Juma'],
      ['Lina Mussa', 'F1A', 'F', 'Mussa Hamisi'], ['Elias Kato', 'F3B', 'M', 'Kato Peter'],
      ['Neema Joseph', 'F1B', 'F', 'Joseph Mushi'], ['Baraka Mwita', 'F4A', 'M', 'Mwita Chacha'],
      ['Rehema Ally', 'F3A', 'F', 'Ally Rashid'], ['Hassan Omari', 'F4B', 'M', 'Omari Bakari'],
    ];
    st.forEach((s, i) => {
      D.students.push({
        id: 'STD-' + pad(i + 1, 3), name: s[0], classId: s[1], gender: s[2], parentName: s[3], parentPhone: '',
        pin: '1234', status: 'active', isDemo: true, optExtras: i % 2 === 0 ? ['ex-transport'] : [],
        enrolledAt: todayStr(), history: [{ date: todayStr(), type: 'enroll', to: s[1], reason: 'Demo' }],
      });
    });
    settings.counters.student = 8;
    D.teachers.push(
      { id: 'T-001', name: 'Mwalimu Juma', pin: '1234', phone: '', isDemo: true },
      { id: 'T-002', name: 'Mwalimu Amina', pin: '1234', phone: '', isDemo: true }
    );
    settings.counters.teacher = 2;
    D.feeStructure.push(
      { id: 'ex-transport', classId: 'ALL', termId: term.id, name: 'Transport', category: 'transport', amount: 80000, required: false, isDemo: true },
      { id: 'ex-uniform', classId: 'ALL', termId: term.id, name: 'Uniform', category: 'uniform', amount: 60000, required: false, isDemo: true },
      { id: 'ex-exams', classId: 'ALL', termId: term.id, name: 'Exams', category: 'exams', amount: 20000, required: true, isDemo: true }
    );
    // a few payments
    const pays = [['STD-001', 350000], ['STD-002', 100000], ['STD-003', 270000], ['STD-005', 270000], ['STD-007', 150000]];
    pays.forEach((p, i) => {
      settings.counters.receipt++;
      D.payments.push({
        id: rid(), studentId: p[0], amount: p[1], date: addDays(todayStr(), -(i * 9 + 2)), termId: term.id,
        method: 'Cash', note: '', receiptNo: 'RCT-' + pad(settings.counters.receipt, 4), balanceAfter: 0,
      });
    });
    D.assessments.push(
      { id: 'as-math1', name: 'Math Assignment 1', type: 'assignment', subjectId: 'math', classId: 'F2A', termId: term.id, given: addDays(todayStr(), -14), deadline: addDays(todayStr(), -7), max: 20, desc: 'Algebra exercises', isDemo: true },
      { id: 'as-eng1', name: 'English Assignment 1', type: 'assignment', subjectId: 'eng', classId: 'F2A', termId: term.id, given: addDays(todayStr(), -10), deadline: addDays(todayStr(), -3), max: 50, desc: 'Essay writing', isDemo: true }
    );
    scr[term.id] = [
      { id: `${term.id}|as-math1|STD-001`, assessmentId: 'as-math1', studentId: 'STD-001', termId: term.id, score: 17 },
      { id: `${term.id}|as-math1|STD-002`, assessmentId: 'as-math1', studentId: 'STD-002', termId: term.id, score: 12 },
      { id: `${term.id}|as-eng1|STD-001`, assessmentId: 'as-eng1', studentId: 'STD-001', termId: term.id, score: 41 },
      { id: `${term.id}|as-eng1|STD-002`, assessmentId: 'as-eng1', studentId: 'STD-002', termId: term.id, score: 33 },
    ];
    [todayStr(), addDays(todayStr(), -1)].forEach((d) =>
      D.students.forEach((s) => {
        const absent = s.id === 'STD-004';
        const rec = { id: `${d}|${s.id}`, date: d, studentId: s.id, classId: s.classId, status: absent ? 'A' : 'P', note: absent ? 'sick' : '' };
        (att[d.slice(0, 7)] = att[d.slice(0, 7)] || []).push(rec);
      })
    );
    log('Mfumo umeanzishwa na data ya mfano', 'System started with demo data');
  } else {
    log('Mfumo umeanzishwa', 'System started');
  }
  const w = [];
  for (const k of Object.keys(D)) w.push(kput(env, 'c:' + k, D[k]));
  w.push(kput(env, 'c:settings', settings));
  for (const m of Object.keys(att)) w.push(kput(env, 'c:attendance:' + m, att[m]));
  for (const t of Object.keys(scr)) w.push(kput(env, 'c:scores:' + t, scr[t]));
  await Promise.all(w);
  await env.SHULE_KV.put('init', '1');
}

async function ensureInit(env) {
  if (!(await env.SHULE_KV.get('init'))) await seed(env, true);
}

// ---------- auth ----------
async function getSession(env, request) {
  const h = request.headers.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!t || t.length < 20) return null;
  return await kget(env, 's:' + t, null);
}

async function login(env, b) {
  const role = b.role, pin = String(b.pin || ''), id = String(b.id || '').trim().toUpperCase();
  if (!['admin', 'teacher', 'parent'].includes(role)) return ERR('role', 400);
  const rlKey = `rl:${role}:${id}`;
  const tries = Number((await env.SHULE_KV.get(rlKey)) || 0);
  if (tries >= 8) return ERR('locked', 429);
  const settings = await kget(env, 'c:settings', {});
  let sess = null;
  if (role === 'admin') {
    if (pin && pin === settings.adminPin) sess = { role, id: 'ADMIN', name: 'Admin' };
  } else if (role === 'teacher') {
    const t = (await kget(env, 'c:teachers', [])).find((x) => x.id.toUpperCase() === id);
    if (t && pin && t.pin === pin) sess = { role, id: t.id, name: t.name };
  } else {
    const s = (await kget(env, 'c:students', [])).find((x) => x.id.toUpperCase() === id);
    if (s && s.status === 'active' && pin && s.pin === pin) sess = { role, id: s.id, name: s.name };
  }
  if (!sess) {
    await env.SHULE_KV.put(rlKey, String(tries + 1), { expirationTtl: 900 });
    return ERR('invalid', 401);
  }
  await env.SHULE_KV.delete(rlKey);
  const token = rid() + rid().slice(0, 8);
  await kput(env, 's:' + token, sess, { expirationTtl: 7 * 24 * 3600 });
  return J({ token, me: sess });
}

// ---------- data ----------
function monthsBetween(a, b) {
  const out = [];
  let y = +a.slice(0, 4), m = +a.slice(5, 7);
  const ey = +b.slice(0, 4), em = +b.slice(5, 7);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 24) {
    out.push(`${y}-${pad(m, 2)}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const pubSettings = (s) => { const { adminPin, counters, ...rest } = s; return rest; };
const noPin = (s) => { const { pin, ...rest } = s; return rest; };

async function loadAttendance(env, from, to) {
  const months = monthsBetween(from, to);
  const arrs = await Promise.all(months.map((m) => kget(env, 'c:attendance:' + m, [])));
  return arrs.flat().filter((r) => r.date >= from && r.date <= to);
}

function pctMap(students, assessments, scores) {
  // overall percentage per student: sum(scores)/sum(max) over assessments the student has a score for
  const amax = Object.fromEntries(assessments.map((a) => [a.id, a.max]));
  const tot = {};
  scores.forEach((sc) => {
    if (amax[sc.assessmentId] === undefined) return;
    const t = (tot[sc.studentId] = tot[sc.studentId] || { s: 0, m: 0 });
    t.s += Number(sc.score) || 0; t.m += amax[sc.assessmentId];
  });
  const out = {};
  students.forEach((st) => { if (tot[st.id] && tot[st.id].m) out[st.id] = (tot[st.id].s / tot[st.id].m) * 100; });
  return out;
}

async function getData(env, s, url) {
  const settings = await kget(env, 'c:settings', {});
  const termId = url.searchParams.get('term') || settings.currentTermId;
  const [classes, terms, students] = await Promise.all([kget(env, 'c:classes', []), kget(env, 'c:terms', []), kget(env, 'c:students', [])]);
  const term = terms.find((t) => t.id === termId) || terms[0] || { start: todayStr(), end: todayStr() };
  const from = term.start < todayStr() ? term.start : todayStr();
  const to = term.end > todayStr() ? term.end : todayStr();
  const base = { classes, terms, termId, settings: s.role === 'admin' ? settings : pubSettings(settings), today: todayStr() };

  if (s.role === 'parent') {
    const me = students.find((x) => x.id === s.id);
    if (!me) return ERR('gone', 401);
    const [fees, pays, att, assess, scores, comments] = await Promise.all([
      kget(env, 'c:feeStructure', []), kget(env, 'c:payments', []), loadAttendance(env, from, to),
      kget(env, 'c:assessments', []), kget(env, 'c:scores:' + termId, []), kget(env, 'c:comments', []),
    ]);
    const myScores = scores.filter((x) => x.studentId === me.id);
    const classmates = students.filter((x) => x.status === 'active' && x.classId === me.classId);
    const classAssess = assess.filter((a) => a.termId === termId && a.classId === me.classId);
    const pm = pctMap(classmates, classAssess, scores.filter((x) => classmates.some((c) => c.id === x.studentId)));
    let position = null;
    if (pm[me.id] !== undefined) position = { pos: 1 + Object.values(pm).filter((v) => v > pm[me.id]).length, of: Object.keys(pm).length };
    return J({
      ...base,
      students: [noPin(me)],
      feeStructure: fees.filter((f) => f.classId === 'ALL' || f.classId === me.classId),
      payments: pays.filter((p) => p.studentId === me.id),
      attendance: att.filter((r) => r.studentId === me.id),
      assessments: assess.filter((a) => a.termId === termId && (a.classId === me.classId || myScores.some((x) => x.assessmentId === a.id))),
      scores: myScores,
      comments: comments.filter((c) => c.studentId === me.id),
      position, teachers: [], activity: [],
    });
  }
  const [assess, att, scores, comments, activity] = await Promise.all([
    kget(env, 'c:assessments', []), loadAttendance(env, from, to), kget(env, 'c:scores:' + termId, []),
    kget(env, 'c:comments', []), kget(env, 'c:activity', []),
  ]);
  if (s.role === 'teacher') {
    return J({ ...base, students: students.map(noPin), assessments: assess, attendance: att, scores, comments, activity: [], feeStructure: [], payments: [], teachers: [] });
  }
  const [fees, pays, teachers] = await Promise.all([kget(env, 'c:feeStructure', []), kget(env, 'c:payments', []), kget(env, 'c:teachers', [])]);
  return J({ ...base, students, assessments: assess, attendance: att, scores, comments, activity, feeStructure: fees, payments: pays, teachers });
}

// ---------- writes ----------
async function assignIds(env, name, items) {
  const needs = items.some((i) => !i.id || (name === 'payments' && !i.receiptNo));
  if (!needs || !['students', 'teachers', 'payments'].includes(name)) return;
  const settings = await kget(env, 'c:settings', {});
  const c = (settings.counters = settings.counters || { student: 0, teacher: 0, receipt: 0 });
  for (const it of items) {
    if (name === 'students' && !it.id) it.id = 'STD-' + pad(++c.student, 3);
    if (name === 'teachers' && !it.id) it.id = 'T-' + pad(++c.teacher, 3);
    if (name === 'payments') {
      if (!it.id) it.id = rid();
      if (!it.receiptNo) it.receiptNo = 'RCT-' + pad(++c.receipt, 4);
    }
  }
  await kput(env, 'c:settings', settings);
}

function mergeInto(arr, name, upsert, remove) {
  const rm = new Set(remove || []);
  let out = arr.filter((x) => !rm.has(x.id));
  const idx = new Map(out.map((x, i) => [x.id, i]));
  for (const it of upsert || []) {
    if (!it || !it.id) continue;
    if (idx.has(it.id)) {
      const old = out[idx.get(it.id)];
      const merged = { ...old, ...it };
      if ('isDemo' in old) merged.isDemo = old.isDemo; // clients can never change the demo flag
      out[idx.get(it.id)] = merged;
    } else {
      const n = { ...it };
      if (['students', 'teachers', 'feeStructure', 'assessments'].includes(name)) n.isDemo = false;
      if (name === 'students' && !n.pin) n.pin = '1234';
      idx.set(n.id, out.length); out.push(n);
    }
  }
  if (name === 'activity') out = out.sort((a, b) => b.ts - a.ts).slice(0, 60);
  return out;
}

async function writeCollection(env, s, name, b) {
  if (s.role === 'parent') return ERR('forbidden', 403);
  if (s.role === 'teacher' && !TEACHER_OK.includes(name)) return ERR('forbidden', 403);
  if (name === 'settings') {
    if (s.role !== 'admin') return ERR('forbidden', 403);
    const cur = await kget(env, 'c:settings', {});
    const p = b.patch || {};
    ['schoolName', 'schoolPhone', 'payInfo', 'currentTermId'].forEach((k) => { if (typeof p[k] === 'string') cur[k] = p[k]; });
    if (typeof p.adminPin === 'string' && /^\d{4,8}$/.test(p.adminPin)) cur.adminPin = p.adminPin;
    await kput(env, 'c:settings', cur);
    return J({ ok: true });
  }
  const upsert = Array.isArray(b.upsert) ? b.upsert : [];
  const remove = Array.isArray(b.remove) ? b.remove : [];
  if (upsert.length + remove.length > 3000) return ERR('too big', 413);
  if (name in SHARDED) {
    const groups = {};
    upsert.forEach((it) => { if (it && it.id) (groups[SHARDED[name](it.id)] = groups[SHARDED[name](it.id)] || { u: [], r: [] }).u.push(it); });
    remove.forEach((id) => (groups[SHARDED[name](id)] = groups[SHARDED[name](id)] || { u: [], r: [] }).r.push(id));
    for (const sh of Object.keys(groups)) {
      if (!/^[\w-]{3,40}$/.test(sh)) return ERR('bad shard', 400);
      const key = `c:${name}:${sh}`;
      const cur = await kget(env, key, []);
      await kput(env, key, mergeInto(cur, name, groups[sh].u, groups[sh].r));
    }
    return J({ ok: true });
  }
  if (!PLAIN.includes(name)) return ERR('unknown', 404);
  await assignIds(env, name, upsert);
  const cur = await kget(env, 'c:' + name, []);
  await kput(env, 'c:' + name, mergeInto(cur, name, upsert, remove));
  return J({ ok: true, saved: upsert });
}

async function deleteStudents(env, b) {
  const students = await kget(env, 'c:students', []);
  const targets = b.demo ? students.filter((x) => x.isDemo === true) : students.filter((x) => (b.ids || []).includes(x.id));
  if (!targets.length) return J({ ok: true, deleted: 0 });
  const ids = new Set(targets.map((x) => x.id));
  await kput(env, 'c:students', students.filter((x) => !ids.has(x.id)));
  const pays = await kget(env, 'c:payments', []);
  await kput(env, 'c:payments', pays.filter((p) => !ids.has(p.studentId)));
  const com = await kget(env, 'c:comments', []);
  await kput(env, 'c:comments', com.filter((p) => !ids.has(p.studentId)));
  for (const k of await listKeys(env, 'c:attendance:')) {
    const a = await kget(env, k, []);
    const n = a.filter((r) => !ids.has(r.studentId));
    if (n.length !== a.length) await kput(env, k, n);
  }
  for (const k of await listKeys(env, 'c:scores:')) {
    const a = await kget(env, k, []);
    const n = a.filter((r) => !ids.has(r.studentId));
    if (n.length !== a.length) await kput(env, k, n);
  }
  const act = await kget(env, 'c:activity', []);
  act.unshift({
    id: rid(), ts: Date.now(), kind: 'delete',
    sw: b.demo ? `Wanafunzi wa demo ${ids.size} wamefutwa` : `Mwanafunzi amefutwa: ${targets[0].name}`,
    en: b.demo ? `${ids.size} demo students deleted` : `Student deleted: ${targets[0].name}`,
  });
  await kput(env, 'c:activity', act.slice(0, 60));
  return J({ ok: true, deleted: ids.size });
}

async function resetAll(env, b) {
  if (b.confirm !== 'RESET') return ERR('confirm', 400);
  for (const p of ['c:', 'init']) for (const k of await listKeys(env, p)) await env.SHULE_KV.delete(k);
  await seed(env, !!b.demo);
  return J({ ok: true });
}

async function savePdf(env, request) {
  const b = await request.json();
  if (!b.b64 || typeof b.b64 !== 'string' || b.b64.length > 3_000_000) return ERR('size', 413);
  const bin = atob(b.b64);
  if (!bin.startsWith('%PDF')) return ERR('not pdf', 400);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const token = rid().slice(0, 28);
  const name = String(b.name || 'file').replace(/[^\w.-]/g, '_').slice(0, 60);
  await env.SHULE_KV.put('f:' + token, bytes, { expirationTtl: 30 * 24 * 3600, metadata: { name } });
  return J({ url: new URL(request.url).origin + '/api/f/' + token + '.pdf' });
}

// ---------- router ----------
async function handle(request, env) {
  if (!env.SHULE_KV) return ERR('KV binding SHULE_KV is missing. Add it in Pages > Settings > Functions > KV namespace bindings.', 500);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const m = request.method;
  try {
    // public routes
    if (path === 'ping') {
      await ensureInit(env);
      const st = await kget(env, 'c:students', []);
      const s = await kget(env, 'c:settings', {});
      return J({ ok: true, demo: st.some((x) => x.isDemo), school: s.schoolName || '' });
    }
    if (path === 'login' && m === 'POST') { await ensureInit(env); return await login(env, await request.json()); }
    if (path.startsWith('f/') && m === 'GET') {
      const token = path.slice(2).replace(/\.pdf$/, '');
      if (!/^[a-f0-9]{20,40}$/.test(token)) return ERR('not found', 404);
      const { value, metadata } = await env.SHULE_KV.getWithMetadata('f:' + token, 'arrayBuffer');
      if (!value) return ERR('Link expired / Kiungo kimekwisha muda', 404);
      return new Response(value, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${(metadata && metadata.name) || 'file'}.pdf"`, 'cache-control': 'private, max-age=3600' } });
    }
    // protected routes
    const s = await getSession(env, request);
    if (!s) return ERR('unauthorized', 401);
    if (path === 'logout' && m === 'POST') {
      const t = (request.headers.get('authorization') || '').slice(7).trim();
      await env.SHULE_KV.delete('s:' + t);
      return J({ ok: true });
    }
    if (path === 'data' && m === 'GET') return await getData(env, s, url);
    if (path === 'attendance' && m === 'GET') {
      if (s.role !== 'admin') return ERR('forbidden', 403);
      const from = url.searchParams.get('from') || todayStr(), to = url.searchParams.get('to') || todayStr();
      return J({ attendance: await loadAttendance(env, from, to) });
    }
    if (path === 'scores' && m === 'GET') {
      if (s.role === 'parent') return ERR('forbidden', 403);
      return J({ scores: await kget(env, 'c:scores:' + (url.searchParams.get('term') || ''), []) });
    }
    if (path === 'pdf' && m === 'POST') {
      if (s.role === 'parent') return ERR('forbidden', 403);
      return await savePdf(env, request);
    }
    if (path === 'admin/delete-students' && m === 'POST') {
      if (s.role !== 'admin') return ERR('forbidden', 403);
      return await deleteStudents(env, await request.json());
    }
    if (path === 'admin/reset' && m === 'POST') {
      if (s.role !== 'admin') return ERR('forbidden', 403);
      return await resetAll(env, await request.json());
    }
    if (path.startsWith('c/') && m === 'POST') return await writeCollection(env, s, path.slice(2), await request.json());
    return ERR('not found', 404);
  } catch (e) {
    return ERR('server: ' + (e && e.message ? e.message : e), 500);
  }
}

// KV binding: any KV namespace bound to this Pages project works (recommended name: SHULE_KV)
function pickKV(env) {
  if (env.SHULE_KV) return env.SHULE_KV;
  for (const k of Object.keys(env)) { const v = env[k]; if (v && typeof v.get === 'function' && typeof v.put === 'function' && typeof v.list === 'function') return v; }
  return null;
}
export async function onRequest(context) {
  const kv = pickKV(context.env);
  return handle(context.request, kv ? { SHULE_KV: kv } : {});
}
