// 실시간 서버 통합 테스트: wrangler dev를 띄우고 WebSocket 손님 여러 명으로 확인합니다.
// 실행: node --test test/server.test.mjs   (ws 패키지 필요)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import WebSocket from 'ws';
import http from 'node:http';

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const ADMIN = 'test-admin-1234';
const AI_PORT = 8796;
let proc;
let log = '';
let aiCalls = [];

// 가짜 Claude API (AI MC·문제 만들기 경로를 확인하기 위함)
const aiServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const j = JSON.parse(body || '{}');
    aiCalls.push({ path: req.url, key: req.headers['x-api-key'], version: req.headers['anthropic-version'], body: j });
    let text = '다들 표정이 너무 좋아요! 다음 판도 이 기세로 가 볼까요? 🎉';
    if (String(j.system).includes('콘텐츠 작가')) {
      text = JSON.stringify([
        { t: '쏘플파티룸의 브랜드 색은 무슨 계열일까요?', o: ['빨강', '파랑', '초록', '보라'], a: 0 },
        { t: '1분은 몇 초일까요?', o: ['30초', '60초', '90초', '100초'], a: 1 },
        { t: '보기 부족 문제', o: ['하나'], a: 0 },
      ]);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', content: [{ type: 'text', text }] }));
  });
});

async function startServer() {
  proc = spawn('node_modules/.bin/wrangler', ['dev', '--port', String(PORT), '--ip', '127.0.0.1', '--var', `ADMIN_PASSWORD:${ADMIN}`, '--var', 'ANTHROPIC_API_KEY:test-key', '--var', 'HOME_URL:https://ssople.com', '--var', `AI_GATEWAY_URL:http://127.0.0.1:${AI_PORT}`, '--log-level', 'warn'], {
    cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
  });
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + '/api/config'); if (r.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('server did not start\n' + log);
}
async function stopServer() {
  if (!proc) return;
  proc.kill('SIGTERM');
  await new Promise((r) => { proc.once('exit', r); setTimeout(r, 4000); });
  proc = null;
}

before(async () => {
  rmSync(new URL('../.wrangler/state', import.meta.url).pathname, { recursive: true, force: true });
  await new Promise((r) => aiServer.listen(AI_PORT, '127.0.0.1', r));
  await startServer();
});
after(async () => { await stopServer(); aiServer.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(code, dev, nick, extra = '') {
    this.msgs = [];
    this.waiters = [];
    this.closed = null;
    const q = `dev=${dev}&nick=${encodeURIComponent(nick)}&look=${encodeURIComponent(JSON.stringify({ hair: 2, top: 3 }))}${extra}`;
    this.ws = new WebSocket(`${WS}/ws/${code}?${q}`);
    this.ws.on('message', (d) => {
      const s = String(d);
      if (s === 'pong') { this.msgs.push({ t: 'rawpong' }); this.flush(); return; }
      const m = JSON.parse(s);
      this.msgs.push(m);
      this.flush();
    });
    this.ws.on('close', (code, reason) => { this.closed = { code, reason: String(reason) }; this.flush(); });
  }
  flush() { for (const w of this.waiters.slice()) if (w.check()) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(w.value); } }
  wait(pred, ms = 5000, label = '') {
    return new Promise((resolve, reject) => {
      const w = { value: null, resolve, check: () => { const m = this.msgs.find((x) => pred(x)); if (m) { w.value = m; return true; } return false; } };
      if (w.check()) return resolve(w.value);
      this.waiters.push(w);
      setTimeout(() => reject(new Error('timeout waiting ' + label + '\nlast: ' + JSON.stringify(this.msgs.slice(-5)))), ms);
    });
  }
  waitT(t, extra = () => true, ms) { return this.wait((m) => m.t === t && extra(m), ms, t); }
  waitClose(ms = 5000) {
    return new Promise((resolve, reject) => {
      if (this.closed) return resolve(this.closed);
      const iv = setInterval(() => { if (this.closed) { clearInterval(iv); resolve(this.closed); } }, 30);
      setTimeout(() => { clearInterval(iv); reject(new Error('no close')); }, ms);
    });
  }
  send(m) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  clear() { this.msgs = []; }
  close() { this.ws.close(); }
}

async function createRoom(body) {
  const r = await fetch(BASE + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
const adminFetch = (path, opts = {}) => fetch(BASE + '/api/admin' + path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN, ...(opts.headers || {}) } });

let CODE;
const HOST_DEV = 'hostdev0001';

test('설정과 방 만들기', async () => {
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.equal(cfg.ok, true);
  assert.equal(cfg.ai, true);
  assert.equal(cfg.square, 'SQ1');
  const bad = await createRoom({ name: 'x' });
  assert.equal(bad.status, 400);
  const r = await createRoom({ name: '민지 생일 파티', theme: 'rooftop', capacity: 6, dev: HOST_DEV, isPublic: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.code, /^[A-Z2-9]{6}$/);
  CODE = r.data.code;
  const info = await (await fetch(BASE + '/api/rooms/' + CODE.toLowerCase())).json();
  assert.equal(info.exists, true);
  assert.equal(info.room.name, '민지 생일 파티');
  assert.equal(info.room.theme, 'rooftop');
  const none = await fetch(BASE + '/api/rooms/ZZZZZ2');
  assert.equal(none.status, 404);
  // 옛 초대 링크는 홈페이지의 온라인 파티룸 주소로 보냄
  const old = await fetch(BASE + '/r/' + CODE, { redirect: 'manual' });
  assert.equal(old.status, 302);
  assert.equal(old.headers.get('location'), 'https://ssople.com/live/r/' + CODE);
  for (const path of ['/', '/square', '/demo']) {
    const r = await fetch(BASE + path, { redirect: 'manual' });
    assert.equal(r.status, 302, path);
    assert.match(r.headers.get('location'), /^https:\/\/ssople\.com\/live/);
  }
  const adm = await fetch(BASE + '/admin');
  assert.equal(adm.status, 200);
  // 홈페이지에서 부르는 API는 CORS 허용, 모르는 사이트는 막음
  const pre = await fetch(BASE + '/api/rooms', { method: 'OPTIONS', headers: { Origin: 'https://ssople.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.ok(pre.status === 204 || pre.status === 200, 'preflight ' + pre.status);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://ssople.com');
  const okc = await fetch(BASE + '/api/config', { headers: { Origin: 'https://ssople.com' } });
  assert.equal(okc.headers.get('access-control-allow-origin'), 'https://ssople.com');
  const evil = await fetch(BASE + '/api/config', { headers: { Origin: 'https://evil.example' } });
  assert.notEqual(evil.headers.get('access-control-allow-origin'), 'https://evil.example');
  // 공개 방 목록: 사람이 들어와 있는 공개 방만 올라감
  const empty = await (await fetch(BASE + '/api/public')).json();
  assert.ok(!empty.rooms.some((x) => x.code === CODE), '빈 방은 목록에 없음');
  const visitor = new Client(CODE, 'pubvisitor01', '구경꾼');
  await visitor.waitT('welcome');
  let pub = null;
  for (let i = 0; i < 20; i++) { pub = await (await fetch(BASE + '/api/public')).json(); if (pub.rooms.some((x) => x.code === CODE)) break; await new Promise((r) => setTimeout(r, 300)); }
  const item = pub.rooms.find((x) => x.code === CODE);
  assert.ok(item, JSON.stringify(pub));
  assert.equal(item.kind, 'party');
  assert.equal(item.name, '민지 생일 파티');
  visitor.ws.close();
  // 집들이 방: 꾸민 집 그대로, 집주인 이름
  const hw = await createRoom({ kind: 'home', owner: '민지', dev: HOST_DEV, isPublic: true, home: { wall: 'w_mint', floor: 'f_oak', items: [{ i: 'bed_single', x: 1, y: 1, r: 0 }, { i: 'arcade', x: 1, y: 5, r: 0 }] } });
  assert.equal(hw.status, 200, JSON.stringify(hw.data));
  assert.equal(hw.data.room.kind, 'home');
  assert.equal(hw.data.room.name, '민지네 집');
  const hwc = new Client(hw.data.code, HOST_DEV, '민지');
  const hww = await hwc.waitT('welcome');
  assert.equal(hww.room.kind, 'home');
  assert.equal(hww.room.home.items.length, 2);
  hwc.ws.close();
});

test('입장, 채팅, 이동, 재접속, 강퇴', async () => {
  const host = new Client(CODE, HOST_DEV, '민지');
  const w = await host.waitT('welcome');
  assert.equal(w.host, w.you, '방을 만든 사람이 방장');
  assert.equal(w.room.theme, 'rooftop');
  const b = new Client(CODE, 'guestdev0001', '하늘');
  const wb = await b.waitT('welcome');
  await host.waitT('join', (m) => m.p.pid === wb.you);
  assert.equal(wb.players.length, 2);
  // 채팅
  b.send({ t: 'chat', text: '안녕하세요!' });
  const c = await host.waitT('chat', (m) => m.m.text === '안녕하세요!');
  assert.equal(c.m.nick, '하늘');
  // 이동
  b.send({ t: 'pos', x: 6.5, y: 9.5, tx: 3.5, ty: 6.5 });
  const pos = await host.waitT('pos', (m) => m.pid === wb.you);
  assert.equal(pos.tx, 3.5);
  // 연결 유지용 ping (서버를 깨우지 않는 자동 응답)
  b.send('ping');
  await b.waitT('rawpong');
  // 같은 기기로 다시 들어오면 예전 연결은 정리되고 같은 사람으로 이어짐
  const b2 = new Client(CODE, 'guestdev0001', '하늘');
  const wb2 = await b2.waitT('welcome');
  assert.equal(wb2.you, wb.you);
  await b.waitT('replaced');
  // 예전 연결에서 온 메시지는 무시
  b.send({ t: 'chat', text: '예전 창에서 보낸 말' });
  await sleep(300);
  assert.ok(!host.msgs.some((m) => m.t === 'chat' && m.m.text === '예전 창에서 보낸 말'));
  // 서버도 닫지만, 화면은 replaced를 받으면 스스로 연결을 닫음
  b.close();
  await b.waitClose();
  b2.send({ t: 'chat', text: '새 창' });
  await host.waitT('chat', (m) => m.m.text === '새 창');
  await host.wait((m) => m.t === 'leave' && m.pid === wb.you, 800).then(() => assert.fail('새 창이 살아 있는데 나감 처리됨'), () => {});
  // 연결이 끊기면 다른 사람에게 알림
  const d = new Client(CODE, 'guestdev0002', '도윤');
  const wd = await d.waitT('welcome');
  d.close();
  await host.waitT('leave', (m) => m.pid === wd.you);
  // 강퇴
  const e = new Client(CODE, 'guestdev0003', '은우');
  const we = await e.waitT('welcome');
  b2.send({ t: 'kick', pid: we.you });
  await sleep(300);
  assert.equal(e.closed, null, '방장이 아니면 강퇴 불가');
  host.send({ t: 'kick', pid: we.you });
  await e.waitT('kicked');
  await host.waitT('gone', (m) => m.pid === we.you);
  e.send({ t: 'chat', text: '강퇴 뒤에 보낸 말' });
  await sleep(300);
  assert.ok(!host.msgs.some((m) => m.t === 'chat' && m.m.text === '강퇴 뒤에 보낸 말'));
  const ec = await e.waitClose(15000);
  assert.equal(ec.code, 4010);
  const e2 = new Client(CODE, 'guestdev0003', '은우');
  const den = await e2.waitT('denied');
  assert.equal(den.reason, 'banned');
  host.close(); b2.close();
  await sleep(300);
});

test('잠금과 정원', async () => {
  const r = await createRoom({ name: '작은 방', capacity: 2, dev: 'lockhost001' });
  const code = r.data.code;
  const h = new Client(code, 'lockhost001', '방장');
  await h.waitT('welcome');
  const a = new Client(code, 'lockguest01', '하나');
  await a.waitT('welcome');
  const full = new Client(code, 'lockguest02', '둘');
  assert.equal((await full.waitT('denied')).reason, 'full');
  assert.equal((await full.waitClose()).code, 4001);
  a.close();
  await h.waitT('leave');
  h.send({ t: 'room.set', locked: true });
  await h.waitT('room', (m) => m.room.locked === true);
  const late = new Client(code, 'lockguest03', '셋');
  assert.equal((await late.waitT('denied')).reason, 'locked');
  // 이미 있던 사람은 잠겨도 다시 들어올 수 있음
  const back = new Client(code, 'lockguest01', '하나');
  await back.waitT('welcome');
  h.close(); back.close();
  const nf = new Client('ZZZZZ3', 'someone001', 'x');
  assert.equal((await nf.waitT('denied')).reason, 'notfound');
});

test('게임: 퀴즈 진행과 비공개 정보', async () => {
  const r = await createRoom({ name: '퀴즈방', dev: 'quizhost01' });
  const code = r.data.code;
  const h = new Client(code, 'quizhost01', '방장');
  const wh = await h.waitT('welcome');
  const a = new Client(code, 'quizguest1', '참가');
  const wa = await a.waitT('welcome');
  h.send({ t: 'g.start', id: 'quiz' });
  const g = (await a.waitT('game', (m) => m.g && m.g.phase === 'answer')).g;
  assert.equal(g.a, null);
  assert.equal(g.q.o.length, 4);
  h.send({ t: 'g.in', gid: g.gid, gs: g.seq, v: 0 });
  a.send({ t: 'g.in', gid: g.gid, gs: g.seq, v: 1 });
  const rev = (await h.waitT('game', (m) => m.g && m.g.phase === 'reveal')).g;
  assert.ok(rev.a !== null);
  assert.ok(rev.picks[wh.you] === 0 && rev.picks[wa.you] === 1);
  h.send({ t: 'g.end' });
  const end = (await a.waitT('game', (m) => m.g && m.g.phase === 'end')).g;
  assert.equal(end.result.rank.length, 2);
  h.send({ t: 'g.close' });
  await a.waitT('game', (m) => m.g === null);
  // 라이어게임은 3명부터
  h.send({ t: 'g.start', id: 'liar' });
  const n = await h.waitT('notice');
  assert.match(n.text, /3명부터/);
  h.close(); a.close();
});

test('타이머: OX퀴즈 모이기 단계가 시간이 되면 넘어감', async () => {
  const r = await createRoom({ name: 'OX방', dev: 'oxhost0001' });
  const code = r.data.code;
  const h = new Client(code, 'oxhost0001', '방장');
  const wh = await h.waitT('welcome');
  h.send({ t: 'g.start', id: 'ox' });
  const g = (await h.waitT('game', (m) => m.g && m.g.phase === 'gather')).g;
  assert.ok(g.deadline > Date.now() - 1000);
  // 무대 O 구역으로 이동
  h.send({ t: 'pos', x: 3.5, y: 2.5, tx: 3.5, ty: 2.5 });
  const ans = (await h.waitT('game', (m) => m.g && m.g.phase === 'answer', 15000)).g;
  assert.ok(ans.q.t.length > 0);
  h.send({ t: 'g.next' });
  const rev = (await h.waitT('game', (m) => m.g && m.g.phase === 'reveal')).g;
  assert.equal(rev.res.results[wh.you], 'O');
  h.close();
});

test('신고 누적, 건배, 케이크, 사진', async () => {
  const r = await createRoom({ name: '이벤트방', dev: 'evhost0001' });
  const code = r.data.code;
  const h = new Client(code, 'evhost0001', '방장');
  await h.waitT('welcome');
  const cs = [];
  for (let i = 0; i < 3; i++) { const c = new Client(code, 'evguest000' + i, '손님' + i); cs.push(c); await c.waitT('welcome'); }
  const target = cs[0];
  const tw = target.msgs.find((m) => m.t === 'welcome');
  for (const rep of [h, cs[1], cs[2]]) rep.send({ t: 'report', pid: tw.you, reason: 'abuse', memo: '욕설' });
  const p = await h.waitT('player', (m) => m.p.pid === tw.you && m.p.muted === true);
  assert.ok(p);
  target.send({ t: 'chat', text: '제한된 말' });
  await target.waitT('notice');
  h.send({ t: 'ev.cheers' });
  assert.equal((await cs[1].waitT('ev', (m) => m.k === 'cheers')).k, 'cheers');
  h.send({ t: 'ev.cake', hero: tw.you });
  await cs[2].waitT('ev', (m) => m.k === 'cake' && m.cake?.on);
  for (const c of [h, cs[1], cs[2]]) c.send({ t: 'ev.blow' });
  const out = await target.waitT('ev', (m) => m.k === 'cakeout');
  assert.match(out.text, /생일 축하/);
  cs[1].send({ t: 'ev.photo' });
  const ph = await h.waitT('ev', (m) => m.k === 'photo');
  assert.ok(ph.at > ph.now);
  // 신고가 관리자 화면에 들어왔는지
  const reps = await (await adminFetch('/reports')).json();
  assert.ok(reps.reports.length >= 3);
  assert.ok(reps.reports[0].chat.length >= 0);
  h.close(); for (const c of cs) c.close();
});

test('쏘플 스퀘어', async () => {
  const a = new Client('SQ1', 'sqguest001', '첫손님');
  const w = await a.waitT('welcome');
  assert.equal(w.room.kind, 'square');
  assert.equal(w.host, null);
  const b = new Client('SQ1', 'sqguest002', '둘째');
  await b.waitT('welcome');
  b.send({ t: 'chat', text: '스퀘어 안녕' });
  await a.waitT('chat', (m) => m.m.text === '스퀘어 안녕');
  a.send({ t: 'g.start', id: 'quiz' });
  await sleep(300);
  assert.ok(!a.msgs.some((m) => m.t === 'game'));
  a.close(); b.close();
});

test('관리자: 비밀번호, 지표, 공지, 콘텐츠, 신고 처리', async () => {
  const no = await fetch(BASE + '/api/admin/summary', { headers: { 'x-admin-key': 'wrong' } });
  assert.equal(no.status, 401);
  const s = await (await adminFetch('/summary')).json();
  assert.ok(s.days.length === 14);
  assert.ok(s.totals.rooms >= 4, JSON.stringify(s.totals));
  assert.ok(s.devices >= 5);
  const set = await (await adminFetch('/settings', { method: 'POST', body: JSON.stringify({ notice: '금요일 밤 9시 스퀘어 파티!', event: { title: '금요 파티', at: Date.now() + 86400_000 } }) })).json();
  assert.equal(set.notice, '금요일 밤 9시 스퀘어 파티!');
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.equal(cfg.event.title, '금요 파티');
  // 직접 추가한 콘텐츠는 바로 승인
  const add = await (await adminFetch('/content', { method: 'POST', body: JSON.stringify({ type: 'quiz', item: { t: '쏘플의 브랜드 색은?', o: ['빨강', '파랑', '초록', '노랑'], a: 0 } }) })).json();
  assert.equal(add.added, 1);
  const bad = await adminFetch('/content', { method: 'POST', body: JSON.stringify({ type: 'quiz', item: { t: '보기 부족', o: ['a'], a: 0 } }) });
  assert.equal(bad.status, 400);
  const list = await (await adminFetch('/content?status=approved')).json();
  assert.equal(list.items.length, 1);
  // AI로 문제 만들기: 형식이 틀린 항목은 버리고 승인 대기로
  const gen = await (await adminFetch('/content/generate', { method: 'POST', body: JSON.stringify({ type: 'quiz', n: 3, topic: '쏘플' }) })).json();
  assert.equal(gen.made, 2, JSON.stringify(gen));
  const pend = await (await adminFetch('/content?status=pending')).json();
  assert.equal(pend.items.length, 2);
  const genCall = aiCalls.find((c) => String(c.body.system).includes('콘텐츠 작가'));
  assert.equal(genCall.path, '/v1/messages');
  assert.equal(genCall.key, 'test-key');
  assert.equal(genCall.version, '2023-06-01');
  assert.match(genCall.body.model, /^claude-/);
  await adminFetch('/content/' + pend.items[0].id, { method: 'POST', body: JSON.stringify({ action: 'approve' }) });
  const appr = await (await adminFetch('/content?status=approved')).json();
  assert.equal(appr.items.length, 2);
  // 신고 처리: 차단
  const reps = await (await adminFetch('/reports')).json();
  const first = reps.reports[0];
  const done = await (await adminFetch('/reports/' + first.id, { method: 'POST', body: JSON.stringify({ action: 'ban' }) })).json();
  assert.equal(done.ok, true);
  const bans = await (await adminFetch('/bans')).json();
  assert.ok(bans.bans.some((b) => b.dev === first.target_dev));
  const rooms = await (await adminFetch('/rooms')).json();
  assert.ok(Array.isArray(rooms.recent) && rooms.recent.length >= 4);
  const pub = await (await fetch(BASE + '/api/public')).json();
  assert.ok(Array.isArray(pub.rooms));
});

test('AI MC: 방장이 부르면 멘트, 게임이 끝나면 마무리 멘트', async () => {
  const r = await createRoom({ name: 'AI방', dev: 'aihost0001' });
  const code = r.data.code;
  const hst = new Client(code, 'aihost0001', '방장');
  await hst.waitT('welcome');
  const g2 = new Client(code, 'aiguest001', '손님');
  await g2.waitT('welcome');
  const before = aiCalls.length;
  hst.send({ t: 'mc.ask' });
  await g2.waitT('mcwait');
  const mc = await g2.waitT('mc', () => true, 8000);
  assert.match(mc.text, /다음 판도/);
  const call = aiCalls[before];
  assert.ok(JSON.stringify(call.body.messages).includes('손님'));
  hst.send({ t: 'g.start', id: 'quiz' });
  await hst.waitT('game', (m) => m.g && m.g.phase === 'answer');
  hst.clear(); g2.clear();
  hst.send({ t: 'g.end' });
  await g2.waitT('game', (m) => m.g && m.g.phase === 'end');
  const fin = await g2.waitT('mc', () => true, 8000);
  assert.ok(fin.text.length > 5);
  hst.close(); g2.close();
});

test('서버를 다시 켜도 방과 대화가 남아 있음', async () => {
  const h = new Client(CODE, HOST_DEV, '민지');
  await h.waitT('welcome');
  h.send({ t: 'chat', text: '저장 확인용 메시지' });
  await h.waitT('chat', (m) => m.m.text === '저장 확인용 메시지');
  await sleep(3500); // 저장 대기 (2.5초)
  h.close();
  await sleep(300);
  await stopServer();
  await startServer();
  const h2 = new Client(CODE, HOST_DEV, '민지');
  const w = await h2.waitT('welcome', () => true, 10000);
  assert.ok(w.chat.some((c) => c.text === '저장 확인용 메시지'));
  assert.equal(w.room.name, '민지 생일 파티');
  h2.close();
});
