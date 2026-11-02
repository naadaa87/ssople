/* 공간 갤러리 — 호스트가 보내 준 사진을 쏘플이 보정·가공한 지점 사진을 모아 보기 */
(function () {
  const { $, $$, esc, icon } = SP;
  let all = [];
  let cat = 'all';
  let region = '';
  const CATS = [['all', '전체'], ['space', '공간'], ['facility', '시설·분위기'], ['scene', '이렇게 놀아요']];

  function feats(s) {
    const f = s.feat || {}, t = [];
    if (f.karaoke && f.karaoke.on) t.push('노래방');
    if (f.bbq && f.bbq.on) t.push('바베큐');
    (f.zones || []).slice(0, 1).forEach((z) => t.push(z));
    if (f.console) t.push('게임기');
    if (f.projector) t.push('빔프로젝터');
    if (f.pet && f.pet.on) t.push('애견 동반');
    return t.slice(0, 4);
  }
  /** 한 지점 묶음 — 홍보 이미지 한 장 + 사진 바둑판 (넘치는 장수는 마지막 칸에 +N) */
  function itemsOf(s) {
    const g = s.gallery || [];
    const items = cat === 'all' ? g.filter((x) => x.c !== 'poster') : g.filter((x) => x.c === cat);
    const poster = cat === 'all' ? g.find((x) => x.c === 'poster') : null;
    return { items, poster, lb: [...(poster ? [poster] : []), ...items] };
  }
  function branch(s) {
    const { items, poster } = itemsOf(s);
    if (!items.length) return '';
    const name = String(s.name).replace(/\s*파티룸$/, '');
    const show = items.slice(0, poster ? 6 : 8);
    const more = items.length - show.length;
    const off = poster ? 1 : 0;
    const facts = [`기준 ${s.base || '-'}명 · 최대 ${s.max || '-'}명`, ...feats(s)].join(' · ');
    const minP = SP.minPrice(s);
    return `<section class="gal-branch" id="g-${esc(s.code)}">
      <div class="gb-hd"><div><span class="room-area">${icon('pin', 'sm')}${esc(s.region)} ${esc(s.area)}</span><h2><a href="/room/${esc(s.code)}">${esc(s.name)}</a></h2><p>${esc(facts)}${minP ? ` · ${SP.won(minP)}부터` : ''}</p></div>
        <div class="row" style="gap:8px"><a class="btn btn-line btn-sm" href="/room/${esc(s.code)}#r-photos">${icon('image', 'sm')}지점 사진 ${(s.gallery || []).length}장</a><a class="btn btn-red btn-sm" href="/room/${esc(s.code)}#r-book">${icon('calendar', 'sm')}요금 보고 예약</a></div></div>
      <div class="gb-body${poster ? ' has-poster' : ''}">
        ${poster ? `<button type="button" class="gb-poster" data-code="${esc(s.code)}" data-k="0" aria-label="${esc(name)} 홍보 이미지 크게 보기"><img src="${esc(poster.s)}" alt="${esc(`${name} 홍보 이미지 — ${poster.t}`)}" loading="lazy" decoding="async"${poster.w ? ` width="${poster.w}" height="${poster.h}"` : ''}>${poster.ai ? '<span class="gal-ai">AI 연출</span>' : ''}</button>` : ''}
        <div class="gb-grid">${show.map((x, i) => `<button type="button" class="gal-cell" data-code="${esc(s.code)}" data-k="${off + i}" aria-label="${esc(x.t || '사진')} 크게 보기"><img src="${esc(x.s)}" alt="${esc(`${name} ${x.t}${x.ai ? ' (AI 연출 이미지)' : ''}`)}" loading="lazy" decoding="async">${x.ai ? '<span class="gal-ai">AI 연출</span>' : ''}${x.t ? `<span class="gal-cap">${esc(x.t)}</span>` : ''}${i === show.length - 1 && more > 0 ? `<span class="gb-more">+${more}</span>` : ''}</button>`).join('')}</div>
      </div></section>`;
  }
  function stats() {
    const n = all.reduce((x, s) => x + (s.gallery || []).length, 0);
    const regs = [...new Set(all.map((s) => s.region))];
    const last = all.map((s) => s.galleryAt || '').filter(Boolean).sort().pop();
    const tile = (b, l) => `<div><b>${esc(b)}</b><span>${esc(l)}</span></div>`;
    $('#galStats').innerHTML = tile(`${all.length}곳`, '갤러리가 있는 지점') + tile(`${n}장`, '쏘플이 다듬은 사진') + tile(`${regs.length}곳`, '권역') + tile(last ? `${Number(last.slice(5, 7))}.${Number(last.slice(8, 10))}` : '-', '마지막 업데이트');
  }
  function filters() {
    const n = (k) => all.reduce((x, s) => x + (s.gallery || []).filter((g) => (k === 'all' ? g.c !== 'poster' : g.c === k)).length, 0);
    $('#galCats').innerHTML = CATS.filter(([k]) => n(k) > 0).map(([k, l]) => `<button type="button" class="chip${k === cat ? ' on' : ''}" data-cat="${k}">${esc(l)} <span class="n">${n(k)}</span></button>`).join('');
    const ORDER = ['서울', '경기', '인천', '대전', '부산', '전주'];
    const regs = [...new Set(all.map((s) => s.region))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    $('#galRegions').innerHTML = regs.length > 1 ? [['', '전체 지역'], ...regs.map((r) => [r, r])].map(([v, l]) => `<button type="button" class="chip${v === region ? ' on' : ''}" data-reg="${esc(v)}">${esc(l)}</button>`).join('') : '';
  }
  function draw() {
    const list = all.filter((s) => !region || s.region === region);
    const html = list.map(branch).filter(Boolean).join('');
    $('#galRoot').innerHTML = html || '<div class="gal-empty">이 분류에 맞는 사진이 아직 없어요. 다른 분류를 눌러 보세요.</div>';
    $('#galAiNote').hidden = !list.some((s) => (s.gallery || []).some((g) => g.ai));
  }

  async function init() {
    const spaces = await SP.spaces().catch(() => []);
    // 새로 올린 지점부터, 같은 날 올린 지점끼리는 들어올 때마다 순서를 섞어요
    all = SP.shuffle(spaces.filter((s) => (s.gallery || []).length)).sort((a, b) => String(b.galleryAt || '').localeCompare(String(a.galleryAt || '')));
    if (!all.length) { $('#galRoot').innerHTML = '<div class="gal-empty">갤러리를 준비하고 있어요. 그동안 <a class="link" href="/rooms">지점 찾기</a>에서 지점 사진을 볼 수 있어요.</div>'; $('#galStats').innerHTML = ''; return; }
    stats(); filters(); draw();
    $('#galCats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; filters(); draw(); });
    $('#galRegions').addEventListener('click', (e) => { const b = e.target.closest('[data-reg]'); if (!b) return; region = b.dataset.reg; filters(); draw(); });
    $('#galRoot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-code][data-k]'); if (!b) return;
      const s = all.find((x) => x.code === b.dataset.code); if (!s) return;
      SP.lightbox(SP.galItems(itemsOf(s).lb, s, true), Number(b.dataset.k));
    });
    const h = decodeURIComponent(location.hash || '').slice(1);
    if (/^g-S-\d{4}$/.test(h)) { const el = document.getElementById(h); if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 60); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
