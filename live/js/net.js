// 실시간 연결: 끊기면 다시 붙고, 서버 시계와 맞춥니다.
const FINAL = new Set(['denied', 'kicked', 'replaced', 'closed']);

export class Net {
  constructor({ server, code, dev, nick, look, pet, role, onMsg, onState }) {
    Object.assign(this, { server, code, dev, nick, look, pet, role, onMsg, onState });
    this.offset = 0;
    this.tries = 0;
    this.final = null;
    this.closedByMe = false;
    this.onVisible = () => { if (document.visibilityState === 'visible' && !this.final && !this.closedByMe && (!this.ws || this.ws.readyState > 1)) { clearTimeout(this.timer); this.connect(); } };
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
  }

  // 실시간 서버는 홈페이지와 다른 주소에 있어요 (server). 없으면 지금 주소.
  url() {
    const base = new URL(this.server || location.origin);
    const proto = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const q = new URLSearchParams({ dev: this.dev, nick: this.nick || '', look: JSON.stringify(this.look || {}) });
    if (this.pet) q.set('pet', JSON.stringify(this.pet));
    if (this.role) q.set('role', this.role);
    return `${proto}//${base.host}/ws/${this.code}?${q}`;
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    this.state('connecting');
    let ws;
    try { ws = new WebSocket(this.url()); } catch { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      this.state('open');
      clearInterval(this.keep);
      this.keep = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 25_000);
      this.clockTimer = setTimeout(() => this.syncClock(), 1500);
    };
    ws.onmessage = (ev) => {
      if (ev.data === 'pong') return;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') this.offset = m.now - Date.now();
      if (m.t === 'pong' && m.c) { const rtt = Date.now() - m.c; if (rtt < 3000) this.offset = m.now + rtt / 2 - Date.now(); }
      if (FINAL.has(m.t)) this.final = m;
      this.onMsg(m);
      if (FINAL.has(m.t)) { try { ws.close(); } catch { /* 이미 닫힘 */ } }
    };
    ws.onclose = (ev) => {
      clearInterval(this.keep);
      clearTimeout(this.clockTimer);
      if (this.ws !== ws) return;
      if (this.closedByMe) return;
      if (this.final || (ev.code >= 4000 && ev.code < 5000)) { this.state('closed', this.final || { t: 'closed', code: ev.code }); return; }
      this.retry();
    };
    ws.onerror = () => { /* onclose에서 처리 */ };
  }

  retry() {
    this.tries += 1;
    const delay = Math.min(10_000, 700 * 2 ** Math.min(4, this.tries - 1));
    this.state('reconnecting', { delay, tries: this.tries });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  state(s, info) { this.status = s; if (this.onState) this.onState(s, info); }
  send(m) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(m)); return true; } return false; }
  syncClock() { this.send({ t: 'ping', c: Date.now() }); }
  now() { return Date.now() + this.offset; }

  close() {
    this.closedByMe = true;
    clearTimeout(this.timer); clearInterval(this.keep); clearTimeout(this.clockTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    try { this.ws && this.ws.close(1000, 'bye'); } catch { /* 무시 */ }
  }
}
