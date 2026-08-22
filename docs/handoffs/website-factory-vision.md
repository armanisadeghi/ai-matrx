---
status: active
updated: 2026-08-21
repos: [matrx-frontend, aidream, my-matrx]
scope: program
feature: Content Planning
vision:
  - /Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md
---

# Website Factory — from content plan to agent-built professional sites

**What this is:** the per-page build pipeline — family territory → structured write → review /
fact-check → HTML build — that takes a `web.site` content plan and produces a real, professional,
multi-page website through many specialized agent steps.
**Scope:** Program (spans Content Planning, SEO, CMS, Workflows)
**Feature:** Content Planning
**Vision:** [Content Engine STATE §2.3](/Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md) — Arman's 2026-07-30 pipeline vision, verbatim.

**Sister program: Growth Loop** ([growth-loop.md](./growth-loop.md)). Factory is idea → a website;
Growth Loop is that site, then measure → improve. Staff or groom one, read the other.

🚨 **READ THE CLUSTER DOC FIRST:
[`common-docs/projects/content-engine/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md)** — merged
vision, verified state, question ledger, and this program's pending list in context.

## Where this stands

**The factory works end to end, small.** One button (`cms_fill_start`) takes a planned site through
four AI steps per page on one durable queue, one item per (page, step), crash-resumable, cost
stated before the run. All four page agents are DATABASE agents behind mandates
(`content_plan.p3_family|p4_write|p5_review|p6_build` — all enabled and bound, verified live
2026-08-20). A human edits any page's words without HTML, and a human revision supersedes the
agent's.

**Publish is PROVEN (2026-08-21):** cosmeticinjectables (`baa61391`) went p1→p7 — 28/29 pages
bulk-published, URLs verified 200 with full shell on
`https://www.mymatrx.com/c/cosmeticinjectables-com/…`. The rail's seven steps all RUN now (p1
runner + p2/p6/p7 arrows), the same eight steps exist at the SITE level
(`GET /content-plan/sites/{id}/pipeline` → `SitePipelineStrip`), and every real publish is
shell-inspected (`cms_verify/shell_check.py`). **What it is NOT yet:** deep (p2 is not real
content research), specialized (no per-page-type builders), or robust at the publish seam —
see the new defects below.

🚨 **Templates are an OPTION, never a requirement.** Never build a required/opt-out flag; there is
nothing to opt out of. The standing requirement is the THEME. Canonical ruling and Arman's
retraction: STATE.md §2.4.

## Remaining work

Full detail, with evidence and row counts, in **STATE.md §4.3**. In priority order:

1. **Publish-seam defects from the 2026-08-21 p1→p7 proof** (detail: STATE.md §4.3.1):
   (a) bulk `/cms-publish` must STREAM — 29 pages exceeds the gateway timeout and the request died
   mid-loop; (b) 🚨 `live_url` lies for un-activated custom domains — post-publish inspection
   fetched the client's REAL external site; verify on `/c/{slug}` until activation is proven;
   (c) content leakage — `/certified-hard-drive-destruction` (All Green) published inside the
   med-spa plan; (d) one page (`b51cad8d`) unpublished + one published page with no plan link.
2. **Deepen p2 into real content research** (extend `features/research/`, don't fork). The runner
   half is DONE — all seven rail steps run (p1 via the step route; p2/p6/p7 arrows via their own
   producers).
3. **Specialist builders routed by page type.** Mandate keys are hardcoded constants; `page_type` is
   a payload variable, never a routing key. Needs no pipeline change — DB agents plus a routing
   seam. Decide the seam (per-page-type mandate binding vs a dispatcher agent) before authoring the
   fleet.
4. **Site design system (S3) — the reusable block library.** `starter_kit` seeds global CSS, one
   header, one footer and navigation. There is no section/block catalog. Offered, never imposed.
5. **Plan-UI remainder** — whole-page "run the rest of the pipeline"; bulk run-step across a tree
   multi-selection.
6. **Streaming-capable assists** (platform gap) — `AssistAction` is a closed union of 5 kinds and
   none can adopt a stream. Fix belongs in the assists capability, not this program.

## Resources

- Pipeline: `aidream/services/content_plan/page_pipeline.py` · queue `cms_fill.py` ·
  tiers `effort.py` · artifacts `artifacts.py`
- FE: `features/marketing/content-plan/` — `NodePanel`/`NodeStepRail`, `setup/effort.ts`,
  `SetupBridgeSection.tsx`, `lib/pipeline-progress.ts`, `lib/pipeline-staleness.ts`
- Feature truth: `features/marketing/content-plan/FEATURE.md` ·
  `aidream/services/content_plan/FEATURE.md` (§ ONE BUTTON, FOUR AI STEPS PER PAGE)
- CMS side: [cms-page-hub.md](./cms-page-hub.md) · Setup AI steps: [content-plan-ai-steps.md](./content-plan-ai-steps.md)
- Workflow-node exposure: `aidream/docs/handoffs/features-to-workflows.md` (separately owned — the
  factory pipeline itself stays on the durable `cms_fill` queue, not workflow nodes)
- **Models (Arman's binding, 2026-08-16):** p3_family → Claude Opus (it constrains the writer, the
  builder and every sibling page); p4_write / p5_review / p6_build → Gemini 3.7 Flash. Rebinding is
  a database edit, never a code change.
- Test login: `/login` `admin@admin.com` / `Password1234#`; plan UI at `/marketing/content-plan`

## Done

- The four-step per-page pipeline on one durable queue; all four agents mandate-bound with zero
  prompt text in code; effort tiers with pre-estimation; the human page-text editor; five artifact
  kinds registered with components; rail staleness derivation; keyword→brief enforcement end to end;
  site→vertical binding as a real FK (WF-10). One line each with code pointers in **STATE.md §3**.

## Decisions needed

**Nothing on this handoff is waiting on Arman.** The cluster's whole question ledger — including the
one standing ask that IS his (the 23 pending review-queue rows) — is **STATE.md §5**.

🚨 **THE ROUTING RULE (Arman, 2026-08-17): developer tasks NEVER go to Arman.** Before adding
anything here or to an assist chip addressed to him: does this need Arman PERSONALLY — a product
ruling, a naming ruling, money, an account only he holds, or his own review? If a competent engineer
could decide it from the code and the doctrine, it is a developer task: decide it, or hand it to
another session.
