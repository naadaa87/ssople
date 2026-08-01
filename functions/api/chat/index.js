/* ============================================================
   홈페이지 상담창 → 챗봇 스킬 서버(쏘플이)

   챗봇은 카카오 오픈빌더용 스킬 서버로 따로 떠 있습니다.
   브라우저가 직접 부르면 CORS에 막히고 주소도 그대로 드러나므로,
   홈페이지 서버가 대신 부릅니다.

   같은 서버를 쓰기 때문에 카카오톡에서 물어본 답과
   홈페이지에서 물어본 답이 같습니다. 답변 규칙을 두 군데 두면
   반드시 어긋납니다.

   설정 (wrangler.toml)
     CHATBOT_URL   https://ssople-chatbot.<계정>.workers.dev
     CHATBOT_PATH  /skill   (기본값)
   ============================================================ */

import { ok, err, readJson, rateLimit, getSetting } from '../../lib/core.js';

/* 규정 관련 질문은 챗봇이 승인 문안으로 즉답하지만,
   챗봇이 잠깐 죽었을 때도 이 답만은 흔들리면 안 되므로
   홈페이지 쪽에도 대비를 둡니다. */
const FIXED_KEYWORDS = ['환불', '취소', '수수료', '위약금', '보증금', '디파짓', '개인정보', '탈퇴'];

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const message = (b.message || '').trim();
  const sessionId = String(b.sessionId || crypto.randomUUID()).slice(0, 64);
  if (!message) return err('질문을 입력해 주세요.');
  if (message.length > 400) return err('질문이 조금 깁니다. 짧게 나눠서 물어봐 주세요.');

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const perHour = Number(await getSetting(env, 'chat.rate_per_hour', '30'));
  if (!(await rateLimit(env, `chat:${ip}`, perHour, 3600)))
    return err('질문이 너무 잦습니다. 잠시 후 다시 시도해 주세요.', 429);

  /* 1) 챗봇 서버에 물어봅니다 */
  if (env.CHATBOT_URL) {
    const r = await askBot(env, { message, sessionId, page: b.page, branch: b.branch });
    if (r) {
      await log(env, sessionId, message, r.answer, 'bot', r.handoff);
      return ok({ sessionId, ...r });
    }
  }

  /* 2) 닿지 못하면 같은 DB의 FAQ로 답합니다 */
  const hit = await findFaq(env, message, FIXED_KEYWORDS.some((k) => message.includes(k)));
  if (hit) {
    await log(env, sessionId, message, hit.answer, 'fallback', 0);
    return ok({ sessionId, answer: hit.answer, source: 'fallback',
      handoff: false, quickReplies: defaultQuick(), links: [], degraded: true });
  }

  const msg = '지금은 답변을 불러오지 못했습니다. 상담원에게 연결해 드릴까요?';
  await log(env, sessionId, message, msg, 'fallback', 1);
  return ok({ sessionId, answer: msg, source: 'none', handoff: true,
    quickReplies: defaultQuick(), links: [], degraded: true });
}

/* ---------- 스킬 서버 호출 ----------
   카카오 오픈빌더 스킬 규격 그대로 보냅니다.
   userRequest.user.id 를 세션마다 고정해야 앞뒤 대화가 이어집니다. */
async function askBot(env, { message, sessionId, page, branch }) {
  const base = String(env.CHATBOT_URL).replace(/\/+$/, '');
  const path = env.CHATBOT_PATH || '/skill';

  const payload = {
    intent: { id: 'web-widget', name: '홈페이지 상담창' },
    userRequest: {
      timezone: 'Asia/Seoul',
      utterance: message,
      user: { id: `web-${sessionId}`, type: 'web', properties: {} },
      block: { id: 'web-widget', name: '홈페이지' },
      lang: 'ko',
    },
    bot: { id: 'ssople', name: '쏘플이' },
    action: {
      name: 'web',
      params: {},
      detailParams: {},
      /* 지금 보고 있는 화면을 함께 알려줍니다.
         챗봇이 쓰지 않아도 무해하고, 쓰면 "이 지점" 질문이 자연스러워집니다. */
      clientExtra: { channel: 'web', page: page || null, branchName: branch || null },
    },
  };

  /* 챗봇은 카카오 5초 제한 때문에 AI를 3.2초에서 끊습니다.
     콜드 스타트를 감안해 9초까지 기다립니다. */
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.CHATBOT_KEY ? { 'x-api-key': env.CHATBOT_KEY } : {}),
      },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return normalize(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 응답 정리 ----------
   챗봇 쪽 출력 형태가 바뀌어도 화면은 그대로 쓰도록 여기서 흡수합니다. */
function normalize(j) {
  if (!j) return null;
  const outs = j.template?.outputs;

  if (Array.isArray(outs) && outs.length) {
    const texts = [];
    const links = [];

    for (const o of outs) {
      const card = o.basicCard || o.textCard || o.commerceCard;
      if (o.simpleText?.text) {
        texts.push(o.simpleText.text);
      } else if (card) {
        texts.push([card.title, card.description].filter(Boolean).join('\n'));
        for (const btn of card.buttons || []) pushBtn(links, btn);
      } else if (o.itemCard) {
        const c = o.itemCard;
        const items = (c.itemList || []).map((i) => `${i.title}  ${i.description}`).join('\n');
        texts.push([c.head?.title, c.title, items,
          c.itemListSummary ? `${c.itemListSummary.title}  ${c.itemListSummary.description}` : '']
          .filter(Boolean).join('\n'));
        for (const btn of c.buttons || []) pushBtn(links, btn);
      } else if (o.listCard) {
        const c = o.listCard;
        texts.push([c.header?.title,
          (c.items || []).map((i) => `· ${i.title}${i.description ? ' — ' + i.description : ''}`).join('\n')]
          .filter(Boolean).join('\n'));
        for (const i of c.items || []) if (i.link?.web) links.push({ label: i.title, url: i.link.web });
        for (const btn of c.buttons || []) pushBtn(links, btn);
      }
    }

    if (!texts.length) return null;
    const answer = texts.join('\n\n').trim();

    const quickReplies = (j.template.quickReplies || [])
      .map((q) => ({ label: q.label, send: q.messageText || q.label, blockId: q.blockId || null }))
      .filter((q) => q.label);

    return {
      answer,
      source: 'bot',
      handoff: detectHandoff(j, answer),
      quickReplies: quickReplies.length ? quickReplies : defaultQuick(),
      links,
    };
  }

  const answer = j.answer || j.text || j.message;
  if (typeof answer === 'string' && answer.trim())
    return { answer: answer.trim(), source: 'bot', handoff: !!j.handoff,
      quickReplies: j.quickReplies || defaultQuick(), links: [] };

  return null;
}

function pushBtn(links, btn) {
  if (!btn) return;
  if (btn.webLinkUrl) links.push({ label: btn.label || '바로가기', url: btn.webLinkUrl });
  else if (btn.phoneNumber) links.push({ label: btn.label || '전화 걸기', url: `tel:${btn.phoneNumber}` });
}

/* 상담원 이관 신호 — 블록 연결 버튼이 오거나 문구에 안내가 들어 있을 때 */
function detectHandoff(j, answer) {
  if (j.handoff || j.data?.handoff) return true;
  const q = j.template?.quickReplies || [];
  if (q.some((x) => x.blockId && /상담/.test(x.label || ''))) return true;
  return /상담원|상담 연결|확인 후 안내|확인해서 안내/.test(answer || '');
}

const defaultQuick = () => [
  { label: '예약 방법', send: '예약은 어떻게 하나요?' },
  { label: '환불 규정', send: '취소하면 환불되나요?' },
  { label: '요금 안내', send: '요금이 어떻게 되나요?' },
  { label: '예약 조회', send: '__LOOKUP__' },
];

/* ---------- 대체 FAQ (챗봇과 같은 테이블) ---------- */
async function findFaq(env, q, fixedOnly) {
  let rows;
  try {
    const sql = fixedOnly
      ? `SELECT question, answer, keywords FROM bot_faqs WHERE is_fixed=1`
      : `SELECT question, answer, keywords FROM bot_faqs`;
    rows = (await env.DB.prepare(sql).all()).results;
  } catch { return null; }

  let best = null, score = 0;
  for (const k of rows) {
    let s = 0;
    for (const key of (k.keywords || '').split(',').map((x) => x.trim()).filter(Boolean))
      if (q.includes(key)) s += 2;
    for (const w of (k.question || '').split(/\s+/))
      if (w.length > 1 && q.includes(w)) s += 1;
    if (s > score) { score = s; best = k; }
  }
  return score >= 2 ? best : null;
}

async function log(env, sessionId, q, a, source, handoff) {
  const mask = (t) => (t || '')
    .replace(/01[016-9][-\s]?\d{3,4}[-\s]?\d{4}/g, '010-****-****')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '***@***');
  try {
    await env.DB.prepare(
      `INSERT INTO chat_logs (session_id, question, answer, source, resolved, handoff)
       VALUES (?,?,?,?,?,?)`
    ).bind(sessionId, mask(q), mask(a), source, handoff ? 0 : 1, handoff ? 1 : 0).run();
  } catch { /* 무시 */ }
}
