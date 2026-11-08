import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { color } from './terminal.mjs'

function ensureInteractive() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      'This prompt needs an interactive terminal. Re-run with --yes, --force, or --overwrite.',
    )
  }
}

function createPrompt() {
  ensureInteractive()
  return readline.createInterface({ input: stdin, output: stdout })
}

export async function confirm(message, defaultValue = false) {
  const rl = createPrompt()
  try {
    const suffix = defaultValue ? ' [Y/n] ' : ' [y/N] '
    const answer = (await rl.question(message + suffix)).trim().toLowerCase()
    if (!answer) return defaultValue
    if (['y', 'yes'].includes(answer)) return true
    if (['n', 'no'].includes(answer)) return false
    throw new Error(`Expected "y" or "n", received "${answer}".`)
  } finally {
    rl.close()
  }
}

export async function choose(message, choices) {
  const rl = createPrompt()
  try {
    console.log(message)
    choices.forEach((choice, index) => {
      console.log(`  ${color.cyan(index + 1)}. ${choice.label}`)
    })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const answer = (
        await rl.question(`Choose [1-${choices.length}]: `)
      ).trim()
      const index = Number(answer) - 1
      if (Number.isInteger(index) && index >= 0 && index < choices.length) {
        return choices[index].value
      }
      console.log(color.yellow(`Enter a number from 1 to ${choices.length}.`))
    }

    throw new Error('No valid choice selected.')
  } finally {
    rl.close()
  }
}
