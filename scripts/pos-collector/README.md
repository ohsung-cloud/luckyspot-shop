# pos-collector — 로얄선즈 · 에스칼프린트 매일 자동 수집

두 포털에 **자동 로그인 → 화면 값 수집 → 교차 분석 → 발주 시스템 전송**까지 한 번에 하는 수집기.
GitHub Actions(`.github/workflows/daily-pos-collect.yml`)가 매일 08:30 KST(`30 23 * * *` UTC)에 실행한다.

원본: `two-site-collector`(2026-11-23 실측으로 검증된 엔진·추출기). 이 폴더로 옮기면서
Playwright 로그인·이동 러너와 지점 분리(storeCode)를 붙였다.

```
src/engine.mjs            교차 엔진(매출·수요·드리프트·잔여일·발주 제안)
src/extractors.mjs        화면 추출기(브라우저 안에서 실행되는 읽기 전용 스크립트)
src/merge.mjs             조각 → 지점 스냅샷
src/payload.mjs           스냅샷 → ingest-pos 전송 본문 / 요약(금액 제외)
src/stores.mjs            지점 정의·환경변수 자격증명·리댁션
src/browser/session.mjs   로그인·메뉴 이동·추출 실행·JSON 응답 관찰
src/browser/collect.mjs   지점 1곳 수집 흐름(포털별 단계)
src/mock-server.mjs       자체 검증용 목 포털
bin/collect-and-push.mjs  실행 진입점
bin/daily.mjs             저장된 스냅샷 재분석·재전송
bin/merge.mjs             조각 폴더 → 스냅샷 파일
tests/                    엔진 고정값 · 병합 · 전송본 · 목 e2e (20건)
```

## 실행

```bash
cd scripts/pos-collector
npm ci                            # playwright 1.65.1 (Next 앱 의존성과 무관)
npx playwright install chromium   # 로컬 1회

node bin/collect-and-push.mjs --dry-run --store all      # 수집·분석만
node bin/collect-and-push.mjs --store STORE_GNM          # 한 지점 실제 전송
node bin/collect-and-push.mjs --mock --dry-run           # 목 포털 자체 검증
node --test "tests/*.test.mjs"                           # 20건
```

`--dry-run` 은 전송만 생략한다. 산출물은 `.tmp/pos-collector/<KST시각>/<STORE>/`에 남는다
(`fragments.json`, `snapshot.json`, `analysis.json`, `report.md`, `payload.json`).
GitHub Actions 에서는 러너 임시 폴더에만 쓰고 **아티팩트로 올리지 않는다**.

## 필요한 GitHub Secrets

| 이름 | 설명 |
| --- | --- |
| `LOYALSUNS_GNM_ID` / `LOYALSUNS_GNM_PW` | 로얄선즈 강남구청역점 계정 |
| `LOYALSUNS_HYJ_ID` / `LOYALSUNS_HYJ_PW` | 로얄선즈 한예종점 계정 |
| `ESCAL_GNM_ID` / `ESCAL_GNM_PW` | 에스칼프린트 강남구청역점 계정(예: `ESCAL_` + 매장번호) |
| `ESCAL_HYJ_ID` / `ESCAL_HYJ_PW` | 에스칼프린트 한예종점 계정 |
| `INGEST_API_SECRET` | (선택) Vercel 에 같은 값을 넣으면 수집기만 전송할 수 있다 |

값이 없는 지점·포털은 **실패가 아니라 건너뜀**으로 처리한다. 전 지점이 비어 있으면 워크플로우가 실패한다.
저장소 Variables 에 `INGEST_API_URL` 을 두면 전송 주소를 바꿀 수 있다(기본 `https://luckyspot-shop.vercel.app`).

## 수집 항목

**로얄선즈** (`http://coffee.loyalsuns.com:8090/#/login`)
- Main page: 금일·어제·이달·**지난달(전월)** 매출, 누적 주문금액·건수, 환불, 베스트셀러, 재료부족 알림
- 판매수익 → 판매정보: 오늘 주문 내역
- 재고 관리 → 재고정보: 슬롯별 잔량 % — 화면이 캔버스면 **같은 화면이 부르는 JSON**에서 읽는다
- 기계 로그 정보: 원료 소모 일지 · 보충 로그 · 재료부족 기계
- 레시피관리: 상품 상세(상위 4개)

**에스칼프린트** (`https://escalprint-portal.com/`)
- 홈/잔량: 토너 K·C·M·Y %, Tray1·Tray2 %, 누적 매수, 모델·S/N
- 청구·정산: 매출 분석(월별 실매출·전월비), 발주 지출 분석, 환불 내역
- 발주하기: 카탈로그(단가·최소수량·무료배송 기준)
- 일정: 학사일정(시험기간 가중)

## 안전 규칙

- 자격증명은 환경변수에서만 읽고, 로그·산출물·요약에 쓰지 않는다(`src/stores.mjs#redact`).
- 요약(GitHub Step Summary)에는 **건수와 성공/실패만** 남긴다 — 금액은 쓰지 않는다.
  이 저장소는 공개 상태이고 Actions 로그·아티팩트도 공개된다.
- 포털 JSON 응답은 재고 % 계산에만 쓰고 원문을 디스크에 저장하지 않는다(토큰·세션 키 제외).
- 한 포털·한 단계가 실패해도 나머지는 계속 간다. 실패는 요약의 “실패한 단계”에 이름과 사유만 남는다.

## 알려진 한계

- 로얄선즈 재고 %가 캔버스이고 JSON 대체도 없으면 재고 단계만 실패한다(나머지는 전송됨).
- 메뉴 이름으로 화면을 찾으므로 포털이 메뉴명을 바꾸면 해당 단계가 실패한다.
  실행 후 Step Summary 의 “실패한 단계”와 “지점 경로”를 보고 `src/browser/collect.mjs` 의 라벨을 고친다.
- 포털이 자동화를 차단하면 로그인 단계에서 실패한다(그 사실이 요약에 남는다).
