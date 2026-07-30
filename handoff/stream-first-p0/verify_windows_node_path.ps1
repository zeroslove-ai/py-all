$ErrorActionPreference = 'Stop'

$ExpectedBase = '5c18e161622e4ceb27d502b48933d411004a14bd'
$ExpectedTracked = @('worker/game-proxy-v2.js')
$ExpectedUntracked = @(
  'AGENTS.md',
  'worker/AGENTS.md',
  'docs/project_v2/STREAM_FIRST_ARCHITECTURE.md',
  'docs/project_v2/HARD_GATE_ALLOWLIST.md'
)

function Resolve-NodeExe {
  $candidates = New-Object System.Collections.Generic.List[string]

  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { $candidates.Add($cmd.Source) }

  $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if ($npx -and $npx.Source) {
    $candidates.Add((Join-Path (Split-Path $npx.Source -Parent) 'node.exe'))
  }

  foreach ($path in @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\node\node.exe",
    "$env:LOCALAPPDATA\Volta\bin\node.exe",
    "$env:USERPROFILE\.volta\bin\node.exe",
    "$env:USERPROFILE\scoop\apps\nodejs\current\node.exe",
    "$env:USERPROFILE\scoop\apps\nodejs-lts\current\node.exe",
    "$env:NVM_SYMLINK\node.exe"
  )) {
    if ($path) { $candidates.Add($path) }
  }

  try {
    $registryPath = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\node.exe' -ErrorAction Stop).'(default)'
    if ($registryPath) { $candidates.Add($registryPath) }
  } catch {}

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw 'NODE_EXE_NOT_FOUND: Node.js is not installed or is unavailable from all known Windows locations.'
}

$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root

$branch = (git branch --show-current).Trim()
if ($branch -ne 'apply/stream-first-p0-20260730') {
  throw "UNEXPECTED_BRANCH: $branch"
}

$head = (git rev-parse HEAD).Trim()
if ($head -ne $ExpectedBase) {
  throw "UNEXPECTED_HEAD: $head"
}

$tracked = @(git diff --name-only | Where-Object { $_ -and $_.Trim() })
$unexpectedTracked = @($tracked | Where-Object { $_ -notin $ExpectedTracked })
if ($unexpectedTracked.Count -gt 0) {
  throw ('UNEXPECTED_TRACKED_CHANGES: ' + ($unexpectedTracked -join ', '))
}
if (@($tracked | Where-Object { $_ -eq 'worker/game-proxy-v2.js' }).Count -ne 1) {
  throw 'WORKER_PATCH_NOT_PRESENT'
}

$untracked = @(git ls-files --others --exclude-standard | Where-Object { $_ -and $_.Trim() })
$unexpectedUntracked = @($untracked | Where-Object {
  ($_ -notin $ExpectedUntracked) -and
  (-not $_.StartsWith('.wrangler/')) -and
  (-not $_.StartsWith('worker/.wrangler/'))
})
if ($unexpectedUntracked.Count -gt 0) {
  throw ('UNEXPECTED_UNTRACKED_FILES: ' + ($unexpectedUntracked -join ', '))
}
foreach ($path in $ExpectedUntracked) {
  if ($path -notin $untracked) { throw "EXPECTED_NEW_FILE_MISSING: $path" }
}

$node = Resolve-NodeExe
Write-Output "NODE_EXE=$node"

foreach ($path in @(
  'worker/game-proxy-v2.js',
  'pages/sidebar.js',
  'pages/ui.js',
  'pages/tts.js',
  'pages/stream.js'
)) {
  & $node --check $path
  if ($LASTEXITCODE -ne 0) { throw "NODE_CHECK_FAILED: $path" }
}

& git diff --check
if ($LASTEXITCODE -ne 0) { throw 'GIT_DIFF_CHECK_FAILED' }

$worker = Get-Content -LiteralPath 'worker/game-proxy-v2.js' -Raw -Encoding UTF8
foreach ($required in @(
  'stream: true',
  'new Response(deepseekRes.body',
  'const degradedAllowed = !isStructuredAppTransaction',
  'const hasPersistedSexualCompletion',
  '상식개변 앱 열기',
  '이걸로 시작'
)) {
  if (-not $worker.Contains($required)) { throw "REQUIRED_TEXT_MISSING: $required" }
}
foreach ($forbidden in @(
  'PLAYER_SETUP_CANDIDATES_INVALID',
  'STRUCTURED_RESOLUTION_UNAVAILABLE',
  'player_recommendations:',
  'const PLAYER_SETUP_CHOICES'
)) {
  if ($worker.Contains($forbidden)) { throw "FORBIDDEN_TEXT_REMAINS: $forbidden" }
}

& $node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK'))"
if ($LASTEXITCODE -ne 0) { throw 'ESM_IMPORT_FAILED' }

Write-Output 'VERIFY_OK'
