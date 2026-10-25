// 화면 부품 도우미: 요소 만들기, 알림, 시트(아래에서 올라오는 창)

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let toastBox = null;
export function toast(text, kind = '') {
  if (!toastBox) { toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const t = h('div', { class: 'toast ' + kind }, text);
  toastBox.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// 아래에서 올라오는 시트 (PC에서는 가운데 창)
const stack = [];
export function sheet({ title, body, actions = [], onClose, wide = false, className = '' }) {
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (ev) => { if (ev.key === 'Escape' && stack[stack.length - 1] === api) close(); };
  const panel = h('div', { class: 'sheet-panel' + (wide ? ' wide' : '') + (className ? ' ' + className : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '창' },
    h('div', { class: 'sheet-grab' }),
    title ? h('div', { class: 'sheet-head' }, h('h3', null, title), h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: close }, '✕')) : null,
    h('div', { class: 'sheet-body' }, body),
    actions.length ? h('div', { class: 'sheet-actions' }, actions.map((a) => h('button', { class: 'btn ' + (a.kind || ''), onclick: () => { const r = a.onClick && a.onClick(); if (r !== false) close(); } }, a.label))) : null,
  );
  const wrap = h('div', { class: 'sheet', onclick: (ev) => { if (ev.target === wrap) close(); } }, panel);
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  document.addEventListener('keydown', onKey);
  const api = { close, el: panel, wrap };
  stack.push(api);
  return api;
}
export function closeSheets() { for (const s of stack.slice()) s.close(); }

export function confirmBox(text, okLabel = '확인', kind = 'primary') {
  return new Promise((resolve) => {
    let done = false;
    sheet({
      title: '확인', body: h('p', { class: 'sheet-text' }, text),
      actions: [{ label: '취소', kind: 'ghost', onClick: () => { done = true; resolve(false); } }, { label: okLabel, kind, onClick: () => { done = true; resolve(true); } }],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallback());
  return Promise.resolve(fallback());
  function fallback() {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}

export function fmtTime(ms) {
  const d = new Date(ms);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const hh = d.getHours(); const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${days[d.getDay()]}) ${hh < 12 ? '오전' : '오후'} ${hh % 12 || 12}:${mm}`;
}
