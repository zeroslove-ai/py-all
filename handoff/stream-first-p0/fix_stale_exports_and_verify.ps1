$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ExpectedBranch = 'apply/stream-first-p0-20260730'
$ExpectedHead = '5c18e161622e4ceb27d502b48933d411004a14bd'
$WorkerPath = 'worker/game-proxy-v2.js'
$AllowedStatus = @(
  ' M worker/game-proxy-v2.js',
  '?? .wrangler/',
  '?? AGENTS.md',
  '?? docs/project_v2/HARD_GATE_ALLOWLIST.md',
  '?? docs/project_v2/STREAM_FIRST_ARCHITECTURE.md',
  '?? worker/.wrangler/',
  '?? worker/AGENTS.md'
)

$Root = (git rev-parse --show-toplevel).Trim()
Set-Location $Root

$Branch = (git branch --show-current).Trim()
$Head = (git rev-parse HEAD).Trim()
if ($Branch -ne $ExpectedBranch) { throw "UNEXPECTED_BRANCH: $Branch" }
if ($Head -ne $ExpectedHead) { throw "UNEXPECTED_HEAD: $Head" }

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'STAGED_CHANGES_PRESENT' }

$StatusLines = @(git status --short | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ })
$Unexpected = @($StatusLines | Where-Object { $_ -notin $AllowedStatus })
if ($Unexpected.Count -gt 0) {
  throw ('UNEXPECTED_WORKTREE_ENTRY: ' + ($Unexpected -join ' | '))
}
foreach ($Required in @(
  ' M worker/game-proxy-v2.js',
  '?? AGENTS.md',
  '?? docs/project_v2/HARD_GATE_ALLOWLIST.md',
  '?? docs/project_v2/STREAM_FIRST_ARCHITECTURE.md',
  '?? worker/AGENTS.md'
)) {
  if ($Required -notin $StatusLines) { throw "EXPECTED_PATCH_ENTRY_MISSING: $Required" }
}

$Worker = [System.IO.File]::ReadAllText((Join-Path $Root $WorkerPath))
if ($Worker.Contains('function hasPotentialUnrecordedFirstEncounter(')) {
  throw 'UNEXPECTED_HELPER_DEFINITION_REMAINS: hasPotentialUnrecordedFirstEncounter'
}
if ($Worker.Contains('function canUseDegradedExtract(')) {
  throw 'UNEXPECTED_HELPER_DEFINITION_REMAINS: canUseDegradedExtract'
}

$Patterns = @(
  '(?m)^  hasPotentialUnrecordedFirstEncounter,\r?\n',
  '(?m)^  canUseDegradedExtract,\r?\n'
)
foreach ($Pattern in $Patterns) {
  $Count = [regex]::Matches($Worker, $Pattern).Count
  if ($Count -ne 1) { throw "STALE_EXPORT_COUNT_MISMATCH: pattern=$Pattern count=$Count" }
  $Worker = [regex]::Replace($Worker, $Pattern, '', 1)
}

[System.IO.File]::WriteAllText(
  (Join-Path $Root $WorkerPath),
  $Worker,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output 'STALE_EXPORT_FIX_APPLIED'

$NodeCandidates = @()
$NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($NodeCommand) { $NodeCandidates += $NodeCommand.Source }
$NodeCandidates += @(
  'C:\Program Files\nodejs\node.exe',
  'C:\Program Files (x86)\nodejs\node.exe',
  (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
)
$Node = $NodeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $Node) { throw 'NODE_EXE_NOT_FOUND' }
Write-Output "NODE_EXE=$Node"

foreach ($Path in @(
  'worker/game-proxy-v2.js',
  'pages/sidebar.js',
  'pages/ui.js',
  'pages/tts.js',
  'pages/stream.js'
)) {
  & $Node --check $Path
  if ($LASTEXITCODE -ne 0) { throw "NODE_CHECK_FAILED: $Path" }
}

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'GIT_DIFF_CHECK_FAILED' }

$Worker = [System.IO.File]::ReadAllText((Join-Path $Root $WorkerPath))
foreach ($Forbidden in @(
  'PLAYER_SETUP_CANDIDATES_INVALID',
  'STRUCTURED_RESOLUTION_UNAVAILABLE',
  'player_recommendations:',
  'const PLAYER_SETUP_CHOICES',
  'hasPotentialUnrecordedFirstEncounter,',
  'canUseDegradedExtract,'
)) {
  if ($Worker.Contains($Forbidden)) { throw "FORBIDDEN_TEXT_REMAINS: $Forbidden" }
}
foreach ($Required in @(
  'stream: true',
  'new Response(deepseekRes.body',
  'const degradedAllowed = !isStructuredAppTransaction',
  'const hasPersistedSexualCompletion',
  '상식개변 앱 열기',
  '이걸로 시작'
)) {
  if (-not $Worker.Contains($Required)) { throw "REQUIRED_TEXT_MISSING: $Required" }
}

& $Node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
if ($LASTEXITCODE -ne 0) { throw 'ESM_IMPORT_FAILED' }

$FinalStatus = @(git status --short | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ })
$UnexpectedFinal = @($FinalStatus | Where-Object { $_ -notin $AllowedStatus })
if ($UnexpectedFinal.Count -gt 0) {
  throw ('UNEXPECTED_FINAL_WORKTREE_ENTRY: ' + ($UnexpectedFinal -join ' | '))
}

Write-Output 'VERIFY_OK'
