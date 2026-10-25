// 운영 관리 화면
import { h, $, $$, toast, confirmBox } from './ui.js';
// 이 화면은 실시간 서버에서 따로 열려서, 게임 이름만 여기 적어 둬요 (live/shared/content.js 와 같게)
const GAME_INFO = {
  balance: { name: '밸런스게임', icon: '⚖️' }, liar: { name: '라이어게임', icon: '🕵️' }, draw: { name: '그림 맞히기', icon: '🎨' },
  truth: { name: '진실카드', icon: '🃏' }, roulette: { name: '파티 룰렛', icon: '🎡' }, quiz: { name: '퀴즈 배틀', icon: '⚡' },
  ox: { name: 'OX퀴즈', icon: '⭕' }, arcade: { name: '미니게임 대결', icon: '🕹️' },
};
const THEMES = { home: { short: '홈파티' }, rooftop: { short: '루프탑' }, game: { short: '게임파티룸' }, square: { short: '스퀘어' } };

const KEY = 'sl.admin';
let key = '';
try { key = sessionStorage.getItem(KEY) || ''; } catch { key = ''; }
let tab = 'dash';
let summary = null;

const REASON = { abuse: '욕설·비하', sexual: '성적인 말', spam: '도배·광고', other: '기타' };
const TYPE = { quiz: '퀴즈 배틀', ox: 'OX퀴즈', balance: '밸런스게임', truth: '진실카드', draw: '그림 맞히기 제시어' };
const fmt = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const num = (v) => (v || 0).toLocaleString('ko-KR');

async function api(path, opts = {}) {
  const res = await fetch('/api/admin' + path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-key': key, ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error(j.error || '비밀번호가 맞지 않아요.'); }
  if (!res.ok) throw new Error(j.error || '요청을 처리하지 못했어요.');
  return j;
}
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

function logout() {
  key = '';
  try { sessionStorage.removeItem(KEY); } catch { /* 무시 */ }
  $('#main').hidden = true; $('#login').hidden = false;
}

$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  key = $('#pw').value;
  $('#login-err').textContent = '';
  try {
    summary = await api('/summary');
    try { sessionStorage.setItem(KEY, key); } catch { /* 무시 */ }
    start();
  } catch (err) { $('#login-err').textContent = err.message; }
});
$('#logout').addEventListener('click', logout);
for (const b of $$('#tabs button')) b.addEventListener('click', () => { tab = b.dataset.tab; for (const x of $$('#tabs button')) x.classList.toggle('on', x === b); render(); });

if (key) api('/summary').then((s) => { summary = s; start(); }).catch(() => logout());
else logout();

function start() {
  $('#login').hidden = true; $('#main').hidden = false;
  badges();
  render();
}

function badges() {
  if (!summary) return;
  $('#badge-rep').textContent = summary.openReports ? String(summary.openReports) : '';
  $('#badge-con').textContent = summary.pendingContent ? String(summary.pendingContent) : '';
}

async function render() {
  const v = $('#view');
  v.replaceChildren(h('p', { class: 'note' }, '불러오는 중…'));
  try {
    if (tab === 'dash') await dash(v);
    if (tab === 'reports') await reports(v);
    if (tab === 'content') await content(v);
    if (tab === 'notice') await notice(v);
    if (tab === 'rooms') await rooms(v);
    if (tab === 'bans') await bans(v);
  } catch (err) { v.replaceChildren(h('div', { class: 'empty' }, err.message)); }
}

// ---------- 한눈에 보기 ----------
async function dash(v) {
  summary = await api('/summary');
  badges();
  const s = summary;
  const today = s.days[s.days.length - 1] || {};
  const T = s.totals || {};
  const avgMin = (o) => (o.sessions ? Math.round(o.session_ms / o.sessions / 60000) : 0);
  const rate = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');
  const shares = (o) => (o.share || 0) + (o.card || 0) + (o.kakao || 0) + (o.invite || 0) + (o.photo_save || 0);
  const stat = (label, val, sub, red) => h('div', { class: 'stat' + (red ? ' red' : '') }, h('small', null, label), h('b', null, val), sub ? h('span', null, sub) : null);
  const games = Object.keys(GAME_INFO).map((id) => h('tr', null, h('td', { class: 'l' }, `${GAME_INFO[id].icon} ${GAME_INFO[id].name}`), h('td', null, num(T['gameStart:' + id])), h('td', null, num(T['gameFinish:' + id])), h('td', null, rate(T['gameFinish:' + id], T['gameStart:' + id]))));
  const max = Math.max(1, ...s.days.map((d) => d.uv || 0));
  const bw = 100 / s.days.length;
  const chart = h('div', { class: 'box' }, h('b', null, '최근 14일 방문자'),
    h('div', { html: `<svg class="chart" viewBox="0 0 100 40" preserveAspectRatio="none">${s.days.map((d, i) => `<rect x="${i * bw + bw * 0.18}" y="${40 - ((d.uv || 0) / max) * 36}" width="${bw * 0.64}" height="${((d.uv || 0) / max) * 36}" rx="0.6" fill="#E83217"><title>${d.day} ${d.uv || 0}명</title></rect>`).join('')}</svg>` }),
    h('div', { class: 'flex note', style: { justifyContent: 'space-between' } }, h('span', null, s.days[0]?.day), h('span', null, s.days[s.days.length - 1]?.day)));
  v.replaceChildren(
    h('h2', null, '한눈에 보기'),
    h('div', { class: 'stats' },
      stat('지금 열린 파티룸', `${num(s.live.rooms)}곳`, `${num(s.live.people)}명 접속 중`),
      stat('지금 쏘플 스퀘어', `${num(s.live.square)}명`),
      stat('오늘 방문자', `${num(today.uv)}명`, `처음 온 사람 ${num(today.newdev)}명`),
      stat('오늘 만든 방', `${num(today.rooms)}개`, `입장 ${num(today.join)}번`),
      stat('오늘 게임 완주율', rate(today.gameFinish, today.gameStart), `시작 ${num(today.gameStart)} · 완주 ${num(today.gameFinish)}`),
      stat('오늘 평균 체류', `${avgMin(today)}분`),
      stat('신고 대기', `${num(s.openReports)}건`, null, s.openReports > 0),
      stat('승인 대기 콘텐츠', `${num(s.pendingContent)}개`, s.ai ? 'AI 문제 만들기 사용 가능' : 'AI 키 미설정', s.pendingContent > 0)),
    h('h3', null, '흐름'),
    chart,
    h('h3', null, '날짜별 기록'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['날짜', '방문자', '신규', '입장', '방 생성', '게임 시작', '게임 완주', '평균 체류', '공유·저장', '단체 사진', '예약 버튼', '신고'].map((t) => h('th', null, t)))),
      h('tbody', null, s.days.slice().reverse().map((d) => h('tr', null,
        h('td', null, d.day), h('td', null, num(d.uv)), h('td', null, num(d.newdev)), h('td', null, num(d.join)), h('td', null, num(d.rooms)),
        h('td', null, num(d.gameStart)), h('td', null, num(d.gameFinish)), h('td', null, `${avgMin(d)}분`), h('td', null, num(shares(d))),
        h('td', null, num(d.photo)), h('td', null, num(d.booking)), h('td', null, num(d.report))))))),
    h('h3', null, '게임별 누적'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { class: 'l' }, '게임'), h('th', null, '시작'), h('th', null, '완주'), h('th', null, '완주율'))), h('tbody', null, games))),
    h('p', { class: 'note' }, `전체 만든 방 ${num(s.roomsTotal)}개 · 다녀간 기기 ${num(s.devices)}대 · 버전 ${s.version}`));
}

// ---------- 신고 ----------
let repStatus = 'open';
async function reports(v) {
  const j = await api('/reports?status=' + repStatus);
  const seg = h('div', { class: 'seg' }, [['open', '처리 전'], ['done', '처리 완료']].map(([k, l]) => h('button', { class: repStatus === k ? 'on' : '', onclick: () => { repStatus = k; render(); } }, l)));
  const act = async (r, action, msg) => {
    if (action !== 'dismiss' && !(await confirmBox(msg, '진행'))) return;
    try { await post('/reports/' + r.id, { action }); toast('처리했어요'); render(); } catch (err) { toast(err.message, 'bad'); }
  };
  const list = j.reports.map((r) => h('div', { class: 'rep' },
    h('div', { class: 'rep-top' },
      h('span', { class: 'pillx red' }, REASON[r.reason] || r.reason),
      h('b', null, `${r.reporter} → ${r.target}`),
      h('span', { class: 'note' }, `${r.room || ''} (${r.code})`),
      r.action ? h('span', { class: 'pillx' }, { dismiss: '문제없음', ban: '차단함', close: '방 닫음' }[r.action] || r.action) : null,
      h('span', { class: 'when' }, fmt(r.at))),
    r.memo ? h('p', { class: 'memo' }, '메모: ', r.memo) : null,
    h('details', null, h('summary', { class: 'note' }, `신고 당시 대화 ${r.chat.length}줄`), h('pre', null, r.chat.join('\n') || '대화 기록이 없어요')),
    r.status === 'open' ? h('div', { class: 'acts2' },
      h('button', { class: 'btn sm ghost', onclick: () => act(r, 'dismiss') }, '문제없음'),
      h('button', { class: 'btn sm primary', onclick: () => act(r, 'ban', `${r.target}님의 기기를 차단할까요? 지금 있는 방에서도 내보내요.`) }, '차단'),
      /^SQ/.test(r.code) ? null : h('button', { class: 'btn sm dark', onclick: () => act(r, 'close', `'${r.room}' 방을 닫을까요? 모든 사람이 나가게 돼요.`) }, '방 닫기')) : null));
  v.replaceChildren(h('h2', null, '신고'), h('p', { class: 'note' }, '같은 사람이 3명에게 신고받으면 채팅이 10분 제한되고, 5명이면 방에서 자동으로 나가요. 최종 판단은 여기서 해 주세요.'), seg, ...(list.length ? list : [h('div', { class: 'empty' }, repStatus === 'open' ? '처리할 신고가 없어요 🎉' : '처리한 신고가 없어요')]));
}

// ---------- 콘텐츠 ----------
let conStatus = 'pending';
function itemText(type, it) {
  if (type === 'quiz') return h('div', null, h('div', { class: 'it-main' }, it.t), h('div', { class: 'it-sub' }, it.o.map((o, i) => (i === it.a ? `✔ ${o}` : o)).join(' / ')));
  if (type === 'ox') return h('div', null, h('div', { class: 'it-main' }, `${it.t}`), h('div', { class: 'it-sub' }, `정답 ${it.a}${it.w ? ' · ' + it.w : ''}`));
  if (type === 'balance') return h('div', { class: 'it-main' }, `${it[0]}  vs  ${it[1]}`);
  return h('div', { class: 'it-main' }, String(it));
}
function editorFor(type, it) {
  // 고치기 편하도록 한 줄 형식으로
  if (type === 'quiz') return `${it.t} | ${it.o.join(' / ')} | ${it.a + 1}`;
  if (type === 'ox') return `${it.t} | ${it.a} | ${it.w || ''}`;
  if (type === 'balance') return `${it[0]} | ${it[1]}`;
  return String(it);
}
function parseLine(type, line) {
  const parts = line.split('|').map((s) => s.trim());
  if (type === 'quiz') return { t: parts[0], o: (parts[1] || '').split('/').map((s) => s.trim()), a: Number(parts[2]) - 1 };
  if (type === 'ox') return { t: parts[0], a: (parts[1] || '').toUpperCase(), w: parts[2] || '' };
  if (type === 'balance') return [parts[0], parts[1]];
  return parts[0];
}
const FORMAT = {
  quiz: '질문 | 보기1 / 보기2 / 보기3 / 보기4 | 정답 번호(1~4)',
  ox: '문장 | O 또는 X | 한 줄 설명',
  balance: '선택1 | 선택2',
  truth: '질문',
  draw: '제시어 (2~5글자)',
};

async function content(v) {
  const j = await api('/content?status=' + conStatus);
  const seg = h('div', { class: 'seg' }, [['pending', '승인 대기'], ['approved', '사용 중'], ['rejected', '거절함']].map(([k, l]) => h('button', { class: conStatus === k ? 'on' : '', onclick: () => { conStatus = k; render(); } }, l)));
  const counts = j.counts || {};
  const type = h('select', { class: 'inp' }, Object.entries(TYPE).map(([k, l]) => h('option', { value: k }, l)));
  const n = h('select', { class: 'inp' }, [5, 10, 15, 20].map((x) => h('option', { value: x, selected: x === 10 }, `${x}개`)));
  const topic = h('input', { class: 'inp', maxlength: 40, placeholder: '예: 연말 파티, 음식, 90년대 (선택)' });
  const genBtn = h('button', { class: 'btn primary', disabled: !summary?.ai }, 'AI로 만들기');
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true; genBtn.textContent = '만드는 중… (최대 1분)';
    try { const r = await post('/content/generate', { type: type.value, n: Number(n.value), topic: topic.value }); toast(`${r.made}개를 만들어 승인 대기에 올렸어요`, 'good'); conStatus = 'pending'; render(); }
    catch (err) { toast(err.message, 'bad'); genBtn.disabled = false; genBtn.textContent = 'AI로 만들기'; }
  });
  const mtype = h('select', { class: 'inp' }, Object.entries(TYPE).map(([k, l]) => h('option', { value: k }, l)));
  const fmtHint = h('p', { class: 'note' }, '형식: ' + FORMAT.quiz);
  mtype.addEventListener('change', () => { fmtHint.textContent = '형식: ' + FORMAT[mtype.value]; });
  const mline = h('input', { class: 'inp', placeholder: '한 줄로 입력해 주세요' });
  const addBtn = h('button', { class: 'btn dark' }, '바로 추가');
  addBtn.addEventListener('click', async () => {
    try { await post('/content', { type: mtype.value, item: parseLine(mtype.value, mline.value) }); toast('추가했어요. 다음 게임부터 나와요.', 'good'); mline.value = ''; if (conStatus === 'approved') render(); }
    catch (err) { toast(err.message, 'bad'); }
  });
  const doIt = async (it, action, item) => { try { await post('/content/' + it.id, { action, item }); render(); api('/summary').then((s) => { summary = s; badges(); }); } catch (err) { toast(err.message, 'bad'); } };
  const cards = j.items.map((it) => h('div', { class: 'item' },
    h('span', { class: 'pillx' }, TYPE[it.type], it.source === 'ai' ? ' · AI' : ' · 직접'),
    itemText(it.type, it.item),
    h('div', { class: 'acts2' },
      conStatus !== 'approved' ? h('button', { class: 'btn sm primary', onclick: () => doIt(it, 'approve') }, '승인') : null,
      conStatus !== 'rejected' ? h('button', { class: 'btn sm ghost', onclick: () => doIt(it, conStatus === 'approved' ? 'pending' : 'reject') }, conStatus === 'approved' ? '사용 중지' : '거절') : null,
      h('button', { class: 'btn sm ghost', onclick: () => { const val = prompt('고칠 내용을 입력해 주세요.\n형식: ' + FORMAT[it.type], editorFor(it.type, it.item)); if (val) doIt(it, conStatus === 'approved' ? 'approve' : 'pending', parseLine(it.type, val)); } }, '고치기'),
      h('button', { class: 'btn sm ghost', onclick: async () => { if (await confirmBox('이 콘텐츠를 지울까요?', '지우기')) doIt(it, 'delete'); } }, '지우기'))));
  v.replaceChildren(
    h('h2', null, '콘텐츠'),
    h('p', { class: 'note' }, '게임에 나오는 문제와 질문을 늘려요. AI가 만든 것은 승인한 것만 게임에 나와요. 기본 문제는 그대로 함께 쓰여요.'),
    h('div', { class: 'box' }, h('b', null, 'AI로 문제 만들기'),
      summary?.ai ? null : h('p', { class: 'note' }, 'ANTHROPIC_API_KEY를 설정하면 쓸 수 있어요. 안내서의 AI 연결 단계를 참고해 주세요.'),
      h('div', { class: 'form-row', style: { marginTop: '10px' } }, h('label', { class: 'field' }, h('span', null, '종류'), type), h('label', { class: 'field' }, h('span', null, '개수'), n), h('label', { class: 'field', style: { flex: '2 1 240px' } }, h('span', null, '주제나 분위기'), topic), genBtn)),
    h('div', { class: 'box', style: { marginTop: '10px' } }, h('b', null, '직접 추가하기'),
      h('div', { class: 'form-row', style: { marginTop: '10px' } }, h('label', { class: 'field' }, h('span', null, '종류'), mtype), h('label', { class: 'field', style: { flex: '3 1 320px' } }, h('span', null, '내용'), mline), addBtn), fmtHint),
    h('h3', null, '목록'),
    h('p', { class: 'note' }, Object.entries(TYPE).map(([k, l]) => `${l} ${counts[k]?.approved || 0}개 사용 중`).join(' · ')),
    seg,
    cards.length ? h('div', { class: 'items' }, cards) : h('div', { class: 'empty' }, conStatus === 'pending' ? '승인을 기다리는 콘텐츠가 없어요' : '아직 없어요'));
}

// ---------- 공지·행사 ----------
async function notice(v) {
  const s = await api('/settings');
  const text = h('textarea', { class: 'inp', rows: 3, maxlength: 200, placeholder: '첫 화면 위쪽과 스퀘어 공지판에 보여요' }, s.notice || '');
  const title = h('input', { class: 'inp', maxlength: 40, placeholder: '예: 금요일 밤 OX퀴즈 파티', value: s.event?.title || '' });
  const pad = (x) => String(x).padStart(2, '0');
  const local = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const at = h('input', { class: 'inp', type: 'datetime-local', value: s.event?.at ? local(s.event.at) : '' });
  const desc = h('input', { class: 'inp', maxlength: 80, placeholder: '예: 쏘플 스퀘어에서 만나요 (선택)', value: s.event?.desc || '' });
  v.replaceChildren(
    h('h2', null, '공지·행사'),
    h('div', { class: 'box' }, h('label', { class: 'field' }, h('span', null, '공지'), text),
      h('div', { class: 'flex', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: async () => { try { await post('/settings', { notice: text.value }); toast('공지를 저장했어요', 'good'); } catch (err) { toast(err.message, 'bad'); } } }, '공지 저장'))),
    h('div', { class: 'box', style: { marginTop: '12px' } }, h('b', null, '다음 공개 행사'), h('p', { class: 'note' }, '첫 화면에 "공개 파티" 띠로 보여요. 시간이 지나고 3시간 뒤에 자동으로 내려가요.'),
      h('div', { class: 'form-row' }, h('label', { class: 'field' }, h('span', null, '행사 이름'), title), h('label', { class: 'field' }, h('span', null, '시작 시간'), at), h('label', { class: 'field', style: { flex: '2 1 240px' } }, h('span', null, '한 줄 설명'), desc)),
      h('div', { class: 'flex', style: { marginTop: '10px' } },
        h('button', { class: 'btn primary', onclick: async () => { const ms = at.value ? new Date(at.value).getTime() : NaN; try { await post('/settings', { event: { title: title.value, at: ms, desc: desc.value } }); toast('행사를 저장했어요', 'good'); } catch (err) { toast(err.message, 'bad'); } } }, '행사 저장'),
        h('button', { class: 'btn ghost', onclick: async () => { await post('/settings', { event: null }); toast('행사를 내렸어요'); render(); } }, '행사 내리기'))));
}

// ---------- 방 ----------
async function rooms(v) {
  const j = await api('/rooms');
  const row = (r) => h('tr', null,
    h('td', { class: 'l' }, r.code), h('td', { class: 'l' }, r.name), h('td', { class: 'l' }, r.kind === 'square' ? '스퀘어' : r.kind === 'home' ? '집들이' : THEMES[r.theme]?.short || r.theme),
    h('td', null, `${r.count}/${r.capacity}`), h('td', { class: 'l' }, r.game ? GAME_INFO[r.game]?.name || r.game : ''),
    h('td', { class: 'l' }, [r.is_public ? '공개' : '비공개', r.locked ? '잠김' : '', r.closed ? '닫힘' : ''].filter(Boolean).join(' · ')),
    h('td', null, fmt(r.last_active)),
    h('td', null, h('button', { class: 'btn sm ghost', onclick: () => viewRoom(r.code) }, '보기'), ' ', r.kind === 'square' || r.closed ? null : h('button', { class: 'btn sm ghost', onclick: async () => { if (await confirmBox(`'${r.name}' 방을 닫을까요?`, '닫기')) { await post(`/rooms/${r.code}/close`); toast('방을 닫았어요'); render(); } } }, '닫기')));
  const table = (list) => list.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['코드', '이름', '테마', '인원', '게임', '상태', '마지막 활동', ''].map((t) => h('th', { class: 'l' }, t)))), h('tbody', null, list.map(row)))) : h('div', { class: 'empty' }, '없어요');
  const detail = h('div', { id: 'room-detail' });
  v.replaceChildren(h('h2', null, '방'), h('h3', null, '지금 사람이 있는 방'), table(j.live), detail, h('h3', null, '최근 활동한 파티룸'), table(j.recent));
  async function viewRoom(code) {
    try {
      const r = await api('/rooms/' + code);
      detail.replaceChildren(h('div', { class: 'box', style: { marginTop: '12px' } },
        h('b', null, `${r.room.name} (${code})`),
        h('p', { class: 'note' }, r.players.map((p) => `${p.nick}${p.host ? '(방장)' : ''}${p.role === 'tv' ? '(TV)' : ''}${p.muted ? '(채팅 제한)' : ''}`).join(', ') || '지금은 아무도 없어요'),
        h('pre', { style: { whiteSpace: 'pre-wrap', background: 'var(--bg2)', padding: '10px', borderRadius: '10px', fontSize: '12.5px', maxHeight: '260px', overflow: 'auto', fontFamily: 'var(--font)' } }, r.chat.map((c) => `${fmt(c.at)} ${c.nick}: ${c.text}`).join('\n') || '대화가 없어요')));
      detail.scrollIntoView({ behavior: 'smooth' });
    } catch (err) { toast(err.message, 'bad'); }
  }
}

// ---------- 차단 ----------
async function bans(v) {
  const j = await api('/bans');
  v.replaceChildren(h('h2', null, '차단 목록'), h('p', { class: 'note' }, '차단은 기기 단위예요. 브라우저 기록을 지우면 다시 들어올 수 있어서, 반복되면 방 잠금이나 방 닫기를 함께 써 주세요.'),
    j.bans.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { class: 'l' }, '메모'), h('th', { class: 'l' }, '기기'), h('th', null, '차단한 때'), h('th', null, ''))),
      h('tbody', null, j.bans.map((b) => h('tr', null, h('td', { class: 'l' }, b.note || ''), h('td', { class: 'l' }, b.dev.slice(0, 10) + '…'), h('td', null, fmt(b.at)), h('td', null, h('button', { class: 'btn sm ghost', onclick: async () => { await post(`/bans/${b.dev}/remove`); toast('차단을 풀었어요'); render(); } }, '풀기'))))))) : h('div', { class: 'empty' }, '차단한 기기가 없어요'));
}
