/* 파티 가이드 — 공유 버튼, 목차 현재 위치 */
(function () {
  const { $, $$ } = SP;
  const share = $('[data-share]');
  if (share) share.addEventListener('click', () => SP.share({ title: share.dataset.share + ' | 쏘플파티룸', text: share.dataset.share, url: location.href.split('#')[0] }));
  const toc = $$('.mag-toc a');
  if (toc.length && 'IntersectionObserver' in window) {
    const map = new Map(toc.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { toc.forEach((a) => a.classList.remove('on')); const a = map.get(e.target.id); if (a) a.classList.add('on'); } });
    }, { rootMargin: '-20% 0px -70% 0px' });
    map.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
  }
})();
