/* 온라인 파티룸 개선 요청 게시판 */
(function () {
  'use strict';
  const { esc } = SP;
  const $ = (s) => document.querySelector(s);
  const ST = { new: '접수', review: '검토 중', planned: '반영 예정', doing: '만드는 중', done: '반영 완료', hold: '보류' };
  const CATS = { feature: '새 기능', game: '게임', deco: '꾸미기·아이템', pet: '펫', bug: '오류 신고', etc: '기타' };
  const F = { sort: 'new', status: '', cat: '', q: '', page: 1 };
  let ME = null;
  const listBox = $('#rqList'); const statBox = $('#rqStats'); const pager = $('#rqPager');
  const nickKey = 'sp.rqnick';
  const savedNick = () => { try { return localStorage.getItem(nickKey) || ''; } catch { return ''; } };
  const saveNick = (n) => { try { localStorage.setItem(nickKey, n); } catch { /* 무시 */ } };

  async function load() {
    const q = new URLSearchParams({ sort: F.sort, page: String(F.page) });
    if (F.status) q.set('status', F.status);
    if (F.cat) q.set('cat', F.cat);
    if (F.q) q.set('q', F.q);
    listBox.innerHTML = '<div class="lv-empty">불러오는 중이에요…</div>';
    let d;
    try { d = await SP.get('/api/live/requests?' + q); } catch (e) { listBox.innerHTML = `<div class="lv-empty">${esc(e.message)}</div>`; return; }
    ME = d.me;
    if (d.notice) { const n = $('#rqNotice'); n.hidden = false; n.textContent = d.notice; }
    const total = Object.values(d.counts || {}).reduce((a, b) => a + b, 0);
    statBox.innerHTML = [['', '전체', total], ...Object.entries(ST).map(([k, l]) => [k, l, d.counts[k] || 0])]
      .map(([k, l, n]) => `<button type="button" class="rq-stat${F.status === k ? ' on' : ''}" data-st="${k}"><small>${l}</small><b>${n}</b></button>`).join('');
    listBox.innerHTML = d.list.length ? d.list.map(item).join('') : `<div class="lv-empty">${F.q || F.status || F.cat ? '조건에 맞는 요청이 없어요.' : '아직 올라온 요청이 없어요. 첫 의견을 남겨 주세요!'}</div>`;
    pager.innerHTML = d.pages > 1 ? Array.from({ length: d.pages }, (_, i) => `<button type="button" class="btn btn-sm ${i + 1 === d.page ? 'btn-ink' : 'btn-line'}" data-pg="${i + 1}">${i + 1}</button>`).join('') : '';
  }

  function item(r) {
    return `<article class="rq-item${r.pinned ? ' pinned' : ''}" data-id="${r.id}">
      <button type="button" class="rq-vote${r.voted ? ' on' : ''}" data-vote="${r.id}" aria-label="공감하기"><span>▲</span>${r.votes}<small>공감</small></button>
      <div class="rq-main" data-open="${r.id}">
        <div class="rq-meta">${r.pinned ? '<span class="lv-st st-doing">고정</span>' : ''}<span class="lv-st st-${esc(r.status)}">${esc(r.statusLabel)}</span><span>${esc(r.catLabel)}</span><span>${esc(r.nick)}</span><span>${SP.ago(r.at)}</span>${r.cmts ? `<span>댓글 ${r.cmts}</span>` : ''}</div>
        <h3>${esc(r.title)}</h3><p>${esc(r.excerpt)}</p>
        ${r.reply ? `<div class="rq-reply"><b>운영팀</b>${esc(r.reply.length > 90 ? r.reply.slice(0, 90) + '…' : r.reply)}</div>` : ''}
      </div></article>`;
  }

  async function vote(id, btn) {
    try {
      const d = await SP.post(`/api/live/requests/${id}/vote`);
      btn.classList.toggle('on', d.voted);
      btn.innerHTML = `<span>▲</span>${d.votes}<small>공감</small>`;
    } catch (e) { SP.fail(e); }
  }

  async function open(id) {
    let d;
    try { d = await SP.get('/api/live/requests/' + id); } catch (e) { SP.fail(e); return; }
    const r = d.item;
    SP.setQs({ id: String(id) });
    const m = SP.modal({
      title: '개선 요청', wide: true,
      body: `<div class="rq-detail"><div class="rq-meta"><span class="lv-st st-${esc(r.status)}">${esc(r.statusLabel)}</span><span>${esc(r.catLabel)}</span><span>${esc(r.nick)}</span><span>${SP.ago(r.at)}</span></div>
        <h3 class="h3" style="margin-top:8px">${esc(r.title)}</h3><div class="rq-body">${esc(r.body)}</div>
        ${r.reply ? `<div class="rq-reply"><b>운영팀 답변</b>${esc(r.reply)}</div>` : ''}
        <div class="row" style="gap:8px;margin-top:12px"><button class="btn btn-line btn-sm" type="button" data-v>${r.voted ? '공감 취소' : '▲ 공감해요'} · ${r.votes}</button>${r.mine ? '<button class="btn btn-soft btn-sm" type="button" data-del>내 글 지우기</button>' : ''}<button class="btn btn-soft btn-sm" type="button" data-share>링크 복사</button></div>
        <h4 class="h4" style="margin-top:18px">댓글 ${d.cmts.length}</h4>
        <div class="rq-cmts">${d.cmts.map((c) => `<div class="rq-cmt${c.admin ? ' admin' : ''}"><b>${esc(c.nick)}</b>${esc(c.body)}<time>${SP.ago(c.at)}</time></div>`).join('') || '<p class="small muted">아직 댓글이 없어요.</p>'}</div>
        <form class="stack" data-cmt style="margin-top:12px;gap:8px">${ME ? '' : `<input class="input" name="nick" maxlength="10" placeholder="이름 (2~10자)" value="${esc(savedNick())}">`}<textarea class="textarea" name="body" maxlength="500" placeholder="같은 생각이라면 의견을 보태 주세요" style="min-height:70px"></textarea><button class="btn btn-ink" type="submit">댓글 달기</button></form></div>`,
      onClose: () => SP.setQs({ id: '' }),
    });
    m.$('[data-v]').onclick = async () => { await vote(id, document.createElement('button')); m.close(); open(id); load(); };
    m.$('[data-share]').onclick = () => SP.copy(location.origin + '/live/requests?id=' + id, '링크를 복사했어요.');
    const del = m.$('[data-del]');
    if (del) del.onclick = async () => { if (!(await SP.confirm('이 요청을 지울까요?', { ok: '지우기', danger: true }))) return; try { await SP.post(`/api/live/requests/${id}/delete`); m.close(); load(); } catch (e) { SP.fail(e); } };
    m.$('[data-cmt]').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target; const btn = f.querySelector('button');
      const body = f.body.value.trim(); const nick = f.nick ? f.nick.value.trim() : '';
      if (body.length < 2) { SP.toast('댓글을 조금 더 써 주세요.', true); return; }
      SP.busy(btn, true, '올리는 중…');
      try { await SP.post(`/api/live/requests/${id}/comments`, { body, nick }); if (nick) saveNick(nick); m.close(); open(id); load(); } catch (er) { SP.fail(er); }
      SP.busy(btn, false);
    };
  }

  function write() {
    const m = SP.modal({
      title: '개선 요청 남기기', wide: true,
      body: `<form class="form-grid" data-w>
        <div class="field full"><span class="label">어떤 이야기인가요?</span><div class="chips" data-cats>${Object.entries(CATS).map(([k, l], i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-c="${k}">${l}</button>`).join('')}</div></div>
        <div class="field full"><label class="label" for="rqT">제목</label><input class="input" id="rqT" name="title" maxlength="60" placeholder="예) 펫이랑 같이 하는 미니게임이 더 있었으면 좋겠어요"></div>
        <div class="field full"><label class="label" for="rqB">내용</label><textarea class="textarea" id="rqB" name="body" maxlength="2000" style="min-height:150px" placeholder="어떤 상황에서 필요했는지, 어떻게 되면 좋겠는지 적어 주시면 반영할 때 큰 도움이 돼요. 오류라면 쓰던 기기와 브라우저도 알려 주세요."></textarea></div>
        ${ME ? `<p class="small muted full">${esc(ME.nick)} 이름으로 올라가요. 진행 상황이 바뀌면 알림으로 알려 드려요.</p>` : `<div class="field full"><label class="label" for="rqN">이름</label><input class="input" id="rqN" name="nick" maxlength="10" placeholder="게시판에 보일 이름" value="${esc(savedNick())}"><p class="small muted" style="margin-top:6px">로그인하고 쓰면 진행 상황을 알림으로 받아 볼 수 있어요. <a class="link" href="/login?next=${encodeURIComponent('/live/requests?write=1')}">로그인</a></p></div>`}
        <p class="small muted full">개인정보(전화번호·주소)는 적지 말아 주세요. 욕설이나 광고는 운영정책에 따라 숨겨질 수 있어요.</p>
      </form>`,
      foot: '<button class="btn btn-soft" data-x>취소</button><button class="btn btn-red" type="button" data-go>올리기</button>',
    });
    let cat = 'feature';
    m.$('[data-cats]').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; m.$$('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); };
    m.$('[data-go]').onclick = async (e) => {
      const f = m.$('[data-w]'); const btn = e.currentTarget;
      const title = f.title.value.trim(); const body = f.body.value.trim(); const nick = f.nick ? f.nick.value.trim() : '';
      if (title.length < 4) { SP.toast('제목을 4자 이상 써 주세요.', true); return; }
      if (body.length < 10) { SP.toast('내용을 10자 이상 써 주세요.', true); return; }
      if (f.nick && nick.length < 2) { SP.toast('이름을 2자 이상 써 주세요.', true); return; }
      SP.busy(btn, true, '올리는 중…');
      try { const d = await SP.post('/api/live/requests', { cat, title, body, nick }); if (nick) saveNick(nick); m.close(); SP.toast('요청을 남겼어요. 고마워요!'); F.sort = 'new'; F.status = ''; F.page = 1; await load(); if (d.id) open(d.id); } catch (er) { SP.fail(er); }
      SP.busy(btn, false);
    };
  }

  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-vote]'); if (v) { vote(v.dataset.vote, v); return; }
    const o = e.target.closest('[data-open]'); if (o) { open(o.dataset.open); return; }
    const s = e.target.closest('[data-st]'); if (s) { F.status = s.dataset.st; F.page = 1; load(); return; }
    const p = e.target.closest('[data-pg]'); if (p) { F.page = Number(p.dataset.pg); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (e.target.closest('[data-write]')) write();
  });
  $('#rqSort').addEventListener('change', (e) => { F.sort = e.target.value; F.page = 1; load(); });
  $('#rqCat').addEventListener('change', (e) => { F.cat = e.target.value; F.page = 1; load(); });
  $('#rqQ').addEventListener('input', SP.debounce((e) => { F.q = e.target.value.trim(); F.page = 1; load(); }, 350));

  load().then(() => {
    const qs = SP.qs();
    if (qs.id) open(Number(qs.id));
    else if (qs.write) write();
  });
})();
