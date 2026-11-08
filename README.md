# Vorzela UI CLI

Install Vorzela UI components from the registry, shadcn-style.

```bash
# global
npm install -g github:vorzela/vorzela-ui-cli#v1.0.4

# or per project
npm install -D github:vorzela/vorzela-ui-cli#v1.0.4
npx vorzela-ui add button input card
```

The CLI reads `vorzela.json` from the current working directory.

```bash
vorzela-ui init
vorzela-ui add <component...>
vorzela-ui update [component...]
vorzela-ui status
vorzela-ui diff <component>
vorzela-ui doctor
```

## Behavior

- `add` is idempotent. If everything requested is already installed it prints a
  single line, skips npm dependency installs, and exits. Pass `--overwrite` or
  `--force` to rewrite files.
- Only genuinely missing, outdated, or deleted files are processed. Per-file
  output is hidden by default; use `--verbose` to see it.
- Colors are enabled for interactive terminals and disabled automatically when
  output is piped. Use `--no-color`, `--color`, or `NO_COLOR` to control it.
- Errors include the registry URL, file path, package manager command, or a
  component-name suggestion, and the command exits non-zero.

Flags: `--registry <url|path>`, `--cwd <dir>`, `--dry-run`/`-n`,
`--overwrite`, `--yes`/`-y`, `--force`/`-f`, `--verbose`, `--no-color`,
`--color`, `--version`/`-V`, `--help`/`-h`.

Default registry:
`https://raw.githubusercontent.com/vorzela/vorzela-ui/v1.0.2/registry`
