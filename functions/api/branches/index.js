/* 지점(공간) 목록 — 날짜를 고르면 그날 예약 가능한 곳만 남습니다 */
import { ok } from '../../lib/core.js';
import { getAvailability } from '../../lib/booking.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const region  = u.searchParams.get('region');
  const purpose = u.searchParams.get('purpose');
  const date    = u.searchParams.get('date');
  const people  = Number(u.searchParams.get('people') || 0);
  const sort    = u.searchParams.get('sort') || 'recommend';
  const area    = u.searchParams.get('area');

  const where = [`b.status='open'`], bind = [];
  if (region && region !== 'all') { where.push(`b.region=?`); bind.push(region); }
  if (area) { where.push(`b.area=?`); bind.push(area); }
  if (people) { where.push(`b.max_people>=?`); bind.push(people); }
  if (u.searchParams.get('pet') === '1')     where.push(`b.pet_ok=1`);
  if (u.searchParams.get('bbq') === '1')     where.push(`b.bbq_ok=1`);
  if (u.searchParams.get('karaoke') === '1') where.push(`b.karaoke_ok=1`);

  const { results } = await env.DB.prepare(
    `SELECT b.*,
            (SELECT url FROM branch_photos WHERE branch_id=b.id ORDER BY is_main DESC, sort_no LIMIT 1) AS photo,
            (SELECT COUNT(*) FROM reviews WHERE branch_id=b.id AND hidden=0) AS review_count,
            (SELECT ROUND(AVG(rating),1) FROM reviews WHERE branch_id=b.id AND hidden=0) AS rating
       FROM branches b WHERE ${where.join(' AND ')}`
  ).bind(...bind).all();

  let list = results;

  if (purpose && purpose !== 'all') {
    list = list.filter((b) => tags(b).includes(purpose) || amenities(b).includes(purpose));
  }

  if (date) {
    const checked = [];
    for (const b of list) {
      const av = await getAvailability(env, b.id, date);
      if (av.error) continue;
      const free = av.slots.filter((s) => s.available);
      if (free.length) checked.push({ ...b, freeSlots: free.map((s) => s.slot) });
    }
    list = checked;
  }

  const minPrice = (b) => {
    const c = [b.day_price, b.night_price].filter((x) => x > 0);
    return c.length ? Math.min(...c) : null;
  };

  if (sort === 'price')       list.sort((a, b) => (minPrice(a) || 1e9) - (minPrice(b) || 1e9));
  else if (sort === 'review') list.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
  else list.sort((a, b) => ((b.rating || 0) * 10 + (b.review_count || 0) * 0.1)
                         - ((a.rating || 0) * 10 + (a.review_count || 0) * 0.1));

  return ok({
    count: list.length,
    branches: list.map((b) => ({
      id: b.id, code: b.code, name: b.name, region: b.region, area: b.area, address: b.address,
      photo: b.photo, tags: tags(b), amenities: amenities(b), features: parse(b.features),
      petOk: !!b.pet_ok, bbqOk: !!b.bbq_ok, karaokeOk: !!b.karaoke_ok, mgmtType: b.mgmt_type,
      bookingMode: b.booking_mode || 'naver',
      naverPlace: b.naver_place || null,
      dayPrice: b.day_price, nightPrice: b.night_price,
      basePeople: b.base_people, maxPeople: b.max_people, extraPrice: b.extra_price,
      minPrice: minPrice(b), rating: b.rating, reviewCount: b.review_count,
      freeSlots: b.freeSlots || null,
    })),
  });
}

const parse = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
const tags = (b) => parse(b.tags);
const amenities = (b) => parse(b.amenities);
