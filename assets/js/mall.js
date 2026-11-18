/* 쏘플파티몰 — 상황별·분류별로 거르기, 「쿠팡에서 보기」 누른 수 기록
 * 상품 카드는 서버가 미리 그려 둬요. 서버 화면이 비어 있을 때만 /api/mall 로 다시 그려요. */
(function () {
  const { $, $$, esc, icon } = SP;
  const root = $('#mallRoot');
  if (!root) return;
  const names = {};

  /* ---------- 서버 화면이 비어 있을 때 그리기 (서버 mall.js 와 같은 모양) ---------- */
  function card(p, eager) {
    const a = `href="${esc(p.url)}" target="_blank" rel="sponsored nofollow noopener" referrerpolicy="unsafe-url" data-mall="${p.id}"`;
    return `<article class="ml-card" data-cat="${esc(p.cat)}" data-tags="${esc(p.tags.join(' '))}">
      <a class="ml-img" ${a} tabindex="-1" aria-hidden="true">${p.img ? `<img src="${esc(p.img)}" alt="" width="492" height="492" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : `<span class="ml-noimg">${icon('image')}</span>`}</a>
      <div class="ml-body">${p.pick ? '<span class="ml-pick">쏘플 추천</span>' : ''}<h3 class="ml-name"><a ${a}>${esc(p.name)}</a></h3>${p.note ? `<p class="ml-note">${esc(p.note)}</p>` : ''}
      <a class="ml-go" ${a}>쿠팡에서 보기${icon('ext', 'sm')}</a></div></article>`;
  }
  function render(d) {
    const list = d.items || [];
    if (!list.length) { root.innerHTML = '<p class="muted" style="padding:40px 0;text-align:center">준비 중이에요. 곧 상품을 채워 둘게요.</p>'; return; }
    let first = 0;
    root.innerHTML = d.cats.map((c) => {
      const ps = list.filter((p) => p.cat === c.id);
      if (!ps.length) return '';
      return `<section class="ml-sec" id="c-${c.id}" data-cat="${c.id}"><div class="ml-sec-hd"><span class="ml-sec-ic">${icon(c.icon)}</span><div><h2 class="h3">${esc(c.name)}</h2><p>${esc(c.desc)}</p></div><span class="ml-sec-n">${ps.length}가지</span></div>
        <div class="ml-grid">${ps.map((p) => card(p, first++ < 4)).join('')}</div></section>`;
    }).join('');
    $('#mallSets').innerHTML = d.sets.map((s) => {
      const all = list.filter((p) => p.tags.includes(s.id));
      if (!all.length) return '';
      const pics = [...all.filter((p) => p.pick && p.img), ...all.filter((p) => !p.pick && p.img)].slice(0, 4);
      return `<a class="ml-set" href="/mall?set=${s.id}#catalog" data-set="${s.id}"><span class="ml-set-pics">${pics.map((p) => `<img src="${esc(p.img)}" alt="" width="492" height="492" loading="lazy" decoding="async">`).join('')}</span>
        <span class="ml-set-tx"><b>${esc(s.name)}</b><small>${esc(s.desc)}</small><span class="ml-set-n">준비물 ${all.length}가지 보기${icon('chev-r', 'sm')}</span></span></a>`;
    }).join('');
    $('#mallChips').innerHTML = `<a class="chip sm on" href="#catalog" data-cat-go="">전체 <b>${list.length}</b></a>` + d.cats.filter((c) => list.some((p) => p.cat === c.id)).map((c) => `<a class="chip sm" href="#c-${c.id}" data-cat-go="${c.id}">${esc(c.name)}</a>`).join('');
    const t = $('#mallTotal'); if (t) t.textContent = list.length;
  }
  async function ensure() {
    if (root.querySelector('.ml-card')) return;
    try { render(await SP.get('/api/mall')); }
    catch { root.innerHTML = '<p class="muted" style="padding:40px 0;text-align:center">상품을 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.</p>'; }
  }

  /* ---------- 상황별로 거르기 ---------- */
  function applySet(id, { scroll = true } = {}) {
    let n = 0;
    $$('.ml-card', root).forEach((c) => { const on = !id || (c.dataset.tags || '').split(' ').includes(id); c.hidden = !on; if (on) n++; });
    $$('.ml-sec', root).forEach((s) => {
      const vis = $$('.ml-card', s).filter((c) => !c.hidden).length;
      s.hidden = !vis;
      const lab = $('.ml-sec-n', s); if (lab) lab.textContent = `${vis}가지`;
      const chip = $(`[data-cat-go="${s.dataset.cat}"]`); if (chip) chip.hidden = !vis;
    });
    $$('.ml-set').forEach((a) => { const on = a.dataset.set === id; a.classList.toggle('on', on); a.setAttribute('aria-current', on ? 'true' : 'false'); });
    const all = $('[data-cat-go=""]'); if (all) all.innerHTML = `전체 <b>${n}</b>`;
    const f = $('#mallFilter');
    if (id) {
      f.innerHTML = `<span>${icon('gift', 'sm')}<b>${esc(names[id] || '')}</b> 준비물 ${n}가지만 보고 있어요</span><button class="btn btn-line btn-sm" type="button" data-clear>${icon('x', 'sm')}전체 상품 보기</button>`;
      f.hidden = false;
    } else f.hidden = true;
    try {
      const u = new URL(location.href);
      if (id) u.searchParams.set('set', id); else u.searchParams.delete('set');
      history.replaceState(null, '', u.pathname + u.search + (scroll ? '#catalog' : u.hash));
    } catch { /* 무시 */ }
    if (scroll) $('#catalog').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  document.addEventListener('click', (e) => {
    const s = e.target.closest('.ml-set');
    if (s) { e.preventDefault(); applySet(s.classList.contains('on') ? '' : s.dataset.set); SP.ga('mall_set', { set: s.dataset.set }); return; }
    if (e.target.closest('[data-clear]')) { applySet(''); return; }
    const g = e.target.closest('[data-cat-go]');
    if (g) { $$('[data-cat-go]').forEach((x) => x.classList.toggle('on', x === g)); }
    // 「쿠팡에서 보기」 — 숫자만 기록해요 (누가 눌렀는지는 남기지 않아요)
    const m = e.target.closest('a[data-mall]');
    if (m) {
      const body = JSON.stringify({ id: Number(m.dataset.mall) });
      try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/mall/click', new Blob([body], { type: 'text/plain' })))) fetch('/api/mall/click', { method: 'POST', body, keepalive: true }).catch(() => {}); } catch { /* 무시 */ }
      const c = m.closest('.ml-card');
      SP.ga('click_mall', { item_id: m.dataset.mall, item_name: c ? ($('.ml-name', c) || {}).textContent : '', item_category: c ? c.dataset.cat : '' });
    }
  });

  // 스크롤하면 지금 보고 있는 분류 칩에 표시
  function spy() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        const id = en.target.dataset.cat;
        $$('[data-cat-go]').forEach((x) => x.classList.toggle('on', x.dataset.catGo === id));
        const on = $(`[data-cat-go="${id}"]`);
        if (on && on.parentElement) { const p = on.parentElement; const l = on.offsetLeft - 16; if (l < p.scrollLeft || l + on.offsetWidth > p.scrollLeft + p.clientWidth) p.scrollTo({ left: l, behavior: 'smooth' }); }
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    $$('.ml-sec', root).forEach((s) => io.observe(s));
  }

  ensure().then(() => {
    $$('.ml-set').forEach((a) => { const b = $('b', a); if (b) names[a.dataset.set] = b.textContent; });
    const q = new URLSearchParams(location.search).get('set');
    if (q && names[q]) applySet(q, { scroll: location.hash === '#catalog' });
    spy();
  });
})();
