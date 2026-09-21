# Browser testing — the one harness, and its verified mechanics

Every rule here was verified live on 2026-08-09 against production and localhost. Deviating costs you a rediscovery cycle.

## THE ONE DEV SERVER LAW

**One Next dev server, machine-wide** — shared by you, Arman, and Codex. A second one is a reliable hard crash.

**This server is HUGE by nature — measured 2026-08-15: 90.7 GB after compiling `/marketing`, 138.3 GB after adding Chat and the Administration entry.** The host has **256 GB**, so the 192 GB watchdog is a runaway guard with 64 GB reserved for the host, not a working-memory budget. (This line previously claimed the machine had 16 GB — false, and it is why the watchdog was set to 8 GB, which killed the server on EVERY start and made browser verification impossible for every agent. If you change the cap in `scripts/agent-dev-server.sh`, measure first.)

- **Start or reuse it only with `pnpm preview:start`** → port **3001**, distdir `.next-preview`. The command is provider-neutral, detached, and tracked. **It prints YOUR hostname — open that, never `localhost`** (see the next rule).
- 🚨 **ONE SERVER, ONE HOSTNAME PER AGENT SESSION — never open `localhost:3001`.** Cookies are scoped to a HOST and ignore the PORT, so every agent on `localhost` shares one cookie jar: on 2026-09-12 five sessions drove this machine at once and one session's dev-login signed every other session in as somebody else mid-form (the app paused itself with "Account Changed…", which is correct, and cost that agent its typed form). `pnpm preview:start` / `pnpm preview:status` now print a URL like `http://s3f1eb9c52.localhost:3001` — your session's own label. `*.localhost` is loopback by definition (no `/etc/hosts` entry, verified on this host), browsers treat each label as its own origin, and the app declares `*.localhost` in `allowedDevOrigins`, so it is the same server with your own cookie jar, storage and dev-login nonce. Name your session deliberately with `MATRX_PREVIEW_SESSION=<name>`; if nothing names it, the start banner says out loud that the label came from the checkout path and could collide. Forcing proof: `pnpm check:preview-session` (it runs the leaky configuration in the same pass, so a green result means something). Mechanics: `scripts/agent-harness/preview-session.sh`.
- **The slot is taken? Read what it says.** A dev server already serving THIS checkout is no longer a refusal — the harness names the owning session and pid and hands you your own hostname on its port. Only an occupant in a DIFFERENT checkout is refused, because its compiled code is not your diff.
- 🚨 **Whole route GROUPS 404ing? Check the active profile and managed cache before changing routes.** Measured 2026-08-25: every `(core)` route — `/marketing/*`, `/organizations/*` — returned 404 while `/dashboard` (transitional) returned 200, for every session sharing the server, and a plain stop/start did NOT fix it (the script preserves the build cache on purpose). After coordinating with any active owner, run `pnpm preview:stop`, move `.next-preview` into a directory created by `mktemp -d` under the system temp directory, then run `pnpm preview:start`. **Stop FIRST**: moving the cache under a running server leaves it serving `ENOENT ... routes-manifest.json` 500s to everyone. Retaining the old cache also permits inspection without a force-delete command. Check a route from another included group first. If profile/cache recovery does not resolve it, inspect the actual route and build error; a 404 alone does not establish the cause.
- **Unstyled localhost while source and production are correct?** On 2026-09-09 the managed preview returned CSS with HTTP 200 but its `app/globals.css` chunk held package rules and no Tailwind utilities. Check the emitted stylesheet content, not just its status or a DOM `link.sheet` property. First let active dependency installs finish and use the managed stop/start lifecycle. If output remains stale, move the stopped-server cache as above. In this run cache rebuilding during dependency adoption hit a PostCSS `leaves the filesystem root` panic; a managed restart after adoption recovered full styles. The exact compiler cause was not established. Verify computed styles and the original interaction; do not rewrite correct application CSS or widen the bundler root to compensate for an unproven cause.
- **It runs `MATRX_PROFILE=core`** — `(core)` + `(admin)` + `(transitional)` + `(public)`. `(dev)`/`/demos/*` routes are **parked** and will 404. To verify a demo: `MATRX_PREVIEW_PROFILE=user pnpm preview:start`. The active profile is printed on every start.
- **Never use named `preview_start` or raw `pnpm dev` / `npm run dev`.** Those paths create untracked server trees.
- A running server (Arman's, Claude's, or Codex's) is **reused**, never duplicated. `pnpm preview:status` shows the process; `pnpm preview:stop` stops the managed preview.
- **A live preview warns; it does not stop a primary install script** (September 21 ruling, implemented in `scripts/agent-harness/install-gate.cjs`). The pre-link `.pnpmfile.cjs` gate announces that `install`, `add`, `remove`, or `update` may interrupt every session using the shared preview. `MATRX_STRICT_INSTALL_GATE=1` explicitly opts into refusal; do not silently bypass that setting. Concurrent installs remain serialized. `pnpm install --lockfile-only` does not relink packages. After an install, inspect `pnpm preview:status`; if the preview died, recover with `pnpm preview:start`. A changed-node_modules failure is announced in the log and lease as `NODE_MODULES_CHANGED`. This risk is real: a September 12 relink briefly hid the design-system package from 1,268 imports, and the resulting error storm ended with `RangeError: Invalid string length`. The current warning policy supersedes the earlier blanket refusal; it does not make a live-relink browser result valid. Re-run any interrupted interaction after recovery. The dev log remains capped by `MATRX_PREVIEW_MAX_LOG_GB` (default 2 GB), with announced rotation.
- A watchdog stop is **loud**: the reason is appended to the dev log and printed
  by both `pnpm preview:status` and the next `pnpm preview:start`.
- The install gate's forcing proof runs real pnpm in a throwaway checkout: `pnpm check:install-gate:self-test` (it also proves the retired `preinstall` wiring failing).
- `pnpm setup:agent-harness` installs Claude/Codex guards. Codex requires one trust review for a new or changed hook via `/hooks`; this trusts the guard, not each server launch.

### From a private worktree

Verifying a diff you did not check out into `/home/user/ai-matrx` itself (a `git worktree add` in `/tmp` or your scratchpad) needs three things beyond the ordinary flow above — all three cost V-22 an hour (NEW-15) before they were fixed into the launcher and documented here:

1. **`git worktree add` never creates `node_modules` at all** — it is gitignored, so there is nothing to check out; a fresh worktree's `node_modules` is ABSENT, not a symlink (a symlink only shows up if something put one there by hand). Running `pnpm install` in the worktree to fix that is worse than the missing-deps error: every `@ai-matrx/*` package and `next`/`react`/`typescript` is declared `latest`, so an install there resolves a DIFFERENT dependency tree than the one under test. `pnpm preview:start` now detects both the absent case and the (rarer) symlink-to-the-primary-checkout case — the symlink one Turbopack also refuses to serve directly, with "Symlink `[project]/node_modules` is invalid" — and in either case replaces it with a same-device hard-link copy (`cp -al`, seconds, no extra disk) of the PRIMARY checkout's `node_modules` before starting Next. A worktree that already has a real `node_modules` directory (yours, or one this same step already fixed) is left untouched. It announces what it found and what it did in every case; you do not need to do this by hand.
2. **`pnpm dev-login`'s OTP fallback needs `HTTPS_PROXY` to actually route through the proxy.** On a sandboxed host that only reaches the internet through `HTTPS_PROXY`, Node's own `fetch` (undici) ignores that variable unless `NODE_USE_ENV_PROXY=1` is set — without it the dev server's `/api/dev-login` OTP fallback fails with `OTP fallback failed: ... "Host not i[n allowlist]"`. `pnpm preview:start` now sets `NODE_USE_ENV_PROXY=1` on the Next process itself whenever `HTTPS_PROXY`/`https_proxy` is present in your shell, and says so in its start banner — nothing to do by hand.
3. **A headless browser needs the egress proxy's CA trusted, never a blanket TLS disable.** Derive the known interception CAs' SPKI hashes from the sandbox's CA bundle and pass them to Chromium's allowlist flag — never `--ignore-certificate-errors` or an equivalent blanket disable:
   ```
   openssl crl2pkcs7 -nocrl -certfile /root/.ccr/ca-bundle.crt \
     | openssl pkcs7 -print_certs \
     | awk 'BEGIN{c=""} /BEGIN CERTIFICATE/{c=""} {c=c $0 "\n"} /END CERTIFICATE/{print c > ("/tmp/ca-" NR ".pem")}'
   for f in /tmp/ca-*.pem; do
     openssl x509 -in "$f" -pubkey -noout \
       | openssl pkey -pubin -outform der \
       | openssl dgst -sha256 -binary | openssl base64
   done
   ```
   Join the resulting hashes with `,` and launch Chromium with `--ignore-certificate-errors-spki-list=<hash1>,<hash2>,...` (`playwright install chromium` first if it is not already downloaded).

Then open **only the printed `http://<your-session>.localhost:3001` hostname** (see the cookie-jar rule above) — never bare `localhost`, and never Arman's own browser.

## THE ONE BROWSER LAW

**Use your own isolated browser for ordinary browsing and every application test**, preferably the provider's separate in-app Browser. Use the available tool's documented API; Computer Use is allowed when it controls the isolated browser. A missing older skill or API is not a reason to stop when another agent-owned browser harness is available.

**Never use the user's browser as a testing or availability fallback.** A matching URL, a signed-in user session, an unavailable isolated browser, or convenience is not authorization. If the isolated browser cannot complete a test, use another agent-owned harness or report the blocker. Matrx UI verification always uses the isolated browser with the authorized `admin@admin.com` test identity; it never borrows the user's Matrx session.

**The user's browser is reserved for work that must be done ON THE USER'S BEHALF in the user's personal identity**, such as reading the user's email or managing an account specifically as the user. Before using it even then, check whether approved access can be completed in the isolated browser through AI Matrx Vault values, a brokered integration, or other agent-owned credentials; prefer that route. Use the user's browser only when the current request explicitly or inherently places that personal identity/session in scope. Otherwise ask before opening it. Permission never carries between tasks, accounts, browsers, or tabs.

When behalf-only browser use is authorized and unavoidable, open a new tab. Never navigate, control, or close a tab the user is using. Close only the tabs/groups you create when finished; leave pre-existing tabs/groups untouched.

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
- **Dev auto-login (loopback only) — the nonce handshake, the ONLY way in.** Run **`pnpm dev-login /<route>`** in a shell in this checkout and open the URL it prints. It mints the nonce into `.dev-login-nonce.<your hostname>` (gitignored) and builds the URL on YOUR session hostname. Redirects 307, back to the same host it was called on — never rewritten to `localhost`, which would drop you into the shared jar. **The nonce is per hostname** (2026-09-12): with one shared `.dev-login-nonce`, any agent's failed navigation consumed the nonce another agent had just minted and that agent's sign-in failed for reasons nothing on its screen explained. A hand-written `openssl rand -hex 16 > .dev-login-nonce` is the old shared file and no host reads it; the 401 names the exact file for your host. The file is consumed by that one request — match or mismatch — so the nonce is worthless by the time anything logs it. The old `?token=$DEV_LOGIN_TOKEN` path was REMOVED (it now 401s with this recipe): a durable credential in a URL lands in browser history, dev-server logs and agent transcripts, and leaked exactly that way on 2026-08-31 and again on 2026-09-11.

### No org is off-limits — verify the site the task NAMES

`admin@admin.com` is a **super_admin**, so `public.is_platform_admin()` is the first clause of every `std_select` and every guard: it reaches **every organization's data**, including orgs it holds no membership in. There is no "site an agent cannot verify" — never substitute a site you can already see for the one you were asked about.

**Arman's most-discussed site is All Green Recycling** — `allgreenrecycling.com`, site `d0aff5b6-0710-4848-8304-164db3c80ab7`, brand `c2db36a1-15b5-4717-b8d6-161600aa5db7`, org `5dc930e9-…` (the CRM org). Verified 2026-08-23: it lists at `/marketing/brands` and its workbench renders 27,172 live keywords. "When I look at all green electronics recycling" means **this** site, not Data Destruction.

🚨 **A `*_denied` 42501 on a site you can reach as a platform admin is a DEFECT in the guard, not a permission you lack.** A `SECURITY DEFINER` fast-path guard may never be stricter than the RLS policy it stands in for — db-rules §6: over-tightening is a defect, and access never depends on the active org. Fix the guard to mirror the table's first clause (worked example: [`migrations/seo_gsc_asserts_match_table_policy.sql`](../../migrations/seo_gsc_asserts_match_table_policy.sql)). Never widen an account's org membership to route around it.
