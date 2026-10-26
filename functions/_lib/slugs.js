// 지역·동네 주소(slug) — 서버 화면·구조화 데이터·지점 API(publicSpace)가 함께 쓴다
export const REGION_SLUGS = { 서울: 'seoul', 경기: 'gyeonggi', 인천: 'incheon', 대전: 'daejeon', 부산: 'busan', 전주: 'jeonju', 대구: 'daegu', 광주: 'gwangju', 울산: 'ulsan', 제주: 'jeju', 강원: 'gangwon', 충청: 'chungcheong', 경남: 'gyeongnam', 경북: 'gyeongbuk', 전남: 'jeonnam', 전북: 'jeonbuk', 세종: 'sejong' };
export const AREA_SLUGS = {
  건대: 'gundae', 구로: 'guro', 까치산: 'kkachisan', 선유도: 'seonyudo', 신도림: 'sindorim', 신촌: 'sinchon', 천호: 'cheonho', 혜화: 'hyehwa', 홍대: 'hongdae',
  강남: 'gangnam', 잠실: 'jamsil', 이태원: 'itaewon', 성수: 'seongsu', 합정: 'hapjeong', 왕십리: 'wangsimni', 노원: 'nowon', 신림: 'sillim', 사당: 'sadang', 영등포: 'yeongdeungpo', 종로: 'jongno', 연남: 'yeonnam', 망원: 'mangwon', 서울대입구: 'seoultaeipgu', 수유: 'suyu', 목동: 'mokdong', 강북: 'gangbuk', 마포: 'mapo', 용산: 'yongsan',
  남양주: 'namyangju', 동탄: 'dongtan', 미사: 'misa', 분당: 'bundang', 수원: 'suwon', 의왕: 'uiwang', 일산: 'ilsan', 안양: 'anyang', 평택: 'pyeongtaek', 용인: 'yongin', 성남: 'seongnam', 부천: 'bucheon', 화성: 'hwaseong', 광명: 'gwangmyeong', 김포: 'gimpo', 하남: 'hanam', 구리: 'guri', 의정부: 'uijeongbu', 안산: 'ansan', 시흥: 'siheung', 파주: 'paju', 양주: 'yangju',
  부평: 'bupyeong', 월미도: 'wolmido', 송도: 'songdo', 구월동: 'guwol', 주안: 'juan',
  대전: 'daejeon', 부산: 'busan', 전주: 'jeonju', 서면: 'seomyeon', 해운대: 'haeundae', 광안리: 'gwangalli', 둔산: 'dunsan', 유성: 'yuseong', 대구: 'daegu', 동성로: 'dongseongno', 광주: 'gwangju', 울산: 'ulsan', 제주: 'jeju', 천안: 'cheonan', 청주: 'cheongju', 춘천: 'chuncheon', 강릉: 'gangneung', 창원: 'changwon', 포항: 'pohang', 여수: 'yeosu', 순천: 'suncheon', 목포: 'mokpo', 전북: 'jeonbuk',
};
export const slugOf = (name, table) => table[name] || encodeURIComponent(String(name || '').trim());
export const regionPath = (name) => '/area/' + slugOf(name, REGION_SLUGS);
export const areaPath = (name) => '/area/' + slugOf(name, AREA_SLUGS);
