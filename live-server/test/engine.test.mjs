// 게임 엔진 단위 테스트: node --test test/engine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomEngine, makeMeta, GRACE_MS, HOST_GRACE_MS, IDLE_MC_MS } from '../../live/shared/engine.js';
import { QUIZ, OX } from '../../live/shared/content.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function setup({ kind = 'party', n = 4, capacity = 8, seed = 7 } = {}) {
  let t = 1_700_000_000_000;
  const out = []; const reports = []; const stats = []; const kicked = []; const mcs = []; const finishes = [];
  const hooks = {
    now: () => t, rand: rng(seed),
    send: (pid, msg) => out.push({ to: pid, msg }),
    broadcast: (msg, except) => out.push({ to: '*', except, msg }),
    onReport: (r) => reports.push(r), onStat: (k, v, x) => stats.push([k, v, x]), onKick: (pid) => kicked.push(pid),
    onFinish: (ctx) => finishes.push(ctx),
  };
  const meta = makeMeta({ code: 'ABC123', kind, name: '테스트 방', capacity, hostDev: 'dev0' }, t);
  const e = RoomEngine.create(meta, hooks, t);
  const pids = [];
  for (let i = 0; i < n; i++) pids.push(e.join('dev' + i, { nick: '사람' + i }, t).pid);
  const env = {
    e, pids, out, reports, stats, kicked, mcs, finishes,
    now: () => t,
    adv(ms) { t += ms; e.tick(t); },
    h(pid, m) { e.handle(pid, m, t); },
    g() { return e.gamePub(t); },
    priv(pid) { return e.gamePriv(pid); },
    lastB(type) { for (let i = out.length - 1; i >= 0; i--) if (out[i].to === '*' && out[i].msg.t === type) return out[i].msg; return null; },
    lastTo(pid, type) { for (let i = out.length - 1; i >= 0; i--) if (out[i].to === pid && out[i].msg.t === type) return out[i].msg; return null; },
    gin(pid, m) { const g = e.g; e.handle(pid, { t: 'g.in', gid: g.gid, gs: g.seq, ...m }, t); },
    // 이동 메시지를 보내 위치를 정함
    move(pid, x, y) { e.rate.delete(pid); e.handle(pid, { t: 'pos', x, y, tx: x, ty: y }, t); },
  };
  return env;
}

test('입장, 방장, 정원, 잠금, 재입장', () => {
  const s = setup({ n: 3, capacity: 4 });
  const { e, pids } = s;
  assert.equal(e.s.hostPid, pids[0], '방을 만든 기기가 방장');
  assert.equal(e.countActive(), 3);
  const p3 = e.join('dev3', { nick: '넷째' }, s.now());
  assert.ok(p3.pid);
  assert.deepEqual(e.join('dev4', { nick: '다섯' }, s.now()), { err: 'full' });
  // 잠금
  s.h(pids[0], { t: 'room.set', locked: true, capacity: 6 });
  assert.equal(e.s.meta.locked, true);
  assert.equal(e.s.meta.capacity, 6);
  assert.deepEqual(e.join('dev5', { nick: '여섯' }, s.now()), { err: 'locked' });
  // 방장이 아니면 설정 변경 불가
  s.h(pids[1], { t: 'room.set', locked: false });
  assert.equal(e.s.meta.locked, true);
  // 끊겼다 다시 들어오면 같은 사람
  e.leave(pids[1], s.now());
  assert.equal(e.countActive(), 3);
  const back = e.join('dev1', { nick: '다시' }, s.now());
  assert.equal(back.pid, pids[1]);
  assert.equal(e.player(pids[1]).nick, '다시');
  // 금칙어 닉네임은 기본값으로
  s.h(pids[0], { t: 'room.set', locked: false });
  const bad = e.join('dev9', { nick: '시발' }, s.now());
  assert.equal(e.player(bad.pid).nick, '손님');
});

test('유예 시간, 임시 방장, 방장 복귀', () => {
  const s = setup({ n: 3 });
  const { e, pids } = s;
  e.leave(pids[0], s.now());
  assert.equal(e.s.hostPid, pids[0], '바로 바뀌지 않음');
  assert.ok(e.nextWake(s.now()) <= s.now() + HOST_GRACE_MS);
  s.adv(HOST_GRACE_MS + 10);
  assert.equal(e.s.hostPid, pids[1], '30초 뒤 다음 사람이 임시 방장');
  // 원래 방장이 돌아오면 다시 방장
  e.join('dev0', { nick: '사람0' }, s.now());
  assert.equal(e.s.hostPid, pids[0]);
  // 나간 사람은 유예 시간 뒤 정리
  e.leave(pids[2], s.now());
  s.adv(GRACE_MS + 10);
  assert.equal(e.player(pids[2]), undefined);
  assert.equal(s.lastB('gone').pid, pids[2]);
  // 방장 넘기기
  s.h(pids[0], { t: 'host.give', pid: pids[1] });
  assert.equal(e.s.hostPid, pids[1]);
  assert.equal(e.s.meta.hostDev, 'dev1');
});

test('빈 방은 타이머가 계속 돌지 않음', () => {
  const s = setup({ n: 1 });
  const { e, pids } = s;
  e.leave(pids[0], s.now());
  s.adv(HOST_GRACE_MS + 1);
  s.adv(GRACE_MS);
  assert.equal(e.s.order.length, 0);
  assert.equal(e.nextWake(s.now()), null);
});

test('채팅 필터, 도배 제한, 신고 누적', () => {
  const s = setup({ n: 6 });
  const { e, pids } = s;
  s.h(pids[1], { t: 'chat', text: '안녕 씨발 반가워' });
  const m = s.lastB('chat').m;
  assert.ok(!m.text.includes('씨발'));
  for (let i = 0; i < 8; i++) s.h(pids[2], { t: 'chat', text: '도배 ' + i });
  assert.equal(e.s.chat.filter((c) => c.pid === pids[2]).length, 6);
  assert.ok(s.lastTo(pids[2], 'notice'));
  // 3명이 신고하면 10분 채팅 제한
  for (const r of [pids[0], pids[2], pids[3]]) s.h(r, { t: 'report', pid: pids[1], reason: 'abuse' });
  assert.equal(s.reports.length, 3);
  assert.ok(s.reports[0].chat.length > 0);
  assert.ok(e.player(pids[1]).muteUntil > s.now());
  s.h(pids[1], { t: 'chat', text: '조용히' });
  assert.ok(!e.s.chat.some((c) => c.text === '조용히'));
  // 5명이면 방에서 내보냄
  for (const r of [pids[4], pids[5]]) s.h(r, { t: 'report', pid: pids[1], reason: 'abuse' });
  assert.equal(e.player(pids[1]), undefined);
  assert.deepEqual(s.kicked, [pids[1]]);
  assert.deepEqual(e.join('dev1', { nick: 'x' }, s.now()), { err: 'banned' });
});

test('방장 강퇴', () => {
  const s = setup({ n: 3 });
  const { e, pids } = s;
  s.h(pids[1], { t: 'kick', pid: pids[2] });
  assert.ok(e.player(pids[2]), '방장만 강퇴 가능');
  s.h(pids[0], { t: 'kick', pid: pids[2] });
  assert.equal(e.player(pids[2]), undefined);
  assert.equal(s.lastTo(pids[2], 'kicked').t, 'kicked');
  assert.deepEqual(e.join('dev2', {}, s.now()), { err: 'banned' });
});

test('밸런스게임: 소수파 점수, 끝까지 진행', () => {
  const s = setup({ n: 4 });
  const { e, pids } = s;
  s.h(pids[1], { t: 'g.start', id: 'balance' });
  assert.equal(e.g, null, '방장만 시작');
  s.h(pids[0], { t: 'g.start', id: 'balance', opts: { rounds: 3 } });
  assert.equal(s.g().phase, 'answer');
  assert.equal(s.g().total, 3);
  s.gin(pids[0], { v: 'a' }); s.gin(pids[1], { v: 'a' }); s.gin(pids[2], { v: 'a' });
  assert.equal(s.g().phase, 'answer');
  s.gin(pids[3], { v: 'b' });
  assert.equal(s.g().phase, 'reveal');
  assert.equal(s.g().minority, 'b');
  assert.equal(e.g.scores[pids[3]], 1);
  // 모두 같은 쪽이면 소수파 없음
  s.h(pids[0], { t: 'g.next' });
  for (const p of pids) s.gin(p, { v: 'b' });
  assert.equal(s.g().minority, null);
  assert.match(s.g().mc, /통했다/);
  // 시간이 지나면 자동 진행
  s.adv(15_001);
  assert.equal(s.g().phase, 'answer');
  assert.equal(s.g().round, 3);
  s.adv(20_001);
  assert.equal(s.g().phase, 'reveal');
  s.adv(15_001);
  assert.equal(s.g().phase, 'end');
  assert.equal(s.g().result.rank[0].pid, pids[3]);
  assert.equal(s.finishes.length, 1);
  // 한 판 더
  s.h(pids[0], { t: 'g.again' });
  assert.equal(s.g().phase, 'answer');
  assert.equal(s.g().gid, 2);
  // 지난 게임의 답은 무시
  e.handle(pids[1], { t: 'g.in', gid: 1, gs: 1, v: 'a' }, s.now());
  assert.equal(s.g().answered.length, 0);
  s.h(pids[0], { t: 'g.close' });
  assert.equal(e.g, null);
});

test('라이어게임: 카드, 발언 순서, 투표, 정답 맞히기', () => {
  const s = setup({ n: 4 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'liar' });
  const g0 = s.g();
  assert.equal(g0.phase, 'card');
  assert.equal(g0.liar, null, '라이어는 공개되지 않음');
  const liar = e.g.d.liar;
  const citizens = pids.filter((p) => p !== liar);
  assert.equal(s.priv(liar).role, 'liar');
  assert.equal(s.priv(liar).word, null);
  assert.equal(s.priv(citizens[0]).word, e.g.d.word);
  for (const p of pids) s.gin(p, { k: 'ok' });
  assert.equal(s.g().phase, 'talk');
  // 차례인 사람이 말하면 다음 차례로
  const first = s.g().turn;
  s.h(first, { t: 'chat', text: '음… 둥글어요' });
  assert.notEqual(s.g().turn, first);
  for (let i = 0; i < 3; i++) s.h(s.g().turn, { t: 'chat', text: '힌트 ' + i });
  assert.equal(s.g().lap, 1);
  assert.ok(e.g.deadline - s.now() <= 45_000, '한 바퀴 돌면 45초 뒤 투표');
  s.h(pids[0], { t: 'g.next' });
  assert.equal(s.g().phase, 'vote');
  // 자기 자신에게는 투표 불가
  s.gin(liar, { k: 'vote', v: liar });
  assert.equal(s.g().voted.length, 0);
  s.gin(liar, { k: 'vote', v: citizens[0] });
  for (const c of citizens) s.gin(c, { k: 'vote', v: liar });
  assert.equal(s.g().phase, 'guess');
  assert.equal(s.g().liar, liar);
  const opts = s.priv(liar).options;
  assert.equal(opts.length, 4);
  assert.ok(opts.includes(e.g.d.word));
  assert.equal(s.priv(citizens[0]).options, null);
  s.gin(liar, { k: 'guess', v: e.g.d.word });
  assert.equal(s.g().phase, 'result');
  assert.equal(s.g().win, 'liar');
  assert.equal(e.g.scores[liar], 3);
  // 다음 판
  s.h(pids[0], { t: 'g.next' });
  assert.equal(s.g().phase, 'card');
  assert.equal(s.g().round, 2);
  // 라이어가 나가면 무효
  const liar2 = e.g.d.liar;
  e.leave(liar2, s.now());
  assert.equal(s.g().phase, 'result');
  assert.equal(s.g().win, 'none');
  s.h(pids[0] === liar2 ? s.e.s.hostPid : pids[0], { t: 'g.end' });
});

test('라이어게임: 시민 승리와 동점', () => {
  const s = setup({ n: 3, seed: 3 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'liar' });
  const liar = e.g.d.liar;
  const [c1, c2] = pids.filter((p) => p !== liar);
  s.adv(30_001); // 카드 시간 끝
  assert.equal(s.g().phase, 'talk');
  s.adv(180_001);
  assert.equal(s.g().phase, 'vote');
  s.gin(c1, { k: 'vote', v: liar }); s.gin(c2, { k: 'vote', v: liar }); s.gin(liar, { k: 'vote', v: c1 });
  assert.equal(s.g().phase, 'guess');
  const wrong = e.g.d.options.find((o) => o !== e.g.d.word);
  s.gin(liar, { k: 'guess', v: wrong });
  assert.equal(s.g().win, 'citizen');
  assert.equal(e.g.scores[c1], 1);
  s.h(pids[0], { t: 'g.next' });
  s.adv(30_001); s.adv(180_001);
  // 동점이면 라이어 승
  const l2 = e.g.d.liar; const [d1, d2] = pids.filter((p) => p !== l2);
  s.gin(d1, { k: 'vote', v: d2 }); s.gin(d2, { k: 'vote', v: l2 }); s.gin(l2, { k: 'vote', v: d1 });
  assert.equal(s.g().phase, 'result');
  assert.equal(s.g().win, 'liar');
});

test('그림 맞히기: 그림 전달, 채팅 정답, 정답 노출 막기', () => {
  const s = setup({ n: 3 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'draw' });
  const g = s.g();
  assert.equal(g.phase, 'draw');
  const drawer = g.drawer;
  const word = e.g.d.cur.word;
  assert.equal(s.priv(drawer).word, word);
  const guesser = pids.find((p) => p !== drawer);
  assert.equal(s.priv(guesser).word, null);
  // 그리는 사람만 그릴 수 있고, 잘못된 값은 버림
  s.gin(guesser, { k: 'stroke', s: [[1, 1, 2, 2, 0, 2]] });
  assert.equal(e.g.d.cur.strokes.length, 0);
  s.gin(drawer, { k: 'stroke', s: [[10, 10, 20, 20, 1, 2], [5000, 1, 2, 2, 0, 2], [1, 2, 3]] });
  assert.equal(e.g.d.cur.strokes.length, 1);
  assert.equal(s.lastB('gdraw').s.length, 1);
  // 그리는 사람이 정답을 쓰면 막음
  s.h(drawer, { t: 'chat', text: `정답은 ${word}` });
  assert.ok(!e.s.chat.some((c) => c.text.includes(word)));
  // 틀린 답은 채팅과 추측 목록에
  s.h(guesser, { t: 'chat', text: '혹시 사과?' });
  assert.equal(s.g().feed.length, 1);
  // 힌트
  s.adv(40_001);
  assert.ok(s.g().hint.startsWith(Array.from(word)[0]));
  // 정답
  s.h(guesser, { t: 'chat', text: word + '!' });
  assert.equal(s.g().phase, 'reveal');
  assert.equal(s.g().winner, guesser);
  assert.equal(e.g.scores[guesser], 3);
  assert.equal(e.g.scores[drawer], 2);
  assert.ok(!e.s.chat.some((c) => !c.sys && c.text.includes(word)), '정답 문장은 채팅에 남지 않음');
  s.adv(7_001);
  assert.equal(s.g().round, 2);
  // 그리는 사람이 나가면 바로 공개
  e.leave(s.g().drawer, s.now());
  assert.equal(s.g().phase, 'reveal');
  s.adv(7_001); s.adv(80_001); s.adv(7_001);
  assert.equal(s.g().phase, 'end');
});

test('진실카드: 대답, 통과권 1장', () => {
  const s = setup({ n: 2 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'truth' });
  assert.equal(s.g().total, 4);
  const cur = s.g().cur;
  const other = pids.find((p) => p !== cur);
  s.gin(other, { k: 'answer', text: '남의 차례' });
  assert.equal(s.g().answer, null);
  s.gin(cur, { k: 'answer', text: '솔직히 라면이요' });
  assert.equal(s.g().phase, 'answered');
  assert.ok(e.s.chat.some((c) => c.text.includes('라면')));
  s.gin(cur, { k: 'done' });
  assert.equal(s.g().round, 2);
  const c2 = s.g().cur;
  s.gin(c2, { k: 'pass' });
  assert.equal(s.g().round, 3);
  // 두 번째 통과는 안 됨
  while (s.g().cur !== c2 && s.g().phase !== 'end') { s.gin(s.g().cur, { k: 'answer', text: '네' }); s.gin(s.g().cur, { k: 'done' }); }
  if (s.g().phase !== 'end') { s.gin(c2, { k: 'pass' }); assert.equal(s.g().cur, c2); }
  s.adv(90_001); s.adv(90_001); s.adv(90_001);
  assert.equal(s.g().phase, 'end');
});

test('파티 룰렛: 방장만 조작, 세 가지 모드', () => {
  const s = setup({ n: 4 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'roulette' });
  s.gin(pids[1], { k: 'spin' });
  assert.equal(s.g().spin, null);
  s.gin(pids[0], { k: 'spin' });
  assert.ok(s.g().spin.idx >= 0 && s.g().spin.idx < 8);
  s.gin(pids[0], { k: 'items', v: ['노래', '춤', '  ', '시발'] });
  assert.equal(s.g().items.length, 3);
  assert.ok(!s.g().items.includes('시발'));
  s.gin(pids[0], { k: 'mode', v: 'team' });
  s.gin(pids[0], { k: 'spin' });
  assert.equal(s.g().teams[0].length + s.g().teams[1].length, 4);
  s.gin(pids[0], { k: 'mode', v: 'order' });
  s.gin(pids[0], { k: 'spin' });
  assert.equal(s.g().order.length, 4);
  s.h(pids[0], { t: 'g.end' });
  assert.equal(e.g, null);
});

test('퀴즈 배틀: 속도 점수, 중간 참여, 끝까지', () => {
  const s = setup({ n: 2 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'quiz' });
  const q = e.g.d.q;
  assert.equal(s.g().a, null, '정답은 공개 전까지 숨김');
  assert.ok(QUIZ.some((x) => x.t === s.g().q.t));
  s.adv(1000);
  s.gin(pids[0], { v: q.a });
  s.adv(5000);
  s.gin(pids[1], { v: (q.a + 1) % 4 });
  assert.equal(s.g().phase, 'reveal');
  assert.equal(s.g().a, q.a);
  assert.ok(e.g.scores[pids[0]] > 140, '빨리 맞히면 보너스');
  assert.equal(e.g.scores[pids[1]] || 0, 0);
  // 중간에 들어온 사람도 참여
  const late = e.join('dev7', { nick: '늦게' }, s.now()).pid;
  assert.ok(e.inGame(late));
  for (let i = 0; i < 9; i++) { s.adv(8_001); s.adv(15_001); }
  s.adv(8_001);
  assert.equal(s.g().phase, 'end');
  assert.equal(s.g().result.rank[0].pid, pids[0]);
});

test('OX퀴즈: 위치로 판정, 서바이벌, 관중석 이동', () => {
  const s = setup({ n: 3, seed: 11 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'ox' });
  assert.equal(s.g().phase, 'gather');
  assert.equal(s.g().survival, true);
  s.adv(10_001);
  assert.equal(s.g().phase, 'answer');
  const q = e.g.d.q;
  assert.ok(OX.some((x) => x.t === q.t));
  const right = q.a === 'O' ? [3.5, 2.5] : [6.5, 2.5];
  const wrong = q.a === 'O' ? [6.5, 2.5] : [3.5, 2.5];
  s.move(pids[0], ...right); s.move(pids[1], ...right); s.move(pids[2], ...wrong);
  s.adv(12_001);
  assert.equal(s.g().phase, 'reveal');
  assert.deepEqual(s.g().res.out, [pids[2]]);
  assert.deepEqual(s.g().alive.sort(), [pids[0], pids[1]].sort());
  const p2 = e.player(pids[2]);
  assert.ok(p2.y >= 4, '탈락자는 관중석으로');
  // 다음 문제: 둘 다 틀리면 전원 부활
  s.adv(7_001);
  const q2 = e.g.d.q;
  const w2 = q2.a === 'O' ? [6.5, 2.5] : [3.5, 2.5];
  s.move(pids[0], ...w2); s.move(pids[1], ...w2);
  s.adv(12_001);
  assert.equal(s.g().res.revived, true);
  assert.equal(s.g().alive.length, 2);
  // 다음 문제: 한 명만 맞히면 게임 끝
  s.adv(7_001);
  const q3 = e.g.d.q;
  const r3 = q3.a === 'O' ? [3.5, 2.5] : [6.5, 2.5];
  const w3 = q3.a === 'O' ? [6.5, 2.5] : [3.5, 2.5];
  s.move(pids[0], ...r3); s.move(pids[1], ...w3);
  s.adv(12_001);
  s.adv(7_001);
  assert.equal(s.g().phase, 'end');
  const rank = s.g().result.rank;
  assert.equal(rank[0].pid, pids[0]);
  assert.equal(rank[0].tag, '생존');
});

test('혼자 하는 OX퀴즈는 탈락 없이 끝까지', () => {
  const s = setup({ n: 1 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'ox' });
  assert.equal(s.g().survival, false);
  s.adv(10_001);
  for (let i = 0; i < 8; i++) { s.adv(12_001); s.adv(7_001); }
  assert.equal(s.g().phase, 'end');
  assert.match(e.g.result.label, /OX/);
});

test('파티 이벤트: 건배, 케이크, 사진', () => {
  const s = setup({ n: 5 });
  const { e, pids } = s;
  s.h(pids[2], { t: 'ev.cheers' });
  assert.equal(s.lastB('ev').k, 'cheers');
  const n0 = s.out.length;
  s.h(pids[3], { t: 'ev.cheers' });
  assert.equal(s.out.length, n0, '8초 안에는 다시 안 됨');
  s.h(pids[1], { t: 'ev.cake', hero: pids[1] });
  assert.equal(e.s.ev.cake, null, '케이크는 방장만');
  s.h(pids[0], { t: 'ev.cake', hero: pids[1] });
  assert.equal(e.s.ev.cake.hero, pids[1]);
  assert.equal(e.cakeNeed(), 3);
  s.h(pids[1], { t: 'ev.blow' }); s.h(pids[1], { t: 'ev.blow' }); s.h(pids[2], { t: 'ev.blow' });
  assert.equal(e.s.ev.cake.lit, true);
  s.h(pids[3], { t: 'ev.blow' });
  assert.equal(e.s.ev.cake.lit, false);
  assert.equal(s.lastB('ev').k, 'cakeout');
  assert.match(s.lastB('ev').text, /사람1님, 생일 축하해요/);
  s.h(pids[4], { t: 'ev.photo' });
  const ph = s.lastB('ev');
  assert.equal(ph.k, 'photo');
  assert.equal(ph.at, s.now() + 3500);
  s.h(pids[4], { t: 'ev.photo' });
  assert.ok(s.lastTo(pids[4], 'notice'));
});

test('앉기, 이동 보정', () => {
  const s = setup({ n: 1 });
  const { e, pids } = s;
  s.move(pids[0], 6.5, 4.5);
  s.h(pids[0], { t: 'emote', e: 'sit' });
  const p = e.player(pids[0]);
  assert.equal(p.sit, true);
  assert.deepEqual([p.x, p.y], [6.5, 5.55]);
  // 막힌 칸(바 테이블)으로는 못 감
  s.move(pids[0], 10.5, 5.5);
  assert.notDeepEqual([p.x, p.y], [10.5, 5.5]);
  assert.equal(p.sit, false);
});

test('TV 모드는 정원에 안 들어가고 조작 불가', () => {
  const s = setup({ n: 2, capacity: 2 });
  const { e } = s;
  const tv = e.join('tvdev', { role: 'tv' }, s.now());
  assert.ok(tv.pid);
  assert.equal(e.countActive(), 2);
  s.h(tv.pid, { t: 'chat', text: '안녕' });
  assert.ok(!e.s.chat.some((c) => c.text === '안녕'));
  assert.equal(e.welcome(tv.pid, s.now()).you, tv.pid);
});

test('스퀘어: 방장·게임 없음', () => {
  const s = setup({ kind: 'square', n: 3 });
  const { e, pids } = s;
  assert.equal(e.s.hostPid, null);
  assert.equal(e.s.meta.capacity, 40);
  s.h(pids[0], { t: 'g.start', id: 'quiz' });
  assert.equal(e.g, null);
  s.h(pids[0], { t: 'ev.photo' });
  assert.equal(s.lastB('ev'), null);
  s.h(pids[1], { t: 'chat', text: '안녕하세요' });
  assert.equal(s.lastB('chat').m.text, '안녕하세요');
});

test('대화가 끊기면 MC가 화제를 던짐 (최대 3번)', () => {
  const s = setup({ n: 2 });
  const { e } = s;
  assert.ok(e.nextWake(s.now()) <= s.now() + IDLE_MC_MS);
  s.adv(IDLE_MC_MS + 1);
  assert.equal(s.lastB('mc') !== null, true);
  s.adv(IDLE_MC_MS + 1); s.adv(IDLE_MC_MS + 1); s.adv(IDLE_MC_MS + 1);
  assert.equal(s.out.filter((o) => o.msg.t === 'mc').length, 3);
  assert.equal(e.nextWake(s.now()), null);
});

test('승인된 추가 콘텐츠도 출제', () => {
  const s = setup({ n: 2 });
  const { e, pids } = s;
  e.h.extra = { quiz: Array.from({ length: 200 }, (_, i) => ({ t: '추가 문제 ' + i, o: ['a', 'b', 'c', 'd'], a: 0 })) };
  s.h(pids[0], { t: 'g.start', id: 'quiz' });
  const qs = e.g.d.qs.map((q) => q.t);
  assert.ok(qs.some((t) => t.startsWith('추가 문제')));
});

test('상태를 JSON으로 저장했다가 다시 불러와도 이어짐', () => {
  const s = setup({ n: 3 });
  const { e, pids } = s;
  s.h(pids[0], { t: 'g.start', id: 'balance', opts: { rounds: 3 } });
  s.gin(pids[0], { v: 'a' });
  const saved = JSON.parse(JSON.stringify(e.s));
  const e2 = new RoomEngine(saved, { ...e.h });
  e2.handle(pids[1], { t: 'g.in', gid: saved.game.gid, gs: saved.game.seq, v: 'b' }, s.now());
  e2.handle(pids[2], { t: 'g.in', gid: saved.game.gid, gs: saved.game.seq, v: 'b' }, s.now());
  assert.equal(e2.g.phase, 'reveal');
  assert.equal(e2.g.d.minority, 'a');
});

// ---------- 2단계: 꾸미기 · 펫 · 집들이 · 미니게임 대결 ----------
test('파티룸 꾸미기: 방장이 소품을 놓으면 지도가 바뀌고 막힌 칸에 있던 사람은 옮겨짐', () => {
  const T = setup({ n: 2 });
  const [h, g] = T.pids;
  T.move(g, 12.5, 4.5);
  T.h(g, { t: 'room.set', deco: [{ i: 'snowman', x: 12, y: 4 }] });
  assert.equal(T.e.s.meta.deco.length, 0, '방장만 바꿀 수 있음');
  T.h(h, { t: 'room.set', deco: [{ i: 'snowman', x: 12, y: 4 }, { i: 'balloons', x: 13, y: 5 }] });
  assert.equal(T.e.s.meta.deco.length, 2);
  assert.ok(T.e.map.props.some((p) => p.item === 'snowman'));
  const pg = T.e.player(g);
  assert.ok(!(Math.floor(pg.x) === 12 && Math.floor(pg.y) === 4), '눈사람 자리에서 비켜남');
  const room = T.lastB('room').room;
  assert.equal(room.deco.length, 2);
  // 규칙에 안 맞으면 알려 주고 그대로
  T.h(h, { t: 'room.set', deco: [{ i: 'snowman', x: 3, y: 2 }] });
  assert.equal(T.e.s.meta.deco.length, 2);
  assert.ok(T.lastTo(h, 'notice'));
});

test('펫: 들어올 때와 hello로 펫 정보가 퍼지고, 이상한 값은 버림', () => {
  const T = setup({ n: 1 });
  const pid = T.e.join('devP', { nick: '펫주인', pet: { kind: 'cat', color: 9, name: '나비', lv: 99, acc: { head: 'p_crown', neck: 'nope' } } }, T.now()).pid;
  const p = T.e.pubPlayer(T.e.player(pid));
  assert.deepEqual(p.pet, { kind: 'cat', color: 3, name: '나비', lv: 30, acc: { head: 'p_crown' } });
  T.h(pid, { t: 'hello', nick: '펫주인', look: {}, pet: null });
  assert.equal(T.lastB('player').p.pet, null);
  T.e.rate.delete(pid);
  T.h(pid, { t: 'hello', nick: '펫주인', look: {}, pet: { kind: 'alien' } });
  assert.equal(T.e.player(pid).pet, null);
});

test('집들이 방: 집 배치로 지도를 만들고 이름은 주인 이름으로', () => {
  const meta = makeMeta({ code: 'HOME01', kind: 'home', owner: '민지', home: { wall: 'w_mint', floor: 'f_walnut', items: [{ i: 'sofa_two', x: 2, y: 2 }, { i: 'arcade', x: 0, y: 6 }, { i: 'bed_single', x: 7, y: 6 }] } });
  assert.equal(meta.name, '민지네 집');
  assert.equal(meta.home.items.length, 0, '현관을 막는 배치는 통째로 버림');
  const ok = makeMeta({ code: 'HOME02', kind: 'home', owner: '민지', home: { wall: 'w_mint', items: [{ i: 'sofa_two', x: 2, y: 2 }, { i: 'arcade', x: 0, y: 6 }] } });
  assert.equal(ok.home.items.length, 2);
  assert.equal(ok.home.floor, 'f_oak');
  const e = RoomEngine.create(ok, {}, 1);
  assert.equal(e.map.id, 'home');
  assert.equal(e.map.seats.length, 2);
  const pid = e.join('d1', { nick: '손님' }, 2).pid;
  e.handle(pid, { t: 'pos', x: 2.6, y: 2.6, tx: 2.6, ty: 2.6 }, 3);
  e.handle(pid, { t: 'emote', e: 'sit' }, 4);
  assert.ok(e.player(pid).sit);
});

test('미니게임 대결: 준비 → 시작 → 모두 점수를 내면 결과, 점수 상한', () => {
  const T = setup({ n: 3 });
  const [h, a, b] = T.pids;
  T.h(h, { t: 'g.start', id: 'arcade', opts: { game: 'balloon' } });
  let g = T.g();
  assert.equal(g.phase, 'ready'); assert.equal(g.game, 'balloon'); assert.ok(g.seed > 0);
  T.gin(a, { score: 300 });
  assert.equal(T.e.g.ans[a], undefined, '준비 중에는 점수를 안 받음');
  T.adv(6100);
  g = T.g();
  assert.equal(g.phase, 'play');
  T.gin(a, { score: 500 });
  T.gin(b, { score: 999999 });
  assert.deepEqual(T.g().done.sort(), [a, b].sort());
  T.gin(h, { score: 100 });
  g = T.g();
  assert.equal(g.phase, 'end');
  assert.equal(g.result.rank[0].pid, b);
  assert.equal(g.result.rank[0].pts, 2400);
});

test('미니게임 대결: 시간이 지나면 낸 사람끼리 결과', () => {
  const T = setup({ n: 2 });
  const [h, a] = T.pids;
  T.h(h, { t: 'g.start', id: 'arcade', opts: { game: 'memory' } });
  T.h(h, { t: 'g.next' });
  assert.equal(T.g().phase, 'play');
  T.gin(a, { score: 640 });
  T.adv(71_000);
  assert.equal(T.g().phase, 'end');
});
