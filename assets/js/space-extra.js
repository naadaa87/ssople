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
})();
