// 초대하기: 링크 복사, 카카오톡 공유, 휴대폰 공유, QR
import qrcode from './vendor/qrcode.mjs';

export function drawQR(canvas, text, { fg = '#1F1A1D', bg = '#FFFFFF', margin = 2 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = canvas.width;
  const cell = size / (n + margin * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = fg;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(Math.floor((c + margin) * cell), Math.floor((r + margin) * cell), Math.ceil(cell), Math.ceil(cell));
}

let kakaoLoading = null;
export function loadKakao(key) {
  if (!key) return Promise.resolve(null);
  if (window.Kakao && window.Kakao.isInitialized && window.Kakao.isInitialized()) return Promise.resolve(window.Kakao);
  if (kakaoLoading) return kakaoLoading;
  kakaoLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => { try { if (!window.Kakao.isInitialized()) window.Kakao.init(key); resolve(window.Kakao); } catch { resolve(null); } };
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
  return kakaoLoading;
}

export async function kakaoShare(key, { url, title, desc, image }) {
  const K = await loadKakao(key);
  if (!K || !K.Share) return false;
  try {
    K.Share.sendDefault({
      objectType: 'feed',
      content: { title, description: desc, imageUrl: image, link: { mobileWebUrl: url, webUrl: url } },
      buttons: [{ title: '파티룸 들어가기', link: { mobileWebUrl: url, webUrl: url } }],
    });
    return true;
  } catch { return false; }
}

export async function webShare({ url, title, text }) {
  if (!navigator.share) return false;
  try { await navigator.share({ url, title, text }); return true; } catch { return false; }
}
