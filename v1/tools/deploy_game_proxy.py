#!/usr/bin/env python3
"""
deploy_game_proxy.py — 게임빌더_v2 Worker 배포 스크립트

사용법:
  1. Cloudflare 로그인: wrangler login
  2. 시크릿 설정 (최초 1회):
     wrangler secret put SUPABASE_SECRET_KEY
     wrangler secret put DEEPSEEK_API_KEY
  3. 배포: python scripts/deploy_game_proxy.py
"""

import subprocess
import sys
import os

WORKER_DIR = os.path.join(os.path.dirname(__file__), '..', 'worker')

def run(cmd, cwd=None):
    """명령 실행 및 출력"""
    result = subprocess.run(cmd, shell=True, cwd=cwd or WORKER_DIR, capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print(f"❌ 오류: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result

def check_secrets():
    """필수 시크릿이 설정되어 있는지 확인"""
    print("🔍 시크릿 확인 중...")
    result = subprocess.run(
        ["wrangler", "secret", "list"],
        cwd=WORKER_DIR, capture_output=True, text=True
    )
    if result.returncode != 0:
        print("⚠️ 시크릿 목록을 확인할 수 없습니다. 수동으로 설정되어 있는지 확인하세요.")
        return False

    secrets = result.stdout
    has_supabase = "SUPABASE_SECRET_KEY" in secrets
    has_deepseek = "DEEPSEEK_API_KEY" in secrets

    if has_supabase and has_deepseek:
        print("✅ SUPABASE_SECRET_KEY, DEEPSEEK_API_KEY 설정됨")
        return True
    else:
        print("⚠️ 일부 시크릿이 누락되었습니다:")
        if not has_supabase: print("  ❌ SUPABASE_SECRET_KEY")
        if not has_deepseek: print("  ❌ DEEPSEEK_API_KEY")
        return False

def deploy():
    print("=" * 60)
    print("🚀 게임빌더_v2 Worker 배포")
    print("=" * 60)

    # 1. wrangler 버전 확인
    print("\n📋 wrangler 버전 확인")
    run("wrangler --version")

    # 2. 시크릿 확인
    secrets_ok = check_secrets()

    if not secrets_ok:
        print("\n⚠️ 시크릿을 먼저 설정해주세요:")
        print("  wrangler secret put SUPABASE_SECRET_KEY")
        print("  wrangler secret put DEEPSEEK_API_KEY")
        response = input("\n계속 진행할까요? (y/N): ")
        if response.lower() != 'y':
            print("배포 취소")
            sys.exit(0)

    # 3. Worker 배포
    print("\n📦 Worker 배포 중...")
    run("wrangler deploy")

    # 4. 배포 확인
    print("\n✅ 배포 완료!")
    print("\n🌐 Worker URL 확인:")
    run("wrangler info")

    print("\n" + "=" * 60)
    print("📋 다음 단계")
    print("=" * 60)
    print("1. Cloudflare Pages에서 프론트엔드 배포")
    print("2. Pages의 API_BASE를 Worker URL로 설정")
    print("3. 브라우저에서 ?game=GAME_ID로 접속 테스트")

if __name__ == "__main__":
    deploy()
