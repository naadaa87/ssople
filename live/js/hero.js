// 홈페이지 소개 화면의 움직이는 미리보기 — 서버 없이 가상의 친구들이 노는 모습을 보여 줘요
import { World } from './world.js';
import { DemoNet } from './demo.js';

const cv = document.getElementById('lvHero');
if (cv) {
  const low = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = new World(cv, { mode: 'spectate', low, fit: 1.12 });
  const scenes = [
    { kind: 'party', theme: 'home', banner: '오늘 밤, 같은 방에서', light: 'warm', deco: [{ i: 'balloons', x: 12, y: 4 }, { i: 'gift_box', x: 9, y: 9 }, { i: 'teddy', x: 3, y: 6 }] },
    { kind: 'party', theme: 'rooftop', banner: '민지야 생일 축하해!', light: 'pink', deco: [{ i: 'cake_tower', x: 9, y: 8 }, { i: 'flower_stand', x: 13, y: 4 }] },
    { kind: 'party', theme: 'game', banner: 'GAME NIGHT', light: 'party', deco: [{ i: 'neon_stand', x: 12, y: 4 }] },
  ];
  let i = 0;
  let net = null;
  const play = (scene) => {
    if (net) net.close();
    net = new DemoNet({
      code: 'HERO', dev: 'hero-viewer', nick: 'TV', look: {}, role: 'spectator', bots: 5, chatty: true, botPets: true, room: scene,
      onMsg: (m) => {
        if (m.t === 'welcome') { world.setRoom(m.room); world.setPlayers(m.players, null); }
        else if (m.t === 'join' || m.t === 'player') world.upsert(m.p);
        else if (m.t === 'pos') world.moveRemote(m.pid, m.x, m.y, m.tx, m.ty, m.sit, m.force);
        else if (m.t === 'chat' && m.m.pid) world.say(m.m.pid, m.m.text);
        else if (m.t === 'emote') world.emote(m.pid, m.e);
        else if (m.t === 'react') world.react(m.pid, m.e);
        else if (m.t === 'room') world.setRoom(m.room);
      },
    });
    net.connect();
  };
  play(scenes[0]);
  world.start();
  setInterval(() => { if (document.visibilityState !== 'visible') return; i = (i + 1) % scenes.length; play(scenes[i]); }, 16000);
  new ResizeObserver(() => world.resize()).observe(cv);
  new IntersectionObserver((ents) => { for (const e of ents) { if (e.isIntersecting) world.start(); else world.stop(); } }).observe(cv);
}
