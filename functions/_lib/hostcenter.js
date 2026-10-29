// 쏘플파티룸 호스트센터 — 호스트·점주 안내 화면(/hostcenter)의 출입 확인
//  · 호스트 권한(연결된 지점)이 있는 회원, 관리자는 바로 들어온다
//  · 아직 계정이 없는 호스트를 위해 공용 아이디·비밀번호(관리자 → 설정 → 호스트센터)로도 들어올 수 있다
//    공용 로그인은 안내 화면을 보는 데만 쓰이고, 지점 정보를 고치는 권한은 없다
//  · 공용 로그인은 sessions 표에 admin = 2 로 남긴다 (회원 세션 0, 관리자 세션 1 과 섞이지 않는다)
import { HttpError, getCookie, setCookie, sha256hex, nowSec, nowIso, randToken, safeEqual } from './util.js';
import { getSettings } from './db.js';
import { hostCodes, loadSpaces } from './spaces.js';

export const HC_COOKIE = 'sp_h';
const HC_TTL = 30 * 24 * 3600;
const GUEST = 2;

/** 이 요청이 호스트센터를 볼 수 있는지 — { kind: 'admin' | 'host' | 'guest', codes } 또는 null */
export async function hcAccess(c) {
  const u = await c.rawUser();
  if (u) {
    if (u.role === 'admin' || u.role === 'staff') return { kind: 'admin', codes: hostCodes(u) };
    const codes = hostCodes(u);
    if (codes.length || u.role === 'host') return { kind: 'host', codes };
    // 공간 등록 신청서를 쓰기 시작한 회원도 안내를 볼 수 있게
    const app = await c.db.prepare('SELECT 1 AS x FROM space_apps WHERE uid = ? LIMIT 1').bind(u.id).first().catch(() => null);
    if (app) return { kind: 'host', codes };
  }
  if (await c.adminLevel()) return { kind: 'admin', codes: [] };
  const tok = getCookie(c.req, HC_COOKIE);
  if (tok && tok.length < 100) {
    const r = await c.db.prepare('SELECT exp FROM sessions WHERE th = ? AND admin = ? AND exp > ?')
      .bind(await sha256hex(tok), GUEST, nowSec()).first();
    if (r) return { kind: 'guest', codes: [] };
  }
  return null;
}

/** 공용 아이디·비밀번호가 바뀌었거나 공용 로그인을 끄면 그동안 들어와 있던 공용 세션을 모두 끝낸다 */
export async function endGuestSessions(db) {
  await db.prepare('DELETE FROM sessions WHERE admin = ?').bind(GUEST).run();
}

export function register(route) {
  route('POST', '/api/hostcenter/login', async (c) => {
    const st = await getSettings(c.db);
    if (st['hc.open'] === '0') throw new HttpError(403, '지금은 공용 아이디로 들어갈 수 없어요. 호스트 권한이 있는 쏘플 계정으로 로그인해 주세요.');
    await c.limit('hc:' + (await c.ih()), 10, 600, '로그인 시도가 너무 많아요. 10분 뒤에 다시 해 주세요.');
    const b = await c.body();
    const id = String(b.id ?? '').trim().slice(0, 60);
    const pw = String(b.pw ?? '').slice(0, 100);
    if (!id || !pw) throw new HttpError(400, '아이디와 비밀번호를 넣어 주세요.');
    const wantId = String(st['hc.id'] || '').trim();
    const wantPw = String(st['hc.pw'] || '');
    if (!wantId || !wantPw) throw new HttpError(403, '공용 아이디가 아직 정해지지 않았어요. 운영팀에 문의해 주세요.');
    const okId = safeEqual(id, wantId);
    const okPw = safeEqual(pw, wantPw);
    if (!(okId && okPw)) throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않아요.');
    const tok = randToken(32);
    await c.db.prepare('INSERT INTO sessions (th, uid, admin, exp, created_at) VALUES (?, NULL, ?, ?, ?)')
      .bind(await sha256hex(tok), GUEST, nowSec() + HC_TTL, nowIso()).run();
    c.outHeaders.push(['set-cookie', setCookie(HC_COOKIE, tok, { maxAge: HC_TTL })]);
    return { ok: true, kind: 'guest' };
  });

  route('POST', '/api/hostcenter/logout', async (c) => {
    const tok = getCookie(c.req, HC_COOKIE);
    if (tok && tok.length < 100) await c.db.prepare('DELETE FROM sessions WHERE th = ? AND admin = ?').bind(await sha256hex(tok), GUEST).run();
    c.outHeaders.push(['set-cookie', setCookie(HC_COOKIE, '', { maxAge: 0 })]);
    return { ok: true };
  });

  // 화면 위쪽 「내 계정」 칸 — 누가 보고 있는지, 연결된 지점이 무엇인지
  route('GET', '/api/hostcenter/me', async (c) => {
    const acc = await hcAccess(c);
    const st = await getSettings(c.db);
    const u = await c.user();
    const out = { access: acc ? acc.kind : null, open: st['hc.open'] !== '0', user: u ? { nick: u.nick, role: u.role } : null, spaces: [] };
    if (acc && acc.codes && acc.codes.length) {
      const list = await loadSpaces(c.db, { all: true });
      out.spaces = list.filter((s) => acc.codes.includes(s.code)).map((s) => ({ code: s.code, name: s.name, visible: !!s.visible }));
    }
    return out;
  });
}
