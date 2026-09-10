# Browser testing — the one harness, and its verified mechanics

Every rule here was verified live on 2026-08-09 against production and localhost. Deviating costs you a rediscovery cycle.

## THE ONE DEV SERVER LAW

**One Next dev server, machine-wide** — shared by you, Arman, and Codex. A second one is a reliable hard crash.

**This server is HUGE by nature — measured 2026-08-15: 90.7 GB after compiling `/marketing`, 138.3 GB after adding Chat and the Administration entry.** The host has **256 GB**, so the 192 GB watchdog is a runaway guard with 64 GB reserved for the host, not a working-memory budget. (This line previously claimed the machine had 16 GB — false, and it is why the watchdog was set to 8 GB, which killed the server on EVERY start and made browser verification impossible for every agent. If you change the cap in `scripts/agent-dev-server.sh`, measure first.)

- **Start or reuse it only with `pnpm preview:start`** → port **3001**, distdir `.next-preview`. The command is provider-neutral, detached, and tracked.
- 🚨 **Whole route GROUPS 404ing? Check the active profile and managed cache before changing routes.** Measured 2026-08-25: every `(core)` route — `/marketing/*`, `/organizations/*` — returned 404 while `/dashboard` (transitional) returned 200, for every session sharing the server, and a plain stop/start did NOT fix it (the script preserves the build cache on purpose). After coordinating with any active owner, run `pnpm preview:stop`, move `.next-preview` into a directory created by `mktemp -d` under the system temp directory, then run `pnpm preview:start`. **Stop FIRST**: moving the cache under a running server leaves it serving `ENOENT ... routes-manifest.json` 500s to everyone. Retaining the old cache also permits inspection without a force-delete command. Check a route from another included group first. If profile/cache recovery does not resolve it, inspect the actual route and build error; a 404 alone does not establish the cause.
- **Unstyled localhost while source and production are correct?** On 2026-09-09 the managed preview returned CSS with HTTP 200 but its `app/globals.css` chunk held package rules and no Tailwind utilities. Check the emitted stylesheet content, not just its status or a DOM `link.sheet` property. First let active dependency installs finish and use the managed stop/start lifecycle. If output remains stale, move the stopped-server cache as above. In this run cache rebuilding during dependency adoption hit a PostCSS `leaves the filesystem root` panic; a managed restart after adoption recovered full styles. The exact compiler cause was not established. Verify computed styles and the original interaction; do not rewrite correct application CSS or widen the bundler root to compensate for an unproven cause.
- **It runs `MATRX_PROFILE=core`** — `(core)` + `(admin)` + `(transitional)` + `(public)`. `(dev)`/`/demos/*` routes are **parked** and will 404. To verify a demo: `MATRX_PREVIEW_PROFILE=user pnpm preview:start`. The active profile is printed on every start.
- **Never use named `preview_start` or raw `pnpm dev` / `npm run dev`.** Those paths create untracked server trees.
- A running server (Arman's, Claude's, or Codex's) is **reused**, never duplicated. `pnpm preview:status` shows the process; `pnpm preview:stop` stops the managed preview.
- A watchdog stop is **loud**: the reason is appended to the dev log and printed
  by both `pnpm preview:status` and the next `pnpm preview:start`.
- `pnpm setup:agent-harness` installs Claude/Codex guards. Codex requires one trust review for a new or changed hook via `/hooks`; this trusts the guard, not each server launch.

## THE ONE BROWSER LAW

**Use your own isolated browser first**, preferably the provider's separate in-app Browser. Use the available tool's documented API; Computer Use is allowed, including for controlling the isolated browser. A missing older skill or API is not a reason to stop when another available tool can open it.

**If your isolated browser cannot complete the task, use the user's browser in a new tab.** This includes a required account signed in only there or an unavailable isolated browser. The fallback is pre-authorized; no additional permission is needed just to switch browsers. Never navigate, control, or close a tab the user is using. Close only the tabs/groups you create when finished; leave pre-existing tabs/groups untouched.

**Claude mechanics below apply to the Claude Browser pane.** Codex agents use the available browser tool's own instructions; do not require a particular plugin name or Node-REPL bootstrap.

## Mechanics that will otherwise waste your turn

- **Every new tab starts at a 0×0 viewport.** `read_page` returns "(empty page)" and screenshots fail until you call `resize_window`. The `desktop` preset resets to *native*, which is also 0×0 — **pass explicit `width`/`height`** (e.g. 1280×800).
- **`computer` (click/type/screenshot) requires the tab to be fronted.** On a background tab it fails with a 30s "Browser pane is currently hidden" timeout. Call `tabs_select` first. `javascript_tool`, `get_page_text`, and `form_input` all work on background tabs.
- **Fill inputs with `form_input`** — it is React-safe and sets controlled state correctly. **`computer type` appends** to existing content and **Backspace does not clear**, so retries silently concatenate (a login fails with a 41-character password and no error).
- **`read_page` before `form_input`/`find`** — refs live in a cache that a navigation or re-render invalidates (`ref map not initialized`). A re-render also **clears already-filled fields**; refill after the page settles.
- **Submit with `form.requestSubmit()`** via `javascript_tool` when a click times out. It triggers React's `onSubmit` with the state `form_input` set.
- **Dev-server first compiles take 45–60s**, longer than the 30s tool timeout. Warm the route with `curl` first, or watch `preview_logs` until compilation finishes, before interacting.
- **`read_network_requests` / `read_console_messages` only capture after the tab is attached.** Reload before relying on them.

## Mobile testing (Claude Browser pane)

`resize_window` `preset: "mobile"` gives **375×812 with 5 touch points and mouse-to-touch translation** — verified working, including screenshots. Reload after switching so load-time device gates re-run.

**It emulates Android, not iOS** (UA: `Linux; Android 14; Pixel 8`). iOS-specific UA gating and real `env(safe-area-inset-*)` values do not appear. Verify layout, touch targets, and breakpoints here; verify genuine iOS behavior on a real device.

## Auth

- **Canonical admin credentials:** `AI_ADMIN_USERNAME="admin@admin.com"` and `AI_ADMIN_PASSWORD="<see AI_ADMIN_PASSWORD in .env>"`.
- **Form login:** open `/login` and use those values. The session persists in that browser profile and hydrates client data pages more reliably.
- **Dev auto-login (localhost only):** set both admin variables plus `DEV_LOGIN_TOKEN`, then open `http://localhost:<port>/api/dev-login?token=${DEV_LOGIN_TOKEN}&next=/<route>`. Redirects 307 when a session exists.

### No org is off-limits — verify the site the task NAMES

`admin@admin.com` is a **super_admin**, so `public.is_platform_admin()` is the first clause of every `std_select` and every guard: it reaches **every organization's data**, including orgs it holds no membership in. There is no "site an agent cannot verify" — never substitute a site you can already see for the one you were asked about.

**Arman's most-discussed site is All Green Recycling** — `allgreenrecycling.com`, site `d0aff5b6-0710-4848-8304-164db3c80ab7`, brand `c2db36a1-15b5-4717-b8d6-161600aa5db7`, org `5dc930e9-…` (the CRM org). Verified 2026-08-23: it lists at `/marketing/brands` and its workbench renders 27,172 live keywords. "When I look at all green electronics recycling" means **this** site, not Data Destruction.

🚨 **A `*_denied` 42501 on a site you can reach as a platform admin is a DEFECT in the guard, not a permission you lack.** A `SECURITY DEFINER` fast-path guard may never be stricter than the RLS policy it stands in for — db-rules §6: over-tightening is a defect, and access never depends on the active org. Fix the guard to mirror the table's first clause (worked example: [`migrations/seo_gsc_asserts_match_table_policy.sql`](../../migrations/seo_gsc_asserts_match_table_policy.sql)). Never widen an account's org membership to route around it.
