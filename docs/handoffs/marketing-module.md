---
status: active
updated: 2026-07-27
repos: [matrx-frontend]
vision: [features/marketing/FEATURE.md, .claude/skills/module-landing-pages/SKILL.md, lib/coming-soon/FEATURE.md]
---

# Marketing module — consolidation and build-out

You are picking up a module that was **structurally repaired and then given its
full intended shape**. The repair is shipped and verified in production. The
shape is declared and reserved; most of it is not built. This document is
everything you need — no other context exists.

---

## 1. Vision

### 1.1 The original problem (Arman's words)

> "We need to quickly fix some major routing problems that have developed lately
> as agents have decided to start sticking everything to the base route of our
> system. And that's just not the way things work. The two biggest massive
> violations of this are the content plan route and the SEO route, which are both
> clearly part of marketing, but they have now been added as root level routes,
> and that's a disaster waiting to happen."

Two root-level routes — `/content-plan` and `/seo/keyword-research` — were
marketing features squatting the app's top-level namespace.

**Why this matters (the reasoning, not just the rule):** the app root is a
finite, shared namespace. Every feature that claims a top-level segment makes
the next feature's naming harder and hides itself from the module it belongs
to. Worse, a root route has no owner: it inherits no module layout, no module
nav, no module docs, and no module auth posture. The feature fragments — which
is exactly what happened, and why keyword research sat invisible to anyone who
did not already know the URL.

### 1.2 The second, subtler problem — first-built bias

> "Ensure that all of the base routes for marketing are truly part of the base,
> and we haven't overly emphasized one system over others. as is often the case
> with coding agents when they're dealing with the first task. And in this case,
> websites were the first thing we did. So there's a possibility that they've
> massively overemphasized websites and ignored other things."

This was correct. `/marketing` was literally `redirect("/marketing/brands")` —
the module's front door went straight into the websites vertical, so websites
*were* the feature as far as any user or agent could tell.

Arman named the specific casualties: **SEO and keywords**, **content planning**,
**the public utilities** ("a metadata checker and possibly a few other things"),
and asked to check for **"a search engine, or something like that."**

He also asked for **"proper structure in the app's main menu to ensure full end
to end clean structured setup for this major feature 'marketing'."**

### 1.3 Refinements Arman added later (call-outs — do not lose these)

1. **Build it like Education and Legal.**
   > "Fully and properly set up the marketing pages so that the entire system is
   > properly set up, just like the knowledge/education module and the legal
   > module."

   Those two modules are the house reference for a *complete* module: a public
   marketing landing on the same URL as the workspace, a real hub, and reserved
   sub-routes for what is not built yet.

2. **Build for the future, with visible placeholders.**
   > "The key is to BUILD for the future, just like legal and education. We need
   > placeholders for the features we don't have yet with 'coming soon' on them."

   **Why:** a placeholder is not a stub — it is a public commitment. It shows the
   user where the product is going, and it makes the engineering debt visible
   instead of tribal. This is the same philosophy as `lib/coming-soon/FEATURE.md`
   ("a promise we made, tracked like a defect").

3. **Look at what the best marketing platforms have.** The reserved pillar set
   below is drawn from the categories HubSpot / Semrush / Ahrefs / Sprout /
   Mailchimp treat as table stakes, plus AI Visibility as the 2026-native one.

4. **CORRECTION — the scraper is NOT part of marketing.**
   > "The scraper is NOT part of marketing."

   This overturned an open question raised earlier in the work (whether
   `/scraper/search` and `/scraper/search-and-scrape`, a keyword→SERP search UI,
   should be promoted into Marketing). **Ruling: no.** `features/scraper/` is
   shared platform infrastructure that Marketing's crawler borrows. Do not move
   it in; do not fork a second crawler inside Marketing. This is the "search
   engine" Arman asked us to look for — it was found, evaluated, and
   deliberately left where it is.

### 1.4 The resulting doctrine

- Marketing is a **multi-pillar module**. Websites is one pillar of eight, the
  largest but not the most important.
- **No marketing surface gets a root-level route**, ever.
- **`/seo/*` is permanently reserved for the `(public)` route group** — the
  anonymous lead-gen analyzers. Never add an authed `/seo/*` route.
- **The module's shape is declared exactly once** and every surface that renders
  a map of it reads that declaration. Hand-maintaining a second copy is how the
  original divergence happened.
- **A reserved route is a real route at its permanent URL.** When the feature
  ships, the URL does not move.

---

## 2. Current state — gap analysis

### 2.1 Done and verified

| Area | Evidence |
| --- | --- |
| `/content-plan` → `/marketing/content-plan` (308 permanent) | `next.config.js`; verified live on `www.aimatrx.com` |
| `/seo/keyword-research` → `/marketing/keyword-research` (308) | same |
| `features/content-plan/` → `features/marketing/content-plan/` | ~50 import sites updated |
| `features/seo/` → `features/marketing/seo/` | same; `(core)/seo` directory deleted entirely |
| `/marketing` is a real multi-pillar hub, not a redirect | `app/(core)/marketing/page.tsx` + `features/marketing/components/MarketingHub.tsx` |
| Single-source structure | `features/marketing/lib/marketing-nav.ts` (`MARKETING_PILLARS`) |
| Shell sidebar GENERATED from that source | `marketingNavChildren()` in `features/shell/constants/nav-data.ts` — 26 children in 9 pillar subgroups |
| Reserved-route metadata GENERATED from that source | `RESERVED_ROUTES` in `features/marketing/lib/route-metadata.ts` |
| 16 reserved routes render + return 200 | `app/(core)/marketing/{campaigns,calendar,audience,local,ranks,ai-visibility,content-studio,social,email,ads,outreach,competitors,monitoring,analytics,reports,automations}/page.tsx` |
| All 16 promises tracked | 16 `marketing.*` rows in `lib/coming-soon/registry.ts` |
| Public `/marketing/tools` index of the 5 public analyzers | `app/(core)/marketing/tools/page.tsx` |
| Guest landing on ANY `/marketing/*` URL, no login wall | `app/(core)/marketing/layout.tsx` server branch → `MarketingLanding` |
| Landing registered on `/features` | `MODULE_LANDING_DIRECTORY` |
| Landing sub-areas GENERATED from the same source | `listMarketingLandingAreas()` — status derived from whether a pillar has any live entry; href prefers a built surface |
| Admin map covers all 16 reserved routes | `app/(core)/marketing/admin/page.tsx` |

**Deployed:** everything in §2.1 through the "Done" line of the first commit is
live in production. The build-out (reserved routes, landing, generated nav) is
committed on `main` — **check `git log` and Vercel to confirm it deployed**; see
§5 gotcha 1.

### 2.2 Partial — started, specifically unfinished

1. **`/marketing/tools` and `/seo` (the public hub page) are two indexes of the
   same five analyzers.** `app/(public)/seo/page.tsx` has its own hand-written
   list. Collapse `(public)/seo/page.tsx` onto `MARKETING_PUBLIC_TOOLS` from
   `marketing-nav.ts`.

2. **Rank tracking exists per-site, not cross-site.**
   `features/marketing/components/ranks/` + the per-site route are live under a
   brand. `/marketing/ranks` (the cross-brand hub) is reserved. Building it is
   mostly aggregation over data that already exists — the cheapest reserved
   route to ship, and a good first task.

3. **No surface manifests for the reserved routes.** Live Marketing surfaces are
   registered in `features/surfaces/manifests/` so agents know what page they are
   on. Reserved routes have none. Correct for now (nothing to declare), but the
   surface manifest is part of "done" for each one — see
   `.claude/skills/surface-authoring`.

### 2.3 Not started

Everything behind the 16 promises. **No database schema exists for any of them** —
no campaign table, no social account table, no email list, no ad connection, no
competitor registry. Each will need a migration, and the schema is the real work;
the routes and nav are already waiting.

Read the exact user-facing promise for each in `lib/coming-soon/registry.ts` —
that text is the spec, and it is what the user has already been shown.

### 2.4 Known issues and risks

1. **`pnpm type-check` was NOT globally green when this was written.** Residual
   errors live in `features/cms/agent-context/buildCmsSiteContextData.ts` and
   `features/html-pages/` — files a **concurrent session was actively editing**
   while this work happened. Zero errors were in Marketing files (verified across
   three separate passes, scoped to `features/marketing`, `app/(core)/marketing`,
   `features/shell`, `features/auth`, `lib/coming-soon`). **Re-run
   `pnpm type-check` yourself before assuming anything.**

2. **This repo has multiple agents working simultaneously.** During this work
   another session renamed a function inside a file mid-edit
   (`buildCmsHubContextData.ts`). Before a large sweep, check `git status` for
   files you do not own, and prefer additive files over broad rewrites.

3. **Legacy site URL shim.** `/marketing/sites/[siteId]/**` client-redirects to
   the canonical brand-nested `/marketing/brands/[brandId]/sites/[siteId]/**`.
   It is deliberate (rows carrying only `site_id` link there). Do not "clean it
   up."

4. **Two banned Lucide icons bit this work:** `Bot` and `Sparkles` are blocked by
   `matrx/no-banned-lucide-icons`, and `Youtube` no longer exists in lucide at
   all (brand icons were removed — it is aliased to `Video` in
   `MarketingHub.tsx`'s ICONS map). Run eslint on any file where you add an icon.

5. **`MarketingComingSoon` throws by design** if a route's id is missing from
   either `MARKETING_PILLARS` or the coming-soon registry. That is the guard, not
   a bug — it prevents a convincing-looking stub with no tracked promise.

6. **Open product question for Arman (not blocking):** Content Plan → CMS is an
   undocumented seam. `/marketing/content-studio` is reserved as the production
   lane between them, but whether drafts live in `features/cms` or in a new
   marketing table is his call, not an agent's.

---

## 3. Architecture and orientation

### 3.1 The one file that matters

`features/marketing/lib/marketing-nav.ts` — `MARKETING_PILLARS` is the module's
shape. Four surfaces read it:

```
marketing-nav.ts  (MARKETING_PILLARS)
   ├── app/(core)/marketing/page.tsx      → MarketingHub.tsx      (the hub)
   ├── app/(core)/marketing/tools/page.tsx→ MarketingHub.tsx      (public tools)
   ├── features/shell/constants/nav-data.ts → marketingNavChildren() (sidebar)
   ├── features/marketing/lib/route-metadata.ts → RESERVED_ROUTES  (titles/OG)
   └── .../module-landing/landings/MarketingLanding.tsx → listMarketingLandingAreas()
```

**Adding a surface = one edit here.** It then appears in all five places, and a
pillar's public status cannot be overstated: `listMarketingLandingAreas()`
derives "Live" vs "Coming soon" from whether any entry is actually built.

### 3.2 Route layout

```
app/(core)/marketing/
  layout.tsx          ← guest/authed branch + metadata for the whole module
  page.tsx            ← the hub (list view of all pillars)
  admin/              ← /marketing/admin resource map
  brands/ sites/      ← LIVE: the websites vertical (largest area by far)
  content-plan/ keyword-research/ discovery/ tools/ connections/ batches/ cost/
  campaigns/ calendar/ audience/ local/ ranks/ ai-visibility/
  content-studio/ social/ email/ ads/ outreach/
  competitors/ monitoring/ analytics/ reports/ automations/   ← 16 RESERVED
```

Every reserved route file is 3 lines:
```tsx
export default function Page() {
  return <MarketingComingSoon comingSoonId="marketing.campaigns" />;
}
```

### 3.3 Feature layout

```
features/marketing/
  lib/marketing-nav.ts        ← THE structure
  lib/routes.ts               ← marketingRoutes — never hand-build a /marketing URL
  lib/route-metadata.ts       ← per-route title/description/favicon letter
  components/MarketingHub.tsx        ← renders pillars (client)
  components/MarketingComingSoon.tsx ← THE reserved-route body (server)
  components/                 ← the websites vertical (brands, crawls, pages, audit…)
  content-plan/               ← editorial plan tree (moved 2026-07-25)
  seo/                        ← serp, audit, keyword-research, social, rank, dataforseo
  google/ bing/ crawler/ pagespeed/ analytics/ data/
```

Public analyzers stay at `app/(public)/seo/{metadata,page-audit,social-preview,structured-data,robots-tester}`
and read from `features/marketing/seo/`.

### 3.4 Related systems you will touch

| Need | Read first |
| --- | --- |
| Marketing rules + pillar table | `features/marketing/FEATURE.md` |
| Reserved/coming-soon contract | `lib/coming-soon/FEATURE.md` |
| Guest vs authed on a feature URL | `.claude/skills/module-landing-pages` |
| Registering a page for agents | `.claude/skills/surface-authoring` |
| `(core)` header + body height rules | `features/shell/components/header/variants/USAGE.md` |
| DB truth (`web.*` schema) | `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md` |

### 3.5 Testing

Log in at `/login` with `admin@admin.com` / `Password1234#`. Start a dev server
with the Browser pane (`preview_start` → `next-dev`), never `pnpm dev` in a shell.
Check `pnpm dev:status` first — several servers usually run already.

---

## 4. Next steps, in order

1. **Re-run `pnpm type-check` and confirm production deployed.** Both were
   affected by concurrent sessions (§2.4.1, §5.1). Do this before anything else.

2. **Collapse the duplicate tool index (§2.2.1).** Point
   `app/(public)/seo/page.tsx` at `MARKETING_PUBLIC_TOOLS`.

3. **Ship `/marketing/ranks` (cross-site rank tracking).** The cheapest reserved
   route — the data already exists per-site under a brand. Aggregate it, delete
   `marketing.rank-tracking` from the registry, drop `status` from its nav entry.
   This is the reference implementation for "how we ship a reserved route."

4. **Then `/marketing/campaigns`.** It is the highest-leverage reserved surface
   because every other channel (social, email, ads, outreach) reports into it —
   building the campaign entity first prevents four incompatible designs. Needs a
   migration; ask Arman before designing the schema.

5. **`/marketing/analytics` and `/marketing/reports`.** Both read from providers
   already bound in `/marketing/connections` (GSC, GA4, Bing) — no new
   integrations, mostly aggregation and layout. `reports` is the agency
   deliverable and probably the highest perceived value per hour of work.

Everything else is a genuine greenfield build; take them in whatever order Arman
prioritizes.

---

## 5. Gotchas

1. **Pushed ≠ deployed — verify against Vercel's deployment list, not `git push`.**
   This repo takes commits from many concurrent agent sessions, often minutes
   apart. Vercel **cancels the in-flight production build whenever a newer
   commit lands**, and a build takes 10–25 minutes. When the push rate exceeds
   the build time, *no* build completes and production silently freezes on the
   last one that survived — every later commit shows as `CANCELED`.

   Observed on 2026-07-27: production sat on `release: v0.4.166` while six
   consecutive deployments (including `b97f5dcc2`, the landing-derivation fix)
   were canceled in a row. Separately, `release: v0.4.161` ended in `ERROR` —
   its content only reached production several releases later via a descendant.

   **So:** a green `git push` proves nothing. Check the deployment list
   (Vercel MCP `list_deployments`, project `prj_ZIeMm2FW8RgOAO9BJgQ2YQcXpwrH`,
   team `team_zWxJHqDHuRr1kpl9Hu9oON3g`) and confirm a `READY` deploy whose
   commit is your commit or a descendant of it. Then hit
   `https://www.aimatrx.com` (note: `aimatrx.com` 308s to `www`) and assert on a
   string that exists ONLY in your new build — picking a marker the old build
   also contained will report a false success.

2. **Never move a reserved URL.** Its permanence is the promise. If a name is
   wrong, change the label — not the href.

3. **Never render a bare "coming soon" string.** Register it, then use the
   registry. An unregistered id throws in development, on purpose.

4. **`/marketing` must never redirect.** That single line is what caused the
   entire websites over-emphasis this work existed to undo.

5. **Do not add a route to `requiresAuth` in `utils/supabase/middleware.ts`** to
   "protect" a marketing surface. Guests must always get a rendered page. Protect
   at the resource level.

6. **The scraper is out of scope.** Settled by Arman (§1.3.4). If you find
   yourself moving `features/scraper/` or writing a second crawler, stop.

7. **`pnpm check:page-headers` reports pre-existing failures** in `(dev)` and
   `(public)` routes. Those are not yours; `(public)` routes do not use AppShell
   at all. Only act on `(core)` findings.

8. **Marketing FEATURE.md is large and actively edited by other sessions.**
   Append to the change log; do not restructure it in a drive-by.
