// 금칙어 필터. 단어를 추가하려면 BAD 목록에 넣으면 됩니다.
// '보지 마', '새끼손가락'처럼 평범한 말이 걸리지 않도록 짧은 단어는 넣지 않았습니다.
const BAD = [
  '시발', '씨발', '씨빨', '시빨', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '븅신', '개새끼', '좆', 'ㅈㄴ', '존나',
  '니애미', '느금마', '미친놈', '미친년', '또라이', '찐따', '썅', '쌍놈', '쌍년', '창녀', '섹스',
  'sex', 'fuck', 'shit', 'bitch', 'fxck',
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = BAD.map((w) => new RegExp(w.split('').filter((c) => c !== ' ').map(esc).join('[\\s._\\-*]*'), 'gi'));

export function clean(text) {
  let out = String(text ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g, '').trim();
  for (const re of PATTERNS) out = out.replace(re, (m) => '*'.repeat(Math.min(m.length, 4)));
  return out;
}

export function hasBad(text) {
  const t = String(text ?? '');
  return PATTERNS.some((re) => { re.lastIndex = 0; const hit = re.test(t); re.lastIndex = 0; return hit; });
}

export function cleanNick(nick, fallback = '손님') {
  let n = String(nick ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤﻿<>]/g, '').replace(/\s+/g, ' ').trim();
  n = Array.from(n).slice(0, 10).join('');
  if (!n || hasBad(n)) return fallback;
  return n;
}

export function cleanLine(text, max) {
  return Array.from(clean(text).replace(/\s+/g, ' ')).slice(0, max).join('');
}

export function normAnswer(s) {
  return String(s ?? '').replace(/[\s.,!?~'"()\-]/g, '').toLowerCase();
}
