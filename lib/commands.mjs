import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  DEFAULT_CONFIG,
  configPath,
  readConfig,
  targetFor,
  rewriteImports,
  rewriteScss,
  writeConfig,
} from './config.mjs'
import { installDependencies, missingDependencies } from './install.mjs'
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
import { color, itemLabel, log, plural, text } from './terminal.mjs'

function ensureConfig(cwd, flags) {
  const config = readConfig(cwd)
  if (!config) {
    throw new Error('No vorzela.json found. Run `vorzela-ui init` first.')
  }
  if (flags.registry) config.registry = flags.registry
  return config
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
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error(`Could not read ${target}: ${error.message}`)
  }
}

function writeLocal(cwd, target, content) {
  const file = path.join(cwd, target)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  } catch (error) {
    throw new Error(`Could not write ${target}: ${error.message}`)
  }
}

function filePath(file) {
  return typeof file === 'string' ? file : file.path
}

function itemState(cwd, manifest, config, item) {
  const targets = (item.files ?? []).map((file) =>
    targetFor(config, filePath(file)),
  )
  const missing = targets.filter((target) => readLocal(cwd, target) === null)
  const entry = manifest.items[item.name]

  return {
    targets,
    missing,
    installed: Boolean(entry),
    installedVersion: entry?.version ?? null,
    outdated: Boolean(entry && entry.version !== item.version),
  }
}

function addItemFiles(item, config, manifest, cwd, flags) {
  const written = []
  const skipped = []
  const unchanged = []

  for (const file of item.files) {
    const { target, content } = transformed(item, file, config, cwd)
    const local = readLocal(cwd, target)

    if (local !== null && local === content) {
      unchanged.push(target)
      if (flags.verbose) log.step(`${text.path(target)} unchanged`)
      continue
    }

    if (local !== null && !flags.overwrite && !flags.force) {
      skipped.push(target)
      if (flags.verbose) log.step(`${text.path(target)} kept local version`)
      continue
    }

    writeLocal(cwd, target, content)
    writeSnapshot(cwd, target, content)
    manifest.files[target] = {
      item: item.name,
      hash: hash(content),
      snapshot: snapshotPath(cwd, target),
    }
    written.push(target)
    if (flags.verbose) log.step(`${text.path(target)} written`)
  }

  manifest.items[item.name] = {
    version: item.version,
    files: item.files.map((file) => targetFor(config, filePath(file))),
    dependencies: item.dependencies ?? [],
    devDependencies: item.devDependencies ?? [],
    registryDependencies: item.registryDependencies ?? [],
  }

  return { written, skipped, unchanged }
}

export async function init(cwd, flags = {}) {
  if (fs.existsSync(configPath(cwd)) && !flags.force) {
    log.warn('vorzela.json already exists. Use --force to overwrite it.')
    return
  }

  const config = flags.registry
    ? { ...DEFAULT_CONFIG, registry: flags.registry }
    : DEFAULT_CONFIG

  writeConfig(cwd, config)

  for (const dir of Object.values(config.paths)) {
    try {
      fs.mkdirSync(path.join(cwd, dir), { recursive: true })
    } catch (error) {
      throw new Error(`Could not create ${dir}: ${error.message}`)
    }
  }

  log.done('Created vorzela.json')
  log.step(`Registry: ${text.path(config.registry)}`)
  log.step(`Components: ${text.path(config.paths.components)}`)
  log.step(`Styles: ${text.path(config.paths.styles)}`)
  log.step(`Import ${text.path(config.css)} once in your app root.`)
}

export async function add(cwd, names, flags = {}) {
  if (names.length === 0) {
    throw new Error('Usage: vorzela-ui add <component...>')
  }

  const config = ensureConfig(cwd, flags)
  const { base, index } = await loadIndex(config.registry, cwd)
  const roots = [...new Set(names.map((name) => name.replace(/^@[^/]+\//, '')))]
  const rootSet = new Set(roots)
  const items = resolveDependencies(index, roots)
  const manifest = readManifest(cwd)
  const force = Boolean(flags.overwrite || flags.force)

  const plan = []
  const already = []

  for (const item of items) {
    const state = itemState(cwd, manifest, config, item)
    if (!force && state.installed && state.missing.length === 0) {
      already.push({ item, state })
    } else {
      plan.push({ item, state })
    }
  }

  const alreadyRoots = already.filter(({ item }) => rootSet.has(item.name))

  if (plan.length === 0) {
    log.done(
      `Already installed: ${alreadyRoots.map(({ item }) => text.name(item.name)).join(', ')}`,
    )
    const outdated = alreadyRoots.filter(({ state }) => state.outdated)
    if (outdated.length) {
      log.step(
        `Newer versions available for ${outdated
          .map(({ item }) => text.name(item.name))
          .join(', ')}. Run ${text.command('vorzela-ui update')}.`,
      )
    }
    return
  }

  const planRoots = plan.filter(({ item }) => rootSet.has(item.name))
  const visible = flags.verbose ? plan : planRoots.length > 0 ? planRoots : plan
  const heading = flags.dryRun ? 'Would install' : 'Installing'
  log.info(
    `${heading} ${visible.map(({ item }) => text.name(item.name)).join(', ')}`,
  )

  const dependencies = [
    ...new Set(plan.flatMap(({ item }) => item.dependencies ?? [])),
  ]
  const devDependencies = [
    ...new Set(plan.flatMap(({ item }) => item.devDependencies ?? [])),
  ]
  const missingDeps = missingDependencies(cwd, dependencies)
  const missingDevDeps = missingDependencies(cwd, devDependencies)

  if (flags.dryRun) {
    for (const { item, state } of visible) {
      const detail = !state.installed
        ? plural(item.files.length, 'file')
        : state.missing.length
          ? `restore ${plural(state.missing.length, 'file')}`
          : plural(item.files.length, 'file')
      log.step(`${itemLabel(item.name, item.version)} · ${detail}`)
    }
    if (missingDeps.length) {
      log.step(
        `npm deps: ${missingDeps.map((value) => text.name(value)).join(', ')}`,
      )
    }
    if (missingDevDeps.length) {
      log.step(
        `npm dev deps: ${missingDevDeps.map((value) => text.name(value)).join(', ')}`,
      )
    }
    return
  }

  if (missingDeps.length) {
    log.step(
      `npm deps: ${missingDeps.map((value) => text.name(value)).join(', ')}`,
    )
    installDependencies(cwd, missingDeps)
  }
  if (missingDevDeps.length) {
    log.step(
      `npm dev deps: ${missingDevDeps.map((value) => text.name(value)).join(', ')}`,
    )
    installDependencies(cwd, missingDevDeps, { dev: true })
  }

  let totalWritten = 0
  let totalSkipped = 0
  const failures = []

  for (const { item } of plan) {
    try {
      const full = await loadItem(base, item.name)
      const result = addItemFiles(full, config, manifest, cwd, flags)

      totalWritten += result.written.length
      totalSkipped += result.skipped.length

      manifest.registry = config.registry
      manifest.version = index.version
      writeManifest(cwd, manifest)

      if (rootSet.has(item.name) || flags.verbose) {
        const summary = result.written.length
          ? `${plural(result.written.length, 'file')} installed`
          : 'already up to date'
        const skipped = result.skipped.length
          ? ` · ${plural(result.skipped.length, 'file')} kept`
          : ''
        log.step(`${itemLabel(item.name, item.version)} · ${summary}${skipped}`)
      }
    } catch (error) {
      failures.push({ name: item.name, error })
      log.error(`${text.name(item.name)} failed: ${error.message}`)
    }
  }

  if (alreadyRoots.length) {
    log.step(
      `Already installed: ${alreadyRoots
        .map(({ item }) => text.name(item.name))
        .join(', ')}`,
    )
  }

  if (failures.length) {
    throw new Error(
      `${plural(failures.length, 'component')} failed. Fix the errors above and re-run.`,
    )
  }

  if (totalWritten === 0) {
    log.done(
      `No files changed${totalSkipped ? ` (${plural(totalSkipped, 'file')} kept)` : ''}.`,
    )
  } else {
    log.done(`${plural(totalWritten, 'file')} installed.`)
  }
  log.step(`Import ${text.path(config.css)} once in your app root.`)
}

async function promptModified(cwd, target, content, flags) {
  if (flags.force || flags.replaceAll) return 'replace'
  if (flags.yes) return 'keep'

  const value = await choose(`\n${text.path(target)} has local changes.`, [
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

  if (!fs.existsSync(current)) {
    console.log(color.dim('(file does not exist locally)'))
    return
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vorzela-'))
  const next = path.join(dir, path.basename(target))

  try {
    fs.writeFileSync(next, content ?? '')
    const result = spawnSync('diff', ['-u', current, next], {
      encoding: 'utf8',
    })

    if (result.error) {
      if (result.error.code === 'ENOENT') {
        console.log(color.yellow('diff command not found; registry content:'))
        console.log(content)
        return
      }
      throw new Error(`Could not run diff: ${result.error.message}`)
    }

    console.log(result.stdout || color.dim('(no textual diff)'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export async function update(cwd, names = [], flags = {}) {
  const config = ensureConfig(cwd, flags)
  const manifest = readManifest(cwd)
  const installedNames = Object.keys(manifest.items)

  if (installedNames.length === 0) {
    log.info('No components installed. Run `vorzela-ui add <component>` first.')
    return
  }

  const { base, index } = await loadIndex(config.registry, cwd)
  const unknown = names.filter((name) => !manifest.items[name])
  if (unknown.length) {
    log.warn(
      `Not installed: ${unknown.map((value) => text.name(value)).join(', ')}`,
    )
  }

  const targets = (names.length ? names : installedNames).filter(
    (name) => manifest.items[name],
  )

  if (targets.length === 0) {
    log.warn('No matching installed components found.')
    return
  }

  log.info(`Checking ${plural(targets.length, 'installed item')}`)

  let updated = 0
  let skipped = 0
  const failures = []

  for (const name of targets) {
    try {
      const entry = index.items.find((item) => item.name === name)
      if (!entry) {
        log.warn(`${text.name(name)} is no longer in the registry`)
        continue
      }

      const item = await loadItem(base, name)
      const known = manifest.items[name]
      const nextFiles = new Map()
      let itemUpdated = 0
      let itemSkipped = 0
      let itemUpToDate = 0

      for (const file of item.files) {
        const { target, content } = transformed(item, file, config, cwd)
        nextFiles.set(target, content)

        const local = readLocal(cwd, target)
        const snapshot = readSnapshot(cwd, target)
        const registryHash = hash(content)
        const localHash = local === null ? null : hash(local)

        if (local === null) {
          if (flags.dryRun) {
            itemUpdated += 1
            if (flags.verbose) log.step(`would restore ${text.path(target)}`)
          } else {
            writeLocal(cwd, target, content)
            writeSnapshot(cwd, target, content)
            manifest.files[target] = {
              item: name,
              hash: registryHash,
              snapshot: snapshotPath(cwd, target),
            }
            itemUpdated += 1
            if (flags.verbose) log.step(`restored ${text.path(target)}`)
          }
          continue
        }

        if (localHash === registryHash) {
          itemUpToDate += 1
          if (flags.verbose) log.step(`${text.path(target)} up to date`)
          continue
        }

        const unchanged = snapshot === null || localHash === hash(snapshot)

        if (flags.dryRun) {
          if (unchanged || flags.force || flags.replaceAll) {
            itemUpdated += 1
            if (flags.verbose) log.step(`would update ${text.path(target)}`)
          } else {
            itemSkipped += 1
            if (flags.verbose) {
              log.step(
                flags.yes
                  ? `would keep ${text.path(target)} (local changes)`
                  : `would prompt for ${text.path(target)} (local changes)`,
              )
            }
          }
          continue
        }

        const action = unchanged
          ? 'replace'
          : await promptModified(cwd, target, content, flags)

        if (action === 'skip') {
          itemSkipped += 1
          break
        }
        if (action === 'keep') {
          itemSkipped += 1
          continue
        }

        writeLocal(cwd, target, content)
        writeSnapshot(cwd, target, content)
        manifest.files[target] = {
          item: name,
          hash: registryHash,
          snapshot: snapshotPath(cwd, target),
        }
        itemUpdated += 1
        if (flags.verbose) log.step(`updated ${text.path(target)}`)
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
        writeManifest(cwd, manifest)
      }

      updated += itemUpdated
      skipped += itemSkipped

      if (itemUpdated === 0 && itemSkipped === 0) {
        log.step(
          `${text.name(name)} up to date (${plural(itemUpToDate, 'file')})`,
        )
      } else {
        const parts = []
        if (itemUpdated) {
          parts.push(
            `${plural(itemUpdated, 'file')} ${flags.dryRun ? 'to update' : 'updated'}`,
          )
        }
        if (itemSkipped) parts.push(`${plural(itemSkipped, 'file')} skipped`)
        log.step(`${text.name(name)}: ${parts.join(' · ')}`)
      }
    } catch (error) {
      failures.push({ name, error })
      log.error(`${text.name(name)} failed: ${error.message}`)
    }
  }

  if (!flags.dryRun) {
    manifest.version = index.version
    writeManifest(cwd, manifest)
  }

  if (failures.length) {
    throw new Error(
      `Update incomplete: ${plural(failures.length, 'component')} failed. Fix the errors above and re-run.`,
    )
  }

  if (updated === 0 && skipped === 0) {
    log.done('Everything is up to date.')
  } else {
    log.done(
      `${plural(updated, 'file')} ${flags.dryRun ? 'would change' : 'updated'}${
        skipped ? ` · ${plural(skipped, 'file')} skipped` : ''
      }`,
    )
  }
}

export async function status(cwd, flags = {}) {
  const config = ensureConfig(cwd, flags)
  const manifest = readManifest(cwd)
  const names = Object.keys(manifest.items)

  if (names.length === 0) {
    log.info('No components installed. Run `vorzela-ui add <component>`.')
    return
  }

  const { index } = await loadIndex(config.registry, cwd)
  const rows = []

  for (const [name, entry] of Object.entries(manifest.items)) {
    const latest = index.items.find((item) => item.name === name)
    let modified = 0

    for (const target of entry.files) {
      const local = readLocal(cwd, target)
      const snapshot = readSnapshot(cwd, target)
      if (
        local !== null &&
        snapshot !== null &&
        hash(local) !== hash(snapshot)
      ) {
        modified += 1
      }
    }

    rows.push({
      name,
      installed: entry.version ?? 'unknown',
      latest: latest?.version ?? 'removed',
      modified,
    })
  }

  const nameWidth = Math.max(
    'Component'.length,
    ...rows.map((row) => row.name.length),
  )
  const installedWidth = Math.max(
    'Installed'.length,
    ...rows.map((row) => String(row.installed).length),
  )
  const latestWidth = Math.max(
    'Latest'.length,
    ...rows.map((row) => String(row.latest).length),
  )

  console.log()
  console.log(
    `${color.bold('Component'.padEnd(nameWidth))}  ${color.bold(
      'Installed'.padEnd(installedWidth),
    )}  ${color.bold('Latest'.padEnd(latestWidth))}  ${color.bold('Local edits')}`,
  )

  for (const row of rows) {
    const latestText = String(row.latest)
    const latestTone =
      row.latest === 'removed'
        ? color.red
        : row.latest === row.installed
          ? color.green
          : color.yellow
    const edits = row.modified > 0 ? color.yellow(row.modified) : color.dim('—')

    console.log(
      `${text.name(row.name.padEnd(nameWidth))}  ${color.dim(
        String(row.installed).padEnd(installedWidth),
      )}  ${latestTone(latestText.padEnd(latestWidth))}  ${edits}`,
    )
  }

  console.log()
}

export async function diff(cwd, name, flags = {}) {
  const config = ensureConfig(cwd, flags)
  const manifest = readManifest(cwd)

  if (!manifest.items[name]) {
    throw new Error(
      `"${name}" is not installed. Run \`vorzela-ui add ${name}\` first.`,
    )
  }

  const { base } = await loadIndex(config.registry, cwd)
  const item = await loadItem(base, name)
  log.info(
    `Diff ${text.name(name)} against registry ${text.version(item.version)}`,
  )

  for (const file of item.files) {
    const { target, content } = transformed(item, file, config, cwd)
    console.log(`\n${color.bold(target)}`)
    showDiff(cwd, target, content)
  }
}

export async function doctor(cwd, flags = {}) {
  const config = ensureConfig(cwd, flags)
  const manifest = readManifest(cwd)
  let issues = 0

  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    log.warn('No package.json found; npm dependency installs will not work.')
    issues += 1
  }

  try {
    const { index } = await loadIndex(config.registry, cwd)
    log.done(
      `Registry reachable: ${text.version(index.version)} (${plural(index.items.length, 'item')})`,
    )
  } catch (error) {
    log.error(`Registry unavailable: ${error.message}`)
    issues += 1
  }

  for (const target of Object.keys(manifest.files)) {
    if (!fs.existsSync(path.join(cwd, target))) {
      log.warn(`Missing installed file: ${text.path(target)}`)
      issues += 1
    }
    if (!readSnapshot(cwd, target)) {
      log.warn(`Missing snapshot: ${text.path(target)}`)
      issues += 1
    }
  }

  for (const [name, entry] of Object.entries(manifest.items)) {
    const missing = missingDependencies(cwd, entry.dependencies ?? [])
    const missingDev = missingDependencies(cwd, entry.devDependencies ?? [])

    if (missing.length) {
      log.warn(
        `${text.name(name)} is missing dependencies: ${missing
          .map((value) => text.name(value))
          .join(', ')}`,
      )
      issues += missing.length
    }
    if (missingDev.length) {
      log.warn(
        `${text.name(name)} is missing dev dependencies: ${missingDev
          .map((value) => text.name(value))
          .join(', ')}`,
      )
      issues += missingDev.length
    }
  }

  if (issues === 0) {
    log.done('No issues found.')
  } else {
    log.warn(`${plural(issues, 'issue')} found.`)
    process.exitCode = 1
  }
}
