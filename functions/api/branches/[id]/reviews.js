/* 지점 후기 — 실제 이용이 확인된 것만 */
import { ok } from '../../../lib/core.js';

export async function onRequestGet({ params, env }) {
  const { results } = await env.DB.prepare(
    `SELECT rv.rating, rv.content, rv.photos, rv.reply, rv.replied_at, rv.created_at, c.name
       FROM reviews rv JOIN customers c ON c.id=rv.customer_id
      WHERE rv.branch_id=? AND rv.visibility='visible'
      ORDER BY (rv.photos IS NOT NULL) DESC, rv.created_at DESC LIMIT 50`
  ).bind(Number(params.id)).all();

  return ok({
    reviews: results.map((r) => ({
      rating: r.rating, content: r.content,
      photos: r.photos ? JSON.parse(r.photos) : [],
      reply: r.reply, repliedAt: r.replied_at,
      author: mask(r.name), createdAt: r.created_at,
    })),
  });
}
const mask = (n) => (!n ? '' : n.length <= 1 ? n : n[0] + '*'.repeat(n.length - 1));
