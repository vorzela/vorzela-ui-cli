import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function localBase(registry, cwd) {
  if (registry.startsWith('file://')) {
    return fileURLToPath(registry).replace(/\/$/, '')
  }
  if (/^https?:\/\//.test(registry)) return registry.replace(/\/$/, '')
  return path.resolve(cwd, registry).replace(/\/$/, '')
}

async function readJson(base, file) {
  if (/^https?:\/\//.test(base)) {
    const response = await fetch(`${base}/${file}`)
    if (!response.ok) throw new Error(`Registry request failed: ${response.status} ${file}`)
    return response.json()
  }
  return JSON.parse(fs.readFileSync(path.join(base, file), 'utf8'))
}

export async function loadIndex(registry, cwd) {
  const base = localBase(registry, cwd)
  const index = await readJson(base, 'index.json')
  return { base, index }
}

export async function loadItem(base, name) {
  return readJson(base, `${name}.json`)
}

export function resolveDependencies(index, roots) {
  const byName = new Map(index.items.map((item) => [item.name, item]))
  const resolved = new Map()
  const queue = [...roots]

  while (queue.length > 0) {
    const name = queue.shift()
    if (resolved.has(name)) continue
    const item = byName.get(name)
    if (!item) throw new Error(`Unknown registry item: ${name}`)
    resolved.set(name, item)
    for (const dep of item.registryDependencies ?? []) {
      if (!resolved.has(dep)) queue.push(dep)
    }
  }

  return [...resolved.values()]
}
