// 체험 모드: 서버 없이 브라우저 안에서 같은 엔진을 돌리고, 가상의 친구(봇)들이 함께 놉니다.
// 첫 화면의 움직이는 미리보기, 서버에 연결하지 못했을 때의 체험판에 씁니다.
import { RoomEngine, makeMeta, GAMES } from '../shared/engine.js';
import { DRAWS } from '../shared/content.js';
import { randomLook } from './avatar.js';
import { findPath } from './iso.js';
import { walkable, buildMap } from '../shared/maps.js';
import { ARCADE } from '../shared/arcade-meta.js';
import { PETS } from '../shared/catalog.js';

const PET_NAMES = ['몽이', '보리', '콩이', '나비', '두부', '호두', '망고', '라떼'];
function randomPet() {
  const kinds = Object.keys(PETS); const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const acc = Math.random() < 0.5 ? { head: ['p_ribbon', 'p_party_hat', 'p_flower', 'p_crown'][Math.floor(Math.random() * 4)] } : {};
  return { kind, color: Math.floor(Math.random() * PETS[kind].colors.length), name: PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)], lv: 1 + Math.floor(Math.random() * 6), acc };
}

const BOT_NAMES = ['지민', '하늘', '도윤', '서연', '민준', '유나', '태오', '수아'];
const IDLE_LINES = ['오늘 분위기 좋다 ㅋㅋ', '다음 게임 뭐 할까?', '배고프다 🍕', '음악 좋다~', 'ㅋㅋㅋㅋㅋ', '사진 한 장 찍자!', '생각보다 재밌는데?', '케이크 언제 나와요?', '건배 한 번 해요!', '여기 루프탑 테마도 예쁘더라'];
const HINTS = ['음… 자주 보는 거?', '좋아하는 사람 많을 듯', '이건 쉬운데?', '나 이거 좋아해', '어릴 때 많이 봤어', '생각보다 크다', '여름에 생각남', '둘이 같이 가면 좋음'];
const TRUTH_ANSWERS = ['솔직히 라면이요 ㅋㅋ', '어제 본 강아지 영상!', '제주도 가고 싶어요', '아침에 커피 두 잔…', '혼자 노래방 가기', '다들 비밀이에요 🤫', '요즘 러닝 시작했어요'];
const BALANCE_TALK = ['이건 무조건 A지', '고민되네…', '와 이거 어렵다', '난 B! 이유는 비밀'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class DemoNet {
  constructor(opts) {
    Object.assign(this, { bots: 4, chatty: false, room: {}, code: 'DEMO01' }, opts);
    this.queue = [];
    this.botState = new Map();
    this.offset = 0;
  }

  connect() {
    const now = Date.now();
    const r = this.room;
    const spectator = this.role === 'spectator' || this.role === 'tv';
    const meta = makeMeta({
      code: this.code, kind: r.kind || 'party', name: r.name || '쏘플 체험 파티룸', theme: r.theme || 'home',
      capacity: 12, banner: r.banner ?? '', light: r.light || 'warm', isPublic: false, hostDev: spectator ? 'demo-bot-0' : this.dev,
      deco: r.deco, home: r.home, owner: r.owner,
    }, now);
    this.engine = RoomEngine.create(meta, {
      send: (pid, msg) => this.route(pid, msg),
      broadcast: (msg, except) => { if (except !== this.pid) this.push(msg); },
      onMc: (ctx, fb) => setTimeout(() => { this.engine.mcSay(fb); }, 700),
    }, now);
    this.map = buildMap(meta);
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < this.bots; i++) {
      const j = this.engine.join('demo-bot-' + i, { nick: names[i], look: randomLook(), pet: this.botPets && Math.random() < 0.6 ? randomPet() : null }, now);
      if (j.pid) {
        this.botState.set(j.pid, { pid: j.pid, nextMove: now + rnd(500, 3000), nextChat: now + rnd(this.chatty ? 2500 : 9000, this.chatty ? 9000 : 20000), nextEmote: now + rnd(4000, 12000), arriveAt: 0, target: null, done: new Set() });
        // 처음 자리는 방 안쪽으로 흩어지게
        const spot = this.randomSpot();
        this.engine.handle(j.pid, { t: 'pos', x: spot[0], y: spot[1], tx: spot[0], ty: spot[1] }, now);
      }
    }
    const me = this.engine.join(this.dev, { nick: this.nick, look: this.look, pet: this.pet, role: spectator ? 'tv' : 'player' }, now);
    this.pid = me.pid;
    this.state('open');
    this.push(this.engine.welcome(this.pid, now));
    if (!spectator) setTimeout(() => this.botSay(pick([...this.botState.keys()]), pick(['어서 와요! 👋', '반가워요!', '오 왔다 ㅋㅋ'])), 1800);
    this.timer = setInterval(() => this.tick(), 200);
  }

  state(s, info) { this.status = s; if (this.onState) this.onState(s, info); }
  now() { return Date.now(); }

  route(pid, msg) { if (pid === this.pid) this.push(msg); }
  push(msg) {
    this.queue.push(msg);
    if (this.queue.length === 1) Promise.resolve().then(() => { const q = this.queue; this.queue = []; for (const m of q) this.onMsg(m); });
  }

  send(m) {
    if (!this.engine) return false;
    this.engine.handle(this.pid, m, Date.now());
    if (m.t === 'room.set') this.map = this.engine.map || this.map;
    if (m.t === 'chat') this.replyTo(m.text);
    return true;
  }

  close() { clearInterval(this.timer); this.engine = null; }

  // ---------- 봇 ----------
  randomSpot(zone) {
    const map = this.map;
    for (let k = 0; k < 60; k++) {
      let x; let y;
      if (zone) { x = rnd(zone[0] + 0.2, zone[2] + 0.8); y = rnd(zone[1] + 0.2, zone[3] + 0.8); }
      else { x = rnd(1, map.w - 0.5); y = rnd(1, map.h - 0.5); }
      if (walkable(map, Math.floor(x), Math.floor(y))) return [+x.toFixed(2), +y.toFixed(2)];
    }
    return [map.spawn[0][0] + 0.5, map.spawn[0][1] + 0.5];
  }

  botMove(b, to, now) {
    const p = this.engine.player(b.pid);
    if (!p) return;
    const path = findPath(this.map, [p.x, p.y], to);
    if (!path.length) return;
    let len = 0; let cur = [p.x, p.y];
    for (const q of path) { len += Math.hypot(q[0] - cur[0], q[1] - cur[1]); cur = q; }
    const end = path[path.length - 1];
    this.engine.handle(b.pid, { t: 'pos', x: p.x, y: p.y, tx: end[0], ty: end[1] }, now);
    b.target = end; b.arriveAt = now + (len / 3.3) * 1000 + 150;
  }

  botSay(pid, text) { if (this.engine && pid) { this.engine.rate.delete(pid); this.engine.handle(pid, { t: 'chat', text }, Date.now()); } }

  replyTo(text) {
    const bots = [...this.botState.keys()];
    if (!bots.length || this.engine?.g) return;
    let reply = null;
    if (/안녕|하이|ㅎㅇ|반가/.test(text)) reply = pick(['안녕하세요! 👋', '하이하이~', '반가워요!']);
    else if (/게임|뭐 할|뭐할/.test(text)) reply = pick(['TV 앞에서 고르면 돼요!', '라이어게임 어때요?', 'OX퀴즈 해요!']);
    else if (/건배|짠/.test(text)) reply = '짠! 🥂';
    else if (Math.random() < 0.3) reply = pick(['ㅋㅋㅋㅋ', '오 인정', '그러니까요', '맞아요!']);
    if (reply) setTimeout(() => this.botSay(pick(bots), reply), rnd(900, 2200));
  }

  tick() {
    const e = this.engine;
    if (!e) return;
    const now = Date.now();
    e.tick(now);
    const g = e.g;
    for (const b of this.botState.values()) {
      const p = e.player(b.pid);
      if (!p) continue;
      if (b.target && now >= b.arriveAt) { this.engine.handle(b.pid, { t: 'pos', x: b.target[0], y: b.target[1], tx: b.target[0], ty: b.target[1] }, now); b.target = null; }
      // 케이크 촛불
      const cake = e.s.ev.cake;
      if (cake && cake.lit && !cake.blown.includes(b.pid)) {
        const key = 'cake' + cake.at;
        if (!b.done.has(key)) { b.done.add(key); setTimeout(() => this.engine && this.engine.handle(b.pid, { t: 'ev.blow' }, Date.now()), rnd(1200, 3500)); }
      }
      if (g) { this.botGame(b, g, now); continue; }
      if (b.target) continue;
      if (now > b.nextMove) { b.nextMove = now + rnd(4000, 11000); this.botMove(b, this.randomSpot(), now); }
      if (now > b.nextChat) { b.nextChat = now + rnd(this.chatty ? 7000 : 25000, this.chatty ? 16000 : 60000); this.botSay(b.pid, pick(IDLE_LINES)); }
      if (now > b.nextEmote) {
        b.nextEmote = now + rnd(8000, 20000);
        if (Math.random() < 0.5) this.engine.handle(b.pid, { t: 'emote', e: pick(['clap', 'dance', 'heart', 'wave', 'hand']) }, now);
        else this.engine.handle(b.pid, { t: 'react', e: pick(['😂', '👏', '🔥', '❤️', '🎉']) }, now);
      }
    }
  }

  later(b, key, ms, fn) {
    if (b.done.has(key)) return;
    b.done.add(key);
    const gid = this.engine?.g?.gid;
    setTimeout(() => { if (this.engine && this.engine.g && this.engine.g.gid === gid) fn(); }, ms);
  }

  botGame(b, g, now) {
    const e = this.engine;
    const k = (s) => `${g.gid}:${g.seq}:${s}`;
    const gin = (m) => { const gg = e.g; if (gg) e.handle(b.pid, { t: 'g.in', gid: gg.gid, gs: gg.seq, ...m }, Date.now()); };
    const inGame = g.players.some((q) => q.pid === b.pid);
    if (!inGame) return;
    switch (g.id) {
      case 'balance':
        if (g.phase === 'answer') this.later(b, k('a'), rnd(1500, 9000), () => { gin({ v: Math.random() < 0.5 ? 'a' : 'b' }); if (Math.random() < 0.15) this.botSay(b.pid, pick(BALANCE_TALK)); });
        break;
      case 'quiz':
        if (g.phase === 'answer') this.later(b, k('a'), rnd(2500, 11000), () => { const q = e.g?.d?.q; if (!q) return; gin({ v: Math.random() < 0.55 ? q.a : Math.floor(Math.random() * 4) }); });
        break;
      case 'liar': {
        const d = g.d;
        if (g.phase === 'card') this.later(b, k('ok'), rnd(1500, 4500), () => gin({ k: 'ok' }));
        if (g.phase === 'talk' && GAMES.liar.curTurn(e) === b.pid) this.later(b, k('talk' + d.turn), rnd(2000, 4500), () => this.botSay(b.pid, pick(HINTS)));
        if (g.phase === 'vote') this.later(b, k('v'), rnd(2500, 9000), () => {
          const others = d.order.filter((x) => x !== b.pid);
          const target = b.pid !== d.liar && Math.random() < 0.45 ? d.liar : pick(others);
          gin({ k: 'vote', v: target === b.pid ? others[0] : target });
        });
        if (g.phase === 'guess' && d.liar === b.pid) this.later(b, k('g'), rnd(3000, 7000), () => gin({ k: 'guess', v: pick(e.g.d.options) }));
        break;
      }
      case 'draw': {
        const cur = g.d.cur;
        if (!cur || g.phase !== 'draw') break;
        if (cur.drawer === b.pid) { this.later(b, k('draw'), 400, () => this.botDraw(b, g.gid, g.seq)); break; }
        this.later(b, k('guess1'), rnd(6000, 14000), () => this.botSay(b.pid, pick(DRAWS.filter((w) => w !== cur.word))));
        if (!b.done.has(`${g.gid}:${g.seq}:hit`) && Math.random() < 0.5) this.later(b, k('hit'), rnd(18000, 45000), () => { const c = e.g?.d?.cur; if (c && e.g.phase === 'draw') this.botSay(b.pid, c.word); });
        break;
      }
      case 'truth':
        if (g.d.cur === b.pid && g.phase === 'turn') this.later(b, k('ans'), rnd(2500, 5000), () => gin({ k: 'answer', text: pick(TRUTH_ANSWERS) }));
        if (g.d.cur === b.pid && g.phase === 'answered') this.later(b, k('done'), rnd(3500, 6000), () => gin({ k: 'done' }));
        break;
      case 'ox': {
        const map = this.map;
        if (g.phase === 'gather') this.later(b, k('go'), rnd(300, 2500), () => this.botMove(b, this.randomSpot(map.stage), Date.now()));
        if (g.phase === 'answer') this.later(b, k('pick'), rnd(1500, 6500), () => {
          const q = e.g?.d?.q; if (!q) return;
          const side = Math.random() < 0.7 ? q.a : (q.a === 'O' ? 'X' : 'O');
          this.botMove(b, this.randomSpot(side === 'O' ? map.oxO : map.oxX), Date.now());
        });
        break;
      }
      case 'arcade':
        if (g.phase === 'play') this.later(b, k('score'), rnd(14000, 30000), () => { const a = ARCADE[e.g?.d?.game]; if (a) gin({ score: Math.round(a.grade[0] * 0.6 + Math.random() * (a.grade[2] - a.grade[0] * 0.6)) }); });
        break;
      default: break;
    }
  }

  // 그리는 사람이 봇이면 간단한 낙서를 그림
  botDraw(b, gid, seq) {
    let n = 0;
    let x = rnd(300, 700); let y = rnd(300, 700); let a = Math.random() * 6;
    const color = Math.floor(Math.random() * 6);
    const iv = setInterval(() => {
      const e = this.engine;
      const g = e && e.g;
      if (!g || g.gid !== gid || g.phase !== 'draw' || n > 40) { clearInterval(iv); return; }
      const segs = [];
      for (let i = 0; i < 4; i++) {
        a += rnd(-0.7, 0.7);
        const nx = Math.min(950, Math.max(50, x + Math.cos(a) * 28)); const ny = Math.min(950, Math.max(50, y + Math.sin(a) * 28));
        segs.push([Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), color, 2]);
        x = nx; y = ny;
      }
      e.handle(b.pid, { t: 'g.in', gid: g.gid, gs: g.seq, k: 'stroke', s: segs }, Date.now());
      n++;
    }, 350);
  }
}
