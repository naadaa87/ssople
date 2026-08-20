/* 보증금 차감 이의제기 — 기획서 9.3

   차감 내역은 본사 대시보드(ops_incidents)가 정본이라, 고객의 이의도
   같은 줄에 남깁니다. 상태를 DISPUTED 로 바꾸면 대시보드
   「분쟁·보증금」 화면의 검토 대기로 올라갑니다.
   상태는 앞으로만 갑니다 — 이미 확정·철회된 건은 다시 열지 않습니다. */
import { ok, err, readJson, requireCustomer, audit, touch } from '../../../lib/core.js';

export async function onRequestPost({ params, request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;

  const incId = String(params.id);
  const b = await readJson(request);
  const note = (b.note || '').trim().slice(0, 800);
  if (note.length < 5) return err('이의 내용을 조금 더 자세히 적어주세요.');

  let inc;
  try {
    inc = await env.DB.prepare(
      `SELECT i.id, i.state, i.res_code, i.extra_json, i.dispute_until,
              r.branch_id, r.customer_id
         FROM ops_incidents i JOIN reservations r ON r.code = i.res_code
        WHERE i.id = ?`
    ).bind(incId).first();
  } catch {
    return err('차감 내역을 확인할 수 없습니다. 고객센터로 문의해 주세요.', 503);
  }

  if (!inc || inc.customer_id !== session.customerId)
    return err('차감 내역을 찾을 수 없습니다.', 404);
  if (inc.state !== 'PROPOSED')
    return err(inc.state === 'DISPUTED'
      ? '이미 이의를 접수해 검토 중입니다.'
      : '검토가 끝난 내역이라 이의를 낼 수 없습니다.', 409);
  if (inc.dispute_until && inc.dispute_until < new Date().toISOString().slice(0, 10))
    return err('이의신청 기간이 지났습니다. 고객센터로 문의해 주세요.', 409);

  let extra = {}; try { extra = JSON.parse(inc.extra_json || '{}'); } catch {}
  extra.objection = note;
  extra.objectedAt = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE ops_incidents SET state='DISPUTED', extra_json=?, up=? WHERE id=?`
  ).bind(JSON.stringify(extra), Date.now(), incId).run();

  await touch(env, 'incident', incId);
  await audit(env, {
    branchId: inc.branch_id, actor: '홈페이지',
    action: '보증금 차감 이의', detail: `${inc.res_code} / ${incId}`,
  });

  return ok({ disputed: true });
}
