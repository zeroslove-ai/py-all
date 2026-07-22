#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
게임빌더 TTS Worker 배포 스크립트 (표준라이브러리만 사용 — 별도 설치 불필요)

사용:
  export CF_TOKEN='cfut_...'        # Workers Scripts:Edit 권한 토큰
  python3 deploy_worker.py                    # worker/bundle.js를 배포
  python3 deploy_worker.py --src worker/worker.js   # 소스 파일 직접 배포(단, aws4fetch import가 없는 단일파일만 가능)

주의(이 스크립트가 자동 처리하는 함정):
  1) PUT 업로드는 metadata.bindings를 빼먹으면 기존 R2 바인딩(tts)이 삭제되고,
     시크릿을 이름만 넣으면 10021 오류로 거부됨
     → 2단계로 처리: ①PUT은 코드만 업로드 ②PATCH /settings로 바인딩 복구
  2) PATCH /settings에서는 시크릿을 값 없이 이름만 넣으면 기존 값이 유지됨
  3) 모듈 파일명은 반드시 'worker.js'로 올려야 함 (metadata.main_module과 일치)
"""
import argparse, json, os, sys, urllib.request, uuid, datetime

ACCOUNT_ID = "98efff3e9faacb9e57a14177682143a8"
WORKER_NAME = "fancy-dust-7f8c"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}"

# 기존 배포와 동일한 바인딩 구성 (R2 버킷 + 시크릿 3개)
BINDINGS = [
    {"name": "tts", "type": "r2_bucket", "bucket_name": "tts"},
    {"name": "FISH_API_KEY", "type": "secret_text"},
    {"name": "R2_ACCESS_KEY_ID", "type": "secret_text"},
    {"name": "R2_SECRET_ACCESS_KEY", "type": "secret_text"},
]

def cf(method, url, token, body=None, headers=None):
    req = urllib.request.Request(url, method=method, data=body,
                                 headers={"Authorization": f"Bearer {token}", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def deploy(token, script_path):
    code = open(script_path, "rb").read()
    # 1단계: 코드만 업로드 (bindings 미포함 — 포함하면 시크릿 text를 요구함)
    # Cloudflare가 '미래 날짜'를 거부하는 경우 대비해 하루 전으로 설정
    compat = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    meta = {
        "main_module": "worker.js",
        "compatibility_date": compat,
    }
    boundary = "----gb" + uuid.uuid4().hex
    # multipart 수동 조립
    buf = b""
    buf += f"--{boundary}\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n".encode()
    buf += json.dumps(meta).encode() + b"\r\n"
    buf += f"--{boundary}\r\nContent-Disposition: form-data; name=\"worker.js\"; filename=\"worker.js\"\r\nContent-Type: application/javascript+module\r\n\r\n".encode()
    buf += code + b"\r\n"
    buf += f"--{boundary}--\r\n".encode()

    status, resp = cf("PUT", API, token, buf, {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    out = json.loads(resp)
    print(f"[deploy] 1단계(코드 업로드) HTTP {status} success={out.get('success')}")
    if not out.get("success"):
        print(json.dumps(out.get("errors"), ensure_ascii=False, indent=2))
        sys.exit(1)

    # 2단계: PATCH /settings로 바인딩 복구 (시크릿은 이름만 → 기존 값 유지, R2 바인딩 재연결)
    boundary2 = "----gb" + uuid.uuid4().hex
    settings = {"bindings": BINDINGS}
    buf2 = f"--{boundary2}\r\nContent-Disposition: form-data; name=\"settings\"\r\nContent-Type: application/json\r\n\r\n".encode()
    buf2 += json.dumps(settings).encode() + f"\r\n--{boundary2}--\r\n".encode()
    status2, resp2 = cf("PATCH", API + "/settings", token, buf2,
                        {"Content-Type": f"multipart/form-data; boundary={boundary2}"})
    out2 = json.loads(resp2)
    print(f"[deploy] 2단계(바인딩 복구) HTTP {status2} success={out2.get('success')}")
    if not out2.get("success"):
        print(json.dumps(out2.get("errors"), ensure_ascii=False, indent=2))
        sys.exit(1)
    print(f"[deploy] 배포 완료: {WORKER_NAME}")

def verify(token):
    status, resp = cf("GET", API + "/settings", token)
    out = json.loads(resp)
    if not out.get("success"):
        print(f"[verify] 설정 조회 실패: {out.get('errors')}")
        return
    bindings = out["result"].get("bindings", [])
    print(f"[verify] 현재 바인딩 {len(bindings)}개:")
    for b in bindings:
        extra = b.get("bucket_name", "")
        print(f"  - {b.get('type')}: {b.get('name')} {extra}")
    names = {b.get("name") for b in bindings}
    assert "tts" in names, "⚠️ R2 바인딩(tts)이 없습니다! 배포가 bindings 없이 됐을 가능성"
    print("[verify] R2 바인딩(tts) 확인 OK")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(os.path.dirname(__file__), "..", "worker", "bundle.js"))
    args = ap.parse_args()
    token = os.environ.get("CF_TOKEN")
    if not token:
        sys.exit("CF_TOKEN 환경변수를 설정하세요 (Workers Scripts:Edit 권한 토큰)")
    deploy(token, args.src)
    verify(token)
    print("\n다음 확인: Dify에서 /음성 실행 → game_save의 debug_tts_worker_raw에 ok:true + r2.cloudflarestorage.com URL이 찍히면 성공")
