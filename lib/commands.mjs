import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  DEFAULT_CONFIG,
  readConfig,
  targetFor,
  rewriteImports,
  rewriteScss,
  writeConfig,
} from './config.mjs'
import { installDependencies } from './install.mjs'
import {
  hash,
  readManifest,
  readSnapshot,
  snapshotPath,
  writeManifest,
  writeSnapshot,
} from './manifest.mjs'
import { choose } from './prompts.mjs'
import { loadIndex, loadItem, resolveDependencies } from './registry.mjs'

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const log = {
  info: (message) => console.log(`${c.blue}◇${c.reset} ${message}`),
  done: (message) => console.log(`${c.green}✔${c.reset} ${message}`),
  warn: (message) => console.log(`${c.yellow}▲${c.reset} ${message}`),
  error: (message) => console.log(`${c.red}✖${c.reset} ${message}`),
  step: (message) => console.log(`${c.dim}·${c.reset} ${message}`),
}

function ensureConfig(cwd, flags) {
  const config = readConfig(cwd)
  if (config) {
    if (flags.registry) config.registry = flags.registry
    return config
  }
  log.warn('No vorzela.json found. Run `vorzela-ui init` first.')
  process.exitCode = 1
  return null
}

function transformed(item, file, config, cwd) {
  let content = file.content
  const target = targetFor(config, file.path)
  if (target.endsWith('.scss')) {
    content = rewriteScss(content, target, config, cwd)
  } else if (target.endsWith('.tsx') || target.endsWith('.ts')) {
    content = rewriteImports(content, config)
  }
  return { target, content }
}

function readLocal(cwd, target) {
  const file = path.join(cwd, target)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

function writeLocal(cwd, target, content) {
  const file = path.join(cwd, target)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

async function addItemFiles(item, config, manifest, cwd, flags) {
  const installed = []
  for (const file of item.files) {
    const { target, content } = transformed(item, file, config, cwd)
    const local = readLocal(cwd, target)

    if (local !== null && !flags.overwrite && !flags.force) {
      log.step(`skip ${target} (already exists; use --overwrite)`)
      continue
    }
    if (flags.dryRun) {
      log.step(`would write ${target}`)
      continue
    }

    writeLocal(cwd, target, content)
    writeSnapshot(cwd, target, content)
    manifest.files[target] = {
      item: item.name,
      hash: hash(content),
      snapshot: snapshotPath(cwd, target),
    }
    installed.push(target)
  }

  manifest.items[item.name] = {
    version: item.version,
    files: item.files.map((file) => targetFor(config, file.path)),
    dependencies: item.dependencies ?? [],
    devDependencies: item.devDependencies ?? [],
    registryDependencies: item.registryDependencies ?? [],
  }
  return installed
}

export async function init(cwd, flags = {}) {
  const config = flags.registry
    ? { ...DEFAULT_CONFIG, registry: flags.registry }
    : DEFAULT_CONFIG
  writeConfig(cwd, config)
  for (const dir of Object.values(config.paths)) {
    fs.mkdirSync(path.join(cwd, dir), { recursive: true })
  }
  log.done('Created vorzela.json')
  log.step(`Registry: ${config.registry}`)
  log.step(`Components: ${config.paths.components}`)
  log.step(`Styles: ${config.paths.styles}`)
  log.step(`Import ${config.css} once in your app root.`)
}

export async function add(cwd, names, flags = {}) {
  if (names.length === 0) {
    log.error('Usage: vorzela-ui add <component...>')
    process.exitCode = 1
    return
  }
  const config = ensureConfig(cwd, flags)
  if (!config) return

  const { base, index } = await loadIndex(config.registry, cwd)
  const roots = names.map((name) => name.replace(/^@[^/]+\//, ''))
  const items = resolveDependencies(index, roots)
  const dependencies = [
    ...new Set(items.flatMap((item) => item.dependencies ?? [])),
  ]
  const devDependencies = [
    ...new Set(items.flatMap((item) => item.devDependencies ?? [])),
  ]

  if (flags.dryRun) {
    for (const item of items) {
      log.step(`would install ${item.name}@${item.version}`)
    }
    if (dependencies.length) log.step(`would install deps: ${dependencies.join(', ')}`)
    if (devDependencies.length) {
      log.step(`would install dev deps: ${devDependencies.join(', ')}`)
    }
    return
  }

  log.info(`Installing ${items.filter((i) => i.type === 'ui' || i.type === 'chart').map((i) => i.name).join(', ')}`)
  if (dependencies.length) {
    log.step(`npm deps: ${dependencies.join(', ')}`)
    installDependencies(cwd, dependencies)
  }
  if (devDependencies.length) {
    log.step(`npm dev deps: ${devDependencies.join(', ')}`)
    installDependencies(cwd, devDependencies, { dev: true })
  }

  const manifest = readManifest(cwd)
  manifest.registry = config.registry
  manifest.version = index.version
  const installed = []

  for (const item of items) {
    const full = await loadItem(base, item.name)
    const files = await addItemFiles(full, config, manifest, cwd, flags)
    installed.push({ name: item.name, files })
  }

  writeManifest(cwd, manifest)
  log.done(`${installed.reduce((total, item) => total + item.files.length, 0)} files installed`)
  log.step(`Import ${config.css} once in your app root.`)
}

async function promptModified(cwd, target, content, flags) {
  if (flags.force || flags.replaceAll) return 'replace'
  if (flags.yes) return 'keep'
  const value = await choose(`\n${target} has local changes.`, [
    { label: 'Show diff', value: 'diff' },
    { label: 'Keep local', value: 'keep' },
    { label: 'Replace with registry', value: 'replace' },
    { label: 'Skip this component', value: 'skip' },
    { label: 'Replace all remaining', value: 'replaceAll' },
  ])
  if (value === 'diff') {
    showDiff(cwd, target, content)
    return promptModified(cwd, target, content, flags)
  }
  if (value === 'replaceAll') {
    flags.replaceAll = true
    return 'replace'
  }
  return value
}

function showDiff(cwd, target, content) {
  const current = path.join(cwd, target)
  const next = path.join(os.tmpdir(), `vorzela-${Date.now()}.txt`)
  fs.writeFileSync(next, content ?? '')
  const result = spawnSync('diff', ['-u', current, next], { encoding: 'utf8' })
  console.log(result.stdout || '(no textual diff)')
  fs.rmSync(next, { force: true })
}

export async function update(cwd, names = [], flags = {}) {
  const config = ensureConfig(cwd, flags)
  if (!config) return
  const manifest = readManifest(cwd)
  const { base, index } = await loadIndex(config.registry, cwd)
  const roots = Object.keys(manifest.items)
  const targets =
    names.length > 0
      ? roots.filter((name) => names.includes(name))
      : roots

  if (targets.length === 0) {
    log.warn('No installed components found.')
    return
  }

  log.info(`Checking ${targets.length} installed item${targets.length === 1 ? '' : 's'}`)

  const updated = []
  let skipped = 0

  for (const name of targets) {
    const entry = index.items.find((item) => item.name === name)
    if (!entry) {
      log.warn(`${name} is no longer in the registry`)
      continue
    }
    const item = await loadItem(base, name)
    const known = manifest.items[name]
    const nextFiles = new Map()

    for (const file of item.files) {
      const { target, content } = transformed(item, file, config, cwd)
      nextFiles.set(target, content)
      const local = readLocal(cwd, target)
      const snapshot = readSnapshot(cwd, target)
      const registryHash = hash(content)
      const localHash = local === null ? null : hash(local)

      if (local === null) {
        if (flags.dryRun) {
          log.step(`would restore ${target}`)
        } else {
          writeLocal(cwd, target, content)
          writeSnapshot(cwd, target, content)
          manifest.files[target] = {
            item: name,
            hash: registryHash,
            snapshot: snapshotPath(cwd, target),
          }
        }
        updated.push(target)
        continue
      }

      if (localHash === registryHash) continue

      const unchanged = snapshot === null || localHash === hash(snapshot)

      if (flags.dryRun) {
        if (unchanged || flags.force || flags.replaceAll) {
          log.step(`would update ${target}`)
          updated.push(target)
        } else if (flags.yes) {
          log.step(`would keep ${target} (local changes)`)
        } else {
          log.step(`would prompt for ${target} (local changes)`)
        }
        continue
      }

      const action = unchanged
        ? 'replace'
        : await promptModified(cwd, target, content, flags)

      if (action === 'skip') {
        skipped += 1
        break
      }
      if (action === 'keep') continue

      writeLocal(cwd, target, content)
      writeSnapshot(cwd, target, content)
      manifest.files[target] = {
        item: name,
        hash: registryHash,
        snapshot: snapshotPath(cwd, target),
      }
      updated.push(target)
    }

    if (!flags.dryRun && nextFiles.size > 0) {
      manifest.items[name] = {
        ...known,
        version: item.version,
        files: [...nextFiles.keys()],
        dependencies: item.dependencies ?? [],
        devDependencies: item.devDependencies ?? [],
        registryDependencies: item.registryDependencies ?? [],
      }
    }
  }

  if (!flags.dryRun) {
    manifest.version = index.version
    writeManifest(cwd, manifest)
  }
  log.done(
    flags.dryRun
      ? `${updated.length} file${updated.length === 1 ? '' : 's'} would change`
      : `${updated.length} file${updated.length === 1 ? '' : 's'} updated${skipped ? ` · ${skipped} skipped` : ''}`,
  )
}

export async function status(cwd, flags = {}) {
  const config = ensureConfig(cwd, flags)
  if (!config) return
  const manifest = readManifest(cwd)
  const { index } = await loadIndex(config.registry, cwd)
  const rows = []

  for (const [name, entry] of Object.entries(manifest.items)) {
    const latest = index.items.find((item) => item.name === name)
    let modified = 0
    for (const target of entry.files) {
      const local = readLocal(cwd, target)
      const snapshot = readSnapshot(cwd, target)
      if (local !== null && snapshot !== null && hash(local) !== hash(snapshot)) {
        modified += 1
      }
    }
    rows.push({
      name,
      installed: entry.version,
      latest: latest?.version ?? 'removed',
      modified,
    })
  }

  console.log()
  console.log(`${c.bold}Component${c.reset}                 ${c.bold}Installed${c.reset}   ${c.bold}Latest${c.reset}   ${c.bold}Local edits${c.reset}`)
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(24)} ${row.installed.padEnd(11)} ${row.latest.padEnd(8)} ${row.modified > 0 ? `${c.yellow}${row.modified}${c.reset}` : '—'}`,
    )
  }
  console.log()
}

export async function diff(cwd, name, flags = {}) {
  const config = ensureConfig(cwd, flags)
  if (!config) return
  const manifest = readManifest(cwd)
  if (!manifest.items[name]) {
    log.error(`${name} is not installed.`)
    return
  }
  const { base } = await loadIndex(config.registry, cwd)
  const item = await loadItem(base, name)
  log.info(`Diff ${name} against registry ${item.version}`)
  for (const file of item.files) {
    const { target, content } = transformed(item, file, config, cwd)
    console.log(`\n${c.bold}${target}${c.reset}`)
    showDiff(cwd, target, content)
  }
}

export async function doctor(cwd, flags = {}) {
  const config = ensureConfig(cwd, flags)
  if (!config) return
  const manifest = readManifest(cwd)
  let issues = 0

  for (const [name, dir] of Object.entries(config.paths)) {
    if (!fs.existsSync(path.join(cwd, dir))) {
      log.error(`Missing ${name} path: ${dir}`)
      issues += 1
    }
  }

  for (const target of Object.keys(manifest.files)) {
    if (!fs.existsSync(path.join(cwd, target))) {
      log.warn(`Missing installed file: ${target}`)
      issues += 1
    }
    if (!readSnapshot(cwd, target)) {
      log.warn(`Missing snapshot: ${target}`)
      issues += 1
    }
  }

  if (issues === 0) log.done('No issues found.')
  else log.warn(`${issues} issue${issues === 1 ? '' : 's'} found.`)
}
