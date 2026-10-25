// 효과음: 파일 없이 브라우저에서 바로 만들어 냅니다.
let ac = null;
let on = true;
let master = null;

export function setSound(v) { on = !!v; }
export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.32; master.connect(ac.destination);
}

function tone(freq, start, dur, { type = 'sine', vol = 0.5, slide = 0, attack = 0.005 } = {}) {
  const o = ac.createOscillator(); const g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g); g.connect(master);
  o.start(start); o.stop(start + dur + 0.02);
}
function noise(start, dur, vol = 0.3, hp = 1200) {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ac.createBufferSource(); s.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ac.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(start);
}

const SOUNDS = {
  pop(t) { tone(660, t, 0.09, { type: 'triangle', vol: 0.35, slide: 1.6 }); },
  click(t) { tone(880, t, 0.05, { type: 'square', vol: 0.12 }); },
  join(t) { tone(523, t, 0.12, { vol: 0.3 }); tone(784, t + 0.08, 0.16, { vol: 0.3 }); },
  leave(t) { tone(523, t, 0.12, { vol: 0.2 }); tone(392, t + 0.08, 0.16, { vol: 0.2 }); },
  chat(t) { tone(1046, t, 0.06, { type: 'sine', vol: 0.12 }); },
  correct(t) { tone(659, t, 0.12, { type: 'triangle', vol: 0.4 }); tone(880, t + 0.1, 0.12, { type: 'triangle', vol: 0.4 }); tone(1318, t + 0.2, 0.22, { type: 'triangle', vol: 0.35 }); },
  wrong(t) { tone(330, t, 0.18, { type: 'sawtooth', vol: 0.18, slide: 0.7 }); tone(247, t + 0.14, 0.26, { type: 'sawtooth', vol: 0.16, slide: 0.7 }); },
  tick(t) { tone(1200, t, 0.03, { type: 'square', vol: 0.08 }); },
  start(t) { [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.07, 0.14, { type: 'triangle', vol: 0.3 })); },
  reveal(t) { tone(392, t, 0.1, { type: 'triangle', vol: 0.3 }); tone(587, t + 0.1, 0.2, { type: 'triangle', vol: 0.3 }); },
  fanfare(t) { [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.11, i === 7 ? 0.5 : 0.12, { type: 'triangle', vol: 0.32 })); },
  cheers(t) { tone(2093, t, 0.25, { type: 'sine', vol: 0.18 }); tone(2637, t + 0.02, 0.3, { type: 'sine', vol: 0.12 }); tone(3136, t + 0.05, 0.35, { type: 'sine', vol: 0.08 }); noise(t, 0.08, 0.08, 3000); },
  shutter(t) { noise(t, 0.05, 0.4, 2000); noise(t + 0.07, 0.06, 0.3, 2500); },
  blow(t) { noise(t, 0.35, 0.18, 600); },
  whoosh(t) { noise(t, 0.3, 0.12, 900); },
  coin(t) { tone(988, t, 0.07, { type: 'square', vol: 0.12 }); tone(1319, t + 0.06, 0.16, { type: 'square', vol: 0.12 }); },
  level(t) { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.08, 0.18, { type: 'triangle', vol: 0.3 })); },
  bomb(t) { noise(t, 0.28, 0.35, 200); tone(120, t, 0.3, { type: 'sawtooth', vol: 0.2, slide: 0.5 }); },
  miss(t) { tone(240, t, 0.08, { type: 'square', vol: 0.08 }); },
  bark(t) { tone(520, t, 0.07, { type: 'square', vol: 0.12, slide: 0.7 }); tone(600, t + 0.11, 0.07, { type: 'square', vol: 0.12, slide: 0.7 }); },
  spin(t) { for (let i = 0; i < 16; i++) tone(900, t + i * (0.06 + i * 0.012), 0.03, { type: 'square', vol: 0.06 }); },
  birthday(t) {
    // 생일 축하 노래 (공유 저작물) 첫 소절
    const n = { G4: 392, A4: 440, C5: 523, B4: 494, D5: 587 };
    const seq = [['G4', 0.3], ['G4', 0.15], ['A4', 0.45], ['G4', 0.45], ['C5', 0.45], ['B4', 0.9], ['G4', 0.3], ['G4', 0.15], ['A4', 0.45], ['G4', 0.45], ['D5', 0.45], ['C5', 0.9]];
    let s = t;
    for (const [k, d] of seq) { tone(n[k], s, d * 0.95, { type: 'triangle', vol: 0.28 }); s += d; }
  },
};

export function play(name) {
  if (!on || !ac || ac.state !== 'running') return;
  const f = SOUNDS[name];
  if (f) { try { f(ac.currentTime + 0.01); } catch { /* 소리 실패는 무시 */ } }
}

/** 음 하나 (리듬 게임·피아노) */
export function playNote(freq, dur = 0.22, type = 'triangle') {
  if (!on || !ac || ac.state !== 'running') return;
  try { tone(freq, ac.currentTime + 0.005, dur, { type, vol: 0.32 }); } catch { /* 무시 */ }
}
