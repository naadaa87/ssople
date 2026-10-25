// 게임 화면: 서버가 보내 준 게임 상태를 그대로 그립니다. (판정은 모두 서버가 함)
import { h } from './ui.js';
import { GAME_INFO } from '../shared/content.js';
import { paintAvatarIcon } from './avatar.js';
import { ARCADE } from '../shared/arcade-meta.js';

const DRAW_COLORS = ['#231B26', '#E83217', '#F07F2A', '#F5B82E', '#22A86B', '#2F6BFF', '#8E5CF7', '#FF7AA8', '#8B5E3C'];
const DRAW_WIDTHS = [4, 9, 16, 28];
const OPT_COLORS = ['#E83217', '#2F6BFF', '#22A86B', '#F5B82E'];
const OPT_LABEL = ['A', 'B', 'C', 'D'];

export class GamePanel {
  constructor(root, api) {
    this.root = root;
    this.api = api; // { send, me, isHost, nick(pid), look(pid), now(), walkTo(x,y), mySide(), onClose, onCard, onShare, bookingUrl, collapse }
    this.board = new DrawBoard((segs) => this.sendIn({ k: 'stroke', s: segs }), () => this.sendIn({ k: 'clear' }));
    this.wheel = new Wheel();
    this.g = null; this.p = null;
    this.lastKey = '';
  }

  sendIn(m) { const g = this.g; if (g) this.api.send({ t: 'g.in', gid: g.gid, gs: g.seq, ...m }); }

  update(g, priv) {
    const prevId = this.g && this.g.gid;
    this.g = g; this.p = priv || this.p;
    if (g && prevId !== g.gid) this.p = priv || null;
    this.render();
  }
  setPriv(priv) { this.p = priv; this.render(); }

  render() {
    const g = this.g;
    const root = this.root;
    if (!g) { root.replaceChildren(); root.hidden = true; return; }
    root.hidden = false;
    // 입력 중인 칸 보존
    const act = document.activeElement;
    const keep = act && root.contains(act) && act.dataset.keep ? { key: act.dataset.keep, val: act.value, s: act.selectionStart, e: act.selectionEnd } : null;
    const saved = {};
    for (const el of root.querySelectorAll('[data-keep]')) saved[el.dataset.keep] = el.value;

    const info = GAME_INFO[g.id];
    const host = this.api.isHost();
    const head = h('div', { class: 'gp-head' },
      h('span', { class: 'gp-icon' }, info.icon),
      h('b', null, info.name),
      g.total && g.phase !== 'end' ? h('span', { class: 'gp-round' }, `${Math.min(g.round, g.total)} / ${g.total}`) : (g.id === 'liar' && g.round && g.phase !== 'end' ? h('span', { class: 'gp-round' }, `${g.round}판`) : null),
      h('span', { class: 'spacer' }),
      host && g.phase !== 'end' && this.nextLabel(g) ? h('button', { class: 'btn sm ghost', onclick: () => this.api.send({ t: 'g.next' }) }, this.nextLabel(g)) : null,
      host ? h('button', { class: 'btn sm ghost', onclick: () => this.api.send({ t: g.phase === 'end' || g.id === 'roulette' ? 'g.close' : 'g.end' }) }, g.phase === 'end' || g.id === 'roulette' ? '닫기' : '끝내기') : null,
      this.api.tv ? null : h('button', { class: 'icon-btn gp-min', 'aria-label': '게임 창 접기', onclick: () => this.api.collapse() }, '▾'),
    );
    const timer = g.deadline ? h('div', { class: 'timer', 'data-deadline': g.deadline, 'data-span': Math.max(1000, g.deadline - (g.phaseAt || g.now - 1)) }, h('i'), h('span')) : null;
    const mc = g.mc ? h('div', { class: 'gp-mc' }, h('span', { class: 'mic' }, '🎤'), g.mc) : null;
    let body;
    try { body = g.phase === 'end' ? this.result(g) : this[g.id](g); } catch (err) { console.error(err); body = h('p', null, '화면을 그리는 중에 문제가 생겼어요.'); }
    root.replaceChildren(h('div', { class: 'gp gp-' + g.id + ' ph-' + g.phase }, head, timer, mc, h('div', { class: 'gp-body' }, body)));
    this.api.tickTimers && this.api.tickTimers();
    for (const el of root.querySelectorAll('[data-keep]')) if (saved[el.dataset.keep] !== undefined) el.value = saved[el.dataset.keep];
    if (keep) { const el = root.querySelector(`[data-keep="${keep.key}"]`); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { /* 일부 입력칸은 지원 안 함 */ } } }
  }

  nextLabel(g) {
    const map = {
      balance: { answer: '공개', reveal: '다음' }, quiz: { answer: '공개', reveal: '다음' },
      liar: { card: '토론 시작', talk: '투표하기', vote: '개표', result: '다음 판' },
      draw: { draw: '공개', reveal: '다음' }, truth: { turn: '건너뛰기', answered: '다음' }, ox: { gather: '시작', answer: '정답 공개', reveal: '다음' }, arcade: { ready: '바로 시작', play: '결과 보기' },
    };
    return map[g.id]?.[g.phase] || null;
  }

  // 미니게임 대결: 게임은 각자 화면(오락실 창)에서 하고, 여기엔 진행 상황만
  arcade(g) {
    const a = ARCADE[g.game] || { name: '미니게임', icon: '🕹️', desc: '' };
    const done = new Set(g.done || []);
    const me = this.me();
    const playing = this.inGame(g);
    const list = h('div', { class: 'scores' }, g.players.map((p) => h('div', { class: 'score' + (p.pid === me ? ' me' : '') }, h('span', null, p.nick), h('b', null, done.has(p.pid) ? `${(g.scores[p.pid] || 0).toLocaleString()}점` : g.phase === 'play' ? '하는 중…' : '준비'))));
    const head = h('div', { class: 'arc-duel' }, h('span', { class: 'ad-ic' }, a.icon), h('div', null, h('b', null, a.name), h('small', null, a.desc)));
    if (g.phase === 'ready') return h('div', null, head, this.waitNote(playing ? '곧 다 같이 시작해요. 게임 창이 자동으로 열려요!' : '이번 판은 구경해요. 다음 판부터 함께해요.'), list);
    return h('div', null, head,
      playing && !done.has(me) && !this.api.tv ? h('button', { class: 'btn primary block', onclick: () => this.api.openDuel && this.api.openDuel(g) }, '게임 화면 열기') : null,
      this.waitNote(`${done.size}/${g.players.length}명이 끝냈어요`), list);
  }

  nick(pid) { return this.api.nick(pid); }
  me() { return this.api.me(); }
  inGame(g) { return g.players.some((p) => p.pid === this.me()); }
  chip(pid, extra = '') { return h('span', { class: 'chip ' + extra }, this.nick(pid)); }
  waitNote(text) { return h('p', { class: 'gp-note' }, text); }

  // ---------- 밸런스게임 ----------
  balance(g) {
    const q = g.q || ['', ''];
    const my = this.p?.my;
    const n = g.players.length;
    if (g.phase === 'answer') {
      const can = this.inGame(g) && !my;
      return h('div', null,
        h('div', { class: 'vs' },
          ['a', 'b'].map((k, i) => h('button', { class: 'vs-btn ' + k + (my === k ? ' mine' : '') + (my && my !== k ? ' dim' : ''), disabled: !can, onclick: () => this.sendIn({ v: k }) },
            h('span', { class: 'vs-tag' }, k.toUpperCase()), h('span', { class: 'vs-text' }, q[i]))),
          h('span', { class: 'vs-mid' }, 'VS')),
        h('p', { class: 'gp-note' }, this.api.tv ? `${g.answered.length}/${n}명이 골랐어요 · 각자 휴대폰에서 골라 주세요` : this.inGame(g) ? (my ? `골랐어요! ${g.answered.length}/${n}명 선택` : '마음 가는 쪽을 눌러 주세요') : '다음 판부터 함께할 수 있어요'));
    }
    const c = g.counts || { a: 0, b: 0 }; const tot = Math.max(1, c.a + c.b);
    const side = (k, i) => {
      const cnt = c[k]; const pct = Math.round((cnt / tot) * 100);
      const names = Object.entries(g.picks || {}).filter(([, v]) => v === k).map(([pid]) => this.nick(pid));
      return h('div', { class: 'res-row ' + k + (g.minority === k ? ' minority' : '') },
        h('div', { class: 'res-top' }, h('b', null, `${k.toUpperCase()}. ${q[i]}`), g.minority === k ? h('span', { class: 'badge' }, '소수파') : null, h('span', { class: 'res-pct' }, `${pct}%`)),
        h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } })),
        h('div', { class: 'res-names' }, names.length ? names.join(', ') : '아무도 없어요'));
    };
    return h('div', null, side('a', 0), side('b', 1));
  }

  // ---------- 라이어게임 ----------
  liar(g) {
    const p = this.p || {};
    const me = this.me();
    const playing = g.order?.includes(me);
    const myCard = playing ? (p.role === 'liar' ? h('div', { class: 'card liar' }, h('small', null, `카테고리 · ${g.cat}`), h('b', null, '당신은 라이어예요'), h('span', null, '제시어를 모르는 걸 들키지 마세요')) : h('div', { class: 'card citizen' }, h('small', null, `카테고리 · ${g.cat}`), h('b', null, p.word || '…'), h('span', null, '라이어에게 들키지 않게 설명해요'))) : null;
    if (g.phase === 'card') {
      return h('div', null,
        playing ? h('div', { class: 'flip' + (p.confirmed ? ' done' : '') }, myCard) : this.waitNote(this.api.tv ? `카테고리는 「${g.cat}」! 각자 휴대폰에서 카드를 확인하고 있어요.` : '이번 판은 구경해요. 다음 판부터 함께해요.'),
        playing && !p.confirmed ? h('button', { class: 'btn primary block', onclick: () => this.sendIn({ k: 'ok' }) }, '확인했어요') : null,
        h('p', { class: 'gp-note' }, `카드 확인 ${g.confirmed.length} / ${g.order.length}명`));
    }
    if (g.phase === 'talk') {
      return h('div', null,
        myCard ? h('div', { class: 'mini-card' }, p.role === 'liar' ? `나는 라이어 · ${g.cat}` : `제시어 · ${p.word}`) : null,
        h('div', { class: 'order' }, g.order.map((pid, i) => h('span', { class: 'chip' + (pid === g.turn ? ' on' : '') + (pid === me ? ' me' : '') }, `${i + 1}. ${this.nick(pid)}`))),
        h('p', { class: 'gp-note strong' }, g.turn === me ? '내 차례예요! 채팅으로 힌트 한 마디를 보내요.' : `${this.nick(g.turn)}님 차례예요. 채팅으로 한 마디씩!`),
        this.api.isHost() ? h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', onclick: () => this.api.send({ t: 'g.more' }) }, '+1분')) : null);
    }
    if (g.phase === 'vote') {
      const my = p.my;
      return h('div', null,
        h('p', { class: 'gp-note strong' }, playing ? (my ? `${this.nick(my)}님을 골랐어요` : '라이어라고 생각하는 사람을 눌러요') : this.api.tv ? '각자 휴대폰에서 라이어를 지목하고 있어요' : '투표를 구경하는 중이에요'),
        h('div', { class: 'grid2' }, g.order.filter((pid) => pid !== me).map((pid) => h('button', { class: 'pick' + (my === pid ? ' mine' : ''), disabled: !playing || !!my, onclick: () => this.sendIn({ k: 'vote', v: pid }) }, this.nick(pid)))),
        h('p', { class: 'gp-note' }, `투표 ${g.voted.length} / ${g.order.length}명`));
    }
    if (g.phase === 'guess') {
      const isLiar = me === g.liar;
      return h('div', null,
        h('div', { class: 'reveal-line' }, '라이어는 ', h('b', null, this.nick(g.liar)), '님!'),
        isLiar ? h('div', null, h('p', { class: 'gp-note strong' }, '마지막 기회! 제시어를 맞히면 역전이에요.'), h('div', { class: 'grid2' }, (p.options || []).map((w) => h('button', { class: 'pick', onclick: () => this.sendIn({ k: 'guess', v: w }) }, w))))
          : this.waitNote(`${this.nick(g.liar)}님이 제시어를 고르는 중이에요…`));
    }
    if (g.phase === 'result') {
      const win = g.win === 'liar' ? '라이어 승리' : g.win === 'citizen' ? '시민 승리' : '무효';
      const votes = Object.entries(g.votes || {});
      return h('div', null,
        h('div', { class: 'banner-res ' + (g.win || 'none') }, win),
        h('div', { class: 'kv' }, h('span', null, '라이어'), h('b', null, this.nick(g.liar)), h('span', null, '제시어'), h('b', null, g.word || '-'), g.guess ? h('span', null, '라이어의 답') : null, g.guess ? h('b', null, g.guess) : null),
        votes.length ? h('div', { class: 'votes' }, votes.map(([from, to]) => h('span', { class: 'vote' }, `${this.nick(from)} → ${this.nick(to)}`))) : null,
        this.scoreLine(g),
        this.api.isHost() ? h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => this.api.send({ t: 'g.next' }) }, '다음 판'), h('button', { class: 'btn ghost', onclick: () => this.api.send({ t: 'g.end' }) }, '여기까지')) : this.waitNote('방장이 다음 판을 열 거예요.'));
    }
    return null;
  }

  scoreLine(g) {
    const list = g.players.map((p) => ({ pid: p.pid, pts: g.scores[p.pid] || 0 })).sort((a, b) => b.pts - a.pts).slice(0, 6);
    return h('div', { class: 'scores' }, list.map((r) => h('span', { class: 'score' + (r.pid === this.me() ? ' me' : '') }, `${this.nick(r.pid)} ${r.pts}`)));
  }

  // ---------- 그림 맞히기 ----------
  draw(g) {
    const me = this.me();
    const drawer = g.drawer === me;
    this.board.setDrawer(drawer && g.phase === 'draw');
    const word = this.p?.word;
    const top = g.phase === 'draw'
      ? (drawer ? h('div', { class: 'word-box' }, '제시어 ', h('b', null, word || '')) : h('div', { class: 'word-box' }, `${this.nick(g.drawer)}님이 그리는 중 · `, h('b', { class: 'hint' }, g.hint), ` (${Array.from(g.hint || '').length}글자)`))
      : h('div', { class: 'word-box done' }, '정답 ', h('b', null, g.word || ''), g.winner ? ` · ${this.nick(g.winner)}님이 맞혔어요` : '');
    const feed = h('div', { class: 'feed' }, (g.feed || []).slice(-4).map((f) => h('span', null, h('b', null, f.nick), ' ', f.text)));
    const guess = !drawer && g.phase === 'draw' && this.inGame(g) ? h('form', { class: 'guess', onsubmit: (ev) => { ev.preventDefault(); const inp = ev.target.querySelector('input'); const v = inp.value.trim(); if (v) { this.api.send({ t: 'chat', text: v }); inp.value = ''; } } },
      h('input', { 'data-keep': 'guess', placeholder: '정답을 입력해요', maxlength: 30, autocomplete: 'off', enterkeyhint: 'send' }), h('button', { class: 'btn primary sm' }, '보내기')) : null;
    return h('div', null, top, this.board.el, drawer && g.phase === 'draw' ? this.board.tools : null, guess, feed);
  }

  // ---------- 진실카드 ----------
  truth(g) {
    const me = this.me();
    const mine = g.cur === me;
    const passes = g.passes || {};
    const card = h('div', { class: 'truth-card' }, h('small', null, `${this.nick(g.cur)}님에게 온 질문`), h('b', null, g.card || ''));
    if (g.phase === 'turn') {
      if (mine) {
        return h('div', null, card,
          h('form', { class: 'answer', onsubmit: (ev) => { ev.preventDefault(); const ta = ev.target.querySelector('textarea'); const v = ta.value.trim(); if (v) { this.sendIn({ k: 'answer', text: v }); ta.value = ''; } } },
            h('textarea', { 'data-keep': 'truth', rows: 2, maxlength: 100, placeholder: '솔직하게 한 줄로 답해 주세요' }),
            h('div', { class: 'row' }, h('button', { class: 'btn primary' }, '대답하기'), h('button', { type: 'button', class: 'btn ghost', disabled: !!passes[me], onclick: () => this.sendIn({ k: 'pass' }) }, passes[me] ? '통과권 사용함' : '통과권 쓰기 (1장)'))));
      }
      return h('div', null, card, this.waitNote(`${this.nick(g.cur)}님이 대답을 쓰는 중이에요…`));
    }
    return h('div', null, card,
      h('div', { class: 'answer-big' }, '“', g.answer || '', '”'),
      mine ? h('button', { class: 'btn primary block', onclick: () => this.sendIn({ k: 'done' }) }, '다음 사람으로') : this.waitNote('리액션 한 번 해 주세요! 👏'));
  }

  // ---------- 파티 룰렛 ----------
  roulette(g) {
    const host = this.api.isHost();
    const tabs = h('div', { class: 'tabs' }, [['penalty', '벌칙'], ['order', '순서'], ['team', '팀 나누기']].map(([k, label]) => h('button', { class: 'tab' + (g.mode === k ? ' on' : ''), disabled: !host, onclick: () => this.sendIn({ k: 'mode', v: k }) }, label)));
    let main;
    if (g.mode === 'penalty') {
      this.wheel.set(g.items, g.spin);
      main = h('div', null, this.wheel.el,
        host ? h('details', { class: 'edit' }, h('summary', null, '벌칙 항목 바꾸기'),
          h('textarea', { 'data-keep': 'items', rows: 4, placeholder: '한 줄에 하나씩 (2~10개)' }, g.items.join('\n')),
          h('button', { class: 'btn sm ghost', onclick: (ev) => { const ta = ev.target.parentElement.querySelector('textarea'); this.sendIn({ k: 'items', v: ta.value.split('\n') }); } }, '저장')) : null);
    } else if (g.mode === 'order') {
      main = g.order ? h('ol', { class: 'olist' }, g.order.map((pid) => h('li', null, g.names[pid] || this.nick(pid)))) : this.waitNote('돌리면 순서가 정해져요.');
    } else {
      main = g.teams ? h('div', { class: 'teams' }, g.teams.map((tm, i) => h('div', { class: 'team t' + i }, h('b', null, i ? '파랑 팀' : '빨강 팀'), tm.map((pid) => h('span', null, g.names[pid] || this.nick(pid)))))) : this.waitNote('돌리면 두 팀으로 나눠요.');
    }
    return h('div', null, tabs, main, host ? h('button', { class: 'btn primary block', onclick: () => this.sendIn({ k: 'spin' }) }, '돌리기') : this.waitNote('방장이 돌릴 수 있어요.'));
  }

  // ---------- 퀴즈 배틀 ----------
  quiz(g) {
    const my = this.p?.my;
    const reveal = g.phase === 'reveal';
    const can = !reveal && this.inGame(g) && (my === null || my === undefined);
    const picks = g.picks || {};
    return h('div', null,
      h('div', { class: 'q-text' }, g.q.t),
      h('div', { class: 'opts' }, g.q.o.map((o, i) => {
        const who = Object.entries(picks).filter(([, v]) => v === i).map(([pid]) => this.nick(pid));
        const cls = ['opt', my === i ? 'mine' : '', reveal && g.a === i ? 'right' : '', reveal && my === i && g.a !== i ? 'wrong' : ''].join(' ');
        return h('button', { class: cls, style: { '--c': OPT_COLORS[i] }, disabled: !can, onclick: () => this.sendIn({ v: i }) },
          h('span', { class: 'opt-tag' }, OPT_LABEL[i]), h('span', { class: 'opt-text' }, o), reveal && who.length ? h('small', null, who.join(', ')) : null);
      })),
      reveal ? (g.gains && g.gains[this.me()] ? h('p', { class: 'gp-note strong good' }, `+${g.gains[this.me()]}점!`) : null) : h('p', { class: 'gp-note' }, this.api.tv ? `답한 사람 ${g.answered.length}/${g.players.length}명` : this.inGame(g) ? (my !== null && my !== undefined ? `답했어요 · ${g.answered.length}/${g.players.length}명` : '빨리 맞힐수록 점수가 커요') : '다음 문제부터 함께해요'),
      this.scoreLine(g));
  }

  // ---------- OX퀴즈 ----------
  ox(g) {
    const me = this.me();
    const alive = !g.survival || (g.alive || []).includes(me);
    const side = this.api.mySide();
    const go = (k) => this.api.walkZone(k);
    if (g.phase === 'gather') {
      return h('div', null, h('p', { class: 'gp-note strong' }, '무대로 모여 주세요! 왼쪽이 O, 오른쪽이 X 구역이에요.'), this.api.tv ? null : h('button', { class: 'btn primary block', onclick: () => go('stage') }, '무대로 가기'),
        g.survival ? h('p', { class: 'gp-note' }, '틀리면 관중석으로! 끝까지 남는 사람이 우승이에요.') : null);
    }
    if (g.phase === 'answer' && this.api.tv) {
      const c = this.api.sideCounts();
      return h('div', null, h('div', { class: 'q-text big' }, g.q?.t || ''),
        h('div', { class: 'ox-btns' }, h('div', { class: 'ox o' }, 'O', h('small', null, `${c.O}명`)), h('div', { class: 'ox x' }, 'X', h('small', null, `${c.X}명`))),
        g.survival ? h('p', { class: 'gp-note' }, `남은 사람 ${(g.alive || []).length}명`) : null);
    }
    if (g.phase === 'answer') {
      return h('div', null,
        h('div', { class: 'q-text big' }, g.q?.t || ''),
        alive ? h('div', { class: 'ox-btns' }, h('button', { class: 'ox o' + (side === 'O' ? ' on' : ''), onclick: () => go('O') }, 'O'), h('button', { class: 'ox x' + (side === 'X' ? ' on' : ''), onclick: () => go('X') }, 'X')) : this.waitNote('관중석에서 응원해 주세요! 📣'),
        h('p', { class: 'gp-note' }, side === '-' ? '아직 O나 X 구역에 서 있지 않아요' : `지금 ${side} 구역에 서 있어요`),
        g.survival ? h('p', { class: 'gp-note' }, `남은 사람 ${(g.alive || []).length}명`) : null);
    }
    const r = g.res || {};
    return h('div', null,
      h('div', { class: 'q-text' }, g.q?.t || ''),
      h('div', { class: 'ox-answer ' + (r.a === 'O' ? 'o' : 'x') }, r.a), r.w ? h('p', { class: 'gp-note' }, r.w) : null,
      r.results && !this.api.tv ? h('p', { class: 'gp-note strong ' + (r.results[me] === r.a ? 'good' : 'bad') }, r.results[me] === r.a ? '정답이에요!' : r.results[me] ? '아쉬워요!' : '') : null,
      r.out && r.out.length ? h('p', { class: 'gp-note' }, `탈락 · ${r.out.map((pid) => this.nick(pid)).join(', ')}`) : null,
      g.survival ? h('p', { class: 'gp-note' }, `남은 사람 ${(g.alive || []).length}명`) : null);
  }

  // ---------- 결과 ----------
  result(g) {
    const res = g.result || { rank: [], unit: '점', label: '최종 순위' };
    const rank = res.rank || [];
    const top = rank.slice(0, 3);
    const none = rank.every((r) => !r.pts);
    const podium = h('div', { class: 'podium' }, [1, 0, 2].map((i) => {
      const r = top[i];
      if (!r) return h('div', { class: 'pod empty' });
      const cv = h('canvas', { class: 'pod-av', width: 72, height: 80 });
      const place = r.place || i + 1;
      requestAnimationFrame(() => paintAvatarIcon(cv, this.api.look(r.pid), { crown: place === 1 && !none }));
      return h('div', { class: 'pod p' + (i + 1) }, cv, h('b', null, r.nick), h('span', null, `${r.pts}${res.unit}${r.tag ? ' · ' + r.tag : ''}`), h('i', null, place));
    }));
    const host = this.api.isHost();
    return h('div', { class: 'result' },
      h('div', { class: 'res-label' }, res.label),
      podium,
      rank.length > 3 ? h('ul', { class: 'rank' }, rank.slice(3, 12).map((r, i) => h('li', { class: r.pid === this.me() ? 'me' : '' }, h('span', null, `${r.place || i + 4}. ${r.nick}`), r.tag ? h('em', null, r.tag) : null, h('b', null, `${r.pts}${res.unit}`)))) : null,
      this.api.tv ? null : h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => this.api.onCard(g) }, '결과 카드 저장'),
        h('button', { class: 'btn ghost', onclick: () => this.api.onShare(g) }, '공유하기')),
      this.api.tv ? null : host ? h('div', { class: 'row wrap' },
        h('button', { class: 'btn dark', onclick: () => this.api.send({ t: 'g.again' }) }, '한 판 더'),
        h('button', { class: 'btn ghost', onclick: () => { this.api.send({ t: 'g.close' }); this.api.openPicker(); } }, '다른 게임'),
        h('button', { class: 'btn ghost', onclick: () => this.api.send({ t: 'g.close' }) }, '닫기')) : h('p', { class: 'gp-note' }, '방장이 다음 게임을 고를 거예요.'),
      this.api.bookingUrl ? h('a', { class: 'booking', href: this.api.bookingUrl, target: '_blank', rel: 'noopener', onclick: () => this.api.stat('booking') }, h('b', null, '다음엔 진짜 파티룸에서 만나요'), h('span', null, '전국 쏘플파티룸 예약하기 →')) : null);
  }
}

// ---------- 그림판 ----------
class DrawBoard {
  constructor(onStroke, onClear) {
    this.onStroke = onStroke; this.onClear = onClear;
    this.cv = h('canvas', { class: 'draw-cv', width: 600, height: 600 });
    this.el = h('div', { class: 'draw-wrap' }, this.cv);
    this.ctx = this.cv.getContext('2d');
    this.segs = [];
    this.color = 0; this.width = 1;
    this.drawer = false;
    this.pending = [];
    this.tools = h('div', { class: 'draw-tools' },
      h('div', { class: 'swatches' }, DRAW_COLORS.map((c, i) => h('button', { class: 'sw' + (i === 0 ? ' on' : ''), style: { background: c }, 'aria-label': '색 ' + (i + 1), onclick: (ev) => { this.color = i; this.mark(ev.currentTarget, '.sw'); } }))),
      h('div', { class: 'widths' }, DRAW_WIDTHS.map((w, i) => h('button', { class: 'wd' + (i === 1 ? ' on' : ''), 'aria-label': '굵기 ' + (i + 1), onclick: (ev) => { this.width = i + 1; this.mark(ev.currentTarget, '.wd'); } }, h('i', { style: { width: 4 + i * 4 + 'px', height: 4 + i * 4 + 'px' } })))),
      h('button', { class: 'btn sm ghost', onclick: () => { this.clear(); this.onClear(); } }, '지우기'));
    this.width = 2;
    this.clear();
    this.bind();
    this.flushTimer = setInterval(() => this.flush(), 90);
  }
  mark(btn, sel) { for (const b of this.tools.querySelectorAll(sel)) b.classList.toggle('on', b === btn); }
  setDrawer(v) { this.drawer = v; this.cv.classList.toggle('can', v); }
  bind() {
    let last = null;
    const pos = (ev) => { const r = this.cv.getBoundingClientRect(); return [Math.round(((ev.clientX - r.left) / r.width) * 1000), Math.round(((ev.clientY - r.top) / r.height) * 1000)]; };
    this.cv.addEventListener('pointerdown', (ev) => { if (!this.drawer) return; ev.preventDefault(); this.cv.setPointerCapture(ev.pointerId); last = pos(ev); this.add([last[0], last[1], last[0] + 1, last[1], this.color, this.width], true); });
    this.cv.addEventListener('pointermove', (ev) => { if (!this.drawer || !last) return; const p = pos(ev); if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 6) return; this.add([last[0], last[1], p[0], p[1], this.color, this.width], true); last = p; });
    const end = () => { last = null; this.flush(); };
    this.cv.addEventListener('pointerup', end); this.cv.addEventListener('pointercancel', end);
    this.cv.style.touchAction = 'none';
  }
  add(s, mine) {
    const c = (v) => Math.max(0, Math.min(1000, v));
    const seg = [c(s[0]), c(s[1]), c(s[2]), c(s[3]), s[4], s[5]];
    this.segs.push(seg); this.paint(seg);
    if (mine) this.pending.push(seg);
  }
  flush() { if (this.pending.length) { const p = this.pending.splice(0, 60); this.onStroke(p); } }
  paint(s) {
    const k = this.cv.width / 1000;
    const ctx = this.ctx;
    ctx.strokeStyle = DRAW_COLORS[s[4]] || '#000'; ctx.lineWidth = DRAW_WIDTHS[(s[5] || 2) - 1] * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(s[0] * k, s[1] * k); ctx.lineTo(s[2] * k, s[3] * k); ctx.stroke();
  }
  addMany(list) { for (const s of list || []) { this.segs.push(s); this.paint(s); } }
  clear() { this.segs = []; this.pending = []; this.ctx.fillStyle = '#FFFFFF'; this.ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
  reset(list) { this.clear(); this.addMany(list); }
}

// ---------- 룰렛 ----------
class Wheel {
  constructor() {
    this.cv = h('canvas', { class: 'wheel', width: 520, height: 520 });
    this.label = h('div', { class: 'wheel-res' });
    this.el = h('div', { class: 'wheel-wrap' }, this.cv, h('div', { class: 'wheel-pin' }), this.label);
    this.angle = 0; this.items = []; this.spinId = 0;
  }
  set(items, spin) {
    const same = JSON.stringify(items) === JSON.stringify(this.items);
    this.items = items.slice();
    if (spin && spin.id !== this.spinId) {
      this.spinId = spin.id;
      const n = this.items.length; const seg = (Math.PI * 2) / n;
      const target = -Math.PI / 2 - (spin.idx + 0.5) * seg;
      const from = this.angle;
      let to = target;
      while (to < from + Math.PI * 8) to += Math.PI * 2;
      const t0 = performance.now(); const dur = 3200;
      this.label.textContent = '';
      this.onSpin && this.onSpin();
      const run = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        this.angle = from + (to - from) * e;
        this.paint();
        if (k < 1) requestAnimationFrame(run); else { this.label.textContent = this.items[spin.idx] || ''; this.onDone && this.onDone(this.items[spin.idx]); }
      };
      requestAnimationFrame(run);
    } else if (!spin && !same) { this.label.textContent = ''; }
    else if (spin && !this.label.textContent) this.label.textContent = this.items[spin.idx] || '';
    this.paint();
  }
  paint() {
    const ctx = this.cv.getContext('2d'); const W = this.cv.width; const r = W / 2 - 8;
    ctx.clearRect(0, 0, W, W);
    const n = Math.max(1, this.items.length); const seg = (Math.PI * 2) / n;
    const cols = ['#E83217', '#F5B82E', '#2F6BFF', '#22A86B', '#FF7AA8', '#8E5CF7', '#F07F2A', '#6EC3F2', '#2B2D35', '#C2412D'];
    ctx.save(); ctx.translate(W / 2, W / 2); ctx.rotate(this.angle);
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, i * seg, (i + 1) * seg); ctx.closePath();
      ctx.fillStyle = cols[i % cols.length]; ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.rotate(i * seg + seg / 2);
      ctx.fillStyle = '#FFFFFF'; ctx.font = `700 ${n > 8 ? 20 : 24}px Pretendard, system-ui, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(this.items[i] || '').slice(0, 9), r - 16, 0);
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(W / 2, W / 2, 30, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.fillStyle = '#E83217'; ctx.font = '800 20px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GO', W / 2, W / 2 + 1);
  }
}
