/* 초대장 보기 — 참석 응답 (가입 없이), 만든 사람은 명단 관리 */
(function () {
  const { $, $$, esc, icon } = SP;
  const id = (location.pathname.match(/\/i\/([A-Za-z0-9]+)/) || [])[1] || SP.qs().id;
  const tkKey = 'inv.' + id;
  let D = null, pick = 'yes';

  async function load() {
    if (!id) return notFound();
    const tok = SP.store.get(tkKey, '');
    try { D = await SP.get(`/api/invites/${id}${tok ? '?token=' + encodeURIComponent(tok) : ''}`); } catch (e) { return notFound(e.message); }
    if (D.mine) pick = D.mine.status;
    document.title = `${D.invite.title} 초대장 | 쏘플파티룸`;
    render();
  }
  function notFound(msg) {
    $('#ivRoot').innerHTML = `<div class="empty" style="margin-top:40px">${icon('send')}<h3>초대장을 찾을 수 없어요</h3><p>${esc(msg || '지워졌거나 주소가 잘못됐어요.')}</p></div>`;
  }

  function render() {
    const iv = D.invite, c = D.counts;
    const me = D.mine;
    const STL = { yes: '갈게요', maybe: '아직 몰라요', no: '못 가요' };
    $('#ivRoot').innerHTML = `${SP.invCard(iv, 'h1')}
      ${iv.space ? `<div class="box" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><b>${esc(iv.space.name)}</b><div class="small muted">${esc(iv.space.addr || '')}</div></div><div class="row">${iv.space.place ? `<a class="btn btn-line btn-sm" href="${esc(iv.space.place)}" target="_blank" rel="noopener">${icon('map', 'sm')}지도</a>` : ''}<a class="btn btn-soft btn-sm" href="/room/${iv.space.code}">지점 보기</a></div></div>` : ''}
      <section class="box" style="margin-top:14px">
        <div class="between"><h2 class="h3">${me ? '내 응답' : '올 수 있어요?'}</h2><span class="small muted">${c.people}명 온대요 · 미정 ${c.maybe}</span></div>
        ${iv.closed ? '<p class="muted" style="margin-top:10px">응답 마감일이 지났어요.</p>' : `
        <form id="rsForm" style="margin-top:14px">
          <div class="rsvp-opts" role="radiogroup">${Object.entries(STL).map(([k, l]) => `<button type="button" role="radio" aria-checked="${pick === k}" class="${pick === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
          <div class="form-grid" style="margin-top:12px">
            <div class="field"><label class="label" for="rName">이름</label><input class="input" id="rName" maxlength="20" value="${esc(me ? me.name : '')}" placeholder="친구들이 알아볼 이름"></div>
            <div class="field"><label class="label" for="rN">몇 명이 와요?</label><input class="input" id="rN" type="number" min="1" max="10" value="${me ? me.n : 1}"></div>
            <div class="field full"><label class="label" for="rMsg">한마디 <span class="opt">선택</span></label><input class="input" id="rMsg" maxlength="120" value="${esc(me && me.msg ? me.msg : '')}" placeholder="예) 케이크는 내가 사 갈게!"></div>
          </div>
          <button class="btn btn-red btn-block btn-lg" type="submit" style="margin-top:14px">${me ? '응답 바꾸기' : '응답 보내기'}</button>
          ${iv.deadline ? `<p class="tiny faint" style="margin-top:8px">${SP.mdw(iv.deadline)}까지 답해 주세요.</p>` : ''}
        </form>`}
      </section>
      ${D.list.length ? `<section class="box" style="margin-top:14px"><h2 class="h4">응답한 사람 ${D.list.length}명</h2><ul class="guest-list" style="margin-top:8px">${D.list.map((g) => `<li><span>${esc(g.name)}${g.n > 1 ? ` <span class="tiny muted">외 ${g.n - 1}명</span>` : ''}${g.mine ? ' <span class="badge mute">나</span>' : ''}${D.owner && g.msg ? `<br><span class="small muted">${esc(g.msg)}</span>` : ''}</span><span class="row"><span class="badge ${g.status === 'yes' ? 'ok' : g.status === 'maybe' ? 'warn' : 'mute'}">${STL[g.status]}</span>${D.owner ? `<button class="btn btn-ghost btn-sm" type="button" data-rm="${g.id}" aria-label="응답 지우기">${icon('trash', 'sm')}</button>` : ''}</span></li>`).join('')}</ul></section>` : ''}
      ${D.owner ? `<div class="row" style="margin-top:14px;flex-wrap:wrap"><button class="btn btn-ink" type="button" id="shBtn">${icon('share')}초대장 보내기</button><a class="btn btn-line" href="/invite?edit=${id}">${icon('edit')}고치기</a><button class="btn btn-ghost" type="button" id="delBtn">${icon('trash')}지우기</button></div>`
        : `<div class="box fog" style="margin-top:22px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap"><div><h3 class="h4">다음 파티는 내가 열어 볼까?</h3><p class="small muted" style="margin-top:2px">날짜만 고르면 전국 쏘플파티룸 요금과 지점이 보여요. 초대장도 이렇게 만들 수 있어요.</p></div><a class="btn btn-red" href="/rooms">지점 찾아보기</a></div>`}`;
    bind();
  }

  function bind() {
    const f = $('#rsForm');
    if (f) {
      f.querySelector('.rsvp-opts').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; pick = b.dataset.s; $$('.rsvp-opts button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('#rName').value.trim();
        if (!name) { SP.toast('이름을 적어 주세요.'); $('#rName').focus(); return; }
        const btn = f.querySelector('button[type=submit]');
        SP.busy(btn, true, '보내는 중');
        try {
          const r = await SP.post(`/api/invites/${id}/rsvp`, { name, status: pick, n: Number($('#rN').value) || 1, msg: $('#rMsg').value.trim(), token: SP.store.get(tkKey, '') || undefined });
          SP.store.set(tkKey, r.token);
          SP.toast(pick === 'yes' ? '응답했어요. 그날 봐요!' : '응답을 보냈어요.');
          load();
        } catch (er) { SP.fail(er); SP.busy(btn, false); }
      });
    }
    const sh = $('#shBtn');
    if (sh) sh.addEventListener('click', () => SP.share({ title: D.invite.title, text: `${D.invite.host || ''} 초대장이 도착했어요. 올 수 있는지 알려 줘!`, url: location.origin + '/i/' + id }));
    const del = $('#delBtn');
    if (del) del.addEventListener('click', async () => {
      if (!(await SP.confirm('초대장을 지울까요? 받은 응답도 함께 지워져요.', { ok: '지우기', danger: true }))) return;
      try { await SP.del('/api/invites/' + id); location.href = '/invite'; } catch (er) { SP.fail(er); }
    });
    $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await SP.confirm('이 응답을 지울까요?', { ok: '지우기', danger: true }))) return;
      try { await SP.del(`/api/invites/${id}/rsvps/${b.dataset.rm}`); load(); } catch (er) { SP.fail(er); }
    }));
  }
  load();
})();
