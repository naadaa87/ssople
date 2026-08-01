import { ok, readSession } from '../../lib/core.js';
export async function onRequestGet({ request, env }) {
  const s = await readSession(env, request);
  if (!s) return ok({ authenticated: false });
  return ok({ authenticated: true, name: s.name, grade: s.grade, customerId: s.customerId });
}
