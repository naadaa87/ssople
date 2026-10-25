/* 온라인 파티룸 소개 화면: 공개 파티룸 목록 · 오늘의 랭킹 · 최근 개선 요청 */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const getJson = async (url, ms = 5000) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store', credentials: url.startsWith('/') ? 'same-origin' : 'omit' }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
  };
  const SW = {
    home: 'linear-gradient(135deg,#F6E7D4,#E3C193)', rooftop: 'linear-gradient(135deg,#1B2147,#3A2C66 60%,#6A3E6E)',
    game: 'linear-gradient(135deg,#1E2136,#5B43D6 60%,#FF4FA0)', house: 'linear-gradient(135deg,#FFF1EC,#F7D9C9)',
  };
  const THEME = { home: '홈파티', rooftop: '루프탑', game: '게임파티룸' };
  const GAME = { balance: '밸런스게임', liar: '라이어게임', draw: '그림 맞히기', truth: '진실카드', roulette: '파티 룰렛', quiz: '퀴즈 배틀', ox: 'OX퀴즈', arcade: '미니게임 대결' };
  const ARC = [['balloon', '🎈 풍선 팡팡'], ['stack', '🎂 케이크 쌓기'], ['rhythm', '🥁 리듬 파티'], ['memory', '🃏 짝꿍 카드'], ['catch', '🦴 간식 받기'], ['reaction', '⚡ 반응 속도'], ['numbers', '🔢 숫자 터치'], ['whack', '🎁 깜짝 상자']];
  const ST = { new: '접수', review: '검토 중', planned: '반영 예정', doing: '만드는 중', done: '반영 완료', hold: '보류' };

  async function rooms() {
    const box = $('#lvRooms');
    if (!box) return;
    const cfg = await getJson('/api/live/config');
    const server = cfg && cfg.server;
    const empty = (msg) => { box.innerHTML = `<div class="lv-empty">${msg}<br><a class="btn btn-red btn-sm" href="/live/play">파티룸 열러 가기</a></div>`; };
    if (!server) { empty('지금은 열린 공개 파티룸이 없어요. 첫 번째 방을 열어 보세요.'); return; }
    const j = await getJson(server + '/api/public');
    const list = (j && j.rooms) || [];
    if (!list.length) { empty(j && j.people ? `지금 ${j.people}명이 친구끼리 놀고 있어요. 공개 파티룸은 아직 없어요.` : '지금은 열린 공개 파티룸이 없어요. 첫 번째 방을 열어 보세요.'); return; }
    box.innerHTML = list.slice(0, 9).map((r) => {
      const home = r.kind === 'home';
      const sub = [home ? '🏠 집들이' : THEME[r.theme] || '파티룸', `${r.count}/${r.capacity}명`, r.game ? `${GAME[r.game] || '게임'} 중` : ''].filter(Boolean).join(' · ');
      return `<a class="lv-room" href="/live/r/${encodeURIComponent(r.code)}"><span class="sw" style="background:${home ? SW.house : SW[r.theme] || SW.home}">${home ? '🏠' : ''}</span><span class="mid"><b>${esc(r.name)}</b><small>${esc(sub)}</small></span><span class="go">${r.count >= r.capacity ? '꽉 찼어요' : '놀러 가기'}</span></a>`;
    }).join('');
  }

  let game = 'balloon';
  async function rank() {
    const tabs = $('#lvRankTabs'); const box = $('#lvRank');
    if (!tabs || !box) return;
    tabs.innerHTML = ARC.map(([k, l]) => `<button type="button" data-g="${k}" class="${k === game ? 'on' : ''}">${l}</button>`).join('');
    const j = await getJson('/api/live/rank?game=' + game + '&period=day');
    const list = (j && j.list) || [];
    box.innerHTML = list.length ? list.slice(0, 5).map((r, i) => `<div class="lv-rank-row${i < 3 ? ' top' : ''}"><span class="n">${i + 1}</span><span>${esc(r.nick)} <small class="muted">Lv.${r.lv}</small></span><span class="s">${Number(r.score).toLocaleString('ko-KR')}점</span></div>`).join('')
      : '<div class="lv-empty">오늘은 아직 기록이 없어요. 첫 1등의 주인공이 되어 보세요!</div>';
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('#lvRankTabs [data-g]'); if (b) { game = b.dataset.g; rank(); } });

  async function reqs() {
    const box = $('#lvReq');
    if (!box) return;
    const j = await getJson('/api/live/requests?sort=top');
    const list = (j && j.list) || [];
    box.innerHTML = list.length ? list.slice(0, 4).map((r) => `<a href="/live/requests?id=${r.id}"><span>${esc(r.title)}</span><i class="lv-st st-${esc(r.status)}">${ST[r.status] || '접수'}</i></a>`).join('')
      : '<div class="lv-empty">아직 올라온 요청이 없어요. 첫 의견을 남겨 주세요!</div>';
  }

  rooms(); rank(); reqs();
  setInterval(() => { if (document.visibilityState === 'visible') rooms(); }, 30000);
})();
