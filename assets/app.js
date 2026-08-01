/* ============================================================
   공통 — API 호출 · 알림 · 포맷 · 인증
   ============================================================ */

const API = {
  async call(path, { method = 'GET', body, silent = false } = {}) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opt.headers['content-type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    let d;
    try {
      const res = await fetch(path, opt);
      d = await res.json();
    } catch {
      if (!silent) toast('연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.', 'bad');
      throw new Error('NETWORK');
    }
    if (!d.ok) {
      if (!silent) toast(d.message || '처리하지 못했습니다.', 'bad');
      const e = new Error(d.message || 'ERROR');
      e.code = d.code;
      e.payload = d;
      throw e;
    }
    return d;
  },
  get:  (p, o)    => API.call(p, { ...o }),
  post: (p, b, o) => API.call(p, { method: 'POST', body: b, ...o }),
  del:  (p, o)    => API.call(p, { method: 'DELETE', ...o }),
};

function toast(msg, kind = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.setAttribute('role', 'status');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

/* ---------- 포맷 ---------- */
const won = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR') + '원');
const num = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));

const SLOT_LABEL = { day: '낮타임', night: '밤타임' };

function dateLabel(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00+09:00');
  const w = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${w})`;
}

function todayStr(offset = 0) {
  return new Date(Date.now() + 9 * 3600 * 1000 + offset * 86400000).toISOString().slice(0, 10);
}

const STATUS = {
  waiting:   ['입금 대기', 'badge-warn'],
  confirmed: ['예약 확정', 'badge-ok'],
  completed: ['이용 완료', 'badge-ink'],
  canceled:  ['취소됨', 'badge-bad'],
  noshow:    ['노쇼', 'badge-bad'],
};
const statusBadge = (s) => {
  const [l, c] = STATUS[s] || [s, 'badge-ink'];
  return `<span class="badge ${c}">${l}</span>`;
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- 인증 ---------- */
async function whoami() {
  try { return await API.get('/api/auth/me', { silent: true }); }
  catch { return { authenticated: false }; }
}

async function logout() {
  await API.post('/api/auth/logout', {}, { silent: true }).catch(() => {});
  location.href = '/';
}

/* ---------- 모달 ---------- */
function modal({ title, body, confirmText = '확인', cancelText = '닫기', onConfirm, danger }) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-h"><h3>${esc(title)}</h3></div>
      <div class="modal-b">${body}</div>
      <div class="modal-f">
        <button class="btn btn-line" data-x>${esc(cancelText)}</button>
        ${onConfirm ? `<button class="btn ${danger ? 'btn-danger' : 'btn-clay'}" data-ok>${esc(confirmText)}</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.querySelector('[data-x]').onclick = close;
  mask.onclick = (e) => { if (e.target === mask) close(); };
  const okBtn = mask.querySelector('[data-ok]');
  if (okBtn) okBtn.onclick = async () => {
    okBtn.disabled = true;
    okBtn.innerHTML = '<span class="spin"></span>';
    try { await onConfirm(mask); close(); }
    catch { okBtn.disabled = false; okBtn.textContent = confirmText; }
  };
  const onEsc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
  return { close, el: mask };
}

const loading = (msg = '불러오는 중입니다') =>
  `<div class="empty"><div class="skel" style="height:14px;width:170px;margin:0 auto 12px"></div>${msg}</div>`;

const emptyState = (title, desc) =>
  `<div class="empty"><b>${esc(title)}</b>${esc(desc || '')}</div>`;
