/* 최근 후기 — 고객 이용후기 페이지용 */
import { ok } from '../../lib/core.js';

export async function onRequestGet({ request, env }) {
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit') || 30), 60);
  const { results } = await env.DB.prepare(
    `SELECT rv.rating, rv.content, rv.photos, rv.created_at, rv.reply, rv.writer,
            b.name branch_name, b.id branch_id
       FROM reviews rv JOIN branches b ON b.id = rv.branch_id
      WHERE rv.hidden = 0
      ORDER BY rv.created_at DESC LIMIT ?`).bind(limit).all();

  return ok({ reviews: results.map((r) => ({
    rating: r.rating, content: r.content, reply: r.reply,
    photos: parse(r.photos),
    author: mask(r.writer),
    branch: r.branch_name, branchId: r.branch_id, createdAt: r.created_at,
  })) });
}

const parse = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
const mask = (n) => (!n ? '고객' : n.length <= 1 ? n : n[0] + '*'.repeat(n.length - 1));
