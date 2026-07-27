---
status: active
updated: 2026-07-27
repos: [matrx-frontend]
vision: []   # no standalone vision doc — Arman's words captured verbatim below
---

# Deployment Split — one repo, three Vercel projects (aimatrx.com / manage / demos)

## Vision — Arman's words

The full app OOM'd Vercel's largest build machine; every release was a ~25-minute coin flip. The split ends that by shipping ONE repo as three deployments whose **union is the full app** — a non-full build profile in production is partitioning, never degradation.

- "Keep the repo intact but convert (admin) into a separate build that goes to a subdomain so it works exactly as now but we ship/build it separately. That one doesn't change as often so it can be separated." Same for `(dev)`: "a critical route… something where we don't have to rebuild it each time."
- "If we run it with anything other than 'full' then the moment it lands, we no longer have our demo modules and we no longer have critical things that admins AND USERS need daily." → every route must stay live for every user; only *which deployment serves it* changes.
- "As long as auth works, nothing else matters, because these are all very natural transitions that never share state." → hard navigation between hosts is fine; ONE login must work on every `*.aimatrx.com` host.
- "I don't want admin and demo to constantly rebuild if they don't need to, and I don't want the main app to rebuild if it doesn't need to."
- The Vercel project was renamed `ai-matrx-admin` → `ai-matrx`: "it became our main frontend so it should just be called ai-matrx."
- admin.aimatrx.com is a SEPARATE competing Vite SPA (Coolify): "the two admins are genuinely our admin systems but they're competing to see who wins… if Next.js keeps acting like this it's going to lose completely and get fully replaced by Vite." Never repoint admin. at this repo; the Next admin lives at **manage.**
- On build failures (2026-07-27): "Reverting the code and then using the same pattern throughout the codebase is what lowered build times from 25 minutes to 10 minutes." → the lazy→dynamic sweep revert (v0.4.137) cleared the OOM; the `turbopackMemoryLimit` 40→30GiB change (v0.4.138) landed after green and has NO verified effect. No controlled single-variable experiment ever ran. Do not credit the ceiling in any doc without one.

## Resources

- **Doctrine:** `CLAUDE.md` § "Build gate — one repo, THREE Vercel projects" (profiles, park mechanism, cross-group import ban, release prefixes). Machine-checked by `pnpm check:doc-claims`.
- **Profiles + park machinery:** `next.config.js` (`PROFILES`, `syncRouteGroupPark`, stale-park quarantine, `NEXT_PUBLIC_MATRX_PROFILE` inlining). Env `MATRX_PROFILE` WINS; `FORCE_MATRX_PROFILE` is the unset-env default (null = full, for local dev).
- **Build gating:** `scripts/vercel-ignore-build.sh` (matches commit prefix vs per-project `MATRX_BUILD_TARGET` env). Release targets: `scripts/release.sh --target main|admin|demos|all` (prefixes `release:` / `release-admin:` / `release-demos:` / `release-all:`); `./ship.sh "msg" --target x` passes through.
- **Cross-subdomain auth:** `utils/supabase/authCookie.ts` — cookie `sb-matrx-auth`, `Domain=.aimatrx.com` on apex hosts only. ALL FIVE client sites must pass its options: `utils/supabase/client.ts`, `server.ts`, `middleware.ts`, `debugClient.ts`, `app/auth/callback/admin/route.ts`.
- **Host routing:** `proxy.ts` — `satelliteGate` + main-host handoffs (gated on build-time `NEXT_PUBLIC_MATRX_PROFILE`); `utils/supabase/middleware.ts` `updateSession({ landing })`.
- **Vercel:** team `team_zWxJHqDHuRr1kpl9Hu9oON3g`. Projects: `ai-matrx` (prj_ZIeMm2FW8RgOAO9BJgQ2YQcXpwrH, slim), `ai-matrx-manage` (admin), `ai-matrx-demos` (demos). All three: `buildMachineType: "turbo"`, env-pinned `MATRX_PROFILE` + `MATRX_BUILD_TARGET` for production/preview/development.
- **Test:** log in once at `https://www.aimatrx.com/login` (`admin@admin.com` / `Password1234#`), then verify session carries to `https://manage.aimatrx.com/administration/users` and `https://demos.aimatrx.com/demos`. Cross-host bounces: `www…/administration/*` → manage, `www…/demos/*` → demos, satellite `/chat` → www.

## Remaining work

1. **Supabase auth allowlist for satellites.** Verify (Supabase dashboard → Auth → URL configuration) that `https://manage.aimatrx.com/**` and `https://demos.aimatrx.com/**` are allowed redirect URLs; test an OAuth (Google/GitHub) login started FROM a satellite. Email/password is verified working; OAuth is not.
2. **Satellite env gaps.** `GOOGLE_CLIENT_ID` is absent on both satellites (missing from `.env.local`; Vercel's env API returns ciphertext so it could not be copied — needs Arman to supply the value). `SLACK_REDIRECT_URL` / `NEXT_PUBLIC_SLACK_REDIRECT_URL` on satellites carry localhost values from `.env.local`. Fix in Vercel dashboard per project.
3. **noindex the satellites.** Both compile `sitemap.xml`/`robots.txt` and serve them on their own hosts — duplicate-content SEO risk. Make robots/meta host-aware (disallow all on manage/demos hosts), e.g. in `app/robots.txt` generation or a satellite-host header in `utils/next-config/headers.js`.
4. **Preview deployments have no cross-host auth.** `*.vercel.app` previews aren't same-site with aimatrx.com, so the domain cookie is never set there (by design in `authCookie.ts` — host-only fallback). Either accept (per-host login on previews) or assign preview subdomains under aimatrx.com in Vercel.
5. **ESLint guard for the cross-group import ban.** Parked-profile builds break on any `@/app/(x)` import from outside that group (static OR `import()` — the settings tabs broke this way). Today it's doctrine text only; add an eslint `no-restricted-imports`-style rule (pattern: `@/app/(core|admin|transitional|public|popup)/*` outside its own group) so the class can't return. `(dev)` helper imports are the tolerated exception.
6. **Main-project env purge (needs Arman's go).** `ai-matrx` carries ~100 env rows the codebase never references (Auth0, Clerk, Hume, Yahoo, `SUPABASE_SAMPLE_*`, `*_OLD`…), ~95KB of a grandfathered 148KB. New projects cap at 64KB, so this blocks any future project cloning. Used-key extraction method: grep tracked tree for `process.env.X` / `requireEnv("X")` (see git history of this doc's era for the script).
7. **OOM attribution experiment (optional but valuable).** Baseline fact: slim compile peaked ~49GB locally vs the 60GB turbo machine — permanently marginal. If anyone wants to re-try `turbopackMemoryLimit` tuning or re-litigate the sweep revert, run two Vercel builds of the SAME commit differing in exactly one variable first. Treat build memory as a budget in review.
8. **Doctrinal stragglers (low).** `app/(transitional)/_flash-cards/ai/*` modals are still imported by `components/flashcard-app/*` (cross-group, currently unreachable from parked builds); `features/applet/demo/AppDemoManager.tsx` is dead (zero importers). Move or delete when touching those areas.

## Done

- Three Vercel projects live + verified in production (2026-07-27): slim/aimatrx.com, admin/manage, demos/demos — see `next.config.js` + `proxy.ts`.
- Per-target release + build gating — `scripts/release.sh`, `scripts/vercel-ignore-build.sh`.
- Cross-subdomain auth cookie (forced one-time re-login) — `utils/supabase/authCookie.ts`.
- Cross-group import fixes: flashcard `app-data` → `components/flashcard-app/`, `AutoSubmitForm` → `features/agents/components/`, 5 settings pages → `features/settings/pages/` (thin route wrappers remain).
- 139 stray `(dev)` route leaves renamed to `.dev.tsx` (were compiling into every profile).
- Vercel project renamed `ai-matrx-admin` → `ai-matrx`; satellites on turbo build machines; env provisioned from `.env.local` (57 keys each).

## Decisions needed

- **Situation:** Google OAuth features on manage/demos need `GOOGLE_CLIENT_ID`, which exists only in the main project's Vercel env (unreadable via API) and not in `.env.local`. **Decide:** paste the value into both satellite projects' env (dashboard), or declare Google OAuth main-host-only.
- **Situation:** the main project carries ~100 unused legacy env vars that can't be replicated anywhere and hide the real config. **Decide:** approve deletion of the unused set (list reproducible via the used-key grep), or keep as-is.
