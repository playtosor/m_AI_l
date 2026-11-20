param(
    [switch]$Build,
    [switch]$InstallLocal
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$PluginDir = Join-Path $Root 'plugin'
$SkillsSrc = Join-Path $Root 'skills/messaging'
$PackageJson = Join-Path $Root 'packages/mcp/package.json'
$ZcodeSkills = Join-Path $HOME '.zcode/skills'
$SkillMappings = @(
    @{ Source = 'mailbox_read.md'; Destination = 'mailbox-read' },
    @{ Source = 'mailbox_write.md'; Destination = 'mailbox-write' },
    @{ Source = 'aro.md'; Destination = 'aro' }
)

if ($Build) {
    Write-Host '==> Building @m_ai_l/mcp (pnpm prepack)'
    Push-Location (Join-Path $Root 'packages/mcp')
    try {
        & pnpm prepack
        if ($LASTEXITCODE -ne 0) { throw "pnpm prepack failed with exit code $LASTEXITCODE" }
    }
    finally {
        Pop-Location
    }
}

$Package = Get-Content -LiteralPath $PackageJson -Raw | ConvertFrom-Json
$Version = $Package.version
$ManifestPath = Join-Path $PluginDir '.claude-plugin/plugin.json'
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$Manifest.version = $Version
$ManifestJson = (ConvertTo-Json -InputObject $Manifest -Depth 100) + "`n"
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "==> Synced plugin version -> $Version"

Write-Host '==> Syncing skills'
foreach ($Mapping in $SkillMappings) {
    $DestinationDir = Join-Path $PluginDir "skills/$($Mapping.Destination)"
    New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $SkillsSrc $Mapping.Source) -Destination (Join-Path $DestinationDir 'SKILL.md') -Force
    Write-Host "    $($Mapping.Source) -> plugin/skills/$($Mapping.Destination)/SKILL.md"
}

if ($InstallLocal) {
    Write-Host "==> Refreshing local ZCode skills in $ZcodeSkills"
    foreach ($Mapping in $SkillMappings) {
        $DestinationDir = Join-Path $ZcodeSkills $Mapping.Destination
        New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $SkillsSrc $Mapping.Source) -Destination (Join-Path $DestinationDir 'SKILL.md') -Force
        Write-Host "    $DestinationDir/SKILL.md updated"
    }
}

Write-Host '==> Done. Next steps: commit + push the repo, then update the plugin from the marketplace.'
