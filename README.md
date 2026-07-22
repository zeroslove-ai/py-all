# 게임빌더 v2

현재 운영 중인 게임빌더 v2의 프론트엔드, Cloudflare Worker, Supabase 마이그레이션을 관리하는 저장소입니다.

## 현재 작업 영역

| 경로 | 용도 |
| --- | --- |
| `pages/` | 공개 게임 프론트엔드 |
| `worker/game-proxy-v2.js` | 운영 Cloudflare Worker |
| `worker/wrangler.jsonc` | Worker 배포 설정 |
| `supabase/migrations/` | v2 DB 마이그레이션 |
| `scripts/deploy-worker.mjs` | 테스트·GitHub main 검증 후 Worker 배포 |
| `test/` | Worker 자동 테스트 |
| `docs/project_v2/` | v2 공식 설계·API·배포 문서 |

## 개발 및 배포

```bash
npm test
npm run deploy:worker
```

`deploy:worker`는 테스트 통과, 작업 트리 청결, `origin/main`과 현재 커밋 일치를 확인한 뒤 `game-proxy-v2` Worker를 배포합니다.

## 이전 버전 보관

v1 Dify 워크플로우, TTS Worker, 과거 인수인계 문서와 외부 AI 작업 자료는 [`v1/`](v1/README.md)에 보관합니다. 운영 v2 작업에는 사용하지 않습니다.
