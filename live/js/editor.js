// 꾸미기 편집기 — 내 집(가구·벽지·바닥)과 내 파티룸(테마·조명·현수막·소품)
// 아래 칸에서 소품을 고르고, 방 바닥을 눌러 자리를 정해요. 저장하면 내 정보에 기록돼요.
import { h, toast, confirmBox } from './ui.js';
import { P } from './profile.js';
import { celebrate } from './hub.js';
import { paintItemIcon } from './deco.js';
import { play } from './sound.js';
import { ITEMS, footprint } from '../shared/catalog.js';
import { checkLayout, mapFor, THEMES, LIGHTS, LAYOUT_MAX } from '../shared/maps.js';

const TABS = {
  home: [['furn', '가구'], ['deco', '소품'], ['wall', '벽 장식'], ['paper', '벽지'], ['floor', '바닥']],
  party: [['deco', '소품'], ['furn', '러그·트리'], ['style', '테마·조명']],
};
const THEME_SWATCH = { home: 'linear-gradient(135deg,#F6E7D4,#E3C193)', rooftop: 'linear-gradient(135deg,#1B2147,#3A2C66 60%,#6A3E6E)', game: 'linear-gradient(135deg,#1E2136,#5B43D6 60%,#FF4FA0)' };

export class Editor {
  /** opts: { kind: 'home'|'party', world, mount(el), onDone(saved, data) } */
  constructor(opts) {
    this.o = opts;
    this.kind = opts.kind;
    const v = P.view();
    const src = this.kind === 'home' ? v.home : v.room;
    this.items = src.items.map((x) => ({ ...x }));
    this.wall = v.home.wall; this.floor = v.home.floor;
    this.theme = v.room.theme; this.light = v.room.light; this.banner = v.room.banner || '';
    this.tab = TABS[this.kind][0][0];
    this.ghost = null; this.sel = null; this.msg = ''; this.dirty = false;
    this.el = h('div', { class: 'editor glass' });
    opts.mount(this.el);
    opts.world.opts.onEditTap = (x, y) => this.tap(x, y);
    this.sync();
    this.render();
  }

  // 다른 쪽(집↔파티룸)에 놓인 개수를 뺀, 이 방에 쓸 수 있는 개수
  avail() {
    const v = P.view();
    const other = this.kind === 'home' ? v.room.items : v.home.items;
    const out = { ...v.inv };
    for (const it of other) out[it.i] = (out[it.i] || 0) - 1;
    return out;
  }
  left(id) {
    const a = this.avail()[id] || 0;
    const used = this.items.filter((x) => x.i === id).length + (this.ghost && this.ghost.from == null && this.ghost.i === id ? 1 : 0);
    return a - used;
  }

  list() { return this.ghost ? this.items.filter((_, i) => i !== this.ghost.from).concat([{ i: this.ghost.i, x: this.ghost.x, y: this.ghost.y, r: this.ghost.r }]) : this.items; }
  check(list) { return checkLayout(this.kind, list, this.avail()); }

  sync() {
    const base = this.ghost ? this.items.filter((_, i) => i !== this.ghost.from) : this.items;
    this.o.world.setEdit({ items: base, ghost: this.ghost, sel: this.ghost ? null : this.sel, wall: this.wall, floor: this.floor });
    if (this.kind === 'party' && this.o.onStyle) this.o.onStyle({ theme: this.theme, light: this.light, banner: this.banner });
  }

  // ---------- 고르기·놓기 ----------
  pick(id) {
    const def = ITEMS[id];
    if (def.cat === 'paper') { this.wall = id; this.dirty = true; this.sync(); this.render(); return; }
    if (def.cat === 'floor') { this.floor = id; this.dirty = true; this.sync(); this.render(); return; }
    if (this.left(id) <= 0) { toast('남은 게 없어요. 상점에서 더 살 수 있어요.'); return; }
    if (this.items.length >= LAYOUT_MAX[this.kind] && !this.ghost) { toast(`소품은 ${LAYOUT_MAX[this.kind]}개까지 놓을 수 있어요.`); return; }
    const spot = this.findSpot(id, 0);
    this.ghost = { i: id, x: spot[0], y: spot[1], r: 0, from: null };
    this.sel = null;
    this.validate();
    this.msg = '놓을 곳을 방에서 눌러 주세요';
    play('click');
    this.sync(); this.render();
  }

  findSpot(id, r) {
    const map = mapFor(this.kind);
    const def = ITEMS[id];
    const fp = footprint(id, r);
    const base = this.ghost ? this.items.filter((_, i) => i !== this.ghost.from) : this.items;
    const tries = [];
    if (def.place === 'wall') { for (let x = 1; x < map.w; x++) tries.push([x, 0]); for (let y = 1; y < map.h; y++) tries.push([0, y]); }
    else {
      const cx = map.w / 2; const cy = map.h / 2;
      // 붙박이 소품(소파·바·무대)의 놀이 구역은 되도록 피해서
      const busy = (x, y) => map.props.some((p) => p.area && x + fp.w > p.area[0] && x <= p.area[2] && y + fp.h > p.area[1] && y <= p.area[3]);
      for (let y = 0; y <= map.h - fp.h; y++) for (let x = 0; x <= map.w - fp.w; x++) tries.push([x, y, busy(x, y) ? 1 : 0]);
      tries.sort((a, b) => a[2] - b[2] || Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    }
    for (const [x, y] of tries) if (!this.check(base.concat([{ i: id, x, y, r }])).error) return [x, y];
    return tries[0] || [1, 1];
  }

  validate() {
    if (!this.ghost) return true;
    const r = this.check(this.list());
    this.ghost.ok = !r.error;
    this.msg = r.error || '좋아요! 여기에 놓을까요?';
    return !r.error;
  }

  tap(x, y) {
    const map = mapFor(this.kind);
    if (this.ghost) {
      const def = ITEMS[this.ghost.i];
      const fp = footprint(this.ghost.i, this.ghost.r);
      if (def.place === 'wall') {
        if (y < x) { this.ghost.y = 0; this.ghost.x = Math.max(0, Math.min(map.w - 1, Math.floor(x))); }
        else { this.ghost.x = 0; this.ghost.y = Math.max(0, Math.min(map.h - 1, Math.floor(y))); }
      } else {
        this.ghost.x = Math.max(0, Math.min(map.w - fp.w, Math.round(x - fp.w / 2)));
        this.ghost.y = Math.max(0, Math.min(map.h - fp.h, Math.round(y - fp.h / 2)));
      }
      this.validate(); this.sync(); this.render();
      return;
    }
    // 놓인 소품 고르기 (세운 것 → 벽 → 러그 순서)
    const tx = Math.floor(x); const ty = Math.floor(y);
    const hit = (pred) => this.items.findIndex((it) => { const d = ITEMS[it.i]; if (!pred(d)) return false; const fp = footprint(it.i, it.r); return tx >= it.x && tx < it.x + fp.w && ty >= it.y && ty < it.y + fp.h; });
    let idx = hit((d) => d.place === 'floor' || d.place === 'hang');
    if (idx < 0) idx = this.items.findIndex((it) => ITEMS[it.i].place === 'wall' && ((it.y === 0 && y < 1.2 && Math.floor(x) === it.x) || (it.x === 0 && x < 1.2 && Math.floor(y) === it.y)));
    if (idx < 0) idx = hit((d) => d.place === 'flat');
    this.sel = idx >= 0 ? idx : null;
    this.msg = idx >= 0 ? ITEMS[this.items[idx].i].name : '';
    this.sync(); this.render();
  }

  rotate() {
    if (this.ghost) { this.ghost.r = this.ghost.r ? 0 : 1; const fp = footprint(this.ghost.i, this.ghost.r); const map = mapFor(this.kind); this.ghost.x = Math.min(this.ghost.x, map.w - fp.w); this.ghost.y = Math.min(this.ghost.y, map.h - fp.h); this.validate(); }
    else if (this.sel != null) {
      const it = this.items[this.sel];
      const next = this.items.slice(); next[this.sel] = { ...it, r: it.r ? 0 : 1 };
      const r = this.check(next);
      if (r.error) { toast(r.error); return; }
      this.items = next; this.dirty = true;
    }
    play('click'); this.sync(); this.render();
  }

  place() {
    if (!this.ghost) return;
    if (!this.validate()) { toast(this.msg); play('wrong'); this.render(); return; }
    const it = { i: this.ghost.i, x: this.ghost.x, y: this.ghost.y, r: this.ghost.r };
    if (this.ghost.from != null) this.items[this.ghost.from] = it; else this.items.push(it);
    this.ghost = null; this.dirty = true; this.msg = '놓았어요';
    play('pop'); this.sync(); this.render();
  }

  move() {
    if (this.sel == null) return;
    const it = this.items[this.sel];
    this.ghost = { ...it, from: this.sel, ok: true };
    this.sel = null; this.msg = '옮길 곳을 방에서 눌러 주세요';
    this.validate(); this.sync(); this.render();
  }

  remove() {
    if (this.ghost && this.ghost.from == null) { this.ghost = null; this.msg = ''; }
    else if (this.ghost) { this.items.splice(this.ghost.from, 1); this.ghost = null; this.dirty = true; this.msg = '보관함에 넣었어요'; }
    else if (this.sel != null) { this.items.splice(this.sel, 1); this.sel = null; this.dirty = true; this.msg = '보관함에 넣었어요'; }
    play('click'); this.sync(); this.render();
  }

  async save() {
    if (this.ghost) { if (!this.validate()) { toast('놓는 중인 소품의 자리를 먼저 정해 주세요'); return; } this.place(); }
    const r = this.check(this.items);
    if (r.error) { toast(r.error); return; }
    try {
      const g = this.kind === 'home'
        ? await P.act('home', { wall: this.wall, floor: this.floor, items: r.items })
        : await P.act('room', { theme: this.theme, light: this.light, banner: this.banner, items: r.items });
      celebrate(g);
      toast('저장했어요', 'good');
      this.close(true);
    } catch (e) { toast(e.message, 'bad'); }
  }

  async cancel() {
    if (this.dirty && !(await confirmBox('바꾼 내용을 저장하지 않고 나갈까요?', '나가기'))) return;
    this.close(false);
  }

  close(saved) {
    this.o.world.opts.onEditTap = null;
    this.o.world.setEdit(null);
    this.el.remove();
    if (this.o.onDone) this.o.onDone(saved, { theme: this.theme, light: this.light, banner: this.banner });
  }

  // ---------- 화면 ----------
  render() {
    const v = P.view();
    const tabs = h('div', { class: 'ed-tabs' }, TABS[this.kind].map(([k, l]) => h('button', { class: k === this.tab ? 'on' : '', onclick: () => { this.tab = k; this.render(); } }, l)));
    let strip;
    if (this.tab === 'style') strip = this.styleBox();
    else {
      const ids = Object.keys(ITEMS).filter((id) => {
        const d = ITEMS[id];
        if (d.cat !== this.tab) return false;
        if (['paper', 'floor'].includes(d.cat)) return (v.inv[id] || 0) > 0;
        return d.where?.includes(this.kind) && (v.inv[id] || 0) > 0;
      });
      strip = h('div', { class: 'ed-strip' }, ids.length ? ids.map((id) => {
        const d = ITEMS[id];
        const cv = h('canvas', { width: 64, height: 56 });
        requestAnimationFrame(() => paintItemIcon(cv, id));
        const isOn = (d.cat === 'paper' && this.wall === id) || (d.cat === 'floor' && this.floor === id);
        const n = ['paper', 'floor'].includes(d.cat) ? null : this.left(id);
        return h('button', { class: 'ed-item' + (isOn ? ' on' : '') + (n === 0 ? ' none' : ''), onclick: () => this.pick(id) }, cv, h('small', null, d.name), n != null ? h('em', null, n) : null);
      }) : h('p', { class: 'hint' }, '가지고 있는 게 없어요. 상점에서 사 올 수 있어요.'));
    }
    const sel = this.sel != null ? this.items[this.sel] : null;
    const actions = this.ghost
      ? h('div', { class: 'ed-acts' }, h('span', { class: 'ed-msg' + (this.ghost.ok ? ' ok' : ' bad') }, this.msg),
        h('button', { class: 'btn sm ghost', onclick: () => this.rotate() }, '↻ 돌리기'),
        h('button', { class: 'btn sm ghost', onclick: () => this.remove() }, this.ghost.from == null ? '취소' : '보관함에'),
        h('button', { class: 'btn sm primary', disabled: !this.ghost.ok, onclick: () => this.place() }, '여기 놓기'))
      : sel ? h('div', { class: 'ed-acts' }, h('span', { class: 'ed-msg' }, ITEMS[sel.i].name),
        h('button', { class: 'btn sm ghost', onclick: () => this.rotate() }, '↻ 돌리기'),
        h('button', { class: 'btn sm ghost', onclick: () => this.move() }, '옮기기'),
        h('button', { class: 'btn sm ghost', onclick: () => this.remove() }, '보관함에'))
        : h('div', { class: 'ed-acts' }, h('span', { class: 'ed-msg' }, this.msg || '아래에서 소품을 고르거나, 놓인 소품을 눌러 옮겨 보세요'));
    this.el.replaceChildren(
      h('div', { class: 'ed-head' }, h('b', null, this.kind === 'home' ? '🏠 내 집 꾸미기' : '🎨 내 파티룸 꾸미기'), h('span', { class: 'ed-count' }, `${this.items.length}/${LAYOUT_MAX[this.kind]}`), h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost', onclick: () => this.cancel() }, '나가기'),
        h('button', { class: 'btn sm primary', onclick: () => this.save() }, '저장')),
      actions, tabs, strip);
  }

  styleBox() {
    const themes = h('div', { class: 'opt-row' }, ['home', 'rooftop', 'game'].map((t) => h('button', { type: 'button', class: 'theme-pick' + (t === this.theme ? ' on' : ''), onclick: () => { this.theme = t; this.dirty = true; this.sync(); this.render(); } }, h('i', { style: { background: THEME_SWATCH[t] } }), h('b', null, THEMES[t].name))));
    const lights = h('div', { class: 'lights' }, Object.entries(LIGHTS).map(([k, l]) => h('button', { type: 'button', class: 'light-dot' + (k === this.light ? ' on' : ''), title: l.name, 'aria-label': l.name, style: { background: l.color }, onclick: () => { this.light = k; this.dirty = true; this.sync(); this.render(); } })));
    const banner = h('input', { class: 'inp', maxlength: 24, value: this.banner, placeholder: '현수막 문구 (예: 민지야 생일 축하해!)' });
    banner.addEventListener('change', () => { this.banner = banner.value.trim(); this.dirty = true; this.sync(); });
    return h('div', { class: 'ed-style' }, themes, lights, banner, h('p', { class: 'hint' }, '여기서 꾸민 대로 파티룸을 만들 수 있어요. 방을 만들 때 「내가 꾸민 파티룸」을 고르면 돼요.'));
  }
}
