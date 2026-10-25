// 미니게임 8종의 기본 정보 — 점수 상한·등급 기준은 서버도 같이 봐요 (말이 안 되는 점수는 받지 않음)
// grade: [B, A, S] 점수 기준 · max: 받을 수 있는 가장 높은 점수 · ms: 한 판에 걸리는 시간 범위(밀리초)
export const ARCADE = {
  balloon: { name: '풍선 팡팡', icon: '🎈', desc: '떠오르는 풍선을 터뜨려요. 금색은 30점, 까만 폭탄은 조심!', how: '풍선을 눌러요', sec: 30, max: 2400, grade: [300, 600, 950], ms: [20000, 70000], color: '#E83217' },
  stack: { name: '케이크 쌓기', icon: '🎂', desc: '움직이는 케이크 층을 딱 맞춰 쌓아요. 빗나간 만큼 잘려요.', how: '화면을 눌러 내려놓아요', sec: 0, max: 2500, grade: [120, 260, 420], ms: [3000, 240000], color: '#F59E0B' },
  rhythm: { name: '리듬 파티', icon: '🥁', desc: '세 줄로 떨어지는 음표가 선에 닿을 때 눌러요.', how: '아래 버튼 세 개를 눌러요', sec: 32, max: 4000, grade: [600, 1100, 1700], ms: [25000, 70000], color: '#8E5CF7' },
  memory: { name: '짝꿍 카드', icon: '🃏', desc: '카드 16장 중 같은 그림 두 장을 찾아요. 빨리, 적게 뒤집을수록 점수가 높아요.', how: '카드를 두 장씩 뒤집어요', sec: 60, max: 1000, grade: [350, 550, 750], ms: [6000, 90000], color: '#2F6BFF' },
  catch: { name: '간식 받기', icon: '🦴', desc: '내 펫을 움직여 떨어지는 간식을 받아요. 양파와 초콜릿은 피하세요.', how: '좌우로 끌거나 화살표 키', sec: 40, max: 2400, grade: [250, 500, 820], ms: [8000, 70000], color: '#22A86B' },
  reaction: { name: '반응 속도', icon: '⚡', desc: '화면이 초록색이 되는 순간 눌러요. 다섯 번의 평균으로 점수를 매겨요.', how: '초록색이 되면 바로 눌러요', sec: 0, max: 1300, grade: [400, 600, 800], ms: [5000, 120000], color: '#EAB308' },
  numbers: { name: '숫자 터치', icon: '🔢', desc: '1부터 25까지 순서대로 빠르게 눌러요. 잘못 누르면 1초가 더해져요.', how: '1부터 차례로 눌러요', sec: 60, max: 1200, grade: [500, 700, 850], ms: [7000, 90000], color: '#06B6D4' },
  whack: { name: '깜짝 상자', icon: '🎁', desc: '상자에서 튀어나온 폭죽을 잡아요. 케이크는 누르면 안 돼요.', how: '튀어나오면 눌러요', sec: 30, max: 2000, grade: [250, 450, 700], ms: [20000, 70000], color: '#EC4899' },
};
export const ARCADE_IDS = Object.keys(ARCADE);

export function gradeOf(game, score) {
  const g = ARCADE[game]?.grade;
  if (!g) return 'C';
  return score >= g[2] ? 'S' : score >= g[1] ? 'A' : score >= g[0] ? 'B' : 'C';
}

/** 서버가 받을 수 있는 점수인지 */
export function plausible(game, score, ms) {
  const a = ARCADE[game];
  if (!a) return false;
  if (!Number.isInteger(score) || score < 0 || score > a.max) return false;
  if (!Number.isFinite(ms) || ms < a.ms[0] || ms > a.ms[1]) return false;
  return true;
}

// 같은 씨앗이면 같은 판이 나오는 난수 — 미니게임 대결에서 모두가 같은 문제를 받도록
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
