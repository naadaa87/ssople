/* 쏘플 클럽 — 등급, 방문 인증, 배지, 기념일 */
(function () {
  const { $, $$, esc, icon } = SP;
  const TIER = { welcome: '웰컴', silver: '실버', gold: '골드' };
  let club = null, spaces = [];

  function passes(s, mine) {
    const ben = s['club.benefits'] || {};
    const sv = s['club.silver'] || 2, gd = s['club.gold'] || 4;
    $$('[data-silver]').forEach((x) => { x.textContent = sv; });
    $$('[data-gold]').forEach((x) => { x.textContent = gd; });
    const card = (k, cls, cond) => `<div class="pass ${cls}${mine === k ? ' me' : ''}">${mine === k ? '<span class="badge ink me-tag">지금 내 등급</span>' : ''}<div class="tier">${TIER[k]}</div><div class="cond">${cond}</div><ul>${(ben[k] || []).map((x) => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul></div>`;
    $('#passes').innerHTML = card('welcome', '', '가입하면 바로') + card('silver', 'silver', `최근 1년 방문 인증 ${sv}번`) + card('gold', 'gold', `최근 1년 방문 인증 ${gd}번`);
    $('#passNote').textContent = '혜택 내용은 운영 상황에 따라 바뀔 수 있어요. 바뀌면 미리 공지할게요.';
  }

  function myBox() {
    const t = club.tier;
    const next = t.tier === 'welcome' ? ['실버', t.silverAt] : t.tier === 'silver' ? ['골드', t.goldAt] : null;
    const pct = next ? Math.min(100, Math.round((t.n / next[1]) * 100)) : 100;
    const today = SP.today();
    const STATUS = { ok: ['ok', '인증 완료'], pending: ['warn', '확인 중'], rejected: ['mute', '확인 안 됨'] };
    $('#myClub').innerHTML = `
      <div class="box">
        <div class="between" style="flex-wrap:wrap;gap:14px">
          <div><div class="muted small">지금 내 등급</div><div class="display" style="font-size:44px;margin-top:4px">${TIER[t.tier]}</div>
            <div class="muted" style="margin-top:6px">최근 1년 방문 인증 <b>${t.n}번</b>${next ? ` · ${next[0]}까지 <b>${t.toNext}번</b> 남았어요` : ' · 가장 높은 등급이에요'}</div></div>
          <button class="btn btn-red" type="button" id="vOpen">${icon('check-c')}방문 인증하기</button>
        </div>
        <div class="progress" style="margin-top:16px" aria-label="다음 등급까지 진행"><i style="width:${pct}%"></i></div>
        ${club.couponNote ? `<div class="callout red" style="margin-top:14px">${icon('gift')}<div class="prewrap">${esc(club.couponNote)}</div></div>` : ''}
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="box"><div class="box-hd"><h2 class="h4">방문 기록</h2></div>
          ${club.visits.length ? `<div class="list-plain">${club.visits.map((v) => `<div><span><b>${esc(v.spaceName)}</b><br><span class="tiny muted">${SP.mdw(v.d)}</span></span><span class="badge ${STATUS[v.status][0]}">${STATUS[v.status][1]}</span></div>`).join('')}</div>` : '<p class="muted small">아직 방문 기록이 없어요. 이용한 뒤 방문 인증을 해 주세요.</p>'}
        </div>
        <div class="box"><div class="box-hd"><h2 class="h4">기념일</h2><button class="btn btn-soft btn-sm" type="button" id="aOpen">${icon('plus', 'sm')}추가</button></div>
          <p class="small muted" style="margin-bottom:8px">30일 전에 알림을 보내 드려요. 미리 방을 잡기 좋아요.</p>
          ${club.annivs.length ? `<div class="list-plain">${club.annivs.map((a) => `<div><span><b>${esc(a.title)}</b><br><span class="tiny muted">${Number(a.md.slice(0, 2))}월 ${Number(a.md.slice(3))}일 · ${a.left === 0 ? '오늘!' : `D-${a.left}`}</span></span><span class="row">${a.left <= 30 ? `<a class="btn btn-line btn-sm" href="/rooms?date=${a.next}">방 찾기</a>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-adel="${a.id}" aria-label="기념일 지우기">${icon('trash', 'sm')}</button></span></div>`).join('')}</div>` : '<p class="muted small">생일, 결혼기념일, 모임 창립일 같은 날을 넣어 보세요.</p>'}
        </div>
      </div>
      <div class="box" style="margin-top:16px"><div class="box-hd"><h2 class="h4">배지</h2><span class="small muted">${club.badges.filter((b) => b.at).length} / ${club.badges.length}</span></div>
        <div class="badges">${club.badges.map((b) => `<div class="bdg${b.at ? ' got' : ''}"><span class="medal">${icon('badge')}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>
      </div>`;
    $('#vOpen').onclick = verify;
    $('#aOpen').onclick = addAnniv;
    $$('[data-adel]').forEach((b) => { b.onclick = async () => { try { await SP.del('/api/me/annivs/' + b.dataset.adel); load(); } catch (e) { SP.fail(e); } }; });
  }

  function verify() {
    const m = SP.modal({
      title: '방문 인증',
      body: `<form id="vf"><div class="field"><label class="label" for="v1">다녀온 지점</label><select class="select" id="v1" name="code">${SP.spaceOptions(spaces, '', '지점을 골라 주세요')}</select></div>
        <div class="field"><label class="label" for="v2">이용한 날</label><input class="input" id="v2" name="d" type="date" max="${SP.today()}" min="${SP.addDays(SP.today(), -365)}"></div>
        <div class="field"><label class="label" for="v3">예약번호</label><input class="input" id="v3" name="resno" maxlength="40" placeholder="네이버 예약 확정 알림에 있는 번호"></div></form>
        <p class="tiny faint" style="margin-top:10px">예약번호 하나는 한 계정에서만 인증돼요. 호스트 예약 기록과 맞으면 바로, 아니면 운영진 확인 후 처리돼요.</p><div class="form-err" id="vErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" id="vGo">인증 요청</button>',
    });
    m.$('#vGo').onclick = async () => {
      const f = SP.formData(m.$('#vf'));
      const err = m.$('#vErr');
      if (!f.code || !f.d || !f.resno) { err.textContent = '지점, 이용한 날, 예약번호를 모두 넣어 주세요.'; err.hidden = false; return; }
      try {
        const r = await SP.post('/api/me/visits', f);
        m.close();
        SP.toast(r.status === 'ok' ? '방문 인증이 완료됐어요!' : '운영진이 확인한 뒤 알려 드릴게요.');
        load();
      } catch (e) { err.textContent = e.message; err.hidden = false; }
    };
  }
  function addAnniv() {
    const m = SP.modal({
      title: '기념일 추가',
      body: `<form id="af"><div class="field"><label class="label" for="a1">이름</label><input class="input" id="a1" name="title" maxlength="20" placeholder="예) 엄마 생신, 결혼기념일"></div>
        <div class="field"><label class="label" for="a2">날짜</label><input class="input" id="a2" name="date" type="date"></div></form><p class="tiny faint">연도는 저장하지 않아요. 매년 그날 30일 전에 알려 드려요.</p>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-ink" id="aGo">추가</button>',
    });
    m.$('#aGo').onclick = async () => {
      const f = SP.formData(m.$('#af'));
      if (!f.title || !f.date) { SP.toast('이름과 날짜를 넣어 주세요.'); return; }
      try { await SP.post('/api/me/annivs', { title: f.title, md: f.date.slice(5) }); m.close(); load(); } catch (e) { SP.fail(e); }
    };
  }

  async function load() {
    const [{ settings: s }, me] = await Promise.all([SP.site(), SP.me(true)]);
    spaces = await SP.spaces().catch(() => []);
    if (!me.user) {
      passes(s || {}, null);
      $('#myClub').innerHTML = `<div class="box fog" style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap"><div><h2 class="h3">가입하면 바로 웰컴 등급이에요</h2><p class="muted" style="margin-top:4px">방문 인증, 배지, 기념일 알림은 로그인하고 쓸 수 있어요.</p></div><div class="row"><a class="btn btn-line" href="/login?next=/membership">로그인</a><a class="btn btn-red" href="/signup?next=/membership">회원 가입</a></div></div>`;
      return;
    }
    try { club = await SP.get('/api/me/club'); } catch (e) { SP.fail(e); return; }
    passes(s || {}, club.tier.tier);
    myBox();
  }
  load();
})();
