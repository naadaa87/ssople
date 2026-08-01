/* ============================================================
   상담 챗봇 "쏘플이" — 홈페이지 위젯

   페이지에 이미 상담창 마크업(#chatbox)이 있으면 그것을 그대로 쓰고,
   안쪽 동작만 실제 챗봇 서버에 연결합니다.
   없는 페이지에는 같은 모양의 창을 새로 넣습니다.

   카카오톡 채널에서 쓰는 것과 같은 서버를 부르므로
   두 곳의 답이 달라지지 않습니다.
   ============================================================ */

(function () {
  if (window.__ssopleChat) return;
  window.__ssopleChat = true;

  const S = { sessionId: null, busy: false, started: false, branch: null, page: null, own: false };
  let el = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    S.page = location.pathname.split('/').pop() || 'index.html';
    const existing = document.getElementById('chatbox');
    if (existing) adopt(existing);
    else inject();
    watchBranch();
  }

  /* ---------- 이미 있는 상담창을 실제 챗봇에 연결 ---------- */
  function adopt(box) {
    S.own = false;
    el.panel = box;
    el.body = box.querySelector('.chat-body') || document.getElementById('chatBody');
    el.input = box.querySelector('.chat-input input') || document.getElementById('chatInput');
    el.send = box.querySelector('.chat-send');
    el.quicks = box.querySelector('.quicks');

    /* 데모 응답 함수를 실제 호출로 바꿔 끼웁니다 */
    window.sendChat = () => ask(el.input ? el.input.value : '');
    window.botReply = (t) => ask(t);
    window.respond = function () {};

    if (el.send) el.send.onclick = () => ask(el.input ? el.input.value : '');
    if (el.input) el.input.onkeydown = (e) => { if (e.key === 'Enter') ask(el.input.value); };

    const fab = document.getElementById('aiFab');
    if (fab) {
      fab.onclick = function () {
        if (typeof window.toggleChat === 'function') window.toggleChat();
        else box.classList.toggle('open');
        if (box.classList.contains('open')) onOpen();
      };
      const tip = fab.querySelector('.fab-tip');
      if (tip) tip.textContent = '상담 챗봇';
      fab.setAttribute('aria-label', '상담 챗봇 열기');
    }

    const head = box.querySelector('.chat-head b');
    if (head && head.firstChild) head.firstChild.nodeValue = '쏘플이 ';
    const sub = box.querySelector('.chat-head > div > span');
    if (sub) sub.textContent = '예약·요금·환불 무엇이든 물어보세요';
  }

  /* ---------- 상담창이 없는 페이지에 새로 넣기 ---------- */
  function inject() {
    S.own = true;
    const w = document.createElement('div');
    w.className = 'spc';
    w.innerHTML =
      '<div class="spc-panel" role="dialog" aria-label="상담 챗봇">' +
        '<div class="spc-h"><div class="spc-av">✦</div>' +
          '<div class="spc-t"><b>쏘플이</b><span>예약·요금·환불 무엇이든 물어보세요</span></div>' +
          '<button type="button" class="spc-x" aria-label="닫기">&times;</button></div>' +
        '<div class="spc-b"></div><div class="spc-q"></div>' +
        '<div class="spc-i"><input placeholder="메시지를 입력하세요" autocomplete="off" aria-label="질문 입력" />' +
          '<button type="button" aria-label="보내기">↑</button></div>' +
      '</div>' +
      '<button type="button" class="spc-fab" aria-label="상담 챗봇 열기">✦</button>';
    document.body.appendChild(w);

    el.panel = w.querySelector('.spc-panel');
    el.body = w.querySelector('.spc-b');
    el.quicks = w.querySelector('.spc-q');
    el.input = w.querySelector('.spc-i input');
    el.send = w.querySelector('.spc-i button');

    w.querySelector('.spc-fab').onclick = () => {
      w.classList.toggle('open');
      if (w.classList.contains('open')) onOpen();
    };
    w.querySelector('.spc-x').onclick = () => w.classList.remove('open');
    el.send.onclick = () => ask(el.input.value);
    el.input.onkeydown = (e) => { if (e.key === 'Enter') ask(el.input.value); };
  }

  /* ---------- 지점 상세 화면이면 지점명을 물고 갑니다 ---------- */
  function watchBranch() {
    if (S.page !== 'room-detail.html') return;
    const pick = () => {
      const n = document.getElementById('dName');
      if (n && n.textContent.trim() && n.textContent.trim() !== '공간명') {
        S.branch = n.textContent.trim();
        return true;
      }
      return false;
    };
    if (pick()) return;
    let n = 0;
    const t = setInterval(() => { if (pick() || ++n > 25) clearInterval(t); }, 300);
  }

  /* ---------- 대화 ---------- */
  function onOpen() {
    if (S.started) return;
    S.started = true;
    if (el.body) el.body.innerHTML = '';

    bubble(S.branch
      ? '안녕하세요, 쏘플이입니다.\n' + S.branch + '에 대해 궁금한 점을 물어보세요.'
      : '안녕하세요, 쏘플이입니다.\n예약·요금·환불 무엇이든 물어보세요.', 'bot');

    quick(S.branch ? [
      { label: '주차 되나요?', send: S.branch + ' 주차 되나요?' },
      { label: '요금 안내', send: S.branch + ' 요금이 어떻게 되나요?' },
      { label: '환불 규정', send: '취소하면 환불되나요?' },
      { label: '예약 조회', send: '__LOOKUP__' },
    ] : [
      { label: '예약 방법', send: '예약은 어떻게 하나요?' },
      { label: '환불 규정', send: '취소하면 환불되나요?' },
      { label: '요금 안내', send: '요금이 어떻게 되나요?' },
      { label: '예약 조회', send: '__LOOKUP__' },
    ]);

    setTimeout(() => { if (el.input) el.input.focus(); }, 120);
  }

  async function ask(text) {
    const q = (text || '').trim();
    if (!q || S.busy) return;
    if (q === '__LOOKUP__') { location.href = '/lookup.html'; return; }

    if (el.input) el.input.value = '';
    bubble(q, 'user');
    clearQuick();

    S.busy = true;
    if (el.send) el.send.disabled = true;
    const wait = bubble('<span class="spc-dots"><i></i><i></i><i></i></span>', 'bot', true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, sessionId: S.sessionId, page: S.page, branch: S.branch }),
      });
      const d = await res.json();
      wait.remove();

      if (!d.ok) { bubble(d.message || '잠시 후 다시 시도해 주세요.', 'bot'); return; }
      S.sessionId = d.sessionId;

      const box = bubble(d.answer, 'bot');
      for (const l of d.links || []) addLink(box, l.label, l.url);

      if (d.handoff) handoffButton();
      else quick(d.quickReplies || []);
    } catch (e) {
      wait.remove();
      bubble('연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.', 'bot');
      handoffButton();
    } finally {
      S.busy = false;
      if (el.send) el.send.disabled = false;
      if (el.input) el.input.focus();
    }
  }

  /* ---------- 그리기 ---------- */
  function bubble(text, who, raw) {
    if (!el.body) return { remove: function () {} };
    const d = document.createElement('div');
    d.className = S.own ? 'spc-m ' + who : 'msg ' + who;
    if (raw) d.innerHTML = text;
    else d.textContent = text;
    el.body.appendChild(d);
    el.body.scrollTop = el.body.scrollHeight;
    return d;
  }

  function addLink(box, label, url) {
    const a = document.createElement('a');
    a.className = 'spc-link';
    a.href = url;
    a.textContent = label || '바로가기';
    if (url.indexOf('tel:') !== 0) { a.target = '_blank'; a.rel = 'noopener'; }
    box.appendChild(document.createElement('br'));
    box.appendChild(a);
  }

  function quick(list) {
    if (!list || !list.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'spc-qrow';
    wrap.dataset.q = '1';
    for (const item of list) {
      const label = typeof item === 'string' ? item : item.label;
      const send = typeof item === 'string' ? item : (item.send || item.label);
      if (!label) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = S.own ? 'spc-qb' : 'quick';
      b.textContent = label;
      b.onclick = () => ask(send);
      wrap.appendChild(b);
    }
    placeQuick(wrap);
  }

  function handoffButton() {
    const wrap = document.createElement('div');
    wrap.className = 'spc-qrow';
    wrap.dataset.q = '1';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = S.own ? 'spc-qb' : 'quick';
    b.textContent = '상담원 연결';
    b.onclick = async () => {
      try {
        const r = await fetch('/api/chat/handoff', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: S.sessionId }),
        }).then((x) => x.json());
        if (r.kakao) { window.open(r.kakao, '_blank', 'noopener'); return; }
        bubble('고객센터 ' + r.phone + '\n' + r.hours, 'bot');
      } catch (e) {
        bubble('고객센터로 연락해 주세요.', 'bot');
      }
    };
    wrap.appendChild(b);
    placeQuick(wrap);
  }

  function placeQuick(wrap) {
    clearQuick();
    if (el.quicks) el.quicks.appendChild(wrap);
    else if (el.body) { el.body.appendChild(wrap); el.body.scrollTop = el.body.scrollHeight; }
  }

  function clearQuick() {
    document.querySelectorAll('[data-q="1"]').forEach((e) => e.remove());
    /* 기존 페이지에 박혀 있던 데모 추천 버튼도 함께 치웁니다 */
    if (el.quicks) el.quicks.querySelectorAll(':scope > .quick').forEach((b) => b.remove());
  }
})();
