/* 최근 후기 — 고객 이용후기 페이지용 */
import { ok } from '../../lib/core.js';
export async function onRequestGet({ request, env }) {
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit') || 30), 60);
  const { results } = await env.DB.prepare(
    `SELECT rv.rating, rv.content, rv.photos, rv.created_at, rv.reply,
            c.name, b.name branch_name, b.id branch_id
       FROM reviews rv JOIN customers c ON c.id=rv.customer_id
       JOIN branches b ON b.id=rv.branch_id
      WHERE rv.visibility='visible'
      ORDER BY rv.created_at DESC LIMIT ?`).bind(limit).all();
  return ok({ reviews: results.map((r) => ({
    rating: r.rating, content: r.content, reply: r.reply,
    photos: r.photos ? JSON.parse(r.photos) : [],
    author: r.name ? r.name[0] + '*'.repeat(Math.max(0, r.name.length - 1)) : '',
    branch: r.branch_name, branchId: r.branch_id, createdAt: r.created_at,
  })) });
}
