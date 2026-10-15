"""Repackage the cached Agent Flow VSIX with the verified local patch."""
import argparse
import json
import os
from pathlib import Path
import zipfile


def main():
    repo = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', type=Path, default=Path(os.environ['APPDATA']) / 'Code/CachedExtensionVSIXs/simon-p.agent-flow-0.9.2')
    parser.add_argument('--extension', type=Path, default=Path(os.environ['USERPROFILE']) / '.vscode/extensions/simon-p.agent-flow-0.9.2')
    parser.add_argument('--output', type=Path, default=repo / 'artifacts.local/agent-flow-codex-local.vsix')
    args = parser.parse_args()
    manifest = json.loads((args.extension / 'package.json').read_text(encoding='utf-8-sig'))
    if (manifest['publisher'], manifest['name'], manifest['version']) != ('simon-p', 'agent-flow', '0.9.2'):
        raise ValueError('Expected the patched simon-p.agent-flow 0.9.2 installation')
    commands = {command['command'] for command in manifest['contributes']['commands']}
    if 'agentVisualizer.showInExplorer' not in commands:
        raise ValueError('Explorer command is missing from the patch')
    manifest.pop('__metadata', None)
    replacements = {'extension/package.json': json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')}
    for relative in ('dist/extension.js', 'dist/extension.js.map', 'dist/webview/index.js', 'dist/webview/index.css'):
        installed = (args.extension / relative).read_bytes()
        if installed != (repo / 'extension' / relative).read_bytes():
            raise ValueError(f'Installed build differs: {relative}')
        replacements[f'extension/{relative}'] = installed
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.template) as original, zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED) as output:
        names = set(original.namelist())
        if not set(replacements).issubset(names):
            raise ValueError('Unexpected VSIX template structure')
        for entry in original.infolist():
            output.writestr(entry, replacements.get(entry.filename, original.read(entry.filename)))
    with zipfile.ZipFile(args.output) as check:
        if check.testzip() is not None:
            raise ValueError('VSIX archive validation failed')
    print(args.output)


if __name__ == '__main__':
    main()
