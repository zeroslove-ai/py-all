# Codex 구현 전용 인수인계 규약

기준일: 2026-08-03

이 문서는 ChatGPT가 설계·진단·검증 순서를 정하고, Codex는 사용자의 로컬 환경에서 구현·실행만 담당하도록 지시하는 표준 규약이다. 다음 인수인계와 모든 후속 작업에서 이 형식을 유지한다.

## 1. 역할 분리

### ChatGPT

- 요구사항을 구조화한다.
- 기존 코드·프롬프트·스키마·배포 상태를 먼저 확인한다.
- 수정 위치, 데이터 흐름, 상태 전이, 예외와 테스트 계약을 설계한다.
- GitHub에 필요한 생성기 파트·테스트·문서를 직접 준비한다.
- Codex가 판단을 다시 하지 않도록 실행 순서와 중단 조건을 구체적으로 작성한다.
- 실패 시 최초 오류만 분석하고 최소 범위 수정안을 만든다.

### Codex 또는 로컬 PowerShell 실행자

- 제공된 명령과 패치만 실행한다.
- 별도 설계 변경, 임의 리팩터링, 범위 확대를 하지 않는다.
- 첫 실패에서 즉시 중단한다.
- 실패 후 다음 테스트·커밋·푸시·배포를 진행하지 않는다.
- 출력에 HEAD, 최초 오류, 작업 트리 보존 상태를 포함한다.

## 2. 지시문 형식

- 모든 로컬 실행 지시는 **한 번에 복사·붙여넣기 가능한 PowerShell 블록 하나**로 제공한다.
- 여러 코드 블록으로 나눠 순서를 사용자가 조합하게 하지 않는다.
- 블록 안에 다음을 포함한다.
  1. 저장소 경로 이동
  2. `$ErrorActionPreference = "Stop"`
  3. 현재 브랜치·HEAD·원격 HEAD 검증
  4. 허용된 변경 파일 검증
  5. 단계별 함수 또는 명시적 `$LASTEXITCODE` 검사
  6. 첫 실패 즉시 `throw`와 `exit 1`
  7. 최종 작업 트리 출력
- 이미 통과한 단계를 반복할 필요가 없으면 실패 지점부터 재개하되, 런타임 코드가 바뀌었으면 관련 앞 단계도 다시 검증한다.

## 3. Git 안전 규칙

- 허용:
  - `git fetch origin`
  - `git pull --ff-only`
  - `git merge --ff-only origin/feature/csa-only`
  - 일반 `git push`
- 금지:
  - `git reset --hard`
  - force push
  - rebase
  - 임의 merge commit
  - 로컬 변경 삭제
- 원격 이력과 다르면 자동으로 우회하지 말고 즉시 중단한다.
- 로컬 변경은 항상 보존한다.
- `.wrangler/`는 미추적 상태로 두며 커밋하지 않는다.
- 커밋 전 스테이징 파일을 화이트리스트로 검증한다.
- 저장소 로컬 Git 작성자:
  - `user.name= zeroslove-ai`
  - `user.email= 302747532+zeroslove-ai@users.noreply.github.com`

## 4. 생성기 작업 규칙

- Worker 원본을 직접 대규모 편집하기보다 기존 생성기 파트 구조를 따른다.
- 생성기 파트는 `worker/build-csa-deactivation-hotfix.parts/*.part`다.
- `part-07.part`는 정렬상 마지막에 실행되는 finalizer다.
- `replaceOnce`·`replaceRegex`·`replaceBalancedStatement`의 표식은 긴 완전 문자열보다 충돌하지 않는 짧고 안정적인 표식을 선호한다.
- 일반 템플릿 리터럴 안에 생성 코드의 `'\n'` 문자열을 넣으면 이스케이프 계층에서 실제 개행으로 변환될 수 있다.
- 생성 함수의 여러 줄 반환은 다음 중 하나로 작성한다.
  - `String.raw`가 최종 출력까지 그대로 보존되는 구조
  - 배열과 `String.fromCharCode(10)`을 이용한 `lines.join(newline)`
- 생성 후 반드시 다음 순서로 확인한다.
  1. 이전 생성 파일 삭제
  2. `node worker/build-csa-deactivation-hotfix.mjs`
  3. `node --check worker/game-proxy-v2.generated.js`
- 생성 실패 시 테스트로 넘어가지 않는다.

## 5. 이번 작업에서 확인된 실패 패턴

### 표식 불일치

- 새 파트가 앞 파트의 Story 결합 순서를 바꾸면 뒤 파트의 긴 source marker가 사라질 수 있다.
- 해결: 실제 최종 생성 순서를 확인한 뒤, 결합식 끝부분의 짧고 유일한 표식으로 교체한다.

### 생성 Worker `return '` 문법 오류

- 원인은 사정 함수가 아니라 복장 함수의 일반 템플릿 리터럴 안 `\n`이었다.
- 줄 번호만 보고 최근 수정 파트로 추측하지 않는다.
- 생성 파일의 오류 줄과 대응되는 생성 파트를 먼저 특정한다.
- 현재 복장·사정 프롬프트는 배열 조립 방식으로 안전하게 변경됐다.

### 구형 테스트 계약

- 구현 규칙이 바뀌었는데 테스트가 과거 문구·과거 단일식을 기대하면 테스트를 새 계약으로 갱신한다.
- 단순히 테스트를 느슨하게 만들지 않고 현재 상태 전이와 최종 프롬프트 핵심 규칙을 각각 검증한다.

### 생성 기반 테스트 경쟁 조건

- 여러 테스트 파일이 동시에 같은 `worker/game-proxy-v2.generated.js`를 생성·삭제·읽으면 빈 파일 또는 다른 테스트의 중간 파일을 읽을 수 있다.
- 여러 생성 기반 테스트를 한 `node --test file1 file2 ...` 호출로 묶지 않는다.
- 각 테스트 파일마다 생성 파일 정리 → 생성 → 문법 검사 → 단일 테스트 실행을 직렬로 수행한다.

## 6. 테스트 원칙

- 정적·결정적 계약 테스트만 실행한다.
- 금지:
  - 실제 Story 호출
  - 실제 Extract 호출
  - 실제 Commit/Reset/Feedback/TTS 호출
  - Supabase write
  - 운영 게임 리셋
- 테스트 실패 시 최초 실패를 기준으로 중단한다.
- 테스트를 통과시키기 위해 기능 의미를 약화하거나 assertion을 무작정 제거하지 않는다.
- 최종 완료 기준:
  - 생성기 성공
  - Worker 문법 검사 성공
  - Frontend 문법 검사 성공
  - 관련 계약 전부 성공
  - `git diff --check` 성공

이번 완료 작업의 최종 검증은 16개 파일, `112/112`였다.

## 7. 권장 직렬 테스트 실행 패턴

PowerShell 지시에는 아래 의미의 함수를 둔다.

```powershell
function Run-GeneratedContract {
    param([string]$TestFile)

    node -e "const fs=require('fs'); for (const p of ['worker/.build-csa-deactivation-hotfix.generated.mjs','worker/game-proxy-v2.generated.js']) fs.rmSync(p,{force:true})"
    if ($LASTEXITCODE -ne 0) { throw "$TestFile 실행 전 생성물 정리 실패" }

    node worker/build-csa-deactivation-hotfix.mjs
    if ($LASTEXITCODE -ne 0) { throw "$TestFile 실행 전 Worker 생성 실패" }

    node --check worker/game-proxy-v2.generated.js
    if ($LASTEXITCODE -ne 0) { throw "$TestFile 실행 전 Worker 문법 검사 실패" }

    node --test $TestFile
    if ($LASTEXITCODE -ne 0) { throw "$TestFile 실패" }
}
```

실제 지시에서는 테스트 파일 배열을 순회하되 프로세스 간 병렬화를 하지 않는다.

## 8. 커밋과 푸시 규칙

- 모든 검증 통과 전 커밋하지 않는다.
- 스테이징 대상은 정확히 지정한다.
- `git diff --cached --name-only`로 허용 목록과 일치하는지 확인한다.
- `git diff --cached --check`를 통과해야 한다.
- 커밋 후 HEAD가 바뀌었는지 확인한다.
- 일반 푸시 후 `git fetch origin`과 원격 SHA 비교로 성공을 검증한다.
- 문서 전용 커밋과 운영 코드 SHA를 구분한다.

## 9. 배포 규칙

### API

- 대상: `game-proxy-v2`
- Wrangler config: `worker/wrangler.jsonc`
- main: `worker/game-proxy-v2.generated.js`
- 수동 배포 예시:

```powershell
npx --yes wrangler@4.113.0 deploy `
    --cwd worker `
    --keep-vars `
    --strict `
    --tag $finalHead.Substring(0, 12) `
    --message "git:$finalHead"
```

### Frontend

- 대상: `gamebuilder-v2`
- config: `wrangler.frontend.jsonc`
- `game-builder-v2`는 절대 배포하지 않는다.
- `pages/version.json`을 최종 SHA로 임시 생성해 배포하고 로컬 상태를 복구한다.

### 배포 중단

- API 실패 시 Frontend를 진행하지 않는다.
- Frontend 실패 시 API 완료 여부를 명시한다.
- 배포 완료를 추측하지 않고 Wrangler가 출력한 Version ID를 보고한다.
- DB 변경이나 게임 리셋은 별도 명시가 없으면 수행하지 않는다.

## 10. 완료 응답 형식

- 시작 SHA
- 최종·원격 SHA
- 커밋 메시지
- 테스트 수와 결과
- API Worker 이름과 Version ID
- Frontend Worker 이름과 Version ID
- DB 변경 여부
- 게임 리셋 여부
- 최종 작업 트리
- 오타 Worker 미배포 확인
- Frontend 변경이 있으면 응답 최하단 한 줄에 운영 URL:

`https://gamebuilder-v2.zeroslove.workers.dev/?game=9ed5b835-9948-4cad-ac25-3ebff7348574`

## 11. Codex에 전달할 핵심 문장

다음 문장을 기본 전제로 포함한다.

> 설계 판단이나 범위 확대는 하지 말고 제공된 구현·검증·배포 단계만 수행한다. 첫 실패에서 즉시 중단하며 이후 테스트·커밋·푸시·배포를 실행하지 않는다. 기존 로컬 변경과 `.wrangler/`를 보존하고, force/reset/rebase 없이 fast-forward와 일반 푸시만 사용한다. 생성 기반 테스트는 공유 생성 파일 경쟁을 막기 위해 파일별로 직렬 실행한다. DB 변경과 게임 리셋은 하지 않는다.
