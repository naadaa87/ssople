/* 로그인 — 실패 5회 시 10분 잠금 */
import { ok, err, readJson, verifyPassword, createSession, setCookie, onlyDigits, fmtPhone, kstNow } from '../../lib/core.js';

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const phone = fmtPhone(onlyDigits(b.phone || b.id));
  const password = b.password || '';
  if (!phone || !password) return err('휴대폰 번호와 비밀번호를 입력해 주세요.');

  const c = await env.DB.prepare(
    `SELECT * FROM customers WHERE phone=? AND status='active'`).bind(phone).first();

  if (c?.locked_until && c.locked_until > kstNow().toISOString())
    return err('로그인 시도가 5회를 넘었습니다. 10분 후 다시 시도해 주세요.', 429);

  if (!c || !(await verifyPassword(password, c.password_hash, c.salt))) {
    if (c) {
      const n = (c.failed_attempts || 0) + 1;
      const lock = n >= 5 ? new Date(Date.now() + 10 * 60000 + 9 * 3600 * 1000).toISOString() : null;
      await env.DB.prepare(`UPDATE customers SET failed_attempts=?, locked_until=? WHERE id=?`)
        .bind(n, lock, c.id).run();
    }
    return err('휴대폰 번호 또는 비밀번호가 맞지 않습니다.', 401);
  }

  await env.DB.prepare(
    `UPDATE customers SET failed_attempts=0, locked_until=NULL, last_login_at=datetime('now') WHERE id=?`
  ).bind(c.id).run();

  const { token, ttl } = await createSession(env, { customerId: c.id, name: c.name, grade: c.grade });
  return ok({ name: c.name, grade: c.grade, redirect: '/mypage.html' },
    { headers: { 'set-cookie': setCookie(token, ttl) } });
}
