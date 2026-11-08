#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'

import {
  add,
  diff,
  doctor,
  init,
  status,
  update,
} from '../lib/commands.mjs'

function parseArgs(argv) {
  const positional = []
  const flags = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--yes' || arg === '-y') flags.yes = true
    else if (arg === '--force' || arg === '-f') flags.force = true
    else if (arg === '--dry-run') flags.dryRun = true
    else if (arg === '--overwrite') flags.overwrite = true
    else if (arg === '--registry') {
      flags.registry = argv[index + 1]
      index += 1
    } else if (arg === '--cwd') {
      flags.cwd = argv[index + 1]
      index += 1
    } else {
      positional.push(arg)
    }
  }

  return { positional, flags }
}

const { positional, flags } = parseArgs(process.argv.slice(2))
const command = positional.shift()
const cwd = path.resolve(flags.cwd ?? process.cwd())

async function main() {
  switch (command) {
    case 'init':
      await init(cwd, flags)
      break
    case 'add':
      await add(cwd, positional, flags)
      break
    case 'update':
      await update(cwd, positional, flags)
      break
    case 'status':
      await status(cwd, flags)
      break
    case 'diff':
      if (!positional[0]) throw new Error('Usage: vorzela-ui diff <component>')
      await diff(cwd, positional[0], flags)
      break
    case 'doctor':
      await doctor(cwd, flags)
      break
    default:
      console.log(`
Vorzela UI CLI

  vorzela-ui init
  vorzela-ui add <component...>
  vorzela-ui update [component...]
  vorzela-ui status
  vorzela-ui diff <component>
  vorzela-ui doctor

Flags:
  --registry <url|path>   Override registry
  --cwd <dir>             Run in another directory
  --dry-run               Show changes without writing
  --overwrite             Replace existing files on add
  --yes                   Accept safe updates only
  --force                 Replace modified files without asking
`)
      process.exitCode = command ? 1 : 0
  }
}

main().catch((error) => {
  console.error(`\x1b[31m✖\x1b[0m ${error.message}`)
  process.exitCode = 1
})
