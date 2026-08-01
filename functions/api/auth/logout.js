import { ok, readSession, destroySession, clearCookie } from '../../lib/core.js';
export async function onRequestPost({ request, env }) {
  const s = await readSession(env, request);
  if (s) await destroySession(env, s.token);
  return ok({ loggedOut: true }, { headers: { 'set-cookie': clearCookie() } });
}
