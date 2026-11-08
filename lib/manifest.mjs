import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { writeFileAtomic } from './config.mjs'

export const MANIFEST_DIR = '.vorzela'

export const EMPTY_MANIFEST = {
  registry: '',
  version: '',
  items: {},
  files: {},
}

export function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function manifestPath(cwd) {
  return path.join(cwd, MANIFEST_DIR, 'manifest.json')
}

export function readManifest(cwd) {
  const file = manifestPath(cwd)
  if (!fs.existsSync(file)) return structuredClone(EMPTY_MANIFEST)

  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${error.message}`)
  }

  return {
    registry: typeof parsed.registry === 'string' ? parsed.registry : '',
    version: typeof parsed.version === 'string' ? parsed.version : '',
    items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {},
    files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
  }
}

export function writeManifest(cwd, manifest) {
  writeFileAtomic(manifestPath(cwd), `${JSON.stringify(manifest, null, 2)}\n`)
}

export function snapshotPath(cwd, target) {
  const safe = target.replaceAll(path.sep, '__').replaceAll('/', '__')
  return path.join(MANIFEST_DIR, 'snapshots', safe)
}

export function readSnapshot(cwd, target) {
  const file = path.join(cwd, snapshotPath(cwd, target))
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

export function writeSnapshot(cwd, target, content) {
  writeFileAtomic(path.join(cwd, snapshotPath(cwd, target)), content)
}

export function removeSnapshot(cwd, target) {
  const file = path.join(cwd, snapshotPath(cwd, target))
  fs.rmSync(file, { force: true })
}
