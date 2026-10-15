param(
    [string] $ExtensionPath = (Join-Path $env:USERPROFILE '.vscode/extensions/simon-p.agent-flow-0.9.2')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$installedPath = (Resolve-Path -LiteralPath $ExtensionPath).Path
$installedManifestPath = Join-Path $installedPath 'package.json'
$installedManifest = Get-Content -LiteralPath $installedManifestPath -Raw | ConvertFrom-Json
if ($installedManifest.publisher -ne 'simon-p' -or $installedManifest.name -ne 'agent-flow' -or $installedManifest.version -ne '0.9.2') {
    throw 'This local patch supports simon-p.agent-flow 0.9.2 only.'
}

$buildFiles = @('dist/extension.js', 'dist/extension.js.map', 'dist/webview/index.js', 'dist/webview/index.css')
foreach ($relative in $buildFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "extension/$relative"))) {
        throw "Missing build output: $relative. Build the extension and webview first."
    }
}

$backupPath = Join-Path $repoRoot ('artifacts.local/extension-backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
$allFiles = @('package.json') + $buildFiles
foreach ($relative in $allFiles) {
    $backupFile = Join-Path $backupPath $relative
    New-Item -ItemType Directory -Path (Split-Path $backupFile -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $installedPath $relative) -Destination $backupFile
}
@{ extensionPath = $installedPath; files = $allFiles } | ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath (Join-Path $backupPath 'backup.json') -Encoding utf8
@'
$ErrorActionPreference = 'Stop'
$backup = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'backup.json') -Raw | ConvertFrom-Json
foreach ($relative in $backup.files) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $relative) -Destination (Join-Path $backup.extensionPath $relative) -Force
}
Write-Output 'Original extension restored. Run Developer: Reload Window in VS Code.'
'@ | Set-Content -LiteralPath (Join-Path $backupPath 'restore.ps1') -Encoding utf8

try {
    foreach ($relative in $buildFiles) {
        $source = Join-Path $repoRoot "extension/$relative"
        $target = Join-Path $installedPath $relative
        Copy-Item -LiteralPath $source -Destination $target -Force
        if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) {
            throw "Installed file verification failed: $relative"
        }
    }
    $sourceManifest = Get-Content -LiteralPath (Join-Path $repoRoot 'extension/package.json') -Raw | ConvertFrom-Json
    foreach ($setting in $sourceManifest.contributes.configuration.properties.PSObject.Properties.Name) {
        $definition = $sourceManifest.contributes.configuration.properties.$setting
        $installedManifest.contributes.configuration.properties | Add-Member -NotePropertyName $setting -NotePropertyValue $definition -Force
    }
    foreach ($command in $sourceManifest.contributes.commands) {
        $installedManifest.contributes.commands = @($installedManifest.contributes.commands | Where-Object { $_.command -ne $command.command }) + @($command)
    }
    foreach ($section in @('views', 'menus')) {
        if (-not $installedManifest.contributes.$section) {
            $installedManifest.contributes | Add-Member -NotePropertyName $section -NotePropertyValue ([pscustomobject]@{})
        }
        foreach ($property in $sourceManifest.contributes.$section.PSObject.Properties) {
            $existing = @($installedManifest.contributes.$section.($property.Name) | Where-Object { $_ })
            $newEntries = @($property.Value)
            foreach ($entry in $newEntries) {
                $existing = @($existing | Where-Object {
                    if ($section -eq 'views') { $_.id -ne $entry.id }
                    else { $_.command -ne $entry.command -or $_.when -ne $entry.when }
                })
            }
            $installedManifest.contributes.$section | Add-Member -NotePropertyName $property.Name -NotePropertyValue @($existing + $newEntries) -Force
        }
    }
    $installedManifest.activationEvents = @(@($installedManifest.activationEvents) + @('onView:agentVisualizer.explorer') | Select-Object -Unique)
    $installedManifest | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $installedManifestPath -Encoding utf8
} catch {
    & (Join-Path $backupPath 'restore.ps1')
    throw
}
Write-Output "Patched: $installedPath"
Write-Output "Backup and rollback script: $backupPath"
Write-Output 'Run Developer: Reload Window in VS Code to load the patch. Marketplace updates may replace it.'
Write-Output 'When commands or Explorer views change, register the patch through a VSIX: python scripts/package-local-codex-fix.py, then code --install-extension artifacts.local/agent-flow-codex-local.vsix --force. Reload after installation.'
