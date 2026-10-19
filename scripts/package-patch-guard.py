"""Package an independent local guard that survives replacement of Agent Flow."""
from pathlib import Path
import hashlib
import json
import zipfile


def main():
    repo = Path(__file__).resolve().parent.parent
    output = repo / 'artifacts.local/agent-flow-patch-guard.vsix'
    manifest = {
        'name': 'agent-flow-patch-guard', 'displayName': 'Agent Flow Local Patch Guard',
        'publisher': 'local-agent-flow', 'version': '0.0.1',
        'description': 'Detects when updates replace this workstation\'s Agent Flow local patch.',
        'engines': {'vscode': '^1.85.0'}, 'activationEvents': ['onStartupFinished'],
        'main': './extension.cjs', 'categories': ['Other'],
        'contributes': {'commands': [{'command': 'agentFlowPatchGuard.recovery', 'title': 'Agent Flow: Local Patch Recovery Instructions'}]},
    }
    expected = {
        'version': 'local-2026.10.19.3', 'readme': str(repo / 'README.md'),
        'vsix': str(repo / 'artifacts.local/agent-flow-codex-local.vsix'),
        'files': {name: hashlib.sha256((repo / 'extension' / name).read_bytes()).hexdigest()
                  for name in ('dist/extension.js', 'dist/webview/index.js', 'dist/webview/index.css')},
    }
    xml = '''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata>
<Identity Language="en-US" Id="agent-flow-patch-guard" Version="0.0.1" Publisher="local-agent-flow"/>
<DisplayName>Agent Flow Local Patch Guard</DisplayName><Description xml:space="preserve">Local patch overwrite detection</Description>
<Tags>agent-flow</Tags><Categories>Other</Categories><GalleryFlags>Public</GalleryFlags>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.85.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/></Properties>
</Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'''
    types = '''<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'''
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('extension.vsixmanifest', xml)
        z.writestr('[Content_Types].xml', types)
        z.writestr('extension/package.json', json.dumps(manifest))
        z.writestr('extension/expected.json', json.dumps(expected))
        z.write(repo / 'scripts/patch-guard/extension.cjs', 'extension/extension.cjs')
    print(output)


if __name__ == '__main__':
    main()
