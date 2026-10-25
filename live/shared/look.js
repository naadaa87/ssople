// 아바타 모습 값 검사 — 서버(실시간·홈페이지)와 화면이 같이 씁니다.
export const LOOK_RANGES = { skin: 5, hair: 8, hairColor: 8, top: 8, topColor: 10, bottom: 6, acc: 9 };
export const DEFAULT_LOOK = { skin: 1, hair: 0, hairColor: 0, top: 0, topColor: 0, bottom: 0, acc: 0 };

export function cleanLook(look) {
  const out = {};
  for (const [k, n] of Object.entries(LOOK_RANGES)) {
    const v = Number(look?.[k]);
    out[k] = Number.isInteger(v) && v >= 0 && v < n ? v : DEFAULT_LOOK[k];
  }
  return out;
}
