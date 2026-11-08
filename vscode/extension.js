const fs = require('node:fs')
const path = require('node:path')
const vscode = require('vscode')

function activate(context) {
  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(async (event) => {
      for (const uri of event.files) {
        if (
          uri.scheme !== 'file' ||
          !uri.fsPath.toLowerCase().endsWith('.scss')
        ) {
          continue
        }

        try {
          await addUseDirective(uri)
        } catch (error) {
          vscode.window.showErrorMessage(
            `Vorzela UI: could not add the SCSS import to ${path.basename(
              uri.fsPath,
            )}: ${error.message}`,
          )
        }
      }
    }),
  )
}

async function addUseDirective(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri)
  if (!folder) return

  const root = folder.uri.fsPath
  const configFile = path.join(root, 'vorzela.json')
  if (!fs.existsSync(configFile)) return

  let config
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  } catch {
    return
  }

  const stylesPath = config?.paths?.styles
  if (typeof stylesPath !== 'string' || !stylesPath) return

  const stylesDir = path.resolve(root, stylesPath)
  const file = uri.fsPath

  if (!fs.existsSync(stylesDir)) return
  if (file === stylesDir || file.startsWith(`${stylesDir}${path.sep}`)) return

  const document = await vscode.workspace.openTextDocument(uri)
  if (document.getText().trim() !== '') return

  let relative = path
    .relative(path.dirname(file), stylesDir)
    .replaceAll(path.sep, '/')
  if (!relative.startsWith('.')) relative = `./${relative}`

  const edit = new vscode.WorkspaceEdit()
  edit.insert(uri, new vscode.Position(0, 0), `@use '${relative}' as vz;\n\n`)

  if (await vscode.workspace.applyEdit(edit)) {
    await document.save()
  }
}

function deactivate() {}

module.exports = { activate, deactivate }
