// 쏘플파티룸 호스트센터 (/hostcenter) — 호스트·점주 안내 화면
// 정적 틀(hostcenter.html)에는 로그인 칸만 있고, 안내 본문은 들어올 수 있는 사람에게만 서버가 끼워 넣는다
import { Ctx } from './_lib/ctx.js';
import { ensureSchema } from './_lib/db.js';
import { renderStatic } from './_lib/ssr.js';
import { hcAccess } from './_lib/hostcenter.js';
import { HC_BODY } from './_lib/hostcenter-body.js';

export const onRequest = async (context) => {
  if (!['GET', 'HEAD'].includes(context.request.method)) return context.next();
  let access = null;
  try {
    if (context.env.DB) {
      await ensureSchema(context.env);
      access = await hcAccess(new Ctx(context));
    }
  } catch { access = null; }
  const res = await renderStatic(context);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('text/html')) return res;
  const rw = new HTMLRewriter();
  if (access) {
    rw.on('#hcGate', { element(el) { el.remove(); } })
      .on('#hcApp', { element(el) { el.setInnerContent(HC_BODY, { html: true }); el.removeAttribute('hidden'); el.setAttribute('data-access', access.kind); } });
  } else {
    rw.on('#hcApp', { element(el) { el.remove(); } });
  }
  const out = rw.transform(res);
  const h = new Headers(out.headers);
  h.set('cache-control', 'private, no-store');
  h.set('x-robots-tag', 'noindex');
  h.delete('content-length'); h.delete('etag');
  return new Response(out.body, { status: 200, headers: h });
};
