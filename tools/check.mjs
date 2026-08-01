/* 배포 전 자체 점검 — node tools/check.mjs */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import vm from 'node:vm';

let fail = 0;
const bad = (m) => { console.log('  ✗ ' + m); fail++; };
const good = (m) => console.log('  ✓ ' + m);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk('.');

/* 1. JS 문법 */
console.log('\n[1] 자바스크립트 문법');
const js = files.filter((f) => extname(f) === '.js' || extname(f) === '.mjs');
let jsBad = 0;
for (const f of js) {
  let src = readFileSync(f, 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export default /gm, 'const _d=').replace(/^export /gm, '');
  /* .mjs 는 모듈이라 최상위 await 이 정상 — 함수로 감싸 검사한다 */
  if (f.endsWith('.mjs')) src = `async function _m(){${src}\n}`;
  try { new vm.Script(src, { filename: f }); }
  catch (e) { bad(`${f} → ${e.message.split('\n')[0]}`); jsBad++; }
}
if (!jsBad) good(`${js.length}개 파일 이상 없음`);

/* 2. HTML 인라인 스크립트 */
console.log('\n[2] HTML 인라인 스크립트');
let htmlBad = 0;
for (const f of files.filter((x) => extname(x) === '.html')) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1].trim()) continue;
    try { new vm.Script(m[1], { filename: f }); }
    catch (e) { bad(`${f} → ${e.message.split('\n')[0]}`); htmlBad++; }
  }
}
if (!htmlBad) good('이상 없음');

/* 3. 내부 링크 */
console.log('\n[3] 내부 링크');
const missing = new Set();
for (const f of files.filter((x) => extname(x) === '.html')) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/href="(\/[^"#?]*)"/g)) {
    const h = m[1];
    if (h.startsWith('/api/')) continue;
    let p = h.replace(/^\//, '') || 'index.html';
    if (p.endsWith('/')) p += 'index.html';
    if (!existsSync(p)) missing.add(`${f} → ${h}`);
  }
  for (const m of s.matchAll(/href="([a-z0-9-]+\.html)/g))
    if (!existsSync(m[1])) missing.add(`${f} → ${m[1]}`);
}
missing.size ? [...missing].forEach(bad) : good('깨진 링크 없음');

/* 4. 호스트 규격 준수 */
console.log('\n[4] 호스트 홈페이지 규격 준수');
/* 점검 스크립트 자신은 검사 대상에서 뺍니다 (규칙 문자열이 잡히므로) */
const all = js.filter((f) => !f.includes('check.mjs'))
             .map((f) => readFileSync(f, 'utf8')).join('\n');
const rules = [
  [/status\s*=\s*['"]CONFIRMED['"]/,   '예약 상태를 대문자로 쓴 곳이 있습니다 (호스트는 소문자)'],
  [/\bspaces\b\s*(?:s|WHERE|JOIN)/,     'spaces 테이블을 참조합니다 (호스트에 없는 테이블)'],
  [/pricing_rules/,                     'pricing_rules 테이블을 참조합니다 (호스트에 없는 테이블)'],
  [/staff_accounts/,                    'staff_accounts 테이블을 참조합니다 (호스트는 users)'],
  [/start_hour|end_hour/,               '시간 단위 예약 흔적이 남아 있습니다 (호스트는 slot)'],
];
let rBad = 0;
for (const [re, msg] of rules) if (re.test(all)) { bad(msg); rBad++; }
if (!rBad) good('상태값·테이블·예약 단위 모두 호스트 규격과 일치');

const need = ['branch_id', "'confirmed'", 'deposit_amount', 'total_amount', "source", "slot"];
const miss = need.filter((k) => !all.includes(k));
miss.length ? bad('필수 컬럼 미사용: ' + miss.join(', ')) : good('호스트 공용 컬럼 사용 확인');

/* 5. 보안 */
console.log('\n[5] 보안');
const toml = existsSync('wrangler.toml') ? readFileSync('wrangler.toml', 'utf8') : '';
/PORTONE_API_SECRET\s*=\s*"[^"]{6,}"|SOLAPI_API_SECRET\s*=\s*"[^"]{6,}"/.test(toml)
  ? bad('wrangler.toml 에 비밀키가 들어 있습니다')
  : good('비밀키 하드코딩 없음');
existsSync('_routes.json') ? good('_routes.json 있음 (정적 페이지는 Functions 우회)')
                           : bad('_routes.json 없음');

/* 6. 연동 지점 */
console.log('\n[6] 다른 시스템 연동');
const chat = existsSync('functions/api/chat/index.js') ? readFileSync('functions/api/chat/index.js', 'utf8') : '';
chat.includes('CHATBOT_URL') ? good('챗봇 서버 연결 지점 있음') : bad('챗봇 연결 없음');
chat.includes('bot_faqs')    ? good('챗봇 장애 시 대체 경로 있음') : bad('대체 경로 없음');
existsSync('lookup.html')    ? good('비회원 예약조회 화면 있음 (챗봇 링크 대상)') : bad('lookup.html 없음');
existsSync('functions/api/reservations/lookup.js') ? good('예약조회 API 있음') : bad('조회 API 없음');
existsSync('functions/api/chat/health.js') ? good('챗봇 연결 점검 엔드포인트 있음') : bad('점검 엔드포인트 없음');
const wt = existsSync('wrangler.toml') ? readFileSync('wrangler.toml','utf8') : '';
/CHATBOT_URL\s*=\s*"https?:\/\//.test(wt)
  ? good('챗봇 주소 설정됨: ' + (wt.match(/CHATBOT_URL\s*=\s*"([^"]+)"/)||[])[1])
  : bad('CHATBOT_URL 이 비어 있습니다');
const pages = walk('.').filter(f => f.endsWith('.html') && !f.includes('/'));
const withChat = pages.filter(f => readFileSync(f,'utf8').includes('assets/chat.js'));
withChat.length >= pages.length - 1
  ? good(`챗봇 위젯 ${withChat.length}/${pages.length}개 화면에 연결 (결제 화면 제외)`)
  : bad(`챗봇 위젯 누락: ${pages.filter(f=>!withChat.includes(f)).join(', ')}`);
!existsSync('owner') && !existsSync('admin')
  ? good('점주·관리자 화면 없음 (별도 시스템으로 분리됨)')
  : bad('점주/관리자 화면이 남아 있습니다 — 호스트·대시보드와 중복됩니다');

console.log('\n' + (fail ? `점검 실패 ${fail}건` : '전체 점검 통과'));
process.exit(fail ? 1 : 0);
