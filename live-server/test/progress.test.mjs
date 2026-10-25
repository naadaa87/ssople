// 내 정보 규칙 (코인·출석·미션·펫·꾸미기·미니게임) 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, view, ctxOf, newProfile, sanitizeImport, petCard, LiveError } from '../../live/shared/progress.js';
import { checkLayout, buildMap } from '../../live/shared/maps.js';
import { START_HOME, START_INV, ITEMS } from '../../live/shared/catalog.js';
import { pickDaily, lvOf, xpFor } from '../../live/shared/missions.js';

const T0 = Date.parse('2026-10-25T03:00:00Z');   // 한국 시간 낮 12시
const day = (n) => T0 + n * 864e5;

test('새 프로필은 시작 코인과 기본 집을 가지고, 배치가 규칙에 맞음', () => {
  const p = newProfile(T0);
  assert.equal(p.coins, 300);
  assert.ok(!checkLayout('home', START_HOME.items, START_INV).error);
  const v = view(p, ctxOf(T0));
  assert.equal(v.lv, 1);
  assert.ok(v.canCheckin);
  assert.ok(v.daily.length >= 4 && v.daily[0].id === 'd_checkin');
  assert.equal(v.free.arcade, 0);
  const m = buildMap({ kind: 'home', home: p.home });
  assert.ok(m.props.some((x) => x.item === 'arcade' && x.actions[0] === 'arcade'));
});

test('출석은 하루 한 번, 연속이면 보상이 늘고 7일째 배지', () => {
  let p = newProfile(T0);
  let r = apply(p, 'checkin', {}, ctxOf(T0));
  assert.equal(r.gains.coins, 25 + 0);
  p = r.profile;
  assert.throws(() => apply(p, 'checkin', {}, ctxOf(T0 + 3600e3)), LiveError);
  for (let i = 1; i < 7; i++) p = apply(p, 'checkin', {}, ctxOf(day(i))).profile;
  assert.equal(p.att.streak, 7);
  assert.ok(p.badges.includes('streak7'));
  // 하루 빠지면 다시 1일
  p = apply(p, 'checkin', {}, ctxOf(day(9))).profile;
  assert.equal(p.att.streak, 1);
});

test('미션: 이벤트를 세고, 다 하면 받기, 두 번은 못 받음, 하루 한도', () => {
  const ctx = ctxOf(T0, true);
  let p = apply(newProfile(T0), 'checkin', {}, ctx).profile;
  p = apply(p, 'claim', { id: 'd_checkin' }, ctx).profile;
  assert.throws(() => apply(p, 'claim', { id: 'd_checkin' }, ctx), /이미/);
  const ids = pickDaily(ctx.today, true);
  assert.equal(ids[0], 'd_checkin');
  p = apply(p, 'events', { list: [{ k: 'chat', n: 999 }] }, ctx).profile;
  assert.equal(p.day.cnt.chat, 200);
  // 출석은 이벤트로 셀 수 없음
  p = apply(p, 'events', { list: [{ k: 'checkin', n: 5 }] }, ctx).profile;
  assert.equal(p.day.cnt.checkin, 1);
});

test('상점: 코인이 모자라면 못 사고, 레벨 제한, 벽지는 하나만', () => {
  const ctx = ctxOf(T0);
  let p = { ...newProfile(T0), coins: 1000 };
  assert.throws(() => apply(p, 'buy', { item: 'piano' }, ctx), /레벨 5/);
  let r = apply(p, 'buy', { item: 'balloons', n: 2 }, ctx);
  assert.equal(r.profile.coins, 1000 - 120);
  assert.equal(r.profile.inv.balloons, 4);
  r = apply(r.profile, 'buy', { item: 'food' }, ctx);
  assert.equal(r.profile.inv.food, 10);
  r = apply(r.profile, 'buy', { item: 'w_mint' }, ctx);
  assert.throws(() => apply(r.profile, 'buy', { item: 'w_mint' }, ctx), /이미/);
  assert.throws(() => apply({ ...r.profile, coins: 10 }, 'buy', { item: 'teddy' }, ctx), /모자라요/);
});

test('꾸미기: 가진 만큼만, 집과 파티룸에 같은 소품을 동시에 못 둠, 길 막기 금지', () => {
  const ctx = ctxOf(T0);
  let p = apply(newProfile(T0), 'buy', { item: 'teddy' }, ctx).profile;
  p = apply(p, 'room', { items: [{ i: 'teddy', x: 12, y: 4 }] }, ctx).profile;
  assert.equal(p.room.items.length, 1);
  assert.throws(() => apply(p, 'home', { items: [...p.home.items, { i: 'teddy', x: 5, y: 6 }] }, ctx), /모자라요/);
  assert.throws(() => apply(p, 'home', { items: [{ i: 'bed_single', x: 7, y: 6 }] }, ctx), /현관/);
  const g = apply(p, 'home', { items: p.home.items.filter((x) => x.i !== 'lamp') }, ctx);
  assert.equal(g.profile.home.items.length, START_HOME.items.length - 1);
  const more = apply(g.profile, 'home', { items: [...g.profile.home.items, { i: 'lamp', x: 3, y: 2 }] }, ctx);
  assert.equal(more.profile.day.cnt.place_item, 2);
  assert.throws(() => apply(p, 'home', { wall: 'w_brick' }, ctx), /벽지/);
});

test('펫: 첫 펫은 무료, 밥·쓰다듬기·놀기, 쿨타임, 레벨업, 두 번째부터 코인', () => {
  const ctx = ctxOf(T0);
  let r = apply(newProfile(T0), 'adopt', { kind: 'dog', color: 1, name: '콩이' }, ctx);
  let p = r.profile;
  assert.equal(p.pets.length, 1);
  assert.equal(p.petOn, 1);
  assert.ok(p.badges.includes('first_pet'));
  assert.deepEqual(petCard(p), { kind: 'dog', color: 1, name: '콩이', lv: 1, acc: {} });
  r = apply(p, 'pet', { id: 1, act: 'food' }, ctx);
  p = r.profile;
  assert.equal(p.inv.food, 4);
  assert.ok(p.pets[0].full > 95);
  assert.throws(() => apply(p, 'pet', { id: 1, act: 'food' }, ctx), /배가 불러서/);
  p = apply(p, 'pet', { id: 1, act: 'pat' }, ctx).profile;
  assert.throws(() => apply(p, 'pet', { id: 1, act: 'pat' }, ctxOf(T0 + 60e3)), /분 뒤에/);
  p = apply(p, 'pet', { id: 1, act: 'play' }, ctxOf(T0 + 60e3)).profile;
  assert.equal(p.day.cnt.pet_play, 2);
  // 시간이 지나면 배고파짐
  const v = view(p, ctxOf(T0 + 20 * 3600e3));
  assert.equal(v.pets[0].mood.k, 'hungry');
  // 레벨업
  for (let i = 1; i <= 8; i++) p = apply(p, 'pet', { id: 1, act: 'pat' }, ctxOf(T0 + i * 6 * 60e3)).profile;
  assert.ok(p.pets[0].lv >= 2);
  assert.throws(() => apply(p, 'adopt', { kind: 'cat', color: 0, name: '나비' }, ctx), /600/);
  p = apply({ ...p, coins: 900 }, 'adopt', { kind: 'cat', color: 0, name: '나비' }, ctx).profile;
  assert.equal(p.pets.length, 2);
  assert.equal(p.coins, 300);
  // 꾸미기는 가진 것만
  assert.throws(() => apply(p, 'petset', { id: 2, acc: { head: 'p_crown' } }, ctx), /아직 없어요/);
  p = apply(p, 'buy', { item: 'p_ribbon' }, ctx).profile;
  p = apply(p, 'petset', { id: 2, acc: { head: 'p_ribbon' }, on: true }, ctx).profile;
  assert.equal(p.petOn, 2);
  assert.equal(petCard(p).acc.head, 'p_ribbon');
});

test('미니게임: 말이 안 되는 점수는 거절, 하루 코인 한도, 최고 기록·등급·배지', () => {
  const ctx = ctxOf(T0);
  let p = newProfile(T0);
  assert.throws(() => apply(p, 'score', { game: 'balloon', score: 99999, ms: 30000 }, ctx), /확인하지/);
  assert.throws(() => apply(p, 'score', { game: 'balloon', score: 500, ms: 500 }, ctx), /확인하지/);
  let r = apply(p, 'score', { game: 'balloon', score: 1000, ms: 31000 }, ctx);
  assert.equal(r.gains.grade, 'S');
  assert.equal(r.gains.coins >= 25, true);
  assert.ok(r.profile.badges.includes('arcade_s'));
  p = r.profile;
  let total = 0;
  for (let i = 0; i < 20; i++) { r = apply(p, 'score', { game: 'memory', score: 800, ms: 20000 }, ctx); p = r.profile; total += r.gains.coins; }
  assert.equal(p.day.arcadeCoins, 200);
  assert.ok(r.gains.capped);
  for (const g of ['stack', 'rhythm', 'catch', 'reaction', 'numbers', 'whack']) p = apply(p, 'score', { game: g, score: 10, ms: 30000 }, ctx).profile;
  assert.ok(p.badges.includes('arcade_all'));
  assert.equal(p.best.balloon, 1000);
});

test('레벨: 경험치 공식과 레벨업 보상', () => {
  assert.equal(lvOf(0), 1); assert.equal(lvOf(99), 1); assert.equal(lvOf(100), 2); assert.equal(lvOf(299), 2); assert.equal(lvOf(300), 3);
  assert.equal(xpFor(5), 1000);
  const ctx = ctxOf(T0, true);
  let p = newProfile(T0);
  const r = apply(p, 'events', { list: [{ k: 'party_game', n: 6 }] }, ctx);
  assert.equal(r.gains.xp, 120);
  assert.equal(r.gains.lv, 2);
});

test('날짜가 바뀌면 일일 미션이 새로', () => {
  let p = apply(newProfile(T0), 'events', { list: [{ k: 'arcade_play', n: 3 }] }, ctxOf(T0)).profile;
  assert.equal(p.day.cnt.arcade_play, 3);
  const v = view(p, ctxOf(day(1)));
  assert.ok(v.daily.every((m) => m.cnt === 0));
});

test('손님 기록 옮기기: 너무 큰 값은 잘림', () => {
  const g = { coins: 99999, xp: 999999, inv: { piano: 50, w_brick: 3, nope: 3 }, pets: [{ kind: 'dog', name: '바둑이', lv: 50 }, { kind: 'alien' }], badges: ['lv5', 'fake'], best: { balloon: 99999, memory: 700 } };
  const p = sanitizeImport(g, ctxOf(T0));
  assert.equal(p.coins, 2000); assert.equal(p.xp, 3000);
  assert.equal(p.inv.piano, 6); assert.equal(p.inv.w_brick, 1); assert.equal(p.inv.nope, undefined);
  assert.equal(p.pets.length, 1); assert.equal(p.pets[0].lv, 10);
  assert.deepEqual(p.badges, ['lv5']);
  assert.equal(p.best.balloon, undefined); assert.equal(p.best.memory, 700);
  assert.equal(p.inv.arcade, 1);
});

test('모든 아이템은 이름·가격·분류가 있음', () => {
  for (const [id, it] of Object.entries(ITEMS)) {
    assert.ok(it.name && Number.isInteger(it.price) && it.cat, id);
    if (['furn', 'deco', 'wall'].includes(it.cat)) assert.ok(it.where && it.place && it.w && it.h, id);
  }
});
