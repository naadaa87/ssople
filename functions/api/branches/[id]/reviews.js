/* 지점 후기 — 실제 이용이 확인된 것만.
   점주가 호스트 센터에서 숨김 처리한 후기는 빠집니다. */
import { ok } from '../../../lib/core.js';

export async function onRequestGet({ params, env }) {
  const { results } = await env.DB.prepare(
    `SELECT rating, content, photos, reply, reply_updated_at, created_at, writer
       FROM reviews
      WHERE branch_id=? AND hidden=0
      ORDER BY (photos IS NOT NULL AND photos <> '[]') DESC, created_at DESC LIMIT 50`
  ).bind(Number(params.id)).all();

  return ok({
    reviews: results.map((r) => ({
      rating: r.rating, content: r.content,
      photos: parse(r.photos),
      reply: r.reply, repliedAt: r.reply_updated_at,
      author: mask(r.writer), createdAt: r.created_at,
    })),
  });
}

const parse = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
const mask = (n) => (!n ? '고객' : n.length <= 1 ? n : n[0] + '*'.repeat(n.length - 1));
