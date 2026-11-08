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
  if (!fs.existsSync(file)) return {}

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${error.message}`)
  }
}

export function missingDependencies(cwd, dependencies) {
  if (dependencies.length === 0) return []

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
  const command = `${manager} ${args.join(' ')}`

  const result = spawnSync(manager, args, { cwd, stdio: 'inherit' })

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(
        `Package manager "${manager}" was not found. Install it or add these dependencies manually: ${missing.join(', ')}.`,
      )
    }
    throw new Error(`Could not run "${command}": ${result.error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(
      `"${command}" failed with exit code ${result.status ?? 'unknown'}. The component files were not installed.`,
    )
  }

  return missing
}
