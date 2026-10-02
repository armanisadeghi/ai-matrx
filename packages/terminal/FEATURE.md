# FEATURE.md — `packages/terminal` (temporary copy)

`@ai-matrx/terminal` lives in ONE home: `aidream/apps/shared/terminal` (contract, rules, tests and
the release flow are in its `FEATURE.md`). This directory is a byte-identical copy of that
package's `src/`, kept only so this app can build before the first npm publish (a new package's
one-time 2FA bootstrap, tag `npm/terminal/v0.1.0`).

- Change the package THERE first, then copy `src/` here unchanged (`diff -r` must be empty).
- The day npm serves `@ai-matrx/terminal`: set `"@ai-matrx/terminal": "latest"` in `package.json`,
  drop it from `transpilePackages` (next.config.js) and the two jest `moduleNameMapper` lines,
  run `pnpm install`, and delete this directory.

Hosts here import `styles/terminal-host.css` (the `--mxt-*` token map). Consumers: the device
console (`features/files/devices/console`), `features/code/terminal/TerminalTab.tsx`,
`components/sandbox/SandboxConsole.tsx`.
