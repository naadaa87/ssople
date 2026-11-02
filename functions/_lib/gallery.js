// 지점 갤러리 — 쏘플이 보정·가공한 지점 사진을 손님 화면(지점·목록·홈·갤러리 화면)에 내보내는 규칙
// 사진 위치(k)는 저장소 사진(/assets/img/gallery/...)이나 사진 저장소(R2) 키(u/...) 둘 다 돼요.
import { GALLERY_SEED } from './gallery-data.js';

export const GAL_CATS = { space: '공간', facility: '시설·분위기', scene: '이렇게 놀아요', poster: '홍보 이미지' };
export const GAL_MAX = 60;
const STATIC_RE = /^\/assets\/img\/gallery\/S-\d{4}\/[\w-]{1,40}\.webp$/;
const R2_RE = /^u\/\d{6}\/[A-Za-z0-9]{8,24}\.(jpg|png|webp)$/;

const urlOf = (k) => (!k ? '' : k.startsWith('/') || /^https?:\/\//.test(k) ? k : '/api/img/' + k);
/** 목록·카드용 작은 사진 — 저장소 사진은 -s.webp 를 함께 만들어 둬요 */
export const thumbOf = (k) => (STATIC_RE.test(k) ? k.replace(/\.webp$/, '-s.webp') : urlOf(k));
export const validGalKey = (k) => STATIC_RE.test(k) || R2_RE.test(k);
/** 작은 사진 — 관리자 화면에서 올린 사진은 작은 크기(s)를 따로 올려 둬요 */
export const smallOf = (it) => (it.s && R2_RE.test(it.s) ? urlOf(it.s) : thumbOf(it.k));

/** 지점 갤러리 원본 목록 — 관리자가 저장한 값이 있으면 그것, 없으면 저장소 기본값 */
export function galleryRaw(s) {
  if (Array.isArray(s.gallery)) return s.gallery;
  const seed = GALLERY_SEED[s.code];
  return seed ? seed.items : [];
}
export function galleryAt(s) {
  if (Array.isArray(s.gallery)) return s.galleryAt || '';
  const seed = GALLERY_SEED[s.code];
  return seed ? seed.at : '';
}
/** 실제 공간 사진(공간·시설)만 — 대표 사진·검색용 사진으로 써요. AI 연출·홍보 이미지는 빼요 */
export const isReal = (it) => (it.c === 'space' || it.c === 'facility') && !it.ai;

/** 손님 화면용 갤러리 */
export function publicGallery(s) {
  return galleryRaw(s).filter((it) => it && it.k && GAL_CATS[it.c]).map((it) => {
    const o = { u: urlOf(it.k), s: smallOf(it), c: it.c, t: it.t || '' };
    if (it.ai) o.ai = 1;
    if (it.w && it.h) { o.w = it.w; o.h = it.h; }
    return o;
  });
}

/** 대표 사진 순서 — 보정한 실제 사진을 앞에, 원래 지점 사진은 그 뒤에 (같은 사진은 한 번만) */
export function photoKeys(s) {
  const real = galleryRaw(s).filter((it) => it && it.k && isReal(it)).map((it) => it.k);
  const rest = (s.photos || []).map((p) => (typeof p === 'string' ? p : p && p.k)).filter(Boolean);
  return [...new Set([...real, ...rest])];
}
/** 카드 첫 사진 (작은 사진) */
export function coverOf(s) {
  const first = galleryRaw(s).find((it) => it && it.k && isReal(it));
  if (first) return smallOf(first);
  const p = (s.photos || [])[0];
  return p ? urlOf(typeof p === 'string' ? p : p.k) : '';
}
export const photoUrls = (s) => photoKeys(s).map(urlOf);

/** 관리자 저장값 다듬기 */
export function cleanGallery(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const it of list.slice(0, GAL_MAX)) {
    if (!it || typeof it !== 'object') continue;
    const k = String(it.k || '').trim();
    if (!validGalKey(k)) continue;
    const c = GAL_CATS[it.c] ? it.c : 'space';
    const o = { k, c, t: String(it.t || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
    if (it.ai) o.ai = 1;
    if (it.s && R2_RE.test(String(it.s))) o.s = String(it.s);
    const w = Number(it.w), h = Number(it.h);
    if (w > 0 && h > 0 && w < 10000 && h < 10000) { o.w = Math.round(w); o.h = Math.round(h); }
    out.push(o);
  }
  return out;
}
