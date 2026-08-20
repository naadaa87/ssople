/* ============================================================
   후기 사진 업로드 — R2(PHOTOS)에 저장하고 공개 경로를 돌려줍니다.
   본인 예약인지, 이용 완료인지 확인한 뒤에만 받습니다.
   R2 바인딩이 없으면 사진 없이 글만 남기도록 안내합니다.
   ============================================================ */

import { ok, err, readJson, requireCustomer } from '../../lib/core.js';

const MAX_FILES = 3;
const MAX_BYTES = 2.5 * 1024 * 1024;   /* 장당 2.5MB */
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function onRequestPost({ request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;
  if (!env.PHOTOS) return err('사진 업로드가 아직 준비되지 않았습니다. 글로 남겨주세요.', 503);

  const b = await readJson(request);
  const resId = Number(b.reservationId);
  const images = Array.isArray(b.images) ? b.images.slice(0, MAX_FILES) : [];
  if (!resId || !images.length) return err('업로드할 사진이 없습니다.');

  const r = await env.DB.prepare(
    `SELECT id, status FROM reservations WHERE id=? AND customer_id=?`
  ).bind(resId, session.customerId).first();
  if (!r) return err('예약을 찾을 수 없습니다.', 404);
  if (r.status !== 'completed') return err('이용이 끝난 예약에만 사진을 올릴 수 있습니다.');

  const urls = [];
  for (const dataUrl of images) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
    if (!m) return err('jpg · png · webp 사진만 올릴 수 있습니다.');
    const bytes = base64ToBytes(m[2]);
    if (bytes.byteLength > MAX_BYTES)
      return err('사진 한 장은 2.5MB까지 올릴 수 있습니다. 조금 줄여서 다시 시도해 주세요.');

    const key = `reviews/${resId}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${TYPES[m[1]]}`;
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: m[1] } });
    urls.push(`/api/photos/${key}`);
  }

  return ok({ urls });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
