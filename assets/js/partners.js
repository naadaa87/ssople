/* 제휴·협업 — 제휴 혜택 목록, 문의 */
(function () {
  const { $, $$, esc, icon } = SP;
  let kind = location.hash === '#space' ? 'space' : 'partner';
  let all = [], cat = '';
  const TIER = { all: '', silver: '실버 이상', gold: '골드 전용' };

  function draw() {
    const cats = [...new Set(all.map((p) => p.cat || '기타'))];
    $('#pCats').innerHTML = all.length ? `<button type="button" class="chip${!cat ? ' on' : ''}" data-c="">전체</button>` + cats.map((c) => `<button type="button" class="chip${cat === c ? ' on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('') : '';
    const list = all.filter((p) => !cat || (p.cat || '기타') === cat);
    $('#pList').innerHTML = list.length ? list.map((p) => `<div class="partner"><div class="p-img">${p.img ? `<img src="${esc(p.img)}" alt="">` : esc((p.name || '?').slice(0, 1))}</div><div style="min-width:0"><h3>${esc(p.name)}</h3><div class="benefit">${esc(p.benefit)}</div>${p.body ? `<p class="clamp3">${esc(p.body)}</p>` : ''}<div class="row wrap-ok" style="margin-top:8px;gap:6px">${TIER[p.tier] ? `<span class="badge mute">${TIER[p.tier]}</span>` : ''}${p.region ? `<span class="badge mute">${esc(p.region)}</span>` : ''}${p.url ? `<a class="btn btn-line btn-sm" href="${esc(p.url)}" target="_blank" rel="noopener">${icon('ext', 'sm')}바로가기</a>` : ''}</div></div></div>`).join('')
      : `<div class="empty" style="grid-column:1/-1">${icon('handshake')}<h3>제휴 파트너를 찾고 있어요</h3><p>케이크, 꽃, 풍선 장식, 출장 사진, 케이터링처럼 파티에 필요한 일을 하신다면 아래에서 연락 주세요.</p></div>`;
  }
  function setKind(k) {
    kind = k;
    $$('#kinds [data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    $('#spaceNote').hidden = k !== 'space';
    $('#c4').placeholder = k === 'space' ? '공간 위치, 크기(평수), 지금 운영 중인지, 궁금한 점을 적어 주세요.' : k === 'corporate' ? '회사명, 인원, 날짜, 지역, 필요한 시설을 적어 주세요.' : '하시는 일, 생각하는 협업 방식, 원하는 일정 등을 자유롭게 적어 주세요.';
  }
  $('#pCats').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; draw(); });
  $('#kinds').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) setKind(b.dataset.k); });
  $('#cForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = SP.formData($('#cForm'));
    const err = $('#cErr');
    err.hidden = true;
    if (!f.name || !f.contact || f.body.length < 10) { err.textContent = '이름, 연락처, 내용(10자 이상)을 적어 주세요.'; err.hidden = false; return; }
    if (!f.agree) { err.textContent = '개인정보 수집·이용에 동의해 주세요.'; err.hidden = false; return; }
    const btn = $('#cForm button[type=submit]');
    SP.busy(btn, true, '보내는 중');
    try { await SP.post('/api/contact', { ...f, kind }); $('#cForm').reset(); SP.toast('문의를 보냈어요. 확인하고 연락드릴게요.'); }
    catch (er) { err.textContent = er.message; err.hidden = false; }
    SP.busy(btn, false);
  });
  setKind(kind);
  if (location.hash === '#space' || location.hash === '#form') setTimeout(() => $('#form').scrollIntoView({ block: 'start' }), 200);
  SP.get('/api/partners').then((d) => { all = d.items; draw(); }).catch(() => { all = []; draw(); });
})();
