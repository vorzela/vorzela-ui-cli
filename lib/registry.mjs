import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FETCH_TIMEOUT_MS = 15_000

function localBase(registry, cwd) {
  if (registry.startsWith('file://')) {
    return fileURLToPath(registry).replace(/\/$/, '')
  }
  if (/^https?:\/\//.test(registry)) return registry.replace(/\/$/, '')
  return path.resolve(cwd, registry).replace(/\/$/, '')
}

function githubToken() {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? ''
}

function headersFor(url) {
  if (!/raw\.githubusercontent\.com|api\.github\.com|github\.com/.test(url)) {
    return undefined
  }
  const token = githubToken()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

async function readJson(base, file) {
  if (/^https?:\/\//.test(base)) {
    const url = `${base}/${file}`
    let response
    try {
      response = await fetch(url, {
        headers: headersFor(url),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (error) {
      const reason =
        error.name === 'TimeoutError'
          ? `timed out after ${FETCH_TIMEOUT_MS}ms`
          : error.message
      throw new Error(`Could not reach registry ${url}: ${reason}`)
    }

    if (!response.ok) {
      throw new Error(
        `Registry request failed (${response.status} ${response.statusText}): ${url}`,
      )
    }

    try {
      return await response.json()
    } catch (error) {
      throw new Error(
        `Registry returned invalid JSON for ${url}: ${error.message}`,
      )
    }
  }

  const filePath = path.join(base, file)
  let raw
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Registry file not found: ${filePath}`)
    }
    throw new Error(`Could not read ${filePath}: ${error.message}`)
  }

  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Registry file is not valid JSON: ${filePath}\n${error.message}`,
    )
  }
}

export async function loadIndex(registry, cwd) {
  const base = localBase(registry, cwd)
  const index = await readJson(base, 'index.json')

  if (!index || !Array.isArray(index.items)) {
    throw new Error(
      `Invalid registry index at ${base}/index.json: "items" must be an array.`,
    )
  }

  return { base, index }
}

export async function loadItem(base, name) {
  const item = await readJson(base, `${name}.json`)

  if (!item || !Array.isArray(item.files)) {
    throw new Error(
      `Invalid registry item "${name}": "files" must be an array.`,
    )
  }

  return item
}

function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution)
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[b.length]
}

export function suggestName(name, candidates) {
  const lower = name.toLowerCase()
  const scored = []

  for (const candidate of candidates) {
    const value = candidate.toLowerCase()
    const contains = value.includes(lower) || lower.includes(value)
    const distance = editDistance(lower, value)
    if (contains || distance <= Math.max(2, Math.ceil(lower.length * 0.35))) {
      scored.push({ candidate, score: contains ? 1 : distance })
    }
  }

  return scored
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, 3)
    .map((entry) => entry.candidate)
}

export function resolveDependencies(index, roots) {
  const byName = new Map(index.items.map((item) => [item.name, item]))
  const names = [...byName.keys()]
  const resolved = new Map()
  const queue = [...roots]

  while (queue.length > 0) {
    const name = queue.shift()
    if (resolved.has(name)) continue

    const item = byName.get(name)
    if (!item) {
      const suggestions = suggestName(name, names)
      const hint = suggestions.length
        ? ` Did you mean ${suggestions.map((value) => `"${value}"`).join(' or ')}?`
        : ' Run `vorzela-ui status` or check the registry index.'
      throw new Error(`Unknown registry item: ${name}.${hint}`)
    }

    resolved.set(name, item)
    for (const dep of item.registryDependencies ?? []) {
      if (!resolved.has(dep)) queue.push(dep)
    }
  }

  return [...resolved.values()]
}
