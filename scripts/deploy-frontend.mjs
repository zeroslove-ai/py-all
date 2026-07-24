import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options
  }).trim();
}

function fail(message) {
  console.error(`\n배포 중단: ${message}`);
  process.exit(1);
}

try {
  const root = run('git', ['rev-parse', '--show-toplevel']);
  if (root !== process.cwd()) fail('Git 저장소 최상단에서 실행하세요.');
  if (run('git', ['status', '--porcelain'])) {
    fail('커밋되지 않은 변경이 있습니다. 테스트 후 커밋·푸시하고 다시 실행하세요.');
  }

  run('npm', ['test']);
  run('git', ['fetch', 'origin', 'main']);

  const head = run('git', ['rev-parse', 'HEAD']);
  const remoteMain = run('git', ['rev-parse', 'origin/main']);
  if (head !== remoteMain) {
    fail('현재 HEAD가 origin/main과 다릅니다. 먼저 현재 커밋을 GitHub main에 푸시하세요.');
  }

  // pages/version.json is a deployed static asset the frontend fetches once
  // at startup to display "frontend: <sha>" next to the API's own
  // /api/version tag — regenerated here so it always reflects the exact
  // commit being deployed, never a stale value from a previous deploy.
  writeFileSync('pages/version.json', `${JSON.stringify({
    sha: head,
    built_at: new Date().toISOString()
  }, null, 2)}\n`);

  run('npx', ['--yes', 'wrangler@4.113.0', 'deploy', '--config', 'wrangler.frontend.jsonc'], { stdio: 'inherit' });

  console.log(`\n배포 완료: git:${head}`);
} catch (error) {
  if (error?.status) process.exit(error.status);
  fail(error?.message || '알 수 없는 오류');
}
