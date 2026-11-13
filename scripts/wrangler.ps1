#Requires -Version 7
<#
.SYNOPSIS
Runs Wrangler with swimcoach's Cloudflare credentials, for this one run only.

.DESCRIPTION
Terry does not keep Cloudflare credentials in environment variables. They live in files under
%USERPROFILE%\.secrets\swimcoach, readable only by his account:

    cloudflare-api-token-local.txt   The local account API token (cfat_ prefix)
    cloudflare-account-id.txt        The Cloudflare account ID

This script reads both files, sets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID at Process
scope, runs "npx wrangler" with every argument it was given, and then clears both variables. It
never writes to the User or Machine environment and never prints the token.

CI does not use this script. GitHub Actions reads the CI token from the CLOUDFLARE_API_TOKEN
repository secret.

There is no param block on purpose: every argument goes to Wrangler unchanged. A param block would
let PowerShell claim short Wrangler flags such as -e and -c as its own common parameters.

.EXAMPLE
pwsh -NoProfile -File scripts/wrangler.ps1 whoami

.EXAMPLE
pwsh -NoProfile -File scripts/wrangler.ps1 deploy
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$secretDir = Join-Path $env:USERPROFILE '.secrets\swimcoach'
$tokenFile = Join-Path $secretDir 'cloudflare-api-token-local.txt'
$accountFile = Join-Path $secretDir 'cloudflare-account-id.txt'

foreach ($file in $tokenFile, $accountFile) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Missing $file. See docs/planning/RESUME.md for how it is made."
    }
}

$exitCode = 1
try {
    [Environment]::SetEnvironmentVariable(
        'CLOUDFLARE_API_TOKEN', (Get-Content -LiteralPath $tokenFile -Raw).Trim(), 'Process')
    [Environment]::SetEnvironmentVariable(
        'CLOUDFLARE_ACCOUNT_ID', (Get-Content -LiteralPath $accountFile -Raw).Trim(), 'Process')
    & npx wrangler @args
    $exitCode = $LASTEXITCODE
}
finally {
    [Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN', $null, 'Process')
    [Environment]::SetEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', $null, 'Process')
}
exit $exitCode
