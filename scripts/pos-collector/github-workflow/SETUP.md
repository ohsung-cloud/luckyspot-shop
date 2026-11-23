# 워크플로우 설치 (한 번만)

`.github/workflows/daily-pos-collect.yml` 은 Pickle 의 GitHub 연결 권한에 **Workflows 쓰기**가 없어
자동 푸시가 거부되었다(`refusing to allow a GitHub App to create or update workflow ... without workflows permission`).
아래 두 방법 중 하나로 넣으면 매일 08:30 KST 자동 수집이 시작된다.

## 방법 A — 권한을 한 번 허용하고 다시 푸시 (권장)

1. https://github.com/apps/pickle/installations/new 에서 `ohsung-cloud/luckyspot-shop` 설치/권한 갱신
   → **Workflows: Read and write** 를 허용
2. Pickle 에 “워크플로우 다시 푸시해줘” 라고 하면, 이 폴더의 파일을 `.github/workflows/` 로 복사해 커밋한다.

## 방법 B — GitHub 웹에서 직접 만들기

1. https://github.com/ohsung-cloud/luckyspot-shop/new/main/.github/workflows → 파일 이름 `daily-pos-collect.yml`
2. 이 폴더의 `daily-pos-collect.yml` 내용을 그대로 붙여넣고 Commit

## 방법 C — 로컬 git (본인 계정 토큰)

```bash
cd luckyspot-shop            # 저장소 루트
mkdir -p .github/workflows
cp scripts/pos-collector/github-workflow/daily-pos-collect.yml .github/workflows/
git add .github/workflows/daily-pos-collect.yml
git commit -m "매일 POS 자동 수집 워크플로우"
git push
```

## 넣은 뒤 확인

- Actions 탭에 “매일 POS 자동 수집 (로얄선즈 · 에스칼프린트)” 이 보인다.
- Secrets 8개(+선택 `INGEST_API_SECRET`)를 등록한다 → `README.md` 의 표 참고.
- `Run workflow` 로 한 번 수동 실행해 Step Summary 의 “지점별 결과 / 실패한 단계”를 확인한다.
- cron 은 UTC 기준이라 `30 23 * * *` = 매일 08:30 KST 다. GitHub 의 예약 실행은 혼잡하면 수 분 늦을 수 있다.
