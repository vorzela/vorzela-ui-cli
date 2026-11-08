import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

export async function confirm(message, defaultValue = false) {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    const suffix = defaultValue ? ' [Y/n] ' : ' [y/N] '
    const answer = (await rl.question(message + suffix)).trim().toLowerCase()
    if (!answer) return defaultValue
    return answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}

export async function choose(message, choices) {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    console.log(message)
    choices.forEach((choice, index) => {
      console.log(`  ${index + 1}. ${choice.label}`)
    })
    const answer = (await rl.question(`Choose [1-${choices.length}]: `)).trim()
    const index = Number(answer) - 1
    return choices[index]?.value ?? choices[0].value
  } finally {
    rl.close()
  }
}
