import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const MANIFEST_DIR = '.vorzela'

export function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function manifestPath(cwd) {
  return path.join(cwd, MANIFEST_DIR, 'manifest.json')
}

export function readManifest(cwd) {
  const file = manifestPath(cwd)
  if (!fs.existsSync(file)) {
    return { registry: '', version: '', items: {}, files: {} }
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function writeManifest(cwd, manifest) {
  const file = manifestPath(cwd)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
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
  const file = path.join(cwd, snapshotPath(cwd, target))
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

export function removeSnapshot(cwd, target) {
  const file = path.join(cwd, snapshotPath(cwd, target))
  if (fs.existsSync(file)) fs.rmSync(file)
}
