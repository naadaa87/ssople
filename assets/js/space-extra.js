/* 지점 부가 정보 — 비품(세부 물품) 목록, SNS·네이버 후기 연결
   호스트 화면(내 공간 관리)·관리자 화면에서는 편집기로, 지점 화면에서는 보기용으로 쓴다. */
(function () {
  const { esc, icon } = SP;
  const CATS = [
    ['kitchen', '주방·식기', 'pot'], ['furniture', '가구·좌석', 'home'], ['av', '영상·음향', 'tv'], ['party', '파티·꾸미기', 'sparkle'],
    ['play', '놀이·게임', 'dice'], ['living', '생활·위생', 'check-c'], ['etc', '기타', 'list'],
  ];
  const CAT = Object.fromEntries(CATS.map(([k, l, ic]) => [k, { l, ic }]));
  /* 자주 쓰는 물품 — 눌러서 바로 넣기 */
  const PRESETS = {
    kitchen: ['접시', '앞접시', '컵', '종이컵', '와인잔', '맥주잔', '수저 세트', '젓가락', '포크', '나이프', '냄비', '프라이팬', '국자', '가위', '집게', '도마', '칼', '쟁반', '전자레인지', '전기포트', '에어프라이어', '얼음틀', '키친타월'],
    furniture: ['의자', '소파', '테이블', '좌식 테이블', '빈백', '방석', '쿠션', '접이식 매트리스', '담요', '행거'],
    av: ['TV', '빔프로젝터', '스크린', '블루투스 스피커', '노래방 마이크', 'HDMI 케이블', '멀티탭', '무드등', '미러볼'],
    party: ['풍선 펌프', '가랜드', '생일 초', '케이크 칼', '포토존 배경', '고깔모자', '벽 손상 없는 테이프'],
    play: ['보드게임', '닌텐도 스위치', '플레이스테이션', '게임 컨트롤러', '화투', '트럼프카드', '다트'],
    living: ['화장지', '물티슈', '핸드워시', '헤어드라이어', '고데기', '휴대폰 충전기', '구급상자', '쓰레기봉투', '분리수거함', '선풍기', '가습기'],
    etc: [],
  };
  const guessCat = (n) => {
    for (const [k, list] of Object.entries(PRESETS)) if (list.some((x) => x === n || n.includes(x) || x.includes(n))) return k;
    if (/잔|컵|접시|그릇|수저|포크|칼|냄비|팬|레인지|포트|커피/.test(n)) return 'kitchen';
    if (/의자|소파|테이블|매트|방석|쿠션|담요|이불/.test(n)) return 'furniture';
    if (/TV|티비|빔|스피커|마이크|케이블|조명|등/.test(n)) return 'av';
    if (/풍선|가랜드|초|파티|꾸미|포토/.test(n)) return 'party';
    if (/게임|카드|화투|다트|보드/.test(n)) return 'play';
    if (/휴지|화장지|티슈|드라이|충전|구급|쓰레기|분리|선풍기|가습/.test(n)) return 'living';
    return 'etc';
  };
  /** "접시 20", "와인잔 x 12 (깨지기 쉬워요)" → {n, q, m} */
  const parseLine = (line) => {
    const t = line.trim().replace(/^[-·•*]\s*/, '');
    if (!t) return null;
    const m = t.match(/^(.+?)\s*[x×:]?\s*(\d{1,4})\s*(?:개|장|대|세트|벌|켤레|인분|EA|ea)?\s*(?:[(\[]?(.*?)[)\]]?)?$/);
    if (m) return { n: m[1].trim().slice(0, 24), q: Number(m[2]), m: (m[3] || '').trim().slice(0, 40) };
    return { n: t.slice(0, 24), q: null, m: '' };
  };

  /* ---------------- 비품 편집기 ---------------- */
  SP.itemsEditor = (host, initial) => {
    let items = (initial || []).map((x) => ({ c: CAT[x.c] ? x.c : 'etc', n: x.n, q: x.q == null ? null : Number(x.q), m: x.m || '' }));
    let cat = 'kitchen';
    const has = (c, n) => items.some((x) => x.c === c && x.n === n);
    function draw() {
      const groups = CATS.map(([k, l]) => [k, l, items.map((x, i) => ({ ...x, i })).filter((x) => x.c === k)]).filter((g) => g[2].length);
      host.innerHTML = `
        <p class="small muted" style="margin-bottom:12px">손님이 지점 화면에서 보는 물품 목록이에요. 자주 쓰는 물품은 눌러서 바로 넣고, 수량은 + − 로 맞춰요. 꼭 맞을 필요는 없지만, 손님이 챙겨 올지 말지 정하는 데 큰 도움이 돼요.</p>
        <div class="ie-cats" role="tablist">${CATS.map(([k, l]) => `<button type="button" class="chip${k === cat ? ' on' : ''}" data-cat="${k}">${esc(l)} <span class="n">${items.filter((x) => x.c === k).length}</span></button>`).join('')}</div>
        <div class="ie-presets">${(PRESETS[cat] || []).map((n) => `<button type="button" class="ie-pre${has(cat, n) ? ' on' : ''}" data-pre="${esc(n)}">${has(cat, n) ? icon('check', 'sm') : icon('plus', 'sm')}${esc(n)}</button>`).join('') || '<span class="small muted">기타 물품은 아래에서 직접 적어 주세요.</span>'}</div>
        <form class="ie-add" data-add><input class="input input-sm" name="n" maxlength="24" placeholder="직접 추가 — 물품 이름" aria-label="물품 이름"><input class="input input-sm" name="q" type="number" min="0" max="9999" placeholder="수량" aria-label="수량" style="width:84px"><button class="btn btn-ink btn-sm" type="submit">${CAT[cat].l}에 추가</button></form>
        ${groups.length ? groups.map(([k, l, list]) => `<div class="ie-group"><h4>${icon(CAT[k].ic, 'sm')}${esc(l)} <span class="muted">${list.length}</span></h4>
          ${list.map((x) => `<div class="ie-row" data-i="${x.i}">
            <input class="input input-sm ie-n" value="${esc(x.n)}" maxlength="24" aria-label="물품 이름">
            <div class="ie-q"><button type="button" data-d="-1" aria-label="${esc(x.n)} 하나 빼기">−</button><input type="number" min="0" max="9999" value="${x.q == null ? '' : x.q}" placeholder="-" aria-label="${esc(x.n)} 수량"><button type="button" data-d="1" aria-label="${esc(x.n)} 하나 더하기">+</button></div>
            <input class="input input-sm ie-m" value="${esc(x.m || '')}" maxlength="40" placeholder="메모 (선택)" aria-label="${esc(x.n)} 메모">
            <button type="button" class="ibtn" data-del aria-label="${esc(x.n)} 빼기">${icon('trash', 'sm')}</button></div>`).join('')}</div>`).join('')
        : '<div class="empty" style="padding:22px">아직 적은 물품이 없어요. 위의 자주 쓰는 물품을 눌러 시작해 보세요.</div>'}
        <details class="ie-bulk"><summary class="btn btn-soft btn-sm">${icon('list', 'sm')}여러 줄 한 번에 붙여 넣기</summary>
          <p class="tiny muted" style="margin:8px 0">한 줄에 하나씩 "이름 수량" 으로 적어요. 예) 접시 30 / 와인잔 12 (깨지기 쉬워요) / 의자 20개. 종류는 이름을 보고 알아서 나눠요.</p>
          <textarea class="textarea" data-bulk style="min-height:110px" placeholder="접시 30&#10;와인잔 12&#10;의자 20개"></textarea>
          <button class="btn btn-ink btn-sm" type="button" data-bulkgo style="margin-top:8px">목록에 넣기</button></details>`;
    }
    const sync = () => {
      host.querySelectorAll('.ie-row').forEach((row) => {
        const x = items[Number(row.dataset.i)];
        if (!x) return;
        x.n = row.querySelector('.ie-n').value.trim();
        const qv = row.querySelector('.ie-q input').value;
        x.q = qv === '' ? null : Math.max(0, Math.min(9999, Number(qv) || 0));
        x.m = row.querySelector('.ie-m').value.trim();
      });
    };
    host.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cat]');
      if (c) { sync(); cat = c.dataset.cat; draw(); return; }
      const pre = e.target.closest('[data-pre]');
      if (pre) {
        sync();
        const n = pre.dataset.pre;
        const i = items.findIndex((x) => x.c === cat && x.n === n);
        if (i >= 0) items.splice(i, 1); else items.push({ c: cat, n, q: null, m: '' });
        draw();
        if (i < 0) { const rows = host.querySelectorAll('.ie-row'); const last = [...rows].find((r) => items[Number(r.dataset.i)].n === n && items[Number(r.dataset.i)].c === cat); if (last) last.querySelector('.ie-q input').focus(); }
        return;
      }
      const d = e.target.closest('.ie-q [data-d]');
      if (d) {
        const inp = d.parentElement.querySelector('input');
        inp.value = Math.max(0, Math.min(9999, (Number(inp.value) || 0) + Number(d.dataset.d)));
        sync();
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) { sync(); items.splice(Number(del.closest('.ie-row').dataset.i), 1); draw(); return; }
      if (e.target.closest('[data-bulkgo]')) {
        sync();
        const lines = host.querySelector('[data-bulk]').value.split('\n').map(parseLine).filter(Boolean);
        let added = 0;
        for (const it of lines) {
          const c = guessCat(it.n);
          const ex = items.find((x) => x.n === it.n);
          if (ex) { if (it.q != null) ex.q = it.q; if (it.m) ex.m = it.m; } else { items.push({ c, ...it }); added++; }
        }
        draw();
        SP.toast(`${lines.length}줄을 읽어서 ${added}개를 새로 넣었어요.`);
      }
    });
    host.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-add]');
      if (!f) return;
      e.preventDefault();
      sync();
      const n = f.n.value.trim();
      if (!n) return;
      if (has(cat, n)) { SP.toast('이미 있는 물품이에요.'); return; }
      items.push({ c: cat, n: n.slice(0, 24), q: f.q.value === '' ? null : Number(f.q.value), m: '' });
      draw();
      host.querySelector('[data-add] input').focus();
    });
    draw();
    return { read() { sync(); return items.filter((x) => x.n).slice(0, 150); }, count: () => items.length };
  };

  /* ---------------- 비품 보기 (지점 화면) ---------------- */
  SP.itemsView = (items) => {
    const list = items || [];
    if (!list.length) return '';
    return `<div class="items-view">${CATS.map(([k, l]) => {
      const g = list.filter((x) => (CAT[x.c] ? x.c : 'etc') === k);
      if (!g.length) return '';
      return `<div class="iv-group"><h3>${icon(CAT[k].ic, 'sm')}${esc(l)}</h3><ul>${g.map((x) => `<li${x.m ? ` title="${esc(x.m)}"` : ''}><span>${esc(x.n)}</span>${x.q != null ? `<b>${x.q}</b>` : ''}${x.m ? `<small>${esc(x.m)}</small>` : ''}</li>`).join('')}</ul></div>`;
    }).join('')}</div>`;
  };

  /* ---------------- SNS·네이버 후기 ---------------- */
  const placeId = (s) => {
    const src = [s.social && s.social.naver, s.book, s.place].filter(Boolean).join(' ');
    const m = src.match(/place\/(\d{5,})/);
    return m ? m[1] : '';
  };
  const kindOf = (u) => {
    let h = '';
    try { h = new URL(u).hostname; } catch { return 'link'; }
    if (/instagram\.com$/.test(h)) return 'insta';
    if (/youtube\.com$|youtu\.be$/.test(h)) return 'youtube';
    if (/blog\.naver\.com$/.test(h)) return 'blog';
    if (/cafe\.naver\.com$/.test(h)) return 'cafe';
    return 'naver';
  };
  const KIND = { insta: ['인스타그램', 'instagram'], youtube: ['유튜브', 'play'], blog: ['네이버 블로그', 'edit'], cafe: ['네이버 카페', 'chat'], naver: ['네이버', 'ext'], link: ['링크', 'link'] };
  const instaCode = (u) => (String(u).match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]{5,})/) || []);

  SP.socialView = (s, settings) => {
    const so = s.social || {};
    const pid = placeId(s);
    const q = encodeURIComponent(`쏘플파티룸 ${s.name}`);
    const btns = [];
    if (pid) {
      btns.push([`https://m.place.naver.com/place/${pid}/review/visitor`, 'naver', '네이버 방문자 리뷰', '예약한 손님이 남긴 리뷰']);
      btns.push([`https://m.place.naver.com/place/${pid}/review/ugc`, 'blog', '네이버 블로그 리뷰', '블로그에 올라온 이용 후기']);
    } else {
      btns.push([`https://search.naver.com/search.naver?where=blog&query=${q}`, 'blog', '네이버 블로그 후기 찾기', '"쏘플파티룸 ' + s.name + '" 검색 결과']);
    }
    const tag = so.tag || '쏘플파티룸';
    btns.push([`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`, 'insta', `인스타그램 #${tag}`, '태그된 사진 보기 (인스타그램 앱에서 열려요)']);
    const ig = settings && settings['sns.instagram'];
    if (ig) btns.push([ig, 'insta', '쏘플파티룸 인스타그램', '공식 계정의 지점 사진·이벤트']);
    const links = (so.links || []).slice(0, 8);
    return `<div class="social-btns">${btns.map(([u, k, t, sub]) => `<a class="sb sb-${k}" href="${esc(u)}" target="_blank" rel="noopener" data-track="${s.code}|social|${k}">${icon(KIND[k][1], 'sm')}<span><b>${esc(t)}</b><small>${esc(sub)}</small></span>${icon('ext', 'sm')}</a>`).join('')}</div>
      ${links.length ? `<h3 class="h4" style="margin:18px 0 10px">호스트가 고른 후기·사진</h3><div class="social-picks">${links.map((l, i) => {
        const k = kindOf(l.u); const ic = instaCode(l.u);
        return `<div class="sp-card"><a href="${esc(l.u)}" target="_blank" rel="noopener"><span class="badge mute">${icon(KIND[k][1], 'sm')}${KIND[k][0]}</span><b>${esc(l.t || (k === 'insta' ? '인스타그램 게시물' : k === 'blog' ? '블로그 후기' : '후기 보기'))}</b></a>${ic[2] ? `<button type="button" class="btn btn-soft btn-sm" data-embed="${esc(ic[1])}/${esc(ic[2])}" data-emb="${i}">여기서 보기</button>` : ''}<div class="sp-embed" id="spEmbed${i}"></div></div>`;
      }).join('')}</div>` : ''}
      <p class="tiny faint" style="margin-top:12px">네이버·인스타그램에 올라온 글은 작성자의 개인 의견이에요. 쏘플이 고치거나 대신 쓰지 않아요.</p>`;
  };
  // 인스타그램 게시물은 누를 때만 불러와요 (처음 화면이 무거워지지 않게)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-embed]');
    if (!b) return;
    const box = document.getElementById('spEmbed' + b.dataset.emb);
    if (!box) return;
    if (box.firstChild) { box.innerHTML = ''; b.textContent = '여기서 보기'; return; }
    const [kind, code] = b.dataset.embed.split('/');
    box.innerHTML = `<iframe src="https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${encodeURIComponent(code)}/embed/captioned/" loading="lazy" title="인스타그램 게시물" allowtransparency="true" scrolling="no"></iframe>`;
    b.textContent = '접기';
  });

  /* ---------------- SNS 연결 편집기 ---------------- */
  SP.socialEditor = (host, initial) => {
    const so = initial || {};
    let links = (so.links || []).map((l) => ({ ...l }));
    function draw() {
      host.innerHTML = `<p class="small muted" style="margin-bottom:12px">지점 화면의 "네이버·인스타그램 후기"에 보여요. 네이버 리뷰 버튼은 네이버 예약·지도 주소에서 자동으로 만들어요. 손님이 쓴 좋은 후기 글이나 인스타그램 게시물 주소를 골라 넣어 주세요(8개까지).</p>
        <div class="form-grid">
          <div class="field"><label class="label" for="soTag">인스타그램 해시태그</label><input class="input" id="soTag" maxlength="30" value="${esc(so.tag || '')}" placeholder="예) 쏘플신촌레스텔 (#는 빼고)"></div>
          <div class="field"><label class="label" for="soNaver">네이버 플레이스 주소 <span class="opt">선택</span></label><input class="input" id="soNaver" type="url" value="${esc(so.naver || '')}" placeholder="https://map.naver.com/p/entry/place/…"></div>
        </div>
        <div class="so-links">${links.map((l, i) => `<div class="so-row" data-i="${i}"><input class="input input-sm" data-k="u" type="url" value="${esc(l.u)}" placeholder="https://blog.naver.com/… 또는 https://www.instagram.com/p/…" aria-label="후기 주소 ${i + 1}"><input class="input input-sm" data-k="t" maxlength="60" value="${esc(l.t || '')}" placeholder="한 줄 제목 (예: 브라이덜 샤워 후기)" aria-label="후기 제목 ${i + 1}"><button type="button" class="ibtn" data-rm="${i}" aria-label="빼기">${icon('trash', 'sm')}</button></div>`).join('')}</div>
        ${links.length < 8 ? `<button class="btn btn-soft btn-sm" type="button" data-addlink style="margin-top:8px">${icon('plus', 'sm')}후기 주소 추가</button>` : ''}
        <p class="tiny faint" style="margin-top:10px">네이버 블로그·카페·플레이스, 인스타그램, 유튜브 주소만 넣을 수 있어요. 직접 쓴 홍보 글은 "지점 소식"에 올려 주세요.</p>`;
    }
    const sync = () => host.querySelectorAll('.so-row').forEach((r) => { const l = links[Number(r.dataset.i)]; l.u = r.querySelector('[data-k="u"]').value.trim(); l.t = r.querySelector('[data-k="t"]').value.trim(); });
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-addlink]')) { sync(); links.push({ u: '', t: '' }); draw(); const rows = host.querySelectorAll('.so-row [data-k="u"]'); if (rows.length) rows[rows.length - 1].focus(); return; }
      const rm = e.target.closest('[data-rm]');
      if (rm) { sync(); links.splice(Number(rm.dataset.rm), 1); draw(); }
    });
    draw();
    return { read() { sync(); return { tag: host.querySelector('#soTag').value.trim().replace(/^#/, ''), naver: host.querySelector('#soNaver').value.trim(), links: links.filter((l) => l.u) }; } };
  };
  SP.ITEM_CATS = CAT;

  /* ---------------- 요금 · 예약 방식 편집기 (호스트 신청서 · 내 공간 관리 · 관리자 지점 편집 공용) ---------------- */
  const COLS = ['월~목', '금', '토', '일'];
  const PK = [['day', '낮'], ['night', '밤'], ['allday', '올데이'], ['tonight', '투나잇'], ['morning', '오전'], ['hour3', '3시간'], ['full', '풀패키지']];
  const hm = (min) => (min == null || min === '' ? '' : `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
  const t2m = (v) => { if (!v) return null; const [h, mi] = v.split(':').map(Number); return h * 60 + (mi || 0); };
  const num = (v) => (v === '' || v == null ? '' : v);
  SP.WAY_DEFS = [
    ['naver', '네이버 예약', '네이버 예약(스마트플레이스) 상품이나 예약 페이지 주소', 'https://booking.naver.com/booking/12/bizes/…', 'url'],
    ['phone', '전화 예약', '손님이 바로 거는 전화번호 — 손님 화면에 그대로 보여요', '010-0000-0000', 'tel'],
    ['kakao', '카카오톡 채널', '카카오톡 채널(pf.kakao.com) 또는 오픈채팅 주소', 'https://pf.kakao.com/_xxxx/chat', 'url'],
    ['talk', '네이버 톡톡', '네이버 톡톡 주소 (talk.naver.com)', 'https://talk.naver.com/…', 'url'],
    ['insta', '인스타그램 DM', '인스타그램 계정 주소 (instagram.com/계정)', 'https://instagram.com/…', 'url'],
    ['sms', '문자 예약', '문자를 받을 번호 — 손님 화면에 그대로 보여요', '010-0000-0000', 'tel'],
    ['link', '다른 예약 링크', '스페이스클라우드·아워플레이스·자체 홈페이지 같은 예약 페이지 주소 (https://)', 'https://', 'url'],
    ['form', '쏘플 문의로 예약 요청', '손님이 지점 화면 「지점에 물어보기」에 남기면 호스트가 답해요. 번호가 필요 없어요', '', ''],
  ];
  /** 요금 — 시간제 / 패키지 / 둘 다. read() → { hourly, pkgs } (패키지 시각이 비면 오류) */
  SP.priceEditor = (host, s = {}, { hourOnly = false } = {}) => {
    let mode = hourOnly ? (s.hourly ? 'hour' : 'off') : s.hourly && (s.pkgs || []).length ? 'both' : s.hourly ? 'hour' : (s.pkgs || []).length ? 'pkg' : '';
    const h = s.hourly || { min: 2, open: 600, close: 1440, p: [null, null, null, null], note: '' };
    const pkgs = (s.pkgs || []).map((p) => ({ ...p, p: (p.p || [null, null, null, null]).slice() }));
    host.innerHTML = `<div class="field full"><span class="label">${hourOnly ? '시간제 요금' : '요금 방식'}</span><div class="chips" style="margin-top:6px">
        ${hourOnly ? '<button type="button" class="chip" data-mode="off">시간제 안 씀</button><button type="button" class="chip" data-mode="hour">시간제 씀</button>' : '<button type="button" class="chip" data-mode="hour">시간제</button><button type="button" class="chip" data-mode="pkg">패키지</button><button type="button" class="chip" data-mode="both">시간제 + 패키지</button>'}</div>
        <p class="help">${hourOnly ? '패키지 요금은 「패키지 · 요금」 탭에서 고쳐요. ' : ''}시간제는 "1시간에 얼마, 최소 몇 시간"으로, 패키지는 "낮 12~17시 8만원"처럼 묶어서 팔 때 써요. 둘 다 쓰면 손님 화면에 두 표가 같이 보여요.</p></div>
      <p class="small muted" data-none>요금 방식을 골라 주세요.</p>
      <div data-hour hidden><h3 class="h4" style="margin:10px 0 8px">시간제 요금</h3><div class="form-grid">
        <div class="field"><label class="label">최소 이용 시간</label><input class="input" type="number" min="1" max="24" data-h="min" value="${h.min}"></div>
        <div class="field"><label class="label">운영 시간 (시작 ~ 끝)</label><div class="row"><input class="input" type="time" data-h="open" value="${hm(h.open)}"><span>~</span><input class="input" type="time" data-h="close" value="${hm(h.close)}"></div><p class="help">끝이 시작보다 이르면 다음 날로 계산해요. 24시간이면 00:00 ~ 00:00</p></div>
        ${COLS.map((d, j) => `<div class="field"><label class="label">${d} · 1시간 (원)</label><input class="input" type="number" min="0" step="1000" data-h="p${j}" value="${num(h.p[j])}" placeholder="20000"></div>`).join('')}
        <div class="field full"><label class="label">안내 한 줄 <span class="opt">선택</span></label><input class="input" data-h="note" maxlength="120" value="${esc(h.note || '')}" placeholder="예) 2시간부터, 30분 단위 연장 가능"></div>
      </div></div>
      <div data-pkg hidden><h3 class="h4" style="margin:16px 0 8px">패키지 요금</h3><p class="small muted" style="margin-bottom:8px">요일별(월~목·금·토·일) 요금이고, 비우면 그 요일엔 팔지 않는 걸로 보여요. 끝 시각이 시작보다 이르면 다음 날로 계산해요.</p><div data-pkgs></div><button class="btn btn-soft btn-sm" type="button" data-pkadd style="margin-top:10px">${icon('plus', 'sm')}패키지 추가</button></div>`;
    const drawMode = () => {
      host.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
      host.querySelector('[data-hour]').hidden = !(mode === 'hour' || mode === 'both');
      host.querySelector('[data-pkg]').hidden = !(mode === 'pkg' || mode === 'both');
      host.querySelector('[data-none]').hidden = !!mode || hourOnly;
    };
    const drawPkgs = () => {
      host.querySelector('[data-pkgs]').innerHTML = pkgs.map((p, i) => `<div class="box" style="padding:14px;margin-bottom:10px"><div class="form-grid">
        <div class="field"><label class="label">종류</label><select class="select input-sm" data-pk="${i}" data-f="k">${PK.map(([k, l]) => `<option value="${k}"${(p.k || 'day') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label">이름 (손님에게 보여요)</label><input class="input input-sm" data-pk="${i}" data-f="label" maxlength="12" value="${esc(p.label || '')}" placeholder="낮 / 밤 / 올데이"></div>
        <div class="field full"><label class="label">시간 (시작 ~ 끝)</label><div class="row"><input class="input input-sm" type="time" data-pk="${i}" data-f="s" value="${hm(p.s)}"><span>~</span><input class="input input-sm" type="time" data-pk="${i}" data-f="e" value="${hm(p.e)}"></div></div>
        ${COLS.map((d, j) => `<div class="field"><label class="label">${d} 요금(원)</label><input class="input input-sm" type="number" min="0" step="1000" data-pk="${i}" data-f="p${j}" value="${num(p.p[j])}"></div>`).join('')}
        <div class="field full"><label class="label">이 패키지의 네이버 예약 주소 <span class="opt">선택</span></label><input class="input input-sm" data-pk="${i}" data-f="url" value="${esc(p.url || '')}" placeholder="https://booking.naver.com/booking/12/bizes/.../items/..."></div>
        </div><button class="btn btn-ghost btn-sm" type="button" data-pkrm="${i}" style="margin-top:6px">이 패키지 빼기</button></div>`).join('') || '<p class="small muted">아직 패키지가 없어요. 「패키지 추가」를 눌러 주세요.</p>';
    };
    const readPkgs = () => {
      host.querySelectorAll('[data-pk]').forEach((inp) => {
        const p = pkgs[Number(inp.dataset.pk)]; const k = inp.dataset.f;
        if (k === 's' || k === 'e') p[k] = t2m(inp.value);
        else if (/^p\d$/.test(k)) p.p[Number(k[1])] = inp.value === '' ? null : Number(inp.value);
        else p[k] = inp.value.trim();
      });
    };
    drawPkgs(); drawMode();
    host.addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; drawMode(); return; }
      if (e.target.closest('[data-pkadd]')) { readPkgs(); pkgs.push({ k: pkgs.length ? 'night' : 'day', label: pkgs.length ? '밤' : '낮', s: pkgs.length ? 1140 : 720, e: pkgs.length ? 1500 : 1020, p: [null, null, null, null], url: '' }); drawPkgs(); return; }
      const rm = e.target.closest('[data-pkrm]'); if (rm) { readPkgs(); pkgs.splice(Number(rm.dataset.pkrm), 1); drawPkgs(); }
    });
    const hv = (k) => host.querySelector(`[data-h="${k}"]`).value;
    return {
      mode: () => mode,
      read: () => {
        readPkgs();
        const useH = mode === 'hour' || mode === 'both', useP = mode === 'pkg' || mode === 'both';
        if (useP && pkgs.some((p) => p.s == null || p.e == null)) throw new Error('패키지 시작·끝 시각을 넣어 주세요.');
        return {
          hourly: useH ? { min: hv('min'), open: t2m(hv('open')) ?? 0, close: t2m(hv('close')) ?? 0, p: [0, 1, 2, 3].map((j) => (hv('p' + j) === '' ? null : Number(hv('p' + j)))), note: hv('note').trim() } : null,
          pkgs: useP ? pkgs.map((p) => ({ k: p.k || 'day', label: p.label, s: p.s, e: p.e, p: p.p, url: p.url })) : [],
        };
      },
    };
  };
  /** 예약 방식 — 여러 개 고르고 순서를 정해요. 첫 번째가 손님 화면의 대표 버튼. read() → { ways, confirm, hours, cancel } */
  SP.waysEditor = (host, b = {}, { legacyBook = '' } = {}) => {
    let ways = (b.ways || []).map((w) => ({ ...w }));
    if (!ways.length && legacyBook) ways = [{ k: 'naver', v: legacyBook, label: '', note: '' }];
    let confirm = b.confirm || '';
    const draw = () => {
      const on = new Set(ways.map((w) => w.k));
      host.querySelector('[data-ways]').innerHTML = `
        <div class="hs-ways">${ways.map((w, i) => { const def = SP.WAY_DEFS.find((x) => x[0] === w.k) || SP.WAY_DEFS[0]; return `<div class="hs-way${i === 0 ? ' main' : ''}">
          <div class="hs-way-hd"><b>${i === 0 ? '<span class="badge red">대표</span>' : `<span class="badge mute">${i + 1}</span>`}${def[1]}</b>
            <span class="row" style="gap:4px">${i ? `<button class="ibtn sm" type="button" data-wup="${i}" aria-label="앞으로">${icon('chev-l', 'sm')}</button>` : ''}<button class="ibtn sm" type="button" data-wrm="${i}" aria-label="빼기">${icon('x', 'sm')}</button></span></div>
          ${def[4] ? `<input class="input input-sm" type="${def[4]}" data-w="${i}" data-f="v" value="${esc(w.v || '')}" placeholder="${esc(def[3])}" inputmode="${def[4] === 'tel' ? 'tel' : 'url'}">` : ''}
          <p class="help">${def[2]}</p>
          <div class="row hs-way-opt" style="gap:6px"><input class="input input-sm" data-w="${i}" data-f="label" maxlength="20" value="${esc(w.label || '')}" placeholder="버튼 이름 (선택)"><input class="input input-sm" data-w="${i}" data-f="note" maxlength="60" value="${esc(w.note || '')}" placeholder="한 줄 안내 (선택) 예) 평일 10~19시"></div>
        </div>`; }).join('') || '<p class="small muted">아직 고른 예약 방식이 없어요. 아래에서 하나 이상 더해 주세요.</p>'}</div>
        <div class="chips" style="margin-top:10px">${SP.WAY_DEFS.filter(([k]) => !on.has(k)).map(([k, l]) => `<button type="button" class="chip" data-wadd="${k}">${icon('plus', 'sm')}${l}</button>`).join('')}</div>`;
    };
    host.innerHTML = `<p class="small muted" style="margin-bottom:8px">손님이 예약하는 방법이에요. 여러 개 넣을 수 있고, <b>첫 번째가 지점 화면의 대표 버튼</b>(휴대폰 아래 고정 버튼)이 돼요. 쏘플은 결제를 받지 않고 손님을 이 방법으로 이어 줘요.</p>
      <div data-ways></div>
      <div class="form-grid" style="margin-top:16px">
        <div class="field"><span class="label">예약 확정 방식</span><div class="chips" style="margin-top:6px"><button type="button" class="chip" data-cf="instant">바로 확정</button><button type="button" class="chip" data-cf="approve">호스트 확인 뒤 확정</button></div></div>
        <div class="field"><label class="label" for="w_hours">예약 받는 시간 <span class="opt">선택</span></label><input class="input" id="w_hours" maxlength="60" value="${esc(b.hours || '')}" placeholder="예) 매일 10:00~22:00"></div>
        <div class="field full"><label class="label" for="w_cancel">취소·환불 규정</label><textarea class="textarea" id="w_cancel" maxlength="600" style="min-height:76px" placeholder="예) 이용 3일 전까지 전액 환불, 이후 환불 없음">${esc(b.cancel || '')}</textarea><p class="help">손님 화면 「이용 전에 확인해 주세요」에 그대로 보여요. 전화번호는 자동으로 가려져요.</p></div>
      </div>`;
    const drawCf = () => host.querySelectorAll('[data-cf]').forEach((x) => x.classList.toggle('on', x.dataset.cf === confirm));
    const read = () => { host.querySelectorAll('[data-w]').forEach((inp) => { ways[Number(inp.dataset.w)][inp.dataset.f] = inp.value.trim(); }); };
    draw(); drawCf();
    host.addEventListener('click', (e) => {
      const cf = e.target.closest('[data-cf]'); if (cf) { confirm = confirm === cf.dataset.cf ? '' : cf.dataset.cf; drawCf(); return; }
      const add = e.target.closest('[data-wadd]'); if (add) { read(); ways.push({ k: add.dataset.wadd, v: '', label: '', note: '' }); draw(); const ins = host.querySelectorAll(`[data-w="${ways.length - 1}"][data-f="v"]`); if (ins[0]) ins[0].focus(); return; }
      const up = e.target.closest('[data-wup]'); if (up) { read(); const i = Number(up.dataset.wup); [ways[i - 1], ways[i]] = [ways[i], ways[i - 1]]; draw(); return; }
      const rm = e.target.closest('[data-wrm]'); if (rm) { read(); ways.splice(Number(rm.dataset.wrm), 1); draw(); }
    });
    return { read: () => { read(); return { ways: ways.map((w) => ({ k: w.k, v: w.v, label: w.label, note: w.note })), confirm, hours: host.querySelector('#w_hours').value.trim(), cancel: host.querySelector('#w_cancel').value.trim() }; } };
  };
  /** 사업자 정보 — 손님 화면 「호스트 정보」 */
  SP.bizEditor = (host, v = {}) => {
    const b = v || {};
    host.innerHTML = `<div class="form-grid">
      <div class="field"><label class="label">상호</label><input class="input" data-b="name" maxlength="40" value="${esc(b.name || '')}" placeholder="예) 성수파티룸"></div>
      <div class="field"><label class="label">대표자</label><input class="input" data-b="ceo" maxlength="20" value="${esc(b.ceo || '')}"></div>
      <div class="field"><label class="label">사업자등록번호</label><input class="input" data-b="no" maxlength="12" inputmode="numeric" value="${esc(b.no || '')}" placeholder="123-45-67890"></div>
      <div class="field"><label class="label">통신판매업 신고번호 <span class="opt">있으면</span></label><input class="input" data-b="mail" maxlength="30" value="${esc(b.mail || '')}" placeholder="2026-서울성동-0000"></div>
    </div><p class="help">사업자로 운영하면 손님 화면 「호스트 정보」에 상호·대표자·사업자등록번호가 보여요. 손님이 믿고 예약하는 데 도움이 돼요.</p>`;
    return { read: () => { const o = {}; host.querySelectorAll('[data-b]').forEach((i) => { o[i.dataset.b] = i.value.trim(); }); return o.name || o.ceo || o.no || o.mail ? o : null; } };
  };
})();
