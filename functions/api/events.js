/* 이벤트·공지 — 고객 화면용 */
import { ok, kstToday } from '../lib/core.js';
export async function onRequestGet({ env }) {
  const today = kstToday();
  const { results } = await env.DB.prepare(
    `SELECT * FROM web_events WHERE status='published'
       AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?)
     ORDER BY pinned DESC, created_at DESC LIMIT 30`).bind(today, today).all();
  return ok({ events: results });
}
