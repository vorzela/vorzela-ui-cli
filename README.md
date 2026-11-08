# Vorzela UI CLI

Install Vorzela UI components from the registry, shadcn-style.

```bash
# global
npm install -g github:vorzela/vorzela-ui-cli#v1.0.2

# or per project
npm install -D github:vorzela/vorzela-ui-cli#v1.0.2
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

Flags: `--registry <url|path>`, `--cwd <dir>`, `--dry-run`, `--overwrite`,
`--yes`, `--force`.

Default registry:
`https://raw.githubusercontent.com/vorzela/vorzela-ui/v1.0.2/registry`
