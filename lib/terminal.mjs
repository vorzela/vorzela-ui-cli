import process from 'node:process'

const noColor =
  process.env.NO_COLOR !== undefined || process.argv.includes('--no-color')

const forceColor =
  (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') ||
  process.argv.includes('--color')

export const colorEnabled =
  !noColor && (forceColor || Boolean(process.stdout.isTTY))

const codes = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
}

function paint(code, value) {
  const text = String(value)
  return colorEnabled ? `\x1b[${code}m${text}\x1b[0m` : text
}

export const color = {
  bold: (value) => paint(codes.bold, value),
  dim: (value) => paint(codes.dim, value),
  red: (value) => paint(codes.red, value),
  green: (value) => paint(codes.green, value),
  yellow: (value) => paint(codes.yellow, value),
  blue: (value) => paint(codes.blue, value),
  magenta: (value) => paint(codes.magenta, value),
  cyan: (value) => paint(codes.cyan, value),
  gray: (value) => paint(codes.gray, value),
}

const marks = {
  info: '◇',
  done: '✔',
  warn: '▲',
  error: '✖',
  step: '·',
}

function write(stream, mark, tone, message) {
  stream.write(`${tone(marks[mark])} ${message}\n`)
}

export const log = {
  info: (message) => write(process.stdout, 'info', color.blue, message),
  done: (message) => write(process.stdout, 'done', color.green, message),
  warn: (message) => write(process.stderr, 'warn', color.yellow, message),
  error: (message) => write(process.stderr, 'error', color.red, message),
  step: (message) => write(process.stdout, 'step', color.dim, message),
}

export const text = {
  name: (value) => color.cyan(value),
  version: (value) => color.dim(value),
  path: (value) => color.cyan(value),
  command: (value) => color.bold(value),
  count: (value) => color.bold(value),
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${text.count(count)} ${count === 1 ? singular : pluralForm}`
}

export function itemLabel(name, version) {
  return version
    ? `${text.name(name)} ${text.version(`v${version}`)}`
    : text.name(name)
}
