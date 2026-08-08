---
status: active
updated: 2026-08-08
repos: [matrx-frontend]
vision: [.claude/skills/agent-copy/SKILL.md, components/agent-copy/README.md]
---

# Agent-copy everywhere — copy / JSON / Copy-for-AI / export on every data surface

## Vision — Arman's words

> "Our entire application is highly AI driven. And so having copy icons everywhere and copy for AI icons everywhere is an absolute must."

> "We should never display any data where we don't properly allow the user to copy individual parts, individual lines, individual entries, or all of them as a whole and then have the copy for AI icon, which also provides XML-ish style formatting to make it easy for pasting directly to AI."

Per-page expectation (stated for the backlinks reference page, generalizes to any data-heavy page):
> "Each card and each item needs a normal copy as well as the for-AI. The table needs more than just that and then the window panel will definitely need more. And then you need one for the entire page and that's where you get into needing to render a dedicated window panel for grooming the AI copy with different variations and some automated options to reduce the size but where you know it's OK to cut."

Refinements he added along the way — each is now doctrine, with the why:

- **Truncated lists must offer the rest.** "We're only showing the top 8. But what if the user wants to see the rest of it? … it wouldn't be hard for us to just make that data available, but someone has to say it." → agents doing big work are expected to *notice* this class themselves.
- **Export is mandatory.** "There's no export feature. And if there's no export feature, then it's just text that's sitting here."
- **Copy as JSON** joins the flavors: "When you have data, you wanna also have copy as JSON in addition to the normal copies."
- **UI integrity is part of the job.** On the table regression: titles in user words ("these are just backlinks", never "stored backlink rows"), counts never in prime real estate pushing the search, header/footer must read as one card with the table, copy icons share existing rows instead of spawning their own. "Be on the lookout for things like that always."
- **The Groomer window is a reusable primitive**: "I love the window panel component you made… that can easily be a reusable component across a lot of different pages."
- **The skill must be Sonnet-executable** — rollout fleets run on Sonnet, never Fable/Opus, to prove the skill carries the quality. (Proven: 3 Sonnet agents shipped 11 pages; one found a truncation gap unprompted.)
- **Do not merge this skill with `surface-authoring`** — deliberate decision; they cross-point instead. Data-heavy pages still deserve solid surface manifests alongside copy (backlinks manifest was enriched as the example).
- **The skill is co-designed**: built on a real page with his feedback, "write it and then rewrite it as you learn things… especially learning my preferences." His verdicts arrive via `agent.review_queue`.

## Resources

- **Doctrine + how-to (read first):** `.claude/skills/agent-copy/SKILL.md`, `components/agent-copy/README.md`.
- **Primitives:** `components/agent-copy/` — `CopyButtons.tsx` (sizes xs/icon/sm, `json` prop, propagation-stop), `buildAgentPayload.ts` (XML-ish envelope), `ExportMenu.tsx` + `export.ts` (JSON/CSV/text download builders), `AgentCopyGroomerWindow.tsx` + `AgentCopyGroomerLauncher.tsx` + `groomer-types.ts` (page-level groomer: Everything/Balanced/Minimal presets, full/compact/brief/off per-section dials, live char/~token sizes, preview, export; window stays behind the launcher's `dynamic ssr:false`).
- **Built-in integrations:** `MatrxDataTable` `copy` config → row/view/window/field copy + toolbar ExportMenu (`components/official/matrx-data-table/` — `tableCopy.ts#rowsToCsvFromColumns`, `DataRowInspector` per-field hover copy, `DataRowWindow.headerActions`); `JsonInspector` `agentCopy` prop; marketing `MetricCell` `copy` prop (`features/marketing/components/shared/MarketingUi.tsx`); marketing shared payload helpers `features/marketing/lib/copy-payloads.ts` (`webCopy` et al — extend, don't fork).
- **Reference page (the exemplar):** `features/marketing/components/backlinks/BacklinksWorkspace.tsx` + `format.ts` — every pattern in one file, including groomer sections and the `copy.showToolbar:false` rule.
- **Testing:** dev server → `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/…`. Real data route: `/marketing/brands/1c71e366-143c-4692-8e9a-1b59bdfe114a/sites/7853b973-be56-47cd-bdf3-a55fad9dd0e4/backlinks` (aimatrx.com, owned by the admin@admin.com test user).
- **Feedback loop:** `agent.review_queue` rows `2ecba5c0-…` (backlinks reference) and `b60b6c75-…` (fleet rollout) await Arman's verdicts — read them before the skill rewrite.

**Known traps:**
- Multiple agent sessions work `main` concurrently; commits and `release.sh` runs swept sibling sessions' staged/working files three times during this build. Never `git add -A`; check `git diff --cached --stat` before every commit; skip files already dirty from another session. Prefer worktree isolation for fleets. A stale `stash@{0}` from one recovery may still exist — safe to drop.
- `pnpm type-check` covers the whole repo and often carries OTHER sessions' in-flight errors — gate on zero errors *in files you touched*.
- Adding a `copy` config to `MatrxDataTable` makes its toolbar render; on pages with their own header row set `copy.showToolbar:false` and host view-copy + ExportMenu in that row, or you recreate the orphan-toolbar-row mess Arman flagged.
- Vercel builds only `release:`-prefixed commits — plain pushes never deploy.

## Remaining work

1. **Final skill rewrite** (`.claude/skills/agent-copy/SKILL.md`) once Arman's review-queue feedback lands: fold in his verdicts + add the **module-audit protocol** he originally asked for — a sweep procedure that enumerates a feature's surfaces (routes/panels/overlays), classifies each rendered data element (list / record / field group / non-record tool), and emits a coverage gap list before wiring. Keep it Sonnet-executable.
2. **Finish marketing:** site tabs overview / integrations / access / settings; brand-level pages (brands list, brand cockpit); `/marketing` root; content-plan. The Pages tab and `CrawlSubnav` sub-routes (URLs/Reports/Snapshots/Links/Logs — no copy layer yet) were owned by parallel sessions — verify current state before touching.
3. **App-wide rollout** beyond marketing, Sonnet fleets reading the skill: SKILL.md's remaining list (`tool-registry/mcp-admin`, `feedback`, `system-agents/*`, `agent-apps/*`) and onward.
4. **Roadmap (design-gated, don't start without Arman):** `buildAgentPayload` auto-folding the active surface manifest's values into `<context>`; screenshot attach (`hooks/useScreenCapture.ts`); Copy-for-AI flipping from clipboard to live agent handoff (keep `kind` slugs stable — they become the tool vocabulary).
5. **Release:** all work sits on `main` unreleased — ship via `./scripts/release.sh` when Arman approves the review items.

## Done

- **Audit rollup rearchitected** (2026-08-08): `buildSiteAuditRollup` now aggregates completely — `topIssues`/`worstPages` carry EVERY ranked entry; truncation happens only at render in `AuditWorkspace` (top 14 / top 10 previews with show-all toggles). Score-trend computation untouched (it reads only counts/passes). Audit tab gained card-level JSON+CSV exports over ALL rows plus a page-level ExportMenu; card copies now cover the full lists; manifest descriptions updated.
- Primitives + integrations built and browser-verified — see `components/agent-copy/` and the reference page above.
- Backlinks page fully wired (all granularities, groomer, export, show-all) + its surface manifest enriched and live in `ui.ui_surface_value`.
- Keyword + ranks surface manifests exist and are verified (`keyword-research`, `marketing-site-keywords`, `marketing-ranks` — built by the surface-canonical-fleet campaign).
- Sonnet fleet shipped 11 marketing site tabs (keywords, ranks, coverage, findings, analysis, audit, links, crawls + detail, sitemaps, discovery, cost) — audit page browser-verified.
- Skill + README updated with every doctrine refinement above.

## Decisions needed

- **Situation:** Two `agent.review_queue` items ask for your verdict on the backlinks reference page and the Sonnet fleet's 11 pages; the final skill rewrite is deliberately waiting on your preferences (placement, hover-reveal vs always-visible, groomer section granularity). **Decide:** review at `/administration/users/agent-review` and leave feedback, or tell the next agent to proceed with current conventions as final.
- **Situation:** Parallel sessions on `main` clobbered each other's in-flight files three times during this build; recovery worked but it is luck-dependent. **Decide:** should rollout fleets run in isolated git worktrees from now on?
