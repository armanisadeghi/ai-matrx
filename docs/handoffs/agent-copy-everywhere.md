---
status: active
updated: 2026-08-15
repos: [matrx-frontend]
vision: [.claude/skills/agent-copy/SKILL.md, components/agent-copy/README.md]
---

# Agent-copy everywhere — copy / JSON / Copy-for-AI / export on every data surface

**State: the platform is DONE; the rollout is ~1/3 of the app.** Every primitive, doctrine, and integration exists and is proven on real pages. What remains is applying it, cluster by cluster, plus three design-gated roadmap steps that are Arman's call. Nothing here is blocked on engineering discovery.

## Vision — Arman's words

> "Our entire application is highly AI driven. And so having copy icons everywhere and copy for AI icons everywhere is an absolute must."

> "We should never display any data where we don't properly allow the user to copy individual parts, individual lines, individual entries, or all of them as a whole and then have the copy for AI icon, which also provides XML-ish style formatting to make it easy for pasting directly to AI."

> "Each card and each item needs a normal copy as well as the for-AI. The table needs more than just that and then the window panel will definitely need more. And then you need one for the entire page and that's where you get into needing to render a dedicated window panel for grooming the AI copy with different variations and some automated options to reduce the size but where you know it's OK to cut."

Doctrine he added along the way, each with its why:

- **A Copy-for-AI control is sometimes a MENU, not a button** — "a proper copy for AI button is sometimes not just a button, but a menu, and then a popover that comes up that gives the user multiple different options." Sized to the data; the aidream admin console was the reference.
- **Truncated lists must offer the rest.** "We're only showing the top 8. But what if the user wants to see the rest of it?" → agents are expected to *notice* this class themselves.
- **Export is mandatory.** "There's no export feature. And if there's no export feature, then it's just text that's sitting here."
- **Copy as JSON** joins the flavors, wherever data is structured.
- **UI integrity is part of the job.** Titles in user words ("Backlinks", never "stored backlink rows"); counts never in prime real estate pushing the search; copy icons share existing rows instead of spawning their own. "Be on the lookout for things like that always."
- **The Groomer window is a reusable primitive**, not a backlinks feature.
- **The skill must be Sonnet-executable** — fleets run on Sonnet to prove the skill carries the quality. (Proven repeatedly; one Sonnet agent found a truncation gap unprompted.)
- **Do not merge this skill with `surface-authoring`** — they cross-point instead.

## Resources

- **Doctrine + how-to (read first):** `.claude/skills/agent-copy/SKILL.md` (carries the sized-to-data table and the module-audit protocol), `components/agent-copy/README.md`.
- **Primitives:** `components/agent-copy/` — `CopyButtons.tsx` (xs/icon/sm, `json`, `aiVariants`, `aiCustom`) · `AiCopyMenu.tsx` (variant dropdown + custom-preview dialog with live char/byte/~token counts) · `buildAgentPayload.ts` (XML-ish envelope) · `ExportMenu.tsx` + `export.ts` · `AgentCopyGroomerWindow/Launcher` + `groomer-types.ts` (page groomer; also exports `buildGroomerPresetPayload` / `groomerPresetVariants` — the shared way to derive graded variants from groomer sections) · `clipboard.ts`.
- **Built-in integrations:** `MatrxDataTable` `copy` config → row/view/window/field copy + toolbar ExportMenu + `copy.aiVariants`/`aiCustom`; `JsonInspector` `agentCopy`; marketing `MetricCell` `copy`; shared payload helpers in `features/marketing/lib/copy-payloads.ts` (`webCopy`, `keyFieldsAiVariant` — extend, never fork).
- **Reference page:** `features/marketing/components/backlinks/BacklinksWorkspace.tsx` + `format.ts` — every pattern in one file (granularities, groomer sections, preset-derived variants, `copy.showToolbar:false`).
- **Testing fixture that actually loads:** `/marketing/brands/52a7eea1-0260-4a6f-a392-90bea1dda941/sites/38eff4c9-b021-451a-b995-7d9b3d17db5e/backlinks` (datadestruction.com — 274 backlink snapshots) as `admin@admin.com`. **Verify any review URL loads as the reviewing account before submitting it** — see the D133 decision below.

**Known traps:**
- Adding a `copy` config to `MatrxDataTable` makes its toolbar render; on pages with their own header row set `copy.showToolbar:false` and host view-copy + ExportMenu in that row, or you recreate the orphan-toolbar-row mess.
- `pnpm type-check` covers the whole repo and often carries OTHER sessions' in-flight errors — gate on zero errors *in files you touched*.
- Many sessions work `main` concurrently. Never `git add -A`; check `git diff --cached --stat` before every commit.
- Vercel builds only `release:`-prefixed commits — a plain push deploys nothing.

## Remaining work

1. **Finish the rollout — the uncovered two-thirds.** Four clusters, each dispatched as its own session 2026-08-15; the skill's Rollout Status holds the same list. Verify coverage before starting a cluster (`grep -rl "agent-copy/CopyButtons" features/<name>`), then run the module-audit protocol: enumerate surfaces → classify each data element → emit the coverage table → wire in batches.
   - **Knowledge/content:** notes · transcripts (+ studio, cleanup) · dictionary
   - **Data pipeline:** research (richest AI-handoff surface in the app — wants a page Groomer) · rag · api-integrations/MCP (sanitize endpoints + OAuth ids) · cms
   - **Marketing's one gap:** `features/marketing/content-plan` — the rest of marketing is done, this sub-feature has zero coverage (tree editor, node panel, pillar map)
   - **Work management:** tasks + projects · scheduling · organizations · war-room
   - **Media:** files (partial) · image-manager · podcasts · audio · pdf — the SKIP call matters most here (a viewer has no record; its lists and metadata do), and payloads carry `file_id` + durable URL, **never a signed URL**
   - Then whatever the route tree still shows uncovered. Scopes / artifacts / code-editor are mostly non-record tools — audit, expect to skip most, and say so rather than forcing buttons on.
2. **Roadmap — design-gated, do not start without Arman.** These three turn copy into *connect*, and they are the reason `kind` slugs and `attributes` are kept stable (they become the tool vocabulary):
   - `buildAgentPayload` auto-folding the active surface manifest's values into `<context>` (`features/surfaces/`, `surface-authoring` skill).
   - Screenshot attach (`hooks/useScreenCapture.ts`) so the agent sees what the user sees.
   - **Copy-for-AI flipping from clipboard to live agent handoff** — the button is already the seam; when tool injection lands, every existing callsite comes along for free. This is where agent-copy meets the agent-slots / dynamic-placement work.
3. **Release:** the completed work is on `main`, unreleased beyond v0.4.334. Batch it into the next scheduled frontend release (`./scripts/release.sh`).

## Decisions needed

- **Org membership for your real accounts (FOUND_DEFECTS D133).** Two review items failed with "site was deleted" — nothing was deleted. `arman@allgreenrecycling.com` has viewer access to ZERO marketing sites (member of none of the brand orgs), and RLS-invisible masquerades as data loss. Items are repointed at datadestruction.com and back to `pending`. **Decide:** which of your accounts join which orgs (one INSERT each once ruled), and whether the "deleted or no longer accessible" wording should split deleted vs no-access.
- **Worktree isolation for fleets.** Parallel sessions on `main` clobbered each other three times during the original build; recovery worked but was luck-dependent. **Decide:** should rollout fleets run in isolated git worktrees from now on?

## Done — one line each

- **Primitives + doctrine complete**: CopyButtons (3 sizes, JSON flavor), `buildAgentPayload` envelope, ExportMenu, the page Groomer, and `AiCopyMenu` (graded variants + custom-preview dialog) — kept in step with aidream `apps/dashboard/src/components/agent-copy/AiCopyMenu.tsx`.
- **Shared derivation helpers** so variants are never hand-maintained twice: `buildGroomerPresetPayload` / `groomerPresetVariants` / `keyFieldsAiVariant`.
- **Table integration**: one `copy` config on `MatrxDataTable` delivers row / view / window / per-field copy + export + graded AI variants.
- **Skill + README carry the sized-to-data model and the module-audit protocol**; proven Sonnet-executable.
- **Covered**: marketing except content-plan (backlinks reference page + every site tab + brand cockpit + brands list + access + settings + `/marketing` root + crawl sub-routes) · agents & system-agents · agent-apps · agent-shortcuts · tool-registry (mcp-admin + mcp-tools) · feedback · ai-models · sandbox / admins / ai-tasks / invitation-requests.
- **Audit rollup rearchitected**: `buildSiteAuditRollup` aggregates completely; truncation happens only at render, with show-all toggles and exports over ALL rows.
