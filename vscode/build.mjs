import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const out = path.join(root, 'vorzela-ui-scss.vsix')

const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".js" ContentType="application/javascript" />
  <Default Extension=".md" ContentType="text/markdown" />
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
  <Default Extension=".xml" ContentType="text/xml" />
</Types>
`

const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}" />
    <DisplayName>${pkg.displayName}</DisplayName>
    <Description xml:space="preserve">${pkg.description}</Description>
    <Tags>${(pkg.keywords ?? []).join(',')}</Tags>
    <Categories>${(pkg.categories ?? []).join(',')}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines.vscode}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="${(pkg.extensionKind ?? ['workspace']).join(',')}" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'vorzela-vsix-'))

try {
  fs.mkdirSync(path.join(stage, 'extension'), { recursive: true })

  for (const file of ['package.json', 'extension.js', 'README.md']) {
    fs.copyFileSync(path.join(root, file), path.join(stage, 'extension', file))
  }

  fs.writeFileSync(path.join(stage, '[Content_Types].xml'), contentTypes)
  fs.writeFileSync(path.join(stage, 'extension.vsixmanifest'), manifest)
  fs.rmSync(out, { force: true })

  execFileSync('zip', ['-qr', out, '.'], { cwd: stage })
  console.log(`Built ${path.relative(process.cwd(), out)}`)
} finally {
  fs.rmSync(stage, { recursive: true, force: true })
}
