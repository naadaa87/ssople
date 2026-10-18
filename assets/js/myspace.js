/* 내 공간 관리 (호스트) — 내 지점 소개·사진·시설·이용 안내 고치기, 지점 소식 */
(function () {
  const { $, $$, esc, icon } = SP;
  const root = $('#hsRoot');
  let spaces = [];
  let me = null;

  async function init() {
    me = await SP.needLogin('호스트 로그인이 필요해요.');
    if (!me) return;
    try { spaces = (await SP.get('/api/host/spaces')).spaces; }
    catch (e) {
      root.innerHTML = `<div class="empty">${icon('key')}<h3>연결된 지점이 없어요</h3><p>${esc(e.message)}</p><a class="btn btn-ink" href="/host">공간 등록 안내 보기</a></div>`;
      return;
    }
    if (!spaces.length) { root.innerHTML = `<div class="empty">${icon('key')}<h3>연결된 지점이 없어요</h3><p>쏘플이 지점을 승인하면 여기에서 관리할 수 있어요.</p><a class="btn btn-ink" href="/host">공간 등록 안내 보기</a></div>`; return; }
    draw();
  }

  const LT = { managed: '쏘플 위탁운영', host: '호스트 운영', direct: '쏘플 직영' };
  const ZN = { premium: '프리미엄존', plus: '플러스존' };
  function draw() {
    root.innerHTML = `<div class="grid g3" id="hsList">${spaces.map((s) => {
      const l = s.listing || {};
      return `<div class="box" style="display:flex;flex-direction:column;gap:8px">
        <div class="row between"><span class="badge ${l.zone === 'premium' ? 'red' : 'mute'}">${ZN[l.zone] || LT[l.type] || '쏘플 위탁운영'}</span><span class="tiny muted">${s.code}</span></div>
        <h2 class="h3">${esc(s.name)}</h2>
        <p class="small muted">${esc(s.addr || `${s.region} ${s.area}`)}${l.until ? ` · 노출 ${esc(l.until)}까지` : ''}</p>
        <p class="small muted">사진 ${(s.photos || []).length}장 · ${s.visible ? '고객 화면 공개 중' : '비공개'}</p>
        <div class="row wrap-ok" style="gap:6px;margin-top:auto">
          <button class="btn btn-red btn-sm" type="button" data-edit="${s.code}">${icon('edit', 'sm')}정보 고치기</button>
          <a class="btn btn-line btn-sm" href="/write?b=host&code=${s.code}">${icon('megaphone', 'sm')}소식 쓰기</a>
          <a class="btn btn-ghost btn-sm" href="/room/${s.code}" target="_blank" rel="noopener">${icon('ext', 'sm')}고객 화면</a>
        </div></div>`;
    }).join('')}</div>
    <div class="box fog" style="margin-top:22px"><h3 class="h4">호스트가 할 수 있는 일</h3><ul class="checks" style="margin-top:8px;font-size:14.5px"><li>소개·지점 공지·태그·사진(12장)·시설·이용 안내 고치기</li><li>지점 소식 글 올리기 (커뮤니티 "지점 소식"과 지점 화면에 보여요)</li><li>호스트 운영 공간이면 요금표와 네이버 예약 주소까지 직접 관리</li></ul><p class="tiny faint" style="margin-top:10px">도어락 번호, 와이파이 비밀번호, 연락처, 계좌번호는 고객 화면에 그대로 보이니 절대 적지 마세요.</p></div>
    <div id="hsPosts" style="margin-top:30px"></div>`;
    $('#hsList').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) edit(spaces.find((s) => s.code === b.dataset.edit)); });
    posts();
  }

  async function posts() {
    const el = $('#hsPosts');
    try {
      const all = [];
      for (const s of spaces.slice(0, 10)) {
        const d = await SP.get(`/api/posts?board=host&code=${s.code}&size=5`);
        all.push(...d.items.map((p) => ({ ...p, spaceName: s.name })));
      }
      all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      el.innerHTML = `<div class="between" style="margin-bottom:10px"><h3 class="h3">내 지점 소식</h3><a class="sec-more" href="/community?b=host">커뮤니티에서 보기</a></div>`
        + (all.length ? `<div>${all.slice(0, 10).map(SP.postRow).join('')}</div>` : `<div class="empty">${icon('megaphone')}<h3>아직 올린 소식이 없어요</h3><p>이달의 꾸밈, 새 장비, 손님께 드리는 안내를 올려 보세요. 사진을 같이 올리면 검색에도 더 잘 잡혀요.</p><a class="btn btn-line btn-sm" href="/write?b=host${spaces.length === 1 ? '&code=' + spaces[0].code : ''}">첫 소식 쓰기</a></div>`);
    } catch { el.innerHTML = ''; }
  }

  function edit(s) {
    const f = s.feat || {}, inf = s.info || {};
    const own = s.listing && s.listing.type === 'host';
    let photos = (s.photos || []).map((p, i) => ({ k: typeof p === 'string' ? p : p.k, url: (s.photoUrls || [])[i] || '' }));
    let pkgs = (s.pkgs || []).map((p) => ({ ...p }));
    const tx = (id, label, v, max, ph = '') => `<div class="field full"><label class="label" for="${id}">${label}</label><textarea class="textarea" id="${id}" maxlength="${max}" style="min-height:76px" placeholder="${esc(ph)}">${esc(v ?? '')}</textarea></div>`;
    const ip = (id, label, v, max, ph = '', type = 'text', cls = '') => `<div class="field ${cls}"><label class="label" for="${id}">${label}</label><input class="input" id="${id}" type="${type}" ${type === 'text' ? `maxlength="${max}"` : ''} value="${esc(v ?? '')}" placeholder="${esc(ph)}"></div>`;
    const ft = (k, label) => `<div class="field"><label class="switch"><input type="checkbox" id="ft_${k}"${f[k] && f[k].on ? ' checked' : ''}><span>${label}</span></label><input class="input input-sm" id="fn_${k}" maxlength="80" value="${esc((f[k] && f[k].note) || '')}" placeholder="설명 (예: 금영 노래방 기계)" style="margin-top:6px"></div>`;
    const ck = (k, label) => `<label class="check"><input type="checkbox" id="fb_${k}"${f[k] ? ' checked' : ''}><span>${label}</span></label>`;
    const m = SP.modal({
      title: `${s.name} 정보 고치기`, wide: true,
      body: `<div class="tabs" id="hsTabs" style="margin-bottom:16px"><button type="button" class="on" data-t="base">소개</button><button type="button" data-t="photo">사진</button><button type="button" data-t="feat">시설</button><button type="button" data-t="info">이용 안내</button>${own ? '<button type="button" data-t="pkg">요금 · 예약 주소</button>' : ''}</div>
      <div data-p="base"><div class="form-grid">
        ${tx('h_intro', '소개', s.intro, 1500, '이 지점만의 분위기와 어울리는 파티를 적어 주세요.')}
        ${tx('h_notice', '지점 공지 (빨간 띠로 보여요)', s.notice, 400, '예) 10월 한 달 동안 엘리베이터 점검이 있어요.')}
        ${ip('h_tags', '태그 (쉼표로 나눠요)', (s.tags || []).join(', '), 200, '생일파티, 브라이덜샤워', 'text', 'full')}
        ${ip('h_addFeeLabel', '인원 추가 요금 (보이는 글)', s.addFeeLabel, 40, '1인당 1만원')}${ip('h_depositLabel', '청소 보증금', s.depositLabel, 30, '8만원')}
        ${ip('h_place', '네이버 지도 주소', s.place, 300, 'https://naver.me/...', 'url', 'full')}
      </div></div>
      <div data-p="photo" hidden><p class="muted small" style="margin-bottom:10px">첫 번째 사진이 대표 사진이에요. 가로 사진이 잘 어울려요. 한 장에 5MB까지, 12장까지.</p><div class="img-pick" id="hsPhotos"></div></div>
      <div data-p="feat" hidden><div class="form-grid">${ft('karaoke', '노래방')}${ft('bbq', '바베큐')}${ft('pet', '애견 동반')}</div>
        <div class="row wrap-ok" style="gap:14px;margin-top:16px">${ck('tv', 'TV')}${ck('console', '게임기')}${ck('projector', '빔프로젝터')}${ck('fridge', '냉장고')}${ck('heating', '난방')}</div>
        <div class="form-grid" style="margin-top:16px">${ip('f_aircon', '에어컨', f.aircon, 60, '스탠드 1대')}${ip('f_cook', '조리', f.cook, 60, '인덕션, 전자레인지')}${ip('f_floor', '층', f.floor, 60, '3층')}${ip('f_toilet', '화장실', f.toilet, 60, '실내 1개')}${ip('f_zones', '특별한 공간 (쉼표)', (f.zones || []).join(', '), 120, '루프탑, 테라스')}${ip('f_games', '보드게임 (쉼표)', (f.games || []).join(', '), 600, '할리갈리, 루미큐브')}</div></div>
      <div data-p="info" hidden><div class="form-grid">${tx('i_size', '평수 · 크기', inf.size, 300, '약 25평')}${tx('i_parking', '주차', inf.parking, 300)}${tx('i_route', '찾아오는 길', inf.route, 300)}${tx('i_noise', '소음 기준', inf.noise, 300)}${tx('i_minors', '미성년자 이용', inf.minors, 300)}${tx('i_sameday', '당일 예약', inf.sameday, 300)}${tx('i_tour', '사전 방문', inf.tour, 300)}</div></div>
      ${own ? `<div data-p="pkg" hidden><p class="muted small" style="margin-bottom:10px">요금은 네이버 예약 화면과 같게 맞춰 주세요. 요일별(월~목·금·토·일) 요금이고, 비우면 그 요일엔 팔지 않는 걸로 보여요.</p>
        ${ip('h_base', '기준 인원', s.base, 0, '', 'number')}${ip('h_max', '최대 인원', s.max, 0, '', 'number')}${ip('h_addFee', '인원 추가 요금 (원, 계산용)', s.addFee, 0, '10000', 'number')}
        ${ip('h_book', '네이버 예약 페이지 (지점 전체 상품)', s.book, 500, 'https://map.naver.com/p/entry/place/...', 'url', 'full')}
        <div id="hsPkgs" style="margin-top:12px"></div><button class="btn btn-soft btn-sm" type="button" id="pkgAdd" style="margin-top:10px">${icon('plus', 'sm')}패키지 추가</button></div>` : ''}
      <div class="form-err" id="hsErr" hidden></div>`,
      foot: `<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="hsSave">저장</button>`,
    });
    const P = (id) => m.$('#' + id);
    m.$('#hsTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; m.$$('#hsTabs button').forEach((x) => x.classList.toggle('on', x === b)); m.$$('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; }); });
    const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
    /* 사진 */
    const drawPhotos = () => {
      P('hsPhotos').innerHTML = photos.map((p, i) => `<div class="pk"><img src="${esc(p.url)}" alt="사진 ${i + 1}"><button type="button" data-rm="${i}" aria-label="빼기">${icon('x', 'sm')}</button>${i ? `<button type="button" data-up="${i}" aria-label="앞으로" style="right:auto;left:4px">${icon('chev-l', 'sm')}</button>` : ''}</div>`).join('')
        + (photos.length < 12 ? `<button type="button" class="add" id="phAdd">${icon('camera')}<br>사진 추가</button>` : '');
    };
    drawPhotos();
    P('hsPhotos').addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rm]'); if (rm) { photos.splice(Number(rm.dataset.rm), 1); drawPhotos(); return; }
      const up = e.target.closest('[data-up]'); if (up) { const i = Number(up.dataset.up); [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]]; drawPhotos(); return; }
      if (e.target.closest('#phAdd')) {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.onchange = async () => {
          for (const file of Array.from(inp.files).slice(0, 12 - photos.length)) {
            try { const r = await SP.upload(file, 2000); photos.push({ k: r.key, url: r.url }); drawPhotos(); } catch (er) { SP.fail(er); }
          }
        };
        inp.click();
      }
    });
    /* 패키지 (호스트 운영 공간만) */
    const drawPkgs = () => {
      const el = P('hsPkgs'); if (!el) return;
      const hm = (min) => min == null ? '' : `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      el.innerHTML = pkgs.map((p, i) => `<div class="box" style="padding:14px;margin-bottom:10px"><div class="form-grid">
        <div class="field"><label class="label">이름</label><input class="input input-sm" data-pk="${i}" data-f="label" value="${esc(p.label || '')}" placeholder="낮 / 밤 / 올데이"></div>
        <div class="field"><label class="label">시간 (시작 ~ 끝)</label><div class="row"><input class="input input-sm" type="time" data-pk="${i}" data-f="s" value="${hm(p.s)}"><span>~</span><input class="input input-sm" type="time" data-pk="${i}" data-f="e" value="${hm(p.e)}"></div></div>
        ${['월~목', '금', '토', '일'].map((d, j) => `<div class="field"><label class="label">${d} 요금(원)</label><input class="input input-sm" type="number" data-pk="${i}" data-f="p${j}" value="${p.p && p.p[j] != null ? p.p[j] : ''}"></div>`).join('')}
        <div class="field full"><label class="label">이 패키지의 네이버 예약 주소</label><input class="input input-sm" data-pk="${i}" data-f="url" value="${esc(p.url || '')}" placeholder="https://booking.naver.com/booking/12/bizes/.../items/..."></div>
        </div><button class="btn btn-ghost btn-sm" type="button" data-pkrm="${i}" style="margin-top:6px">이 패키지 빼기</button></div>`).join('');
    };
    const readPkgs = () => {
      m.$$('[data-pk]').forEach((inp) => {
        const p = pkgs[Number(inp.dataset.pk)]; const k = inp.dataset.f;
        if (k === 's' || k === 'e') { const [h, mi] = inp.value.split(':').map(Number); p[k] = inp.value ? h * 60 + mi : null; }
        else if (/^p\d$/.test(k)) { p.p = p.p || [null, null, null, null]; p.p[Number(k[1])] = inp.value === '' ? null : Number(inp.value); }
        else p[k] = inp.value.trim();
      });
    };
    if (own) {
      drawPkgs();
      P('pkgAdd').onclick = () => { readPkgs(); pkgs.push({ k: 'day', label: '', s: 720, e: 1020, p: [null, null, null, null], url: '' }); drawPkgs(); };
      P('hsPkgs').addEventListener('click', (e) => { const b = e.target.closest('[data-pkrm]'); if (b) { readPkgs(); pkgs.splice(Number(b.dataset.pkrm), 1); drawPkgs(); } });
    }
    P('hsSave').onclick = async () => {
      const err = P('hsErr'); err.hidden = true;
      const body = {
        intro: P('h_intro').value.trim(), notice: P('h_notice').value.trim(), tags: list(P('h_tags').value),
        addFeeLabel: P('h_addFeeLabel').value.trim(), depositLabel: P('h_depositLabel').value.trim(), place: P('h_place').value.trim(),
        photos: photos.map((p) => p.k),
        feat: {
          karaoke: { on: P('ft_karaoke').checked, note: P('fn_karaoke').value.trim() }, bbq: { on: P('ft_bbq').checked, note: P('fn_bbq').value.trim() }, pet: { on: P('ft_pet').checked, note: P('fn_pet').value.trim() },
          tv: P('fb_tv').checked, console: P('fb_console').checked, projector: P('fb_projector').checked, fridge: P('fb_fridge').checked, heating: P('fb_heating').checked,
          aircon: P('f_aircon').value.trim(), cook: P('f_cook').value.trim(), floor: P('f_floor').value.trim(), toilet: P('f_toilet').value.trim(), zones: list(P('f_zones').value), games: list(P('f_games').value),
        },
        info: { size: P('i_size').value.trim(), parking: P('i_parking').value.trim(), route: P('i_route').value.trim(), noise: P('i_noise').value.trim(), minors: P('i_minors').value.trim(), sameday: P('i_sameday').value.trim(), tour: P('i_tour').value.trim() },
      };
      if (own) {
        readPkgs();
        if (pkgs.some((p) => p.s == null || p.e == null)) { err.textContent = '패키지 시작·끝 시각을 넣어 주세요.'; err.hidden = false; return; }
        Object.assign(body, { base: P('h_base').value, max: P('h_max').value, addFee: P('h_addFee').value, book: P('h_book').value.trim(), pkgs: pkgs.map((p) => ({ k: p.k || 'day', label: p.label, s: p.s, e: p.e, p: p.p, url: p.url })) });
      }
      const btn = P('hsSave'); SP.busy(btn, true, '저장하는 중');
      try {
        await SP.put('/api/host/spaces/' + s.code, body);
        m.close(); SP.toast('저장했어요. 고객 화면에는 1분 안에 바뀌어요.');
        spaces = (await SP.get('/api/host/spaces')).spaces; draw();
      } catch (e) { err.textContent = e.message; err.hidden = false; SP.busy(btn, false); }
    };
  }

  init().catch((e) => console.error(e));
})();
