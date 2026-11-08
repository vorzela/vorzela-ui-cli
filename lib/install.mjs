import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const PACKAGE_MANAGERS = [
  ['pnpm', 'pnpm-lock.yaml'],
  ['yarn', 'yarn.lock'],
  ['bun', 'bun.lockb'],
  ['npm', 'package-lock.json'],
]

export function detectPackageManager(cwd) {
  for (const [name, lock] of PACKAGE_MANAGERS) {
    if (fs.existsSync(path.join(cwd, lock))) return name
  }
  return 'npm'
}

export function readPackageJson(cwd) {
  const file = path.join(cwd, 'package.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
}

export function missingDependencies(cwd, dependencies) {
  const pkg = readPackageJson(cwd)
  const present = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ])
  return [...new Set(dependencies)].filter((dep) => !present.has(dep))
}

export function installDependencies(cwd, dependencies, { dev = false } = {}) {
  const missing = missingDependencies(cwd, dependencies)
  if (missing.length === 0) return []

  const manager = detectPackageManager(cwd)
  const verb = manager === 'npm' ? 'install' : 'add'
  const devFlag = manager === 'bun' ? '-d' : '-D'
  const args = dev ? [verb, devFlag, ...missing] : [verb, ...missing]

  const result = spawnSync(manager, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`Failed to install dependencies: ${missing.join(', ')}`)
  }
  return missing
}
