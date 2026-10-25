// 받침에 맞춰 조사를 붙여요: josa('곰인형', '은', '는') → '곰인형은'
export function hasFinal(word) {
  const s = String(word || '').trim();
  const ch = s.charCodeAt(s.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28 !== 0;
  if (/[0-9]$/.test(s)) return /[013678]$/.test(s);
  if (/[a-zA-Z]$/.test(s)) return /[lmnr]$/i.test(s);
  return false;
}
export const josa = (word, withFinal, withoutFinal) => String(word) + (hasFinal(word) ? withFinal : withoutFinal);
