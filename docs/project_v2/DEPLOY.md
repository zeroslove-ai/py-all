# Worker 배포 가이드

## 사전 준비

1. **Cloudflare 계정** 및 Workers/Pages 권한
2. **wrangler CLI** 설치:
   ```bash
   npm install -g wrangler
   ```
3. **로그인**:
   ```bash
   wrangler login
   ```

## 환경변수 (Secrets)

`worker/wrangler.jsonc`에는 일반 설정만 있고, **API Key는 secrets로 관리**합니다.

```bash
# Supabase Service Role Key
npx wrangler secret put SUPABASE_SECRET_KEY --cwd worker
# 입력: 현재 Supabase에서 발급한 Service Role Key

# DeepSeek API Key
npx wrangler secret put DEEPSEEK_API_KEY --cwd worker
# 입력: your-deepseek-api-key
```

> ⚠️ **주의**: `wrangler.toml`이나 코드에 API Key를 하드코딩하지 마세요.

## 배포

```bash
npm run deploy:worker
```

또는 수동:
```bash
npx wrangler deploy --cwd worker --keep-vars
```

## 배포 후 확인

```bash
# Worker 로그 실시간 확인
wrangler tail

# Worker 정보 확인
wrangler info
```

## 프론트엔드 연동

`pages/api.js`의 `API_BASE`를 Worker URL로 설정:

```javascript
const API_BASE = 'https://game-proxy-v2.your-account.workers.dev';
// 또는 같은 도메인 (Pages + Worker 라우팅)
```

### 같은 도메인 사용 시 (권장)

Cloudflare Pages에 `_worker.js` 또는 `_routes.json`을 설정하여 `/api/*` 경로를 Worker로 라우팅:

```json
// pages/_routes.json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
```

이 경우 `API_BASE = ''` (빈 문자열)로 설정하면 같은 도메인에서 호출됩니다.

## 롤백

```bash
# 이전 버전으로 롤백
wrangler rollback
```

## 문제 해결

| 문제 | 원인 | 해결 |
|---|---|---|
| `401 Unauthorized` | Supabase Key 잘못됨 | `wrangler secret put SUPABASE_SECRET_KEY` 재설정 |
| `502 Bad Gateway` | DeepSeek API 실패 | DeepSeek API Key 확인, quota 확인 |
| `429 Too Many Requests` | 속도 제한 | `checkRateLimit` 임계값 조정 또는 KV 설정 |
| CORS 에러 | 프론트/Worker 도메인 불일치 | Worker CORS 헤더 확인, Pages `_routes.json` 확인 |
