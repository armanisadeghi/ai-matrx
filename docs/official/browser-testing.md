# Browser testing — the one harness, and its verified mechanics

Every rule here was verified live on 2026-08-09 against production and localhost. Deviating costs you a rediscovery cycle.

## THE ONE DEV SERVER LAW

**This machine has 16GB. Two Next dev servers is a reliable hard crash.** The cap is **ONE dev server, machine-wide** — shared by you, Arman, and Codex.

- **Start it only via** `mcp__Claude_Browser__preview_start` with `name: "next-dev"` → port **3001**, distdir `.next-preview`.
- **Never `pnpm dev` / `npm run dev` in Bash.** It is unmanaged, invisible to the guard, and nothing reaps it at SessionEnd — it leaks until the box dies.
- A server already running (yours, Arman's, or Codex's) means **reuse it**: point the Browser pane at its port. Stop it first only if genuinely stale.
- Enforced by `~/.claude/hooks/matrx-preview-ports.sh` (`guard` on `preview_start`, `guard-bash` on Bash). `list-any` shows every dev server; `reap` at SessionEnd kills only agent-owned ones, never Arman's.

## THE ONE BROWSER LAW

**Use the in-app Browser pane (`mcp__Claude_Browser__*`). Never `mcp__claude-in-chrome__*`.**

Chrome is Codex's surface — Codex drives Arman's real Chrome `Default` profile (`CODEX_CHROMIUM_PREFERENCES_PATH`), so touching it collides with both Codex and Arman's live session. The Browser pane is a **separate persistent profile** (`~/Library/Application Support/Claude/`) with its own cookie jar: log in once and the session persists across sessions.

## Mechanics that will otherwise waste your turn

- **Every new tab starts at a 0×0 viewport.** `read_page` returns "(empty page)" and screenshots fail until you call `resize_window`. The `desktop` preset resets to *native*, which is also 0×0 — **pass explicit `width`/`height`** (e.g. 1280×800).
- **`computer` (click/type/screenshot) requires the tab to be fronted.** On a background tab it fails with a 30s "Browser pane is currently hidden" timeout. Call `tabs_select` first. `javascript_tool`, `get_page_text`, and `form_input` all work on background tabs.
- **Fill inputs with `form_input`** — it is React-safe and sets controlled state correctly. **`computer type` appends** to existing content and **Backspace does not clear**, so retries silently concatenate (a login fails with a 41-character password and no error).
- **`read_page` before `form_input`/`find`** — refs live in a cache that a navigation or re-render invalidates (`ref map not initialized`). A re-render also **clears already-filled fields**; refill after the page settles.
- **Submit with `form.requestSubmit()`** via `javascript_tool` when a click times out. It triggers React's `onSubmit` with the state `form_input` set.
- **Dev-server first compiles take 45–60s**, longer than the 30s tool timeout. Warm the route with `curl` first, or watch `preview_logs` until compilation finishes, before interacting.
- **`read_network_requests` / `read_console_messages` only capture after the tab is attached.** Reload before relying on them.

## Mobile testing

`resize_window` `preset: "mobile"` gives **375×812 with 5 touch points and mouse-to-touch translation** — verified working, including screenshots. Reload after switching so load-time device gates re-run.

**It emulates Android, not iOS** (UA: `Linux; Android 14; Pixel 8`). iOS-specific UA gating and real `env(safe-area-inset-*)` values do not appear. Verify layout, touch targets, and breakpoints here; verify genuine iOS behavior on a real device.

## Auth

- **Form login (canonical):** `/login` with `admin@admin.com` / `Password1234#`. Persists in the Browser pane profile.
- **Dev auto-login (localhost only):** `http://localhost:<port>/api/dev-login?token=${DEV_LOGIN_TOKEN}&next=/<route>`. Redirects 307 when a session exists. The form login hydrates client data pages more reliably.
