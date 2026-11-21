<#
.SYNOPSIS
  Pulls Pace's commits into your local clones as they land, so you can watch
  the code change (Visual Studio reloads the files).

.DESCRIPTION
  Every few seconds, for each repo: fetch the work branch from GitHub and, if
  Pace has pushed new commits, fast-forward your local branch to them and list
  what changed. It never merges, rebases, stashes or overwrites your work: if
  you have local commits, or uncommitted edits to a file Pace changed, it says
  so and leaves that repo alone until you sort it out.

  Each repo must already be on the work branch (git switch pace).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File pace-sync.ps1 D:\GameDev\PlaygroundTopDown2D D:\GameDev\Jumble
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)] [string[]] $Repos = @('.'),
  [string] $Branch = 'pace',
  [int] $Seconds = 5
)

$watch = @()
foreach ($r in $Repos) {
  $path = (Resolve-Path $r -ErrorAction SilentlyContinue).Path
  if (-not $path -or -not (Test-Path (Join-Path $path '.git'))) { Write-Warning "$r is not a git repo; skipping."; continue }
  $name = Split-Path $path -Leaf
  $current = (git -C $path rev-parse --abbrev-ref HEAD).Trim()
  if ($current -ne $Branch) {
    Write-Warning ("$name is on '$current', not '$Branch'. To watch it: commit or stash your changes, then " +
      "run: git -C `"$path`" switch $Branch")
    continue
  }
  $watch += [pscustomobject]@{ Path = $path; Name = $name; Warned = '' }
}
if (-not $watch) { Write-Host 'Nothing to watch.'; exit 1 }

Write-Host ("Watching " + (($watch | ForEach-Object Name) -join ', ') + " on '$Branch' every $Seconds s. Ctrl+C to stop.")
while ($true) {
  foreach ($w in $watch) {
    git -C $w.Path fetch --quiet origin $Branch 2>$null
    if ($LASTEXITCODE -ne 0) { continue }            # offline, or the branch isn't on GitHub yet
    $local = (git -C $w.Path rev-parse HEAD).Trim()
    $remote = (git -C $w.Path rev-parse FETCH_HEAD).Trim()
    if ($local -eq $remote) { continue }

    git -C $w.Path merge-base --is-ancestor $local $remote
    if ($LASTEXITCODE -ne 0) {
      git -C $w.Path merge-base --is-ancestor $remote $local
      if ($LASTEXITCODE -eq 0) { continue }          # you're ahead (unpushed commits of your own); nothing new from Pace
      if ($w.Warned -ne $remote) {
        Write-Warning "$($w.Name): your local commits and Pace's have both moved on. Run 'git pull' there to combine them."
        $w.Warned = $remote
      }
      continue
    }

    $files = @(git -C $w.Path diff --name-only $local $remote)
    $subjects = @(git -C $w.Path log --reverse --format='%s' "$local..$remote")
    $out = git -C $w.Path merge --ff-only --quiet $remote 2>&1
    if ($LASTEXITCODE -ne 0) {
      if ($w.Warned -ne $remote) {
        Write-Warning ("$($w.Name): couldn't update, because you have uncommitted edits to files Pace changed. " +
          "Commit or stash them, and it will catch up.`n$out")
        $w.Warned = $remote
      }
      continue
    }
    $w.Warned = ''
    $time = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$time] $($w.Name): $($subjects.Count) new commit$(if ($subjects.Count -ne 1) { 's' })" -ForegroundColor Yellow
    $subjects | ForEach-Object { Write-Host "    $_" }
    $files | ForEach-Object { Write-Host "    ~ $_" -ForegroundColor DarkGray }
  }
  Start-Sleep -Seconds $Seconds
}
