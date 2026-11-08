# Vorzela UI SCSS

A tiny VS Code / Cursor / Windsurf extension that adds the Vorzela UI Sass
import to newly created `.scss` files.

When you create an empty `.scss` file in a workspace that contains
`vorzela.json`, the extension inserts:

```scss
@use '../../styles' as vz;
```

The path is calculated from `vorzela.json` → `paths.styles`, so it works from
any folder. Files inside the styles layer itself and files created with content
are left untouched.

This extension is installed by `vorzela-ui init`. To install it manually:

```bash
code --install-extension vorzela-ui-scss.vsix --force
windsurf --install-extension vorzela-ui-scss.vsix --force
cursor --install-extension vorzela-ui-scss.vsix --force
```
