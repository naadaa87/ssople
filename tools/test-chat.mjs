/* normalize() 단독 테스트 — 카카오 스킬 응답 여러 모양을 넣어본다 */
import { readFileSync } from 'node:fs';
let src = readFileSync('functions/api/chat/index.js', 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export async function onRequestPost[\s\S]*?\n}\n/m, '');
src += '\nexport { normalize, detectHandoff };';
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { normalize } = mod;

let pass = 0, fail = 0;
const t = (name, input, check) => {
  const r = normalize(input);
  const ok = check(r);
  console.log((ok ? '  OK   ' : '  실패 ') + name);
  if (!ok) { console.log('       →', JSON.stringify(r)); fail++; } else pass++;
};

t('simpleText 한 개',
  { template: { outputs: [{ simpleText: { text: '예약금은 80,000원입니다.' } }] } },
  r => r && r.answer === '예약금은 80,000원입니다.' && r.source === 'bot');

t('simpleText 여러 개 이어붙이기',
  { template: { outputs: [{ simpleText: { text: '첫째' } }, { simpleText: { text: '둘째' } }] } },
  r => r.answer === '첫째\n\n둘째');

t('basicCard + 웹링크 버튼',
  { template: { outputs: [{ basicCard: { title: '강남점', description: '주차 2대 가능',
      buttons: [{ action: 'webLink', label: '예약하기', webLinkUrl: 'https://x/rooms.html' }] } }] } },
  r => r.answer.includes('강남점') && r.links.length === 1 && r.links[0].label === '예약하기');

t('전화 버튼은 tel: 로',
  { template: { outputs: [{ textCard: { text: '고객센터', buttons: [{ label: '전화', phoneNumber: '1544-3523' }] } }] } },
  r => r.links[0].url === 'tel:1544-3523');

t('itemCard (예약 조회 결과 형태)',
  { template: { outputs: [{ itemCard: { head: { title: '예약 확인' }, itemList: [
      { title: '일시', description: '8월 20일 밤타임' }, { title: '인원', description: '12명' }] } }] } },
  r => r.answer.includes('일시') && r.answer.includes('밤타임'));

t('listCard 항목 링크',
  { template: { outputs: [{ listCard: { header: { title: '가까운 지점' },
      items: [{ title: '강남점', description: '테헤란로', link: { web: 'https://x/room-detail.html?id=1' } }] } }] } },
  r => r.answer.includes('강남점') && r.links.length === 1);

t('quickReplies 는 messageText 우선',
  { template: { outputs: [{ simpleText: { text: 'ㅇㅋ' } }],
      quickReplies: [{ label: '예약하기', messageText: '예약하고 싶어요' }] } },
  r => r.quickReplies[0].send === '예약하고 싶어요');

t('quickReplies 없으면 기본값',
  { template: { outputs: [{ simpleText: { text: 'ㅇㅋ' } }] } },
  r => r.quickReplies.length === 4);

t('상담 이관 감지 — 문구',
  { template: { outputs: [{ simpleText: { text: '확인 후 안내드리겠습니다.' } }] } },
  r => r.handoff === true);

t('상담 이관 감지 — 블록 버튼',
  { template: { outputs: [{ simpleText: { text: '네' } }],
      quickReplies: [{ label: '상담원 연결', blockId: 'abc123' }] } },
  r => r.handoff === true);

t('평범한 답은 이관 아님',
  { template: { outputs: [{ simpleText: { text: '주차는 2대까지 가능합니다.' } }] } },
  r => r.handoff === false);

t('단순 {answer} 형태도 받음', { answer: '네 가능합니다' },
  r => r.answer === '네 가능합니다');

t('빈 응답은 null (대체 경로로 넘어감)', { template: { outputs: [] } }, r => r === null);
t('이상한 응답도 null', { foo: 'bar' }, r => r === null);

console.log('\n' + (fail ? `실패 ${fail}건` : `전부 통과 (${pass}건)`));
process.exit(fail ? 1 : 0);
