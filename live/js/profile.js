// 내 정보 저장소 — 로그인한 회원은 홈페이지 서버에, 손님은 이 브라우저에 저장해요.
// 규칙(코인·미션·펫)은 shared/progress.js 하나로 서버와 화면이 똑같이 계산해요.
import { apply, view, normalize, ctxOf, petCard, newProfile, LiveError } from '../shared/progress.js';
import * as store from './store.js';

const API = '/api/live';
const listeners = new Set();

async function call(path, body) {
  const opt = body === undefined ? { cache: 'no-store', credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-sp': '1' }, body: JSON.stringify(body) };
  const res = await fetch(API + path, opt);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) { const e = new LiveError(j.error || '잠시 후 다시 시도해 주세요.'); e.status = res.status; e.data = j; throw e; }
  return j;
}

export const P = {
  ready: false,
  online: false,      // 홈페이지 서버와 연결됨 (로그인 여부와 별개)
  user: null,         // 로그인한 회원 { nick }
  profile: null,
  social: false,      // 실시간 서버가 있으면 같이 하는 미션도 나와요
  queue: {},
  timer: null,

  async init({ social = false, offline = false } = {}) {
    this.social = !!social;
    const guest = store.load('guest', null);
    if (!offline) {
      try {
        const j = await call('/me');
        this.online = true;
        this.user = j.user || null;
        if (this.user) {
          this.profile = j.profile;
          // 손님으로 놀던 기록이 있고 계정이 새로 생겼으면 옮겨 와요
          if (j.fresh && guest && worth(guest)) {
            try { const k = await call('/import', { guest }); this.profile = k.profile; this.imported = true; store.save('guest.bak', guest); store.save('guest', null); } catch { /* 옮기지 못해도 계속 */ }
          }
        }
      } catch { this.online = false; }
    }
    if (!this.user) this.profile = normalize(guest || newProfile(), this.ctx());
    this.ready = true;
    this.emit();
    window.addEventListener('pagehide', () => this.flush(true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(true); });
    return this;
  },

  ctx() { return ctxOf(Date.now(), this.social); },
  view() { return view(this.profile, this.ctx()); },
  petCard() { return petCard(this.profile); },
  isMember() { return !!this.user; },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(g) { for (const fn of listeners) { try { fn(this, g); } catch (e) { console.error(e); } } },

  saveGuest() { if (!this.user) store.save('guest', this.profile); },

  /** 동작 하나 — 실패하면 이유를 담은 오류를 던져요 */
  async act(op, args = {}) {
    if (op !== 'events') await this.flush();
    if (this.user) {
      const j = await call('/do', { op, args });
      this.profile = j.profile;
      this.emit(j.gains);
      return j.gains || {};
    }
    const r = apply(this.profile, op, args, this.ctx());
    this.profile = r.profile;
    this.saveGuest();
    this.emit(r.gains);
    return r.gains;
  },

  /** 게임 안에서 일어난 일 (모아서 몇 초마다 보내요) */
  event(k, n = 1) {
    if (!this.ready) return;
    // 화면에는 바로 반영
    try {
      const r = apply(this.profile, 'events', { list: [{ k, n }] }, this.ctx());
      const before = this.view().claimable;
      this.profile = r.profile;
      if (!this.user) this.saveGuest();
      const after = this.view().claimable;
      this.emit({ ...r.gains, newClaim: after > before });
    } catch { /* 무시 */ }
    if (!this.user) return;
    this.queue[k] = (this.queue[k] || 0) + n;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 2500);
  },

  async flush(beacon) {
    clearTimeout(this.timer);
    const list = Object.entries(this.queue).map(([k, n]) => ({ k, n }));
    if (!list.length || !this.user) return;
    this.queue = {};
    if (beacon) {
      try { fetch(API + '/do', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-sp': '1' }, body: JSON.stringify({ op: 'events', args: { list } }) }); } catch { /* 무시 */ }
      return;
    }
    try { const j = await call('/do', { op: 'events', args: { list } }); this.profile = j.profile; this.emit(); } catch { /* 다음에 다시 */ }
  },

  async rank(game, period = 'day') { return call(`/rank?game=${encodeURIComponent(game)}&period=${period}`); },
};

function worth(g) {
  return (g.earned || 0) > 0 || (g.pets && g.pets.length) || (g.xp || 0) > 0;
}

/** 얻은 것을 짧은 문장으로 */
export function gainText(g) {
  if (!g) return '';
  const bits = [];
  if (g.coins) bits.push(`코인 +${g.coins}`);
  if (g.xp) bits.push(`경험치 +${g.xp}`);
  return bits.join(' · ');
}
