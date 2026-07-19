# 게임빌더_v1 — TTS Worker 저장소

Dify + Supabase + Cloudflare 기반 텍스트 게임의 TTS 인프라 코드입니다.
전체 맥락은 `docs/게임빌더_프로젝트_인수인계.md` 참조.

## 구조

```
worker/worker.js      # Worker 소스 (aws4fetch import — 대시보드 에디터용)
worker/bundle.js      # esbuild로 인라인 번들된 배포본 (API 배포용)
scripts/deploy_worker.py  # 배포 스크립트 (python3 표준라이브러리만 필요)
docs/                 # 프로젝트 인수인계 문서
```

## 배포 (가장 쉬운 방법)

```bash
export CF_TOKEN='cfut_...'   # Workers Scripts:Edit 권한 토큰 (인수인계 문서 1-1절 참조)
python3 scripts/deploy_worker.py
```

끝. 업로드 + 바인딩 검증까지 자동으로 합니다.

## 소스를 수정했을 때

- **Cloudflare 대시보드 에디터에 붙여넣기로 배포한다면**: `worker/worker.js` 그대로 붙여넣고 Deploy (대시보드는 npm import를 자동 번들링)
- **API로 배포한다면**: import를 인라인해야 하므로 다시 번들링:
  ```bash
  npm i aws4fetch esbuild
  npx esbuild worker/worker.js --bundle --format=esm --outfile worker/bundle.js
  python3 scripts/deploy_worker.py
  ```

## 함정 3가지 (deploy_worker.py가 자동 처리)

1. PUT 업로드는 bindings 없이 본문만 볼냄 — bindings를 포함하면 시크릿에 값을 요구(10021)하고, 빼먹으면 기존 R2 바인딩이 삭제됨 → 스크립트는 ①코드만 PUT ②PATCH /settings로 바인딩 복구 2단계 처리
2. 시크릿 3개는 **PATCH /settings에서만** 값 없이 이름만으로 기존 값 유지 가능
3. 업로드 파일명은 반드시 `worker.js`, compatibility_date는 오늘(UTC 기준 미래)로 잡으면 거부될 수 있어 하루 전으로 설정

## 배포 후 확인

Dify에서 `/음성` 실행 → Supabase `game_save`의 `debug_tts_worker_raw`에
`ok:true` + `r2.cloudflarestorage.com` 서명 URL이 찍히면 성공.
