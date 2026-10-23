/* =====================================================================
   쏘플파티룸 — 모든 화면이 함께 쓰는 스크립트
   API 호출 · 로그인 상태 · 머리글/바닥글 · 낮/밤 표시 · 카드 그리기
   ===================================================================== */
(function () {
  'use strict';
  const SP = (window.SP = window.SP || {});

  /* ---------------- 작은 도구 ---------------- */
  SP.$ = (s, r = document) => r.querySelector(s);
  SP.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  SP.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  SP.icon = (n, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  SP.fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  SP.won = (n) => {
    if (n == null || n === '') return '';
    n = Number(n);
    if (n >= 10000) { const m = n / 10000; return (Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, '')) + '만원'; }
    return SP.fmt(n) + '원';
  };
  SP.qs = () => Object.fromEntries(new URLSearchParams(location.search));
  SP.setQs = (obj, replace = true) => {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null && v !== false) p.set(k, v); });
    const u = location.pathname + (p.toString() ? '?' + p : '') + location.hash;
    history[replace ? 'replaceState' : 'pushState'](null, '', u);
  };
  SP.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  SP.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
  };
  const sget = (k) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const sset = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

  /* ---------------- 날짜 (한국 시간) ---------------- */
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  SP.today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  /** 노출 존(프리미엄/플러스) — 노출 끝 날짜가 지났으면 빈 값 */
  SP.zoneOf = (s) => { const l = (s && s.listing) || {}; if (!l.zone) return ''; if (l.until && l.until < SP.today()) return ''; return l.zone === 'premium' || l.zone === 'plus' ? l.zone : ''; };
  SP.zoneRank = (s) => { const z = SP.zoneOf(s); return z === 'premium' ? 0 : z === 'plus' ? 1 : 2; };
  SP.addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  SP.dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  SP.wdi = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();
  SP.wd = (ymd) => WD[SP.wdi(ymd)];
  SP.isWeekend = (ymd) => { const w = SP.wdi(ymd); return w === 0 || w === 6; };
  SP.md = (ymd) => (ymd ? `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일` : '');
  SP.mdw = (ymd) => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))} (${SP.wd(ymd)})` : '');
  SP.mdwLong = (ymd) => (ymd ? `${SP.md(ymd)} ${SP.wd(ymd)}요일` : '');
  SP.dayWord = (ymd) => { const d = SP.dayDiff(SP.today(), ymd); return d === 0 ? '오늘' : d === 1 ? '내일' : d === 2 ? '모레' : SP.mdw(ymd); };
  SP.priceIdx = (ymd) => { const w = SP.wdi(ymd); return w === 5 ? 1 : w === 6 ? 2 : w === 0 ? 3 : 0; };
  SP.ago = (iso) => {
    if (!iso) return '';
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
    const k = new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
    return k.slice(0, 4) === SP.today().slice(0, 4) ? SP.md(k) : k.replace(/-/g, '.');
  };
  SP.hm = (t) => (t ? t.replace(/^0/, '') : '');

  /* ---------------- 서버 호출 ---------------- */
  SP.api = async (path, opt = {}) => {
    const init = { method: opt.method || 'GET', headers: { 'x-sp': '1', ...(opt.headers || {}) }, credentials: 'same-origin' };
    if (opt.body !== undefined) {
      if (opt.body instanceof Blob || opt.body instanceof ArrayBuffer) init.body = opt.body;
      else { init.body = JSON.stringify(opt.body); init.headers['content-type'] = 'application/json'; }
    }
    let res;
    try { res = await fetch(path, init); } catch (e) { throw new Error('인터넷 연결을 확인해 주세요.'); }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data || data.ok === false) {
      const err = new Error((data && data.error) || `요청을 처리하지 못했어요. (${res.status})`);
      err.status = res.status;
      err.data = data;
      if (data && data.needLogin && opt.loginRedirect !== false) {
        SP.toast('로그인이 필요해요.');
        setTimeout(() => SP.goLogin(), 500);
      }
      throw err;
    }
    return data;
  };
  SP.get = (p) => SP.api(p);
  SP.post = (p, body) => SP.api(p, { method: 'POST', body: body || {} });
  SP.put = (p, body) => SP.api(p, { method: 'PUT', body: body || {} });
  SP.patch = (p, body) => SP.api(p, { method: 'PATCH', body: body || {} });
  SP.del = (p) => SP.api(p, { method: 'DELETE' });

  let siteP = null, meP = null, spacesP = null;
  SP.site = () => {
    if (!siteP) {
      const c = sget('sp.site');
      siteP = c && Date.now() - c.t < 300000 ? Promise.resolve(c.v)
        : SP.get('/api/site').then((v) => { sset('sp.site', { t: Date.now(), v }); return v; }).catch(() => ({ settings: {}, spaces: 45, regions: {} }));
    }
    return siteP;
  };
  SP.me = (fresh) => {
    if (!meP || fresh) meP = SP.get('/api/me').catch(() => ({ user: null }));
    return meP;
  };
  SP.spaces = () => {
    if (!spacesP) {
      const c = sget('sp.spaces');
      spacesP = c && Date.now() - c.t < 300000 ? Promise.resolve(c.v)
        : SP.get('/api/spaces').then((d) => { sset('sp.spaces', { t: Date.now(), v: d.spaces }); return d.spaces; });
    }
    return spacesP;
  };
  SP.avail = (from, days, codes, detail) => {
    const q = new URLSearchParams({ from, days: String(days) });
    if (codes && codes.length) q.set('code', codes.join(','));
    if (detail) q.set('detail', '1');
    return SP.get('/api/avail?' + q).catch(() => ({ show: false }));
  };
  SP.goLogin = () => { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); };
  SP.needLogin = async (msg) => {
    const m = await SP.me();
    if (m.user) return m.user;
    SP.toast(msg || '로그인하고 이용해 주세요.');
    setTimeout(SP.goLogin, 600);
    return null;
  };

  /* ---------------- 알림창 · 모달 ---------------- */
  SP.toast = (msg, bad) => {
    let w = SP.$('.toast-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; w.setAttribute('role', 'status'); document.body.appendChild(w); }
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    w.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  };
  SP.fail = (e) => SP.toast((e && e.message) || '문제가 생겼어요.', true);

  SP.modal = ({ title, body, wide, foot, onOpen, onClose }) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${SP.esc(title || '')}">
      <div class="modal-hd"><h2>${SP.esc(title || '')}</h2><button class="ibtn" data-x aria-label="닫기">${SP.icon('x')}</button></div>
      <div class="modal-body">${body || ''}</div>${foot ? `<div class="modal-ft">${foot}</div>` : ''}</div>`;
    const prevFocus = document.activeElement;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; if (onClose) onClose(); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
    const first = bg.querySelector('input, select, textarea, button:not([data-x])');
    if (first) setTimeout(() => first.focus(), 30);
    const api = { el: bg, close, $: (s) => bg.querySelector(s), $$: (s) => Array.from(bg.querySelectorAll(s)) };
    if (onOpen) onOpen(api);
    return api;
  };
  SP.confirm = (msg, { ok = '확인', danger } = {}) => new Promise((resolve) => {
    let done = false;
    const m = SP.modal({
      title: '확인해 주세요', body: `<p style="font-size:16px;line-height:1.6">${SP.esc(msg)}</p>`,
      foot: `<button class="btn btn-soft" data-no>취소</button><button class="btn ${danger ? 'btn-red' : 'btn-ink'}" data-yes>${SP.esc(ok)}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.$('[data-no]').onclick = () => { done = true; resolve(false); m.close(); };
    m.$('[data-yes]').onclick = () => { done = true; resolve(true); m.close(); };
  });
  SP.lightbox = (urls, i = 0) => {
    const n = urls.length;
    if (!n) return;
    const bg = document.createElement('div');
    bg.className = 'lightbox';
    bg.setAttribute('role', 'dialog');
    bg.setAttribute('aria-modal', 'true');
    bg.setAttribute('aria-label', '사진 크게 보기');
    bg.innerHTML = `<img alt="">${n > 1 ? '<span class="lb-count" aria-live="polite"></span>' : ''}<button style="top:12px;right:12px" data-x aria-label="닫기">${SP.icon('x', 'lg')}</button>${n > 1 ? `<button style="left:8px;top:50%" data-p aria-label="이전 사진">${SP.icon('chev-l', 'lg')}</button><button style="right:8px;top:50%" data-n aria-label="다음 사진">${SP.icon('chev-r', 'lg')}</button>` : ''}`;
    const img = bg.querySelector('img');
    const cnt = bg.querySelector('.lb-count');
    const draw = () => {
      img.src = urls[i];
      if (cnt) cnt.textContent = `${i + 1} / ${n}`;
      if (n > 1) [1, -1].forEach((d) => { const im = new Image(); im.src = urls[(i + d + n) % n]; });   // 옆 사진 미리 받기
    };
    const go = (d) => { if (n < 2) return; i = (i + d + n) % n; draw(); };
    const prevOv = document.documentElement.style.overflow;
    const close = () => { bg.remove(); document.removeEventListener('keydown', k); document.documentElement.style.overflow = prevOv; };
    bg.addEventListener('click', (e) => {
      if (e.target.closest('[data-p]')) { go(-1); return; }
      if (e.target.closest('[data-n]')) { go(1); return; }
      if (e.target === bg || e.target.closest('[data-x]')) close();
    });
    // 휴대폰에서 옆으로 밀어 넘기기
    let x0 = null, y0 = 0;
    bg.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive: true });
    bg.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
    }, { passive: true });
    const k = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', k);
    document.documentElement.style.overflow = 'hidden';
    draw();
    document.body.appendChild(bg);
    bg.querySelector('[data-x]').focus({ preventScroll: true });
  };
  SP.busy = (btn, on, label) => {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; if (label) btn.textContent = label; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  };

  /* ---------------- 공유 · 복사 ---------------- */
  SP.copy = async (text, msg = '복사했어요.') => {
    try { await navigator.clipboard.writeText(text); SP.toast(msg); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); SP.toast(msg); } catch { SP.toast('복사하지 못했어요. 길게 눌러 직접 복사해 주세요.', true); }
      ta.remove();
    }
  };
  SP.share = async ({ title, text, url }) => {
    url = url || location.href;
    if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    SP.copy(url, '링크를 복사했어요. 카톡에 붙여넣어 보내 보세요.');
  };

  /* ---------------- 네이버 예약 연결 ---------------- */
  SP.naverHref = (url, date) => {
    if (!url) return '';
    try {
      const u = new URL(url);
      if (/booking\.naver\.com/.test(u.host)) {
        // 네이버 예약 주소 형식 그대로(2026-10-11T00:00:00+09:00). 날짜를 안 골랐으면 지난 날짜를 지워 오늘부터 보이게 한다
        if (date) u.searchParams.set('startDateTime', `${date}T00:00:00+09:00`);
        else u.searchParams.delete('startDateTime');
      }
      return u.toString();
    } catch { return url; }
  };
  SP.track = (code, kind, pkg, d) => {
    const body = JSON.stringify({ code, kind, pkg: pkg || null, d: d || null });
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/click', new Blob([body], { type: 'text/plain' }))) return; } catch { /* 무시 */ }
    fetch('/api/click', { method: 'POST', body, keepalive: true }).catch(() => {});
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-track]');
    if (!a) return;
    const [code, kind, pkg, d] = a.dataset.track.split('|');
    SP.track(code, kind, pkg, d);
  });

  /* ---------------- 낮/밤 표시 ---------------- */
  const SLABEL = { o: '예약 가능', b: '마감', c: '지난 시간', '-': '운영 안 함' };
  SP.dn = (d, n, { live = true, lg = false, title } = {}) => {
    d = d || '-'; n = n || '-';
    const lbl = title || `낮 ${live || d !== 'o' ? SLABEL[d] : '확인 필요'}, 밤 ${live || n !== 'o' ? SLABEL[n] : '확인 필요'}`;
    return `<span class="dn${lg ? ' lg' : ''}${live ? '' : ' unknown'}" role="img" aria-label="${SP.esc(lbl)}" title="${SP.esc(lbl)}"><i class="d" data-s="${d}">${SP.icon('sun')}</i><i class="n" data-s="${n}">${SP.icon('moon')}</i></span>`;
  };
  SP.strip = (code, from, live, days = 7) => {
    if (!code) return '';
    let h = '<div class="dn-strip" aria-label="날짜별 낮·밤 예약 현황">';
    for (let i = 0; i < Math.min(days, code.length / 2); i++) {
      const d = SP.addDays(from, i);
      const we = SP.isWeekend(d);
      h += `<div class="cell"><b class="${we ? 'we' : ''}">${i === 0 && d === SP.today() ? '오늘' : SP.wd(d)}</b>${SP.dn(code[i * 2], code[i * 2 + 1], { live, title: `${SP.mdw(d)} 낮 ${SLABEL[code[i * 2]]}, 밤 ${SLABEL[code[i * 2 + 1]]}` })}</div>`;
    }
    return h + '</div>';
  };
  SP.legend = (live) => `<div class="legend"><span><i class="lg-d"></i>낮 ${live ? '예약 가능' : ''}</span><span><i class="lg-n"></i>밤 ${live ? '예약 가능' : ''}</span><span><i class="lg-b"></i>마감</span><span><i class="lg-c"></i>지난 시간</span></div>`;

  /* ---------------- 지점 표지 · 카드 ---------------- */
  /* 사진이 없는 지점의 표지 — 시설에 맞는 분위기 사진 위에 동네 이름 (실제 사진이 아니라는 표시를 같이 둔다) */
  const MOOD = ['orange-room', 'moroccan', 'welcome', 'party-table', 'birthday-2', 'yearend', 'bridal-2', 'entrance'];
  SP.moodPhoto = (s) => {
    const f = s.feat || {};
    let h = 0; for (const ch of String(s.code || '')) h = (h * 31 + ch.charCodeAt(0)) % 9973;
    let pool = MOOD;
    if (f.bbq && f.bbq.on || (f.zones || []).some((z) => /루프탑|테라스/.test(z))) pool = ['terrace-night', 'rooftop', 'yearend', 'party-table', 'orange-room'];
    else if (f.karaoke && f.karaoke.on && (f.console || (f.games || []).length > 6)) pool = ['game-lounge', 'neon-night', 'game-lounge-2', 'birthday-2'];
    else if (f.karaoke && f.karaoke.on) pool = ['neon-night', 'birthday-2', 'orange-room', 'moroccan'];
    else if (f.projector && (s.max || 0) >= 16) pool = ['theater', 'workshop', 'meeting', 'yearend'];
    return pool[h % pool.length];
  };
  const MEET_MOOD = { 보드게임: 'game-lounge-2', '와인·술': 'party-table', '영화·드라마': 'theater', '파티·네트워킹': 'birthday-2', '운동·러닝': 'rooftop', '노래·음악': 'neon-night', 게임: 'game-lounge', '스터디·자기계발': 'workshop', '맛집·요리': 'cups', 동네친구: 'welcome', '공간 아카데미': 'design-meeting' };
  SP.cover = (s, alt) => {
    if (s.photos && s.photos[0]) return `<img src="${SP.esc(s.photos[0])}" alt="${SP.esc(alt || s.name)}" loading="lazy">`;
    return `<div class="cover-art" aria-hidden="true" style="--ca:url('/assets/img/photo/${SP.moodPhoto(s)}-s.webp')"><span class="ca-note">실제 사진 준비 중</span><span class="ca-seal"></span><span class="ca-area">${SP.esc(s.area)}</span></div>`;
  };
  SP.minPrice = (s) => {
    let m = null;
    (s.pkgs || []).forEach((p) => (p.p || []).forEach((x) => { if (x && (m == null || x < m)) m = x; }));
    return m;
  };
  SP.priceOn = (s, date) => {
    const i = SP.priceIdx(date);
    let m = null;
    (s.pkgs || []).forEach((p) => { const x = (p.p || [])[i]; if (x && (m == null || x < m)) m = x; });
    return m;
  };
  SP.featTags = (s, max = 4) => {
    const t = [];
    const f = s.feat || {};
    if (f.karaoke && f.karaoke.on) t.push(['mic', '노래방']);
    if (f.bbq && f.bbq.on) t.push(['flame', '바베큐']);
    if (f.pet && f.pet.on) t.push(['paw', '애견 동반']);
    if ((f.zones || []).includes('루프탑')) t.push(['umbrella', '루프탑']);
    else if ((f.zones || []).includes('테라스')) t.push(['umbrella', '테라스']);
    if (f.projector) t.push(['projector', '빔프로젝터']);
    if (f.console) t.push(['game', '게임기']);
    return t.slice(0, max).map(([i, l]) => `<span class="tag">${SP.icon(i)}${l}</span>`).join('');
  };
  SP.roomCard = (s, opt = {}) => {
    const href = '/room/' + s.code + (opt.date ? '?date=' + opt.date : '');
    const price = opt.date ? SP.priceOn(s, opt.date) : SP.minPrice(s);
    const rv = s.reviews && s.reviews.n ? `<span>${SP.icon('star-f', 'sm')} ${s.reviews.avg} (${s.reviews.n})</span>` : '';
    let badge = '';
    if (opt.dayState) {
      const [d, n] = opt.dayState;
      if (d === 'o' || n === 'o') badge = `<div class="room-badge">${d === 'o' && opt.live ? '<span class="badge sun">낮 비어 있음</span>' : ''}${n === 'o' && opt.live ? '<span class="badge moon">밤 비어 있음</span>' : ''}</div>`;
      else if (d === 'b' || n === 'b') badge = '<div class="room-badge"><span class="badge mute">이날 마감</span></div>';
    }
    const l = s.listing || {};
    const z = SP.zoneOf(s);
    const zone = z === 'premium' ? '<span class="badge red">프리미엄</span>' : z === 'plus' ? '<span class="badge ink">플러스</span>' : '';
    const host = l.type === 'host' ? '<span class="badge mute">호스트 운영</span>' : '';
    if (!badge && (zone || host)) badge = `<div class="room-badge">${zone}${host}</div>`;
    return `<a class="room" href="${href}">
      <div class="room-cover">${SP.cover(s)}${badge}${opt.rank ? `<span class="rank">${opt.rank}</span>` : ''}</div>
      <div class="room-body">
        <div class="room-area">${SP.icon('pin', 'sm')}${SP.esc(s.region)} ${SP.esc(s.area)}</div>
        <h3 class="room-name">${SP.esc(s.name)}</h3>
        <div class="room-facts"><span>${SP.icon('users', 'sm')}기준 ${s.base || '-'}명 · 최대 ${s.max || '-'}명</span>${s.info && s.info.size ? `<span>${SP.icon('size', 'sm')}${SP.esc(s.info.size)}</span>` : ''}${rv}</div>
        ${price ? `<div class="room-price"><b>${SP.won(price)}</b>${opt.date ? ` <span class="muted small">${SP.mdw(opt.date)} 최저</span>` : ' <span class="muted small">부터</span>'}</div>` : ''}
        <div class="room-feat">${SP.featTags(s)}</div>
        ${opt.avail && opt.live ? `<div class="room-avail">${SP.strip(opt.avail, opt.from, opt.live, 7)}</div>` : ''}
      </div></a>`;
  };
  SP.stars = (n, max = 5) => {
    let h = '<span class="stars" aria-label="별점 ' + n + '점">';
    for (let i = 1; i <= max; i++) h += SP.icon('star-f', i <= n ? '' : 'off');
    return h + '</span>';
  };
  SP.avatar = (a, cls = '') => {
    const v = a || '🙂';
    if (/^\/|^https?:/.test(v)) return `<span class="avatar ${cls}"><img src="${SP.esc(v)}" alt=""></span>`;
    if (/^u\//.test(v)) return `<span class="avatar ${cls}"><img src="/api/img/${SP.esc(v)}" alt=""></span>`;
    return `<span class="avatar ${cls}" aria-hidden="true">${SP.esc(v)}</span>`;
  };
  SP.ticket = (e) => {
    const past = e.status === 'done';
    const d = e.d || '';
    const when = `${SP.mdw(d)}${e.t1 ? ' ' + SP.hm(e.t1) : ''}${e.d2 ? ' ~ ' + SP.mdw(e.d2) : ''}`;
    const st = e.status === 'closed' ? '<span class="badge mute">신청 마감</span>' : past ? '<span class="badge mute">지난 행사</span>' : e.cap && e.going >= e.cap ? '<span class="badge warn">대기 접수</span>' : e.mode === 'external' ? '<span class="badge red">링크로 신청</span>' : e.mode === 'rsvp' ? '<span class="badge red">신청 받는 중</span>' : '';
    return `<a class="ticket${past ? ' past' : ''}" href="/e/${e.id}">
      <div class="ticket-date"><b>${d ? Number(d.slice(8, 10)) : '?'}</b><span>${d ? Number(d.slice(5, 7)) + '월 ' + SP.wd(d) : ''}</span></div>
      <div class="ticket-body"><div class="row wrap-ok" style="gap:6px">${st}${e.members_only ? '<span class="badge mute">회원 전용</span>' : ''}${e.adult ? '<span class="badge mute">19세 이상</span>' : ''}</div>
        <h3 style="margin-top:6px">${SP.esc(e.title)}</h3>${e.summary ? `<p class="clamp2">${SP.esc(e.summary)}</p>` : ''}
        <div class="ticket-meta"><span>${SP.icon('clock', 'sm')}${SP.esc(when)}</span>${e.spaceName || e.place ? `<span>${SP.icon('pin', 'sm')}${SP.esc(e.spaceName || e.place)}</span>` : ''}${e.cap ? `<span>${SP.icon('users', 'sm')}${e.going || 0}/${e.cap}명</span>` : ''}${e.price ? `<span>${SP.icon('won', 'sm')}${SP.esc(e.price)}</span>` : ''}</div></div></a>`;
  };
  SP.band = (c) => {
    const d = c.d || '';
    const slots = Array.from({ length: Math.min(c.need, 10) }, (_, i) => `<i class="${i < c.accepted ? 'on' : ''}"></i>`).join('');
    const st = c.status === 'closed' ? '<span class="badge mute">모집 완료</span>' : c.status === 'done' ? '<span class="badge mute">지난 파티</span>' : '';
    return `<a class="band" href="/t/${c.id}">
      <div class="band-date"><b>${d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) : '-'}</b><span>${d ? SP.wd(d) + '요일' : ''}</span></div>
      <div style="min-width:0"><h3 class="clamp2">${st} ${SP.esc(c.title)}</h3>
        <div class="band-meta">${c.spaceName ? `<span>${SP.icon('pin', 'sm')}${SP.esc(c.spaceName)}</span>` : `<span>${SP.icon('pin', 'sm')}${SP.esc(c.region || '')} 지점 미정</span>`}${c.t ? `<span>${SP.icon('clock', 'sm')}${SP.esc(c.t)}</span>` : ''}${c.cost ? `<span>${SP.icon('won', 'sm')}${SP.esc(c.cost)}</span>` : ''}</div></div>
      <div class="band-need"><b>${c.accepted}/${c.need}</b><small>명 모였어요</small><div class="slots">${slots}</div></div></a>`;
  };
  SP.meet = (m) => `<a class="meet" href="/m/${m.id}">
      <div class="meet-cover">${m.cover ? `<img src="${SP.esc(m.cover)}" alt="" loading="lazy">` : `<div class="cover-art" aria-hidden="true" style="--ca:url('/assets/img/photo/${MEET_MOOD[m.cat] || 'welcome'}-s.webp')"><span class="ca-area">${SP.esc(m.cat || '모임')}</span></div>`}<span class="cat badge ink">${SP.esc(m.cat || '모임')}</span></div>
      <div class="meet-body"><h3 class="clamp2">${SP.esc(m.title)}</h3>${m.intro ? `<p class="clamp2">${SP.esc(m.intro)}</p>` : ''}
        <div class="meet-foot"><span>${SP.icon('pin', 'sm')} ${SP.esc(m.region || '')}</span><span>${SP.icon('users', 'sm')} ${m.members}/${m.cap}명${m.next ? ` · 다음 모임 ${SP.mdw(m.next)}` : ''}</span></div></div></a>`;
  const BOARD = { review: '이용후기', tip: '파티 꿀팁', qna: '질문', free: '자유', notice: '공지', host: '지점 소식', mb: '모임' };
  SP.BOARD = BOARD;
  const HOST_TAG = { notice: ['red', '공지'], news: ['mute', '소식'], event: ['sun', '이벤트'] };
  SP.HOST_TAG = HOST_TAG;
  const boardBadge = (p) => {
    if (p.board === 'host') { const t = HOST_TAG[p.tag] || HOST_TAG.news; return `<span class="badge ${t[0]}">${t[1]}</span>${p.spaceName ? `<span class="badge mute">${SP.esc(p.spaceName)}</span>` : ''}`; }
    if (p.board === 'qna' && p.code) return `<span class="badge ${p.answered ? 'ok' : 'warn'}">${p.answered ? '답변 완료' : '답변 대기'}</span><span class="badge mute">${SP.esc(p.spaceName || '지점 문의')}</span>`;
    return `<span class="badge mute">${BOARD[p.board] || ''}</span>`;
  };
  SP.boardBadge = boardBadge;
  SP.postRow = (p) => `<a class="post-row" href="/c/${p.id}">
      <div style="min-width:0"><h3>${p.pinned ? '<span class="badge red">고정</span>' : ''}${boardBadge(p)}${SP.esc(p.title)}${p.imgCount > 1 ? ` <span class="faint small">${SP.icon('image', 'sm')}</span>` : ''}</h3>
        ${p.board === 'review' && p.rating ? `<div style="margin-top:4px">${SP.stars(p.rating)} ${p.spaceName ? `<span class="small muted">${SP.esc(p.spaceName)}</span>` : ''}${p.verified ? ' <span class="badge ok">방문 인증</span>' : ''}</div>` : ''}
        <p class="clamp2">${SP.esc(p.excerpt)}</p>
        <div class="post-meta"><span>${SP.esc(p.author ? p.author.nick : '')}</span><span>${SP.ago(p.created_at)}</span><span>${SP.icon('heart', 'sm')}${p.likes}</span><span>${SP.icon('chat', 'sm')}${p.cmts}</span></div></div>
      ${p.img ? `<div class="post-thumb"><img src="${SP.esc(p.img)}" alt="" loading="lazy"></div>` : ''}</a>`;

  /* ---------------- 사진 올리기 (휴대폰에서 줄여서) ---------------- */
  SP.shrink = (file, max = 1600, q = 0.85) => new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error('사진 파일만 올릴 수 있어요.')); return; }
    if (file.type === 'image/gif' && file.size < 4.5e6) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      const r = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * r); h = Math.round(h * r);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 변환하지 못했어요.'))), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요. 다른 사진으로 해 주세요.')); };
    img.src = url;
  });
  SP.upload = async (file, max) => {
    const blob = await SP.shrink(file, max);
    return SP.api('/api/upload', { method: 'POST', body: blob, headers: { 'content-type': blob.type || 'image/jpeg' } });
  };

  /* ---------------- 신고 ---------------- */
  SP.report = async (kind, id) => {
    const u = await SP.needLogin('신고하려면 로그인이 필요해요.');
    if (!u) return;
    const reasons = ['광고·홍보', '욕설·비방', '개인정보 노출', '음란·불쾌한 내용', '사기·거래 유도', '기타'];
    const m = SP.modal({
      title: '신고하기',
      body: `<p class="muted small" style="margin-bottom:12px">신고가 3건 쌓이면 운영진 확인 전까지 자동으로 가려져요.</p>
        <div class="chips" data-r>${reasons.map((r, i) => `<button class="chip${i === 0 ? ' on' : ''}" type="button">${r}</button>`).join('')}</div>
        <textarea class="textarea" style="min-height:90px;margin-top:12px" maxlength="200" placeholder="더 알려 주실 내용 (선택)"></textarea>`,
      foot: '<button class="btn btn-soft" data-x>취소</button><button class="btn btn-ink" data-go>신고 보내기</button>',
    });
    m.$('[data-r]').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; m.$$('[data-r] .chip').forEach((x) => x.classList.toggle('on', x === b)); });
    m.$('[data-go]').onclick = async () => {
      const r = m.$('[data-r] .chip.on').textContent + (m.$('textarea').value.trim() ? ' — ' + m.$('textarea').value.trim() : '');
      try { await SP.post('/api/report', { kind, id, reason: r }); m.close(); SP.toast('신고를 받았어요. 확인 후 조치할게요.'); } catch (e) { SP.fail(e); }
    };
  };

  /* ---------------- 머리글 · 바닥글 ---------------- */
  function chrome() {
    const hd = SP.$('.hd');
    if (hd) {
      const onScroll = () => hd.classList.toggle('scrolled', window.scrollY > 4);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    const drawer = SP.$('.drawer');
    SP.$$('[data-menu]').forEach((b) => b.addEventListener('click', () => { drawer.classList.add('open'); document.body.style.overflow = 'hidden'; }));
    if (drawer) drawer.addEventListener('click', (e) => { if (e.target.closest('.drawer-bg') || e.target.closest('[data-x]') || e.target.closest('a')) { drawer.classList.remove('open'); document.body.style.overflow = ''; } });
    // 머리글 드롭다운 — Esc로 닫기
    SP.$$('.gnb-item').forEach((it) => {
      it.addEventListener('keydown', (e) => { if (e.key === 'Escape') { it.classList.add('shut'); const a = it.querySelector('a'); if (a) a.focus(); } });
      it.addEventListener('mouseleave', () => it.classList.remove('shut'));
      it.addEventListener('focusout', (e) => { if (!it.contains(e.relatedTarget)) it.classList.remove('shut'); });
      it.addEventListener('click', (e) => { if (e.target.closest('.gnb-panel a')) it.classList.add('shut'); });
    });

    SP.site().then(({ settings: s }) => {
      if (!s) return;
      SP.settings = s;
      SP.$$('[data-set]').forEach((el) => {
        const v = s[el.dataset.set];
        if (v) el.textContent = v;
        // 회사 정보처럼 값이 없으면 줄째로 숨기는 칸
        if (el.dataset.hideEmpty !== undefined) { const row = el.closest('.co-row') || el; row.hidden = !v; }
      });
      SP.$$('[data-co2]').forEach((el) => { el.hidden = !s['biz2.name']; });
      SP.$$('[data-set-href]').forEach((el) => { const v = s[el.dataset.setHref]; if (v) { el.href = (el.dataset.setHref === 'cs.phone' ? 'tel:' : '') + v; if (el.dataset.hideEmpty !== undefined) el.hidden = false; } else if (el.dataset.hideEmpty !== undefined) el.hidden = true; });
      const bar = SP.$('.notice-bar');
      if (bar && s['site.notice']) {
        bar.innerHTML = s['site.notice_link'] ? `<a href="${SP.esc(s['site.notice_link'])}">${SP.esc(s['site.notice'])}</a>` : SP.esc(s['site.notice']);
        bar.hidden = false;
      }
      const biz = SP.$('[data-biz]');
      if (biz) {
        // 바닥글 사업자 정보 — 운영 회사, 함께 표시하는 회사 순서로 한 줄씩
        const line = (p) => [s[p + '.name'], s[p + '.ceo'] && '대표 ' + s[p + '.ceo'], s[p + '.no'] && '사업자등록번호 ' + s[p + '.no'], s[p + '.mailorder'] && '통신판매업 ' + s[p + '.mailorder'], s[p + '.addr'], s[p + '.email']].filter(Boolean).join(' | ');
        const lines = [line('biz'), s['biz2.name'] ? line('biz2') : ''].filter(Boolean);
        if (lines.length) biz.innerHTML = lines.map((l) => `<div>${SP.esc(l)}</div>`).join('');
      }
      const sns = SP.$('[data-sns]');
      if (sns) {
        // 인스타그램은 바닥글 위쪽 버튼으로 보이니 여기엔 블로그·유튜브만
        const l = [['sns.blog', '블로그'], ['sns.youtube', '유튜브']].filter(([k]) => s[k]);
        sns.innerHTML = l.map(([k, n]) => `<a href="${SP.esc(s[k])}" target="_blank" rel="noopener">${n}</a>`).join('');
      }
    });

    SP.me().then((m) => {
      const u = m.user;
      SP.user = u;
      document.documentElement.classList.toggle('is-in', !!u);
      const slot = SP.$('#hdUser');
      const bell = SP.$('#bellBtn');
      if (slot) {
        slot.innerHTML = u
          ? `<a class="hd-user" href="/mypage">${SP.avatar(u.avatar, 'sm')}<span>${SP.esc(u.nick)}</span></a>`
          : '<a class="btn btn-ink btn-sm" href="/login">로그인</a>';
      }
      const dslot = SP.$('#drawerUser');
      if (dslot) dslot.innerHTML = u ? `<a href="/mypage">${SP.avatar(u.avatar, 'sm')} ${SP.esc(u.nick)}님</a>${(u.hostCodes || []).length ? '<a href="/myspace" class="sub">내 공간 관리 (호스트)</a>' : ''}${u.admin ? '<a href="/admin" class="sub">관리자 화면</a>' : ''}<a href="#" class="sub" data-logout>로그아웃</a>` : '<a href="/login">로그인</a><a href="/signup" class="sub">회원 가입</a>';
      if (bell) {
        bell.hidden = !u;
        if (u && m.unread) bell.insertAdjacentHTML('beforeend', `<span class="dot">${m.unread > 9 ? '9+' : m.unread}</span>`);
        bell.addEventListener('click', openNotis);
      }
    });
    document.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-logout]')) return;
      e.preventDefault();
      try { await SP.post('/api/account/logout'); } catch { /* 무시 */ }
      try { sessionStorage.clear(); } catch { /* 무시 */ }
      location.href = '/';
    });
    const nav = document.body.dataset.nav;
    if (nav) SP.$$('[data-nav]').forEach((a) => { if (a.dataset.nav.split(' ').includes(nav)) a.classList.add('on'); });
    SP.$$('[data-tg]').forEach((a) => a.classList.toggle('on', a.dataset.tg === nav));
  }

  async function openNotis(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    let pop = SP.$('.pop', btn.parentElement);
    if (pop) { pop.remove(); return; }
    pop = document.createElement('div');
    pop.className = 'pop';
    pop.innerHTML = '<div class="pop-hd">알림<button class="btn btn-ghost btn-sm" data-readall>모두 읽음</button></div><div data-list><p class="noti muted">불러오는 중…</p></div>';
    btn.parentElement.style.position = 'relative';
    btn.parentElement.appendChild(pop);
    const close = (ev) => { if (!pop.contains(ev.target) && ev.target !== btn) { pop.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
    try {
      const d = await SP.get('/api/me/notis');
      pop.querySelector('[data-list]').innerHTML = d.items.length
        ? d.items.map((n) => `<a class="noti${n.read ? '' : ' unread'}" href="${SP.esc(n.link || '#')}" data-id="${n.id}">${SP.esc(n.text)}<time>${SP.ago(n.created_at)}</time></a>`).join('')
        : '<p class="noti muted">아직 알림이 없어요.</p>';
    } catch (er) { pop.querySelector('[data-list]').innerHTML = `<p class="noti muted">${SP.esc(er.message)}</p>`; }
    pop.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-readall]')) {
        await SP.post('/api/me/notis/read', {}).catch(() => {});
        SP.$$('.noti.unread', pop).forEach((x) => x.classList.remove('unread'));
        const dot = SP.$('.dot', btn); if (dot) dot.remove();
        return;
      }
      const a = ev.target.closest('.noti[data-id]');
      if (a) SP.post('/api/me/notis/read', { id: Number(a.dataset.id) }).catch(() => {});
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chrome);
  else chrome();
})();

/* ---------------- 폼에서 자주 쓰는 조각 ---------------- */
(function () {
  const SP = window.SP;
  SP.spaceOptions = (spaces, sel = '', none = '지점 미정') => {
    const by = {};
    spaces.forEach((s) => (by[s.region] = by[s.region] || []).push(s));
    return `<option value="">${SP.esc(none)}</option>` + Object.entries(by).map(([r, l]) => `<optgroup label="${SP.esc(r)}">${l.map((s) => `<option value="${s.code}"${s.code === sel ? ' selected' : ''}>${SP.esc(s.name)}</option>`).join('')}</optgroup>`).join('');
  };
  SP.REGIONS = ['서울', '경기', '인천', '대전', '부산', '전주', '기타'];
  SP.formData = (root) => {
    const o = {};
    root.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value.trim();
    });
    return o;
  };
  /** 사진 한 장 고르기 버튼 — 올린 키를 hidden input에 넣는다 */
  SP.coverPicker = (wrap, initialUrl, initialKey) => {
    wrap.innerHTML = `<div class="img-pick"><div class="pk" ${initialUrl ? '' : 'hidden'}><img alt="대표 사진" src="${SP.esc(initialUrl || '')}"><button type="button" data-rm aria-label="사진 빼기">${SP.icon('x', 'sm')}</button></div><button type="button" class="add" data-add ${initialUrl ? 'hidden' : ''}>${SP.icon('camera')}<br>대표 사진</button></div><input type="hidden" name="cover" value="${SP.esc(initialKey || '')}"><input type="file" accept="image/*" hidden>`;
    const file = wrap.querySelector('input[type=file]');
    const hid = wrap.querySelector('input[name=cover]');
    const pk = wrap.querySelector('.pk'), add = wrap.querySelector('[data-add]');
    add.onclick = () => file.click();
    wrap.querySelector('[data-rm]').onclick = () => { hid.value = ''; pk.hidden = true; add.hidden = false; };
    file.onchange = async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      pk.hidden = false; add.hidden = true; pk.querySelector('img').src = URL.createObjectURL(f);
      try { const r = await SP.upload(f, 1600); hid.value = r.key; pk.querySelector('img').src = r.url; }
      catch (e) { SP.fail(e); hid.value = ''; pk.hidden = true; add.hidden = false; }
    };
  };
})();

/* ---------------- 초대장 카드 ---------------- */
(function () {
  const SP = window.SP;
  SP.THEMES = [['confetti', '색종이', '#fff'], ['night', '밤하늘', '#2b2f6b'], ['pastel', '파스텔', '#fdf2f5'], ['minimal', '깔끔하게', '#ffffff'], ['birthday', '생일 빨강', '#e83217'], ['bridal', '웨딩', '#fbfaf8']];
  SP.invCard = (iv, tag = 'div') => {
    const when = [iv.d ? SP.mdwLong(iv.d) : '', iv.t ? SP.hm(iv.t) : ''].filter(Boolean).join(' ');
    const where = iv.space ? iv.space.name : iv.spaceName || iv.place || '';
    return `<div class="inv-card t-${SP.esc(iv.theme || 'confetti')}"><div class="deco"></div>
      <div><div class="inv-host">${SP.esc(iv.host || '')}${iv.host ? '의 초대' : '초대장'}</div><${tag} class="inv-title" style="margin-top:12px">${SP.esc(iv.title || '파티 제목을 적어 주세요')}</${tag}></div>
      <div><div class="inv-when">${SP.esc(when || '날짜는 곧 정해져요')}</div>${where ? `<div class="inv-where">${SP.esc(where)}</div>` : ''}${iv.msg ? `<div class="inv-msg">${SP.esc(iv.msg)}</div>` : ''}</div></div>`;
  };
})();

/* ---------------- 배경 영상 자동재생 보조 ----------------
   아이폰 저전력 모드, 삼성 인터넷 자동재생 차단처럼 영상이 멈춘 채 열리는 휴대폰이 있다.
   그럴 땐 처음 화면을 만지거나 스크롤할 때 한 번 더 재생을 시도한다. 그래도 안 되면 대표 사진이 그대로 보인다. */
(function () {
  const vids = Array.from(document.querySelectorAll('video[autoplay][muted]'));
  if (!vids.length) return;
  const kick = () => vids.forEach((v) => { v.muted = true; if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } });
  const once = () => { kick(); ['touchstart', 'scroll', 'click'].forEach((ev) => window.removeEventListener(ev, once)); };
  ['touchstart', 'scroll', 'click'].forEach((ev) => window.addEventListener(ev, once, { passive: true }));
  if (document.readyState === 'complete') kick(); else window.addEventListener('load', kick, { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
})();
