/* 공간 아카데미 — 참여 신청 */
(function () {
  const { $ } = SP;
  $('#aForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = SP.formData($('#aForm'));
    const err = $('#aErr'); err.hidden = true;
    if (!f.name || !f.contact) { err.textContent = '이름과 연락처를 적어 주세요.'; err.hidden = false; return; }
    if (!f.agree) { err.textContent = '개인정보 수집·이용에 동의해 주세요.'; err.hidden = false; return; }
    const body = [`[나는] ${f.who}`, `[관심 주제] ${f.topic}`, f.body ? '\n' + f.body : ''].join('\n');
    const btn = $('#aForm button[type=submit]');
    SP.busy(btn, true, '보내는 중');
    try { await SP.post('/api/contact', { kind: 'academy', name: f.name, contact: f.contact, body, agree: true }); $('#aForm').reset(); SP.toast('신청을 받았어요. 다음 모임 일정을 알려 드릴게요.'); }
    catch (er) { err.textContent = er.message; err.hidden = false; }
    SP.busy(btn, false);
  });
  if (location.hash === '#join') setTimeout(() => $('#join').scrollIntoView({ block: 'start' }), 200);
})();
