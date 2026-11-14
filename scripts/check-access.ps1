#Requires -Version 7.0
<#
.SYNOPSIS
Proves that Cloudflare Access guards swimcoach, using the service token in cli.json.

.DESCRIPTION
Runs three checks against GET /healthz on the URL named in the CLI config file:
  (a) A request with no credentials is refused or sent to the Access login host.
  (b) A request with the real service token is admitted (HTTP 200).
  (c) A request with the real client ID and a wrong secret is refused.
The script never follows a redirect, never prints the client secret, and sends the token only
to the url in the same config file. It exits 0 when every check passes, 1 when a check fails,
and 2 when the config file is unusable. A network failure (unknown host, refused connection, TLS
error) prints "Fail (check): could not reach host: message" for that check, and the other checks
still run. The script turns script tracing off first (Set-PSDebug -Off) and prints one line saying
so, because "Set-PSDebug -Trace 2" would print the secret's variable assignment. See docs/runbooks/access-setup.md.

.PARAMETER ConfigPath
The CLI config file. Defaults to %USERPROFILE%\.secrets\swimcoach\cli.json (contract/cli.md section 5).
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path -Path $env:USERPROFILE -ChildPath '.secrets\swimcoach\cli.json')
)

# Tracing prints every variable assignment, including the client secret, so it goes off before the
# config is read. The line below tells Terry that the script did this.
Set-PSDebug -Off
Write-Output 'Script tracing (Set-PSDebug) is off for this run, so the secret is never traced.'

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Read-CliConfig {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Config file not found: $Path"
    }
    try {
        $config = Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json -ErrorAction Stop
    } catch {
        throw "Config file is not valid JSON: $Path"
    }
    foreach ($key in 'url', 'access_client_id', 'access_client_secret') {
        $value = $config.PSObject.Properties[$key]
        if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value.Value)) {
            throw "Config file has no value for '$key'."
        }
    }
    if (([string]$config.url) -notmatch '^https://') {
        throw "Config 'url' must start with https:// so the token never travels in clear text."
    }
    return $config
}

function Invoke-Probe {
    param(
        [string]$Uri,
        [hashtable]$Headers = @{}
    )

    # The debug stream of Invoke-WebRequest prints every request header, including the client secret.
    # These two preferences are local to this function, so they also beat -Debug on the script and
    # a profile that sets $DebugPreference = 'Continue'.
    $DebugPreference = 'SilentlyContinue'
    $VerbosePreference = 'SilentlyContinue'

    # Never follow a redirect: a redirect to the Access login host is itself the answer. With
    # -MaximumRedirection 0, PowerShell 7 still returns the 302 but also writes a non-terminating
    # "maximum redirection count exceeded" error, so -ErrorAction SilentlyContinue silences that one.
    # A transport failure (unknown host, refused connection, TLS error, timeout) is a terminating
    # error that -ErrorAction does not silence, so the try/catch turns it into Status 0.
    $hostName = ([uri]$Uri).Host
    try {
        $response = Invoke-WebRequest -Uri $Uri -Method Get -Headers $Headers -MaximumRedirection 0 `
            -SkipHttpErrorCheck -TimeoutSec 30 -ErrorAction SilentlyContinue -Debug:$false -Verbose:$false
    } catch {
        return [pscustomobject]@{
            Status = 0; Location = ''; Body = ''; HostName = $hostName; Problem = $_.Exception.Message
        }
    }
    if ($null -eq $response) {
        return [pscustomobject]@{
            Status = 0; Location = ''; Body = ''; HostName = $hostName; Problem = 'no response'
        }
    }
    $location = ''
    if ($response.Headers.ContainsKey('Location')) {
        $location = [string]($response.Headers['Location'] | Select-Object -First 1)
    }
    return [pscustomobject]@{
        Status   = [int]$response.StatusCode
        Location = $location
        Body     = [string]$response.Content
        HostName = $hostName
        Problem  = ''
    }
}

function Get-RefusalVerdict {
    # Returns $null when the response is an Access refusal, otherwise the reason it is not.
    param([pscustomobject]$Probe)

    if ($Probe.Status -eq 0) {
        return "could not reach $($Probe.HostName): $($Probe.Problem)"
    }
    if ($Probe.Status -in 301, 302, 303, 307, 308) {
        $target = $null
        if ([uri]::TryCreate($Probe.Location, [UriKind]::Absolute, [ref]$target) -and
            $target.Host.EndsWith('.cloudflareaccess.com', [StringComparison]::OrdinalIgnoreCase)) {
            return $null
        }
        return "Redirected (HTTP $($Probe.Status)), but not to a cloudflareaccess.com host."
    }
    if ($Probe.Status -in 401, 403) {
        if ($Probe.Body -match 'unauthenticated') {
            return "The Worker answered HTTP $($Probe.Status) itself, so Access is NOT in front of it."
        }
        return $null
    }
    return "Admitted or answered (HTTP $($Probe.Status)); Access did not refuse it."
}

try {
    $config = Read-CliConfig -Path $ConfigPath
} catch {
    Write-Output "Config problem: $($_.Exception.Message)"
    exit 2
}

$baseUrl = ([string]$config.url).TrimEnd('/')
$healthUrl = "$baseUrl/healthz"
$clientId = [string]$config.access_client_id
$secret = [string]$config.access_client_secret
$failed = 0

Write-Output "Checking Access in front of $healthUrl"

# Check (a): no credentials.
$probe = Invoke-Probe -Uri $healthUrl
$verdict = Get-RefusalVerdict -Probe $probe
if ($null -eq $verdict) {
    Write-Output "Pass  (a) No credentials: refused (HTTP $($probe.Status))."
} else {
    Write-Output "Fail  (a) No credentials: $verdict"
    $failed++
}

# Check (b): the real service token.
$probe = Invoke-Probe -Uri $healthUrl -Headers @{
    'CF-Access-Client-Id'     = $clientId
    'CF-Access-Client-Secret' = $secret
}
if ($probe.Status -eq 200) {
    Write-Output 'Pass  (b) Service token: admitted (HTTP 200).'
} else {
    if ($probe.Status -eq 0) {
        Write-Output "Fail  (b) Service token: could not reach $($probe.HostName): $($probe.Problem)"
    } else {
        Write-Output "Fail  (b) Service token: expected HTTP 200, got HTTP $($probe.Status). Check the Service Auth policy and the token."
    }
    $failed++
}

# Check (c): the real client ID with a wrong secret.
$wrongSecret = (New-Guid).ToString('N') + (New-Guid).ToString('N')
$probe = Invoke-Probe -Uri $healthUrl -Headers @{
    'CF-Access-Client-Id'     = $clientId
    'CF-Access-Client-Secret' = $wrongSecret
}
$verdict = Get-RefusalVerdict -Probe $probe
if ($null -eq $verdict) {
    Write-Output "Pass  (c) Wrong secret: refused (HTTP $($probe.Status))."
} else {
    Write-Output "Fail  (c) Wrong secret: $verdict"
    $failed++
}

if ($failed -eq 0) {
    Write-Output 'All 3 checks passed.'
    exit 0
}
Write-Output "$failed of 3 checks failed."
exit 1
