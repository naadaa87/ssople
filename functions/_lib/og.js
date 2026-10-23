// 링크 미리보기(카카오톡·문자·SNS) 이미지 — /assets/img/og/ 에 미리 만들어 둔 1200×630 카드
// 지점 이름·인원이 바뀌거나 지점이 새로 생기면 카드를 다시 만들고 OG_VER를 올린다 (카드가 없는 지점은 첫 사진을 쓴다)
export const OG_VER = '20261023';
export const OG_ROOMS = new Set(["S-0001", "S-0002", "S-0003", "S-0005", "S-0007", "S-0008", "S-0009", "S-0010", "S-0011", "S-0012", "S-0013", "S-0014", "S-0016", "S-0017", "S-0018", "S-0019", "S-0021", "S-0022", "S-0023", "S-0024", "S-0025", "S-0026", "S-0028", "S-0029", "S-0032", "S-0033", "S-0034", "S-0035", "S-0036", "S-0037", "S-0040", "S-0041", "S-0042", "S-0043", "S-0044", "S-0045"]);
export const OG_AREAS = new Set(["bundang", "bupyeong", "busan", "cheonho", "daejeon", "dongtan", "gundae", "guro", "gyeonggi", "hongdae", "hyehwa", "incheon", "jeonju", "kkachisan", "misa", "namyangju", "seonyudo", "seoul", "sinchon", "sindorim", "suwon", "uiwang", "wolmido"]);
export const ogImg = (path) => `/assets/img/og/${path}.jpg?v=${OG_VER}`;
