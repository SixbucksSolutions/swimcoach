#Requires -Version 7
<#
.SYNOPSIS
Runs the shared localswim service's CLI as Bot, with the Bot token for this one run only.

.DESCRIPTION
swimcoach's own work is tracked as cards on the "swimcoach" board of Terry's shared localswim
service. The service runs from C:\Projects\localswim, its code; its data is in the localswim state
store (Terry, 2026-11-15, after C:\Projects\localswim-v2 was retired). Its receipt, service.json,
gives the base URL and the directory holding the DPAPI-protected credentials. The receipt lives in
%LOCALAPPDATA%\localswim-v2, moved there on 2026-11-15 out of the localswim repo's runtime folder,
where a git clean could delete it; the script tries that first and the old runtime copy second.

This script reads the receipt, decrypts bot.xml, sets LOCALSWIM_URL and LOCALSWIM_TOKEN at Process
scope, runs localswim.exe with every argument it was given, and then clears both variables. It
never writes to the User or Machine environment and never prints the token. It MUST be used for
every localswim call an agent makes on Windows, and the token MUST NOT be read any other way there.
On agentspace (Linux), scripts/localswim.sh is the path instead (card #0054).

There is no param block on purpose: every argument goes to localswim.exe unchanged.

.EXAMPLE
pwsh -NoProfile -File scripts/localswim.ps1 card list 62728944-eac7-482c-bd46-4d8f206e5381
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$serviceRoot = 'C:\Projects\localswim'
$exe = Join-Path $serviceRoot 'localswim.exe'
if (-not (Test-Path -LiteralPath $exe)) {
    throw "Missing $exe. See docs/planning/RESUME.md for how swimcoach uses localswim."
}

# Newest home first; the first receipt that exists wins (card #0053).
$receiptCandidates = @()
if ($env:LOCALAPPDATA) {
    $receiptCandidates += Join-Path $env:LOCALAPPDATA 'localswim-v2\service.json'
}
$receiptCandidates += Join-Path $serviceRoot 'runtime\service.json'
$receiptFile = $receiptCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($null -eq $receiptFile) {
    throw "Missing the localswim service receipt; tried $($receiptCandidates -join ', '). See docs/planning/RESUME.md."
}

$receipt = [IO.File]::ReadAllText($receiptFile) | ConvertFrom-Json
$botFile = Join-Path $receipt.credential_directory 'bot.xml'
if (-not (Test-Path -LiteralPath $botFile)) {
    throw "Missing $botFile. The service receipt names a credential directory without bot.xml."
}

$exitCode = 1
try {
    [Environment]::SetEnvironmentVariable('LOCALSWIM_URL', $receipt.base, 'Process')
    [Environment]::SetEnvironmentVariable(
        'LOCALSWIM_TOKEN', (Import-Clixml -LiteralPath $botFile).GetNetworkCredential().Password, 'Process')
    & $exe @args
    $exitCode = $LASTEXITCODE
}
finally {
    [Environment]::SetEnvironmentVariable('LOCALSWIM_TOKEN', $null, 'Process')
    [Environment]::SetEnvironmentVariable('LOCALSWIM_URL', $null, 'Process')
}
exit $exitCode
