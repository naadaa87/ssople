/* 행사 상세 — 참가 신청·대기·취소, 캘린더 저장, 공유 */
(function () {
  const { $, esc, icon } = SP;
  const id = Number((location.pathname.match(/\/e\/(\d+)/) || [])[1] || SP.qs().id);
  let ev = null, mine = null, waits = 0;

  async function load() {
    if (!id) return notFound();
    let d;
    try { d = await SP.api('/api/evt/' + id, { loginRedirect: false }); } catch (e) { return notFound(e.message); }
    ev = d.event; mine = d.mine; waits = d.waits;
    document.title = `${ev.title} | 쏘플파티룸`;
    render(d.canEdit);
  }
  function notFound(msg) {
    $('#evRoot').innerHTML = `<div class="empty" style="margin-top:40px">${icon('ticket')}<h3>행사를 찾을 수 없어요</h3><p>${esc(msg || '')}</p><a class="btn btn-ink" href="/event">행사 목록</a></div>`;
  }
  function when() {
    let s = SP.mdwLong(ev.d);
    if (ev.t1) s += ` ${SP.hm(ev.t1)}`;
    if (ev.t2) s += ` ~ ${ev.d2 ? SP.mdw(ev.d2) + ' ' : ''}${SP.hm(ev.t2)}`;
    else if (ev.d2) s += ` ~ ${SP.mdwLong(ev.d2)}`;
    return s;
  }
  function statusText() {
    if (ev.status === 'done') return ['mute', '지난 행사'];
    if (ev.status === 'closed') return ['mute', '신청 마감'];
    if (ev.status === 'pending') return ['warn', '검토 중'];
    if (ev.mode === 'external') return ['red', '링크로 신청'];
    if (ev.mode === 'info') return ['mute', '안내'];
    if (ev.cap && ev.going >= ev.cap) return ['warn', '대기 접수 중'];
    return ['red', '신청 받는 중'];
  }

  function rsvpBox() {
    if (ev.status === 'pending') return '<div class="callout warn">운영진이 확인하고 있는 행사예요. 공개되면 신청할 수 있어요.</div>';
    if (ev.status === 'done') return '<p class="muted">이미 끝난 행사예요. 다음 행사 소식은 행사 목록에서 확인해 주세요.</p>';
    if (ev.mode === 'external') return `<a class="btn btn-red btn-block btn-lg" href="${esc(ev.ext_url)}" target="_blank" rel="noopener">${icon('ext')}신청 페이지로 가기</a><p class="tiny faint" style="margin-top:8px">외부 신청 페이지(네이버 예약·신청서 등)에서 접수해요.</p>`;
    if (ev.mode === 'info') return '<p class="muted">따로 신청하지 않아도 되는 행사예요. 시간 맞춰 와 주세요.</p>';
    if (ev.status === 'closed') return '<p class="muted">신청이 마감됐어요.</p>';
    if (mine) {
      return `<div class="callout ${mine.status === 'going' ? '' : 'warn'}">${icon(mine.status === 'going' ? 'check-c' : 'clock')}<div><b>${mine.status === 'going' ? '참가 확정' : `대기 중`}</b> · ${mine.n}명${mine.status === 'wait' ? '<br><span class="small">자리가 나면 순서대로 확정하고 알림을 보내 드려요.</span>' : ''}</div></div>
        <button class="btn btn-line btn-block" style="margin-top:12px" id="cancelBtn" type="button">신청 취소</button>`;
    }
    const full = ev.cap && ev.going >= ev.cap;
    const ns = Array.from({ length: ev.max_n || 1 }, (_, i) => `<option value="${i + 1}">${i + 1}명</option>`).join('');
    return `<form id="rsvpForm">
      ${(ev.max_n || 1) > 1 ? `<div class="field"><label class="label" for="rN">함께 오는 인원</label><select class="select" id="rN">${ns}</select></div>` : ''}
      <div class="field"><label class="label" for="rMsg">남길 말 <span class="opt">선택</span></label><input class="input" id="rMsg" maxlength="200" placeholder="예) 처음이라 설레요"></div>
      <button class="btn btn-red btn-block btn-lg" type="submit" style="margin-top:14px">${full ? '대기 신청하기' : '참가 신청하기'}</button>
      ${full ? `<p class="tiny faint" style="margin-top:8px">정원이 찼어요. 대기 ${waits}명 · 취소가 생기면 순서대로 확정돼요.</p>` : ''}
      ${ev.adult ? '<p class="tiny faint" style="margin-top:8px">만 19세 이상만 참가할 수 있어요.</p>' : ''}
    </form>`;
  }

  function render(canEdit) {
    const [bc, bt] = statusText();
    $('#evRoot').innerHTML = `
      <nav class="crumb"><a href="/event">행사</a>${icon('chev-r', 'sm')}<span>${esc(ev.cat)}</span></nav>
      ${ev.cover ? `<div class="ticket-cover"><img src="${esc(ev.cover)}" alt=""></div>` : ''}
      <div class="room-layout" style="margin-top:22px">
        <div>
          <div class="row wrap-ok"><span class="badge ${bc}">${bt}</span>${ev.members_only ? '<span class="badge mute">회원 전용</span>' : ''}${ev.adult ? '<span class="badge mute">19세 이상</span>' : ''}<span class="badge mute">${esc(ev.cat)}</span></div>
          <h1 class="h1" style="margin-top:10px">${esc(ev.title)}</h1>
          ${ev.summary ? `<p class="lead" style="margin-top:8px">${esc(ev.summary)}</p>` : ''}
          <dl class="kv" style="margin-top:22px">
            <dt>언제</dt><dd>${esc(when())}</dd>
            <dt>어디서</dt><dd>${ev.spaceName ? `<a class="link" href="/room/${ev.code}">${esc(ev.spaceName)}</a>` : esc(ev.place || (ev.locked ? '회원에게만 보여요' : '추후 안내'))}${ev.spaceName && ev.place ? ` · ${esc(ev.place)}` : ''}</dd>
            ${ev.cap ? `<dt>정원</dt><dd>${ev.going}/${ev.cap}명${waits ? ` · 대기 ${waits}명` : ''}</dd>` : ''}
            ${ev.price ? `<dt>참가비</dt><dd>${esc(ev.price)}</dd>` : ''}
          </dl>
          <section class="room-sec"><h2>행사 안내</h2>${ev.locked ? `<div class="callout">${icon('lock')}<span>회원 전용 행사예요. <a class="link" href="/login?next=${encodeURIComponent(location.pathname)}">로그인</a>하면 자세한 내용이 보여요.</span></div>` : `<div class="prose prewrap">${esc(ev.body || '자세한 내용은 곧 올라와요.')}</div>`}</section>
        </div>
        <aside class="book">
          <h2>${ev.mode === 'rsvp' ? '참가 신청' : '참여 방법'}</h2>
          <div style="margin-top:14px" id="rsvpArea">${rsvpBox()}</div>
          <div class="row" style="margin-top:16px;flex-wrap:wrap">
            <a class="btn btn-soft btn-sm" href="/api/evt/${ev.id}/ics">${icon('calendar', 'sm')}캘린더에 저장</a>
            <button class="btn btn-soft btn-sm" type="button" id="shareBtn">${icon('share', 'sm')}공유</button>
            ${canEdit ? `<a class="btn btn-ghost btn-sm" href="/admin#events">${icon('edit', 'sm')}관리</a>` : ''}
          </div>
        </aside>
      </div>`;
    bind();
  }

  function bind() {
    $('#shareBtn').addEventListener('click', () => SP.share({ title: ev.title, text: ev.summary || '', url: location.origin + '/e/' + ev.id }));
    const f = $('#rsvpForm');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!(await SP.needLogin('로그인하고 신청해 주세요.'))) return;
      const btn = f.querySelector('button[type=submit]');
      SP.busy(btn, true, '신청하는 중');
      try {
        const r = await SP.post(`/api/evt/${id}/rsvp`, { n: $('#rN') ? Number($('#rN').value) : 1, msg: $('#rMsg').value.trim() });
        SP.toast(r.status === 'going' ? '참가가 확정됐어요.' : '대기 명단에 올렸어요.');
        load();
      } catch (er) { SP.fail(er); SP.busy(btn, false); }
    });
    const c = $('#cancelBtn');
    if (c) c.addEventListener('click', async () => {
      if (!(await SP.confirm('신청을 취소할까요?', { ok: '취소하기', danger: true }))) return;
      try { await SP.post(`/api/evt/${id}/cancel`); SP.toast('신청을 취소했어요.'); load(); } catch (er) { SP.fail(er); }
    });
  }
  load();
})();
