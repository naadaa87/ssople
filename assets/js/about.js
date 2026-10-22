/* 브랜드 이야기 — 위쪽 탭(브랜드 이야기 · 회사 정보)을 지금 보는 부분에 맞춘다 */
(function () {
  const tabs = SP.$$('[data-tg]');
  const mark = () => {
    const co = location.hash === '#company';
    tabs.forEach((a) => a.classList.toggle('on', a.dataset.tg === (co ? 'company' : 'about')));
  };
  mark();
  window.addEventListener('hashchange', mark);
})();
