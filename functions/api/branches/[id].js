/* 지점 상세 */
import { ok, err } from '../../lib/core.js';
import { slotTime, SLOT_LABEL, slotPrice, branchDeposit } from '../../lib/booking.js';

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
      WHERE branch_id=? AND hidden=0`).bind(id).first();

  const deposit = await branchDeposit(env, b);
  let priceRules = null;
  try { priceRules = b.price_rules ? JSON.parse(b.price_rules) : null; } catch { priceRules = null; }

  return ok({
    branch: {
      id: b.id, code: b.code, name: b.name, region: b.region, area: b.area,
      address: b.address, lat: b.lat, lng: b.lng,
      mgmtType: b.mgmt_type, deposit, priceRules,
      features: parse(b.features), petOk: !!b.pet_ok, bbqOk: !!b.bbq_ok, karaokeOk: !!b.karaoke_ok,
      intro: b.intro, guideText: b.guide_text, parkingText: b.parking_text,
      dayPrice: b.day_price, nightPrice: b.night_price,
      basePeople: b.base_people, extraPrice: b.extra_price, maxPeople: b.max_people,
      tags: parse(b.tags), amenities: parse(b.amenities),
      photos: photos.map((p) => p.url),
      slots: ['day', 'night'].map((s) => ({
        slot: s, label: SLOT_LABEL[s], time: slotTime(b, s).label,
        price: slotPrice(b, s),
      })),
      rating: rv?.avg || null, reviewCount: rv?.c || 0,
    },
  });
}
const parse = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
