# 쏘플파티룸 홈페이지

전국 프라이빗 파티룸 예약 서비스 **쏘플파티룸**의 공식 웹사이트입니다.
빌드 과정이 필요 없는 정적 사이트(HTML/CSS/JS)라서, GitHub에 올려두면 Cloudflare Pages가 자동으로 배포합니다.

---

## 📁 페이지 구성

| 파일 | 내용 |
|------|------|
| `index.html` | 메인 (홈) |
| `rooms.html` | 공간 찾기 (검색·필터) |
| `room-detail.html` | 공간 상세 |
| `locations.html` | 지점 안내 |
| `booking.html` | 예약·결제 |
| `about.html` | 브랜드 소개 |
| `corporate.html` | 기업대관 |
| `franchise.html` | 창업안내 |
| `guide.html` | 이용안내·FAQ |
| `reviews.html` | 이용후기 |
| `event.html` | 이벤트·공지 |
| `membership.html` | 멤버십 |
| `gift.html` | 선물하기 |
| `mypage.html` | 마이페이지 |

이 밖에 배포용 보조 파일이 함께 들어 있습니다.

| 파일 | 역할 |
|------|------|
| `404.html` | 없는 주소로 들어왔을 때 보여줄 안내 페이지 (Cloudflare가 자동 사용) |
| `_headers` | 보안 헤더·캐시 설정 (Cloudflare Pages 전용) |
| `robots.txt` | 검색엔진 크롤링 안내 |
| `sitemap.xml` | 검색엔진용 페이지 목록 |
| `.gitignore` | Git에 올리지 않을 잡파일 목록 |

---

## 🚀 배포하기 (GitHub → Cloudflare Pages)

### 1단계. GitHub에 파일 올리기

개발 도구가 익숙하지 않다면 **웹에서 바로 올리는 방법**이 가장 쉽습니다.

1. [github.com](https://github.com) 로그인 후, 오른쪽 위 **`+` → New repository**
2. 저장소 이름 입력 (예: `ssople-web`) → **Public** 선택 → **Create repository**
3. 만들어진 저장소 화면에서 **uploading an existing file** 링크 클릭
4. 이 폴더 안의 **파일 전체를 드래그**해서 올리기
   - `.gitignore`, `_headers`처럼 점(`.`)이나 밑줄(`_`)로 시작하는 파일도 빠짐없이 포함해 주세요.
5. 아래 **Commit changes** 버튼 클릭

> 명령어(git)에 익숙하다면 아래처럼 해도 됩니다.
> ```bash
> git init
> git add .
> git commit -m "쏘플파티룸 홈페이지 최초 배포"
> git branch -M main
> git remote add origin https://github.com/사용자명/ssople-web.git
> git push -u origin main
> ```

### 2단계. Cloudflare Pages에 연결하기

1. [Cloudflare 대시보드](https://dash.cloudflare.com) 로그인 (계정 없으면 무료 가입)
2. 왼쪽 메뉴 **Workers & Pages** → **Create application** → **Pages** 탭 → **Connect to Git**
3. **GitHub 연결(Authorize)** 후, 방금 만든 저장소(`ssople-web`) 선택
4. 빌드 설정 화면에서 아래처럼 두면 됩니다. **이 사이트는 빌드가 필요 없습니다.**

   | 항목 | 입력값 |
   |------|--------|
   | Framework preset | **None** |
   | Build command | **비워두기** |
   | Build output directory | **`/`** (또는 비워두기) |

5. **Save and Deploy** 클릭 → 잠시 뒤 배포 완료

배포가 끝나면 `https://프로젝트명.pages.dev` 형태의 주소가 발급됩니다. 바로 접속해서 확인해 보세요.

---

## 🔄 이후 수정 방법

한 번 연결해 두면, **GitHub의 파일을 고치고 저장(commit)하는 순간 Cloudflare가 자동으로 다시 배포**합니다.
따로 재배포 버튼을 누를 필요가 없습니다.

- 간단한 문구 수정: GitHub 웹에서 해당 파일을 열고 연필 아이콘(✏️)으로 바로 편집 → **Commit**
- 여러 파일 교체: 위 **1단계**의 업로드 방식으로 새 파일을 올리면 덮어쓰기 됩니다.

---

## 🌐 도메인 연결 (예: ssople.com)

1. Cloudflare Pages 프로젝트 → **Custom domains** → **Set up a domain**
2. 보유한 도메인 입력 후 안내에 따라 DNS(CNAME) 설정
3. SSL 인증서는 Cloudflare가 자동 발급합니다 (몇 분~수십 분 소요)

> 도메인을 연결한 뒤에는 아래 두 파일 안의
> `https://ssople.pages.dev` 주소를 **실제 도메인으로 바꿔주세요.** 검색 노출에 도움이 됩니다.
> - `robots.txt`
> - `sitemap.xml`

---

## ℹ️ 참고

- 이 사이트는 서버가 필요 없는 **정적 웹사이트**입니다. 예약·결제 등 실제 데이터 처리를 붙이려면 별도 백엔드(API) 연동이 필요합니다.
- 글꼴은 Pretendard(CDN)를 사용하며, 이미지·아이콘은 파일 안에 내장되어 있어 별도 이미지 폴더가 없습니다.
- GitHub 저장소를 **Private(비공개)** 로 두어도 Cloudflare Pages 연결·배포가 가능합니다.
