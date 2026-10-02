# FEATURE.md — `@ai-matrx/terminal` (package mechanics)

Verified against code 2026-10-02.

**What it is:** THE terminal for every Matrx app — xterm 6 (DOM renderer) with fit, theme, a
transport-free handle, and the phone layer modelled on Termius for iOS: tap to type, drag to scroll
with momentum, press-and-hold to select a word (drag to extend, Copy pill), and a 44px keyboard
accessory bar that stays above the on-screen keyboard. Any PTY plugs in: the Matrx 2 desktop relay
(`/devices/[deviceId]`), the cloud sandbox (`/sandbox/[id]`, `/code`), anything with bytes in and
bytes out.

## Shape

| Layer | Where |
|---|---|
| Accessory keys, byte sequences, Ctrl/Alt encoding | `src/core/keys.ts` |
| Ctrl / Alt latch (tap = once, double-tap = locked) | `src/core/modifiers.ts` |
| Touch gesture recognizer + momentum | `src/core/gesture.ts` |
| Long-press selection math (word, span, cell under a point) | `src/core/selection.ts` |
| Visual-viewport math (keyboard inset, height above the keyboard) | `src/core/viewport.ts` |
| Font, metrics, both palettes | `src/core/theme.ts` |
| `<Terminal>` | `src/react/Terminal.tsx` |
| `<AccessoryBar>` | `src/react/AccessoryBar.tsx` |
| Structural CSS (`--mxt-*` tokens only) / default token values | `src/styles.css` / `src/tokens.css` |

Entries: `@ai-matrx/terminal` (core, no React, no xterm at runtime), `@ai-matrx/terminal/react`,
`@ai-matrx/terminal/styles.css`, `@ai-matrx/terminal/tokens.css`.

## Rules

- **Bytes in, keys out, nothing else.** A host gets a `TerminalHandle` from `onReady`
  (`write` resolves after xterm parsed the bytes — pace credit-based streams on it; `reset` before a
  screen snapshot; `getText`), keys from `onData` (already modified by the bar's Ctrl/Alt) and the
  grid from `onResize`. The package never knows what a PTY is.
- **The phone layer is the package's job.** Hosts never re-implement touch scrolling, selection, the
  accessory bar, the 16px input (iOS zoom), autocorrect/autocapitalize off, or keyboard-aware
  sizing. `touch` and `accessory` default to `"auto"` (on for a coarse pointer).
- **`fit="viewport"`** sizes the terminal from its top edge to the bottom of the VISUAL viewport on
  every `visualViewport` resize/scroll, so the last row and the bar sit on the keyboard. Use it for
  a full-screen console; `fit="container"` (default) fills a sized parent.
- **Ctrl:** tap = the next key only; double-tap within 350 ms = locked until tapped again. A paste
  never consumes a latched modifier.
- **Alternate screen** (vim, less, htop): a drag sends ↑/↓ instead of scrolling a scrollback the
  program does not have.
- No framework imports, no module-level mutable state, no hardcoded colours outside xterm's palette.

## Host in this repo

`<Terminal>` imports its own structural CSS and xterm's. Each host imports
`styles/terminal-host.css`, which maps the `--mxt-*` tokens onto the app theme. Consumers: `features/files/devices/console`
(the device console), `features/code/terminal/TerminalTab.tsx`, `app/(core)/sandbox/[id]`.

## Tests

`src/__tests__/core.test.ts` (jest, from the repo root: `npx jest packages/terminal`). Strict types:
`pnpm tsc -p packages/terminal/tsconfig.json`.

## Not yet

- Publishing to npm: a brand-new package needs the owner's one-time npm 2FA bootstrap, published
  from `aidream/apps/shared/terminal` (the package moves there at that moment). Until then it is a
  private workspace package here, like `@ai-matrx/canvas`.
