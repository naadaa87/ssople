/* 브랜드 소개 — 지점 수는 실제 데이터로 */
(function () {
  SP.site().then((s) => {
    const n = Object.keys(s.regions || {}).length;
    if (n) SP.$('#aRegions').textContent = n + '개';
  });
})();
