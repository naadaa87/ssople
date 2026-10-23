// 옛 아임웹 지점 사진 옮기기 — 아임웹 게시물에 있던 공간사진을 사진 저장소(R2)로 가져와 지점 사진에 붙인다
// 관리자 화면 "아임웹 사진 가져오기" 버튼이 지점마다 몇 장씩 나눠 부른다 (한 번에 많이 받으면 시간 제한에 걸린다)
import { HttpError, slug, kstNow, parseJSON } from './util.js';
import { loadSpaces, saveSpace, photoUrl, PHOTO_MAX } from './spaces.js';
import { IMWEB_PHOTOS } from './imweb-photos-data.js';

const SRC_RE = /^https:\/\/daroom\.b-cdn\.net\/space\/(\d+\/[\w-]+\.(?:jpe?g|png|webp))$/i;
const PER_CALL = 6;
const MAX_BYTES = 5 * 1024 * 1024;

/** 원본 주소 → 기록용 짧은 이름 (예: 231/230016_wMM6YcXjnJZ8.jpg) */
export function srcId(u) {
  const m = SRC_RE.exec(String(u || '').split('?')[0]);
  return m ? m[1] : '';
}

/**
 * 지점 하나의 진행 상황
 * photoSrc: { 원본이름: 저장 키 | 'legacy'(처음 업로드분) | '!'(받지 못함) }
 * 처음 업로드분(2026.10.23)은 아임웹 순서 앞쪽부터 들어가 있어서, 기록이 없으면 지금 사진 수만큼 앞에서부터 받은 것으로 본다.
 */
export function planOf(space) {
  const src = (IMWEB_PHOTOS[space.code] || []).filter((u) => srcId(u));
  const map = { ...(space.photoSrc || {}) };
  const have = (space.photos || []).length;
  if (!space.photoSrc && have) {
    const n = Math.min(src.length, have);
    for (let i = 0; i < n; i++) map[srcId(src[i])] = 'legacy';
  }
  const fresh = src.filter((u) => !(srcId(u) in map));
  const failed = src.filter((u) => map[srcId(u)] === '!');
  const done = src.length - fresh.length - failed.length;
  return { src, map, fresh, failed, done, have, room: Math.max(0, PHOTO_MAX - have) };
}

function summary(space) {
  const p = planOf(space);
  return {
    code: space.code, name: space.name, visible: !!space.visible,
    have: p.have, total: p.src.length, done: p.done,
    pending: Math.min(p.fresh.length + p.failed.length, p.room), missed: p.failed.length, full: p.room === 0,
  };
}

/** 지점 하나를 DB에서 바로 읽기 (목록 캐시를 거치지 않아 방금 고친 내용까지 보인다) */
async function loadOne(db, code) {
  const r = await db.prepare('SELECT code, name, region, area, visible, sort, data FROM spaces WHERE code = ?').bind(code).first();
  if (!r) return null;
  return { ...parseJSON(r.data, {}), code: r.code, name: r.name, region: r.region, area: r.area, visible: !!r.visible, sort: r.sort };
}

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['jpg', 'image/jpeg'];
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ['png', 'image/png'];
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45) return ['webp', 'image/webp'];
  return null;
}

/** 원본 서버에서 사진 받기 — 긴 변 1600px 판을 먼저 시도하고, 안 되면 원래 크기로 */
async function grab(src) {
  const u = String(src).split('?')[0];
  const tries = [`${u}?type=w&w=1600&quality=85`, `${u}?type=w&w=900&quality=90`, u];
  let why = '받지 못함';
  for (const t of tries) {
    try {
      const r = await fetch(t, { headers: { accept: 'image/jpeg,image/png,image/*;q=0.8', 'user-agent': 'Mozilla/5.0 (compatible; ssople-photo-import)' }, redirect: 'follow' });
      if (!r.ok) { why = `원본 서버 응답 ${r.status}`; continue; }
      const len = Number(r.headers.get('content-length') || 0);
      if (len > MAX_BYTES) { why = '5MB 넘음'; continue; }
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) { why = '5MB 넘음'; continue; }
      if (buf.byteLength < 1024) { why = '빈 파일'; continue; }
      const kind = sniff(buf);
      if (!kind) { why = '사진 파일이 아님'; continue; }
      return { buf, ext: kind[0], ct: kind[1] };
    } catch (e) {
      why = '연결 실패';
    }
  }
  throw new Error(why);
}

export function register(route) {
  route('GET', '/api/admin/imweb-photos', async (c) => {
    await c.needAdmin('staff');
    const list = await loadSpaces(c.db, { all: true });
    const rows = list.filter((s) => IMWEB_PHOTOS[s.code]).map(summary);
    return {
      spaces: rows,
      total: rows.reduce((a, r) => a + r.pending, 0),
      visiblePending: rows.filter((r) => r.visible).reduce((a, r) => a + r.pending, 0),
      max: PHOTO_MAX,
    };
  });

  route('POST', '/api/admin/spaces/:code/imweb-photos', async (c) => {
    await c.needAdmin('admin');
    if (!c.env.PHOTOS) throw new HttpError(503, '사진 저장소(PHOTOS)가 연결돼야 가져올 수 있어요.');
    await c.limit('imweb-ph', 300, 3600, '사진을 너무 많이 가져왔어요. 한 시간 뒤에 이어서 해 주세요.');
    const space = await loadOne(c.db, c.params.code);
    if (!space) throw new HttpError(404, '지점을 찾을 수 없어요.');
    if (!IMWEB_PHOTOS[space.code]) throw new HttpError(404, '아임웹에 이 지점 사진이 없어요.');

    const p = planOf(space);
    // 처음 받는 사진을 다 넣은 뒤에야, 지난번에 못 받은 사진을 다시 시도한다 (한 번 누를 때 같은 사진을 두 번 시도하지 않게)
    const queue = (p.fresh.length ? p.fresh : p.failed).slice(0, Math.min(PER_CALL, p.room));
    const n = kstNow();
    const ym = `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
    const got = await Promise.all(queue.map(async (u) => {
      try {
        const g = await grab(u);
        const key = `u/${ym}/${slug(16)}.${g.ext}`;
        await c.env.PHOTOS.put(key, g.buf, {
          httpMetadata: { contentType: g.ct, cacheControl: 'public, max-age=31536000, immutable' },
          customMetadata: { uid: 'imweb', src: srcId(u) },
        });
        return { u, key };
      } catch (e) {
        return { u, err: e.message || '받지 못함' };
      }
    }));

    // 받는 사이 다른 화면에서 고쳤을 수 있으니 최신 지점 정보에 붙인다
    const fresh = (await loadOne(c.db, space.code)) || space;
    const map = { ...planOf(fresh).map };
    const photos = (fresh.photos || []).slice();
    const failed = [], added = [];
    for (const g of got) {
      const id = srcId(g.u);
      if (map[id] && map[id] !== '!') continue;   // 그사이 다른 요청이 먼저 넣은 사진
      if (g.key && photos.length < PHOTO_MAX) { photos.push({ k: g.key }); map[id] = g.key; added.push({ k: g.key, url: photoUrl(g.key) }); }
      else if (g.err) { map[id] = '!'; failed.push({ src: id, why: g.err }); }
    }
    const { code, visible, sort, updated_at, ...rest } = fresh;
    const next = { ...rest, photos, photoSrc: map, edited: true };
    if (added.length || failed.length) await saveSpace(c.db, space.code, next, { visible: fresh.visible, sort: fresh.sort });

    const after = summary({ ...next, code: space.code, name: fresh.name, visible: fresh.visible });
    return {
      ok: true,
      added: added.length,
      addedPhotos: added,
      failed,
      more: planOf({ ...next, code: space.code }).fresh.length > 0 && after.have < PHOTO_MAX,
      ...after,
      photos: photos.map((ph) => ({ k: ph.k, url: photoUrl(ph) })),
    };
  });
}
