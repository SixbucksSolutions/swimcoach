#Requires -Version 7
<#
.SYNOPSIS
Runs the shared localswim service's CLI as Bot, with the Bot token for this one run only.

.DESCRIPTION
swimcoach's own work is tracked as cards on the "swimcoach" board of Terry's shared localswim
service. The service runs from C:\Projects\localswim-v2 (the installed build; the source repo is
C:\Projects\localswim). Its receipt, cutover\v2-service.json, gives the base URL and the directory
holding the DPAPI-protected credentials.

This script reads the receipt, decrypts bot.xml, sets LOCALSWIM_URL and LOCALSWIM_TOKEN at Process
scope, runs localswim.exe with every argument it was given, and then clears both variables. It
never writes to the User or Machine environment and never prints the token. It MUST be used for
every localswim call an agent makes; the token MUST NOT be read any other way.

There is no param block on purpose: every argument goes to localswim.exe unchanged.

.EXAMPLE
pwsh -NoProfile -File scripts/localswim.ps1 card list 62728944-eac7-482c-bd46-4d8f206e5381
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$serviceRoot = 'C:\Projects\localswim-v2'
$exe = Join-Path $serviceRoot 'localswim.exe'
$receiptFile = Join-Path $serviceRoot 'cutover\v2-service.json'

foreach ($file in $exe, $receiptFile) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Missing $file. See docs/planning/RESUME.md for how swimcoach uses localswim."
    }
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
