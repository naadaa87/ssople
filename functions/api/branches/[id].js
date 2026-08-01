/* 지점 상세 */
import { ok, err } from '../../lib/core.js';
import { slotTime, SLOT_LABEL } from '../../lib/booking.js';

export async function onRequestGet({ params, env }) {
  const id = Number(params.id);
  const b = await env.DB.prepare(
    `SELECT * FROM branches WHERE id=? AND status='open'`).bind(id).first();
  if (!b) return err('지점을 찾을 수 없습니다.', 404);

  const { results: photos } = await env.DB.prepare(
    `SELECT url FROM branch_photos WHERE branch_id=? ORDER BY is_main DESC, sort_no`
  ).bind(id).all();

  const rv = await env.DB.prepare(
    `SELECT COUNT(*) c, ROUND(AVG(rating),1) avg FROM reviews
      WHERE branch_id=? AND visibility='visible'`).bind(id).first();

  return ok({
    branch: {
      id: b.id, code: b.code, name: b.name, region: b.region,
      address: b.address, lat: b.lat, lng: b.lng,
      intro: b.intro, guideText: b.guide_text, parkingText: b.parking_text,
      dayPrice: b.day_price, nightPrice: b.night_price,
      basePeople: b.base_people, extraPrice: b.extra_price, maxPeople: b.max_people,
      tags: parse(b.tags), amenities: parse(b.amenities),
      photos: photos.map((p) => p.url),
      slots: ['day', 'night'].map((s) => ({
        slot: s, label: SLOT_LABEL[s], time: slotTime(b, s).label,
        price: s === 'night' ? b.night_price : b.day_price,
      })),
      rating: rv?.avg || null, reviewCount: rv?.c || 0,
    },
  });
}
const parse = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
