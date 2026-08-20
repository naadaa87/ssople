/* 회원가입 — 휴대폰이 아이디입니다 (호스트와 같은 규칙) */
import { ok, err, readJson, randomSalt, hashPassword, createSession, setCookie, onlyDigits, fmtPhone, getSetting } from '../../lib/core.js';

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const name = (b.name || '').trim();
  const phone = onlyDigits(b.phone);
  const email = (b.email || '').trim().toLowerCase() || null;
  const password = b.password || '';

  if (!name) return err('이름을 입력해 주세요.');
  if (phone.length < 10) return err('휴대폰 번호를 확인해 주세요.');
  if (password.length < 8) return err('비밀번호는 8자 이상으로 만들어 주세요.');
  if (!b.agreeTerms || !b.agreePrivacy) return err('이용약관과 개인정보 수집·이용에 동의해 주세요.');

  const dup = await env.DB.prepare(`SELECT 1 FROM customers WHERE phone=?`).bind(fmtPhone(phone)).first();
  if (dup) return err('이미 가입된 휴대폰 번호입니다.');

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);

  const r = await env.DB.prepare(
    `INSERT INTO customers (phone,email,name,password_hash,salt,marketing_ok) VALUES (?,?,?,?,?,?)`
  ).bind(fmtPhone(phone), email, name, hash, salt, b.agreeMarketing ? 1 : 0).run();

  const customerId = r.meta.last_row_id;
  await env.DB.prepare(
    `INSERT INTO customer_grade_logs (customer_id,grade_from,grade_to,reason) VALUES (?,NULL,'WELCOME','가입')`
  ).bind(customerId).run();

  /* 첫 예약 환영 쿠폰 — 마이그레이션 전이면 조용히 건너뜁니다 */
  try {
    const cid = Number(await getSetting(env, 'coupon.first.coupon_id', '0'));
    if (cid) {
      const c = await env.DB.prepare(
        `SELECT valid_days FROM coupons WHERE id=? AND status='active'`).bind(cid).first();
      if (c) await env.DB.prepare(
        `INSERT INTO coupon_issues (coupon_id, customer_id, expires_at)
         VALUES (?,?, datetime('now', ?))`
      ).bind(cid, customerId, `+${c.valid_days || 60} days`).run();
    }
  } catch { /* coupons 테이블 미생성 */ }

  const { token, ttl } = await createSession(env, { customerId, name, grade: 'WELCOME' });
  return ok({ customerId, name, grade: 'WELCOME' }, { headers: { 'set-cookie': setCookie(token, ttl) } });
}
