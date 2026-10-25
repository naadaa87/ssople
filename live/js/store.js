// 이 기기에만 저장하는 정보 (닉네임, 아바타, 설정, 최근 방)
const PREFIX = 'sl.';

export function load(key, def) {
  try { const v = localStorage.getItem(PREFIX + key); return v == null ? def : JSON.parse(v); } catch { return def; }
}
export function save(key, val) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch { /* 저장이 막힌 브라우저 */ }
}

export function deviceId() {
  let d = load('dev', null);
  if (!d || !/^[a-zA-Z0-9_-]{8,64}$/.test(d)) {
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.random() * 256; });
    d = 'd' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    save('dev', d);
  }
  return d;
}

export function settings() {
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  return { sound: true, low: false, joystick: isTouch, ...load('settings', {}) };
}
export function saveSettings(s) { save('settings', s); }

export function recentRooms() { return load('recent', []).filter((r) => r && r.code); }
export function addRecent(room) {
  const list = recentRooms().filter((r) => r.code !== room.code);
  list.unshift({ code: room.code, name: room.name, theme: room.theme, at: Date.now() });
  save('recent', list.slice(0, 6));
}
export function removeRecent(code) { save('recent', recentRooms().filter((r) => r.code !== code)); }
