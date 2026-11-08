#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { add, diff, doctor, init, status, update } from '../lib/commands.mjs'
import { color, log } from '../lib/terminal.mjs'

const VERSION = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version

function usage() {
  console.log(`
${color.bold('Vorzela UI CLI')} ${color.dim(`v${VERSION}`)}

${color.bold('Usage')}
  vorzela-ui <command> [options]

${color.bold('Commands')}
  init                    Create vorzela.json
  add <component...>      Install components and their registry dependencies
  update [component...]   Update installed components
  status                  Show installed versions and local edits
  diff <component>        Diff an installed component against the registry
  doctor                  Check config, registry and installed files

${color.bold('Options')}
  --registry <url|path>   Override the registry
  --cwd <dir>             Run in another directory
  --dry-run, -n           Show changes without writing
  --overwrite             Replace existing files on add
  --yes, -y               Keep local changes without prompting
  --force, -f             Replace existing/modified files without prompting
  --verbose               Show per-file details
  --no-color              Disable ANSI colors
  --color                 Force ANSI colors
  --version, -V           Print the CLI version
  --help, -h              Show this help

${color.bold('Examples')}
  vorzela-ui add button input card
  vorzela-ui add select table modal --dry-run
  vorzela-ui update --yes
  vorzela-ui status
`)
}

function parseArgs(argv) {
  const positional = []
  const flags = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--yes' || arg === '-y') flags.yes = true
    else if (arg === '--force' || arg === '-f') flags.force = true
    else if (arg === '--dry-run' || arg === '-n') flags.dryRun = true
    else if (arg === '--overwrite') flags.overwrite = true
    else if (arg === '--verbose') flags.verbose = true
    else if (arg === '--no-color') flags.color = false
    else if (arg === '--color') flags.color = true
    else if (arg === '--help' || arg === '-h') flags.help = true
    else if (arg === '--version' || arg === '-V') flags.version = true
    else if (arg === '--registry' || arg === '--cwd') {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}.`)
      }
      flags[arg.slice(2)] = value
      index += 1
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}. Run \`vorzela-ui --help\`.`)
    } else {
      positional.push(arg)
    }
  }

  return { positional, flags }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2))

  if (flags.version) {
    console.log(VERSION)
    return
  }

  const command = positional.shift()

  if (flags.help || !command) {
    usage()
    return
  }

  const cwd = path.resolve(flags.cwd ?? process.cwd())

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
      throw new Error(`Unknown command: ${command}. Run \`vorzela-ui --help\`.`)
  }
}

process.on('SIGINT', () => {
  process.stderr.write('\n')
  log.warn('Cancelled.')
  process.exit(130)
})

main().catch((error) => {
  log.error(error?.message ?? String(error))
  if (process.env.DEBUG) console.error(error)
  process.exitCode = 1
})
