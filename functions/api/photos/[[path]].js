/* R2에 담긴 후기 사진을 내려줍니다 — 버킷을 공개로 열지 않아도 됩니다. */
export async function onRequestGet({ params, env }) {
  if (!env.PHOTOS) return new Response('사진 저장소가 없습니다.', { status: 404 });

  const key = (Array.isArray(params.path) ? params.path.join('/') : params.path || '');
  if (!key || key.includes('..')) return new Response('잘못된 경로입니다.', { status: 400 });

  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('사진을 찾을 수 없습니다.', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: obj.httpEtag,
    },
  });
}
