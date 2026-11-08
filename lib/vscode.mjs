import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeFileAtomic } from './config.mjs'
import { log, text } from './terminal.mjs'

export const EDITORS = ['code', 'cursor', 'windsurf', 'codium']

function readJson(file) {
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

function mergeJsonFile(file, update) {
  const current = readJson(file)
  if (current === undefined) {
    log.warn(
      `Could not parse ${text.path(path.relative(process.cwd(), file))}; leaving it unchanged.`,
    )
    return false
  }

  writeFileAtomic(file, `${JSON.stringify(update(current ?? {}), null, 2)}\n`)
  return true
}

export function vsixPath() {
  return fileURLToPath(
    new URL('../vscode/vorzela-ui-scss.vsix', import.meta.url),
  )
}

export function detectEditor(flags = {}, env = process.env) {
  if (flags.editor) {
    if (!EDITORS.includes(flags.editor)) {
      throw new Error(
        `Unknown editor "${flags.editor}". Use one of: ${EDITORS.join(', ')}.`,
      )
    }
    return flags.editor
  }

  const keys = Object.keys(env).map((key) => key.toUpperCase())
  const term = String(env.TERM_PROGRAM ?? '').toLowerCase()

  if (
    keys.some((key) => key.includes('WINDSURF')) ||
    term.includes('windsurf')
  ) {
    return 'windsurf'
  }
  if (keys.some((key) => key.includes('CURSOR')) || term.includes('cursor')) {
    return 'cursor'
  }
  if (keys.some((key) => key.includes('CODIUM')) || term.includes('codium')) {
    return 'codium'
  }
  if (keys.some((key) => key.includes('VSCODE')) || term.includes('vscode')) {
    return 'code'
  }

  return null
}

function installExtension(cwd, flags) {
  const vsix = vsixPath()
  if (!fs.existsSync(vsix)) {
    log.warn('The SCSS auto-import helper is missing from this CLI package.')
    return false
  }

  const editor = detectEditor(flags)
  if (!editor) return false

  const result = spawnSync(editor, ['--install-extension', vsix, '--force'], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      log.warn(
        `Could not find the ${editor} CLI. Install the helper with ${text.command(
          `${editor} --install-extension ${vsix} --force`,
        )}.`,
      )
      return false
    }
    log.warn(`Could not run ${editor}: ${result.error.message}`)
    return false
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    log.warn(
      `Could not install the SCSS helper into ${editor}${detail ? `: ${detail}` : '.'}`,
    )
    return false
  }

  log.done(`SCSS auto-import helper installed into ${editor}.`)
  return true
}

export function setupVscode(cwd, flags = {}) {
  if (flags.vscode === false) return

  const dir = path.join(cwd, '.vscode')
  const settingsFile = path.join(dir, 'settings.json')
  const extensionsFile = path.join(dir, 'extensions.json')
  const snippetsFile = path.join(dir, 'scss.code-snippets')

  mergeJsonFile(settingsFile, (settings) => ({
    ...settings,
    'files.associations': {
      '*.scss': 'scss',
      ...(settings['files.associations'] ?? {}),
    },
  }))

  mergeJsonFile(extensionsFile, (extensions) => {
    const recommendations = Array.isArray(extensions.recommendations)
      ? extensions.recommendations
      : []
    return {
      ...extensions,
      recommendations: [
        ...new Set([...recommendations, 'vorzela.vorzela-ui-scss']),
      ],
    }
  })

  mergeJsonFile(snippetsFile, (snippets) => ({
    ...snippets,
    'Vorzela UI SCSS import': {
      prefix: 'vzuse',
      body: ["@use '${1:../../styles}' as vz;"],
      description: 'Import the Vorzela UI Sass API',
    },
  }))

  log.step(`Editor settings: ${text.path('.vscode/')}`)

  if (!installExtension(cwd, flags)) {
    log.step(
      `Install the SCSS auto-import helper with ${text.command(
        `code --install-extension ${vsixPath()} --force`,
      )}.`,
    )
  }
}
