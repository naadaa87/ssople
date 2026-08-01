/* 정기 작업 실행기 — Pages는 Cron을 못 받으므로 이 워커가 대신 부릅니다 */
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const res = await fetch(`${env.SITE_URL}/api/cron/tick`, {
          method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET },
        });
        console.log(res.ok ? '정기 작업 완료' : `정기 작업 실패 ${res.status}`);
      } catch (e) { console.error('정기 작업 호출 실패', e); }
    })());
  },
  async fetch() {
    return new Response('쏘플 홈페이지 정기 작업 실행기', {
      headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
