# Masterwork — Distillation → Rulebook → Build → a Masterwork

> Vocabulary authority: [`common-docs/systems/vocabulary/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md).
> Cross-repo system-of-record: [`common-docs/systems/masterwork/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/masterwork/FEATURE.md).

**The spine:** an **Expert** → **Distillation** (many **Approaches**) → a **Rulebook** →
**Build** → a **Masterwork** (draft → released), proved by an **Audition**, run by an
**Operator** as an **Encore**.

## Part 0 — Arman's vision (unchanged; do not lose)

1. **UI-first is the reality test** — nothing is real without a UI a normal user can use.
2. **The system is for HUMANS first** — the product is the PROCESS that distills, never
   hand-authored rules. The dream: *"just talk for an hour, upload the audio, we do the rest."*
3. **chunk → extract → table → reference-back** is the ingestion play; reuse the document
   pipeline; every rule links to its source pages.
4. **The honest-evaluation caveat:** Hopkins/Strunk flatter us (models know them). The REAL
   test is Arman's own SEO method, judged by whether HE agrees with the output.
   **Still the gate. Still not run.**
5. **Agents are legitimate UI.**

## STATUS — live and verified (compressed)

- **The full loop is LIVE on `/masterwork`:** guided intake → Scout interview
  (`masterwork_scout` `4a0b2f8e-…`, `rulebook` tool) or source/exemplar/file ingest → Expert
  review → Build → run in place → "What did it get wrong?" → Audition → gaps become drafts.
- **The vocabulary rename EXECUTED end-to-end 2026-08-17** — DB (`platform.rulebook` + `rules`
  col, `platform.masterwork_run`, RPCs `rulebook_versions`/`rulebook_snapshot`, entity tokens,
  8 mandate keys `masterwork.*`, tool `rulebook`, all live agent/workflow/Rulebook rows incl.
  instruction text + `[[masterwork_name]]`/`[[rulebook_source_line]]` template placeholders),
  aidream (`services/masterworks/` + `services/distillation/`, `/masterworks/{build,ingest,
  ingest-file,audition,runs/{id}/rejoin}`, `masterwork_*` events, `rulebook_*`/`masterwork_*`
  error literals, attribution slug `masterwork`), matrx-frontend (`features/masterwork/`,
  `/masterwork` routes — old namespace deleted, no redirects), docs, generated types both
  repos, migration record `aidream/db/migrations/masterwork_vocabulary_rename.sql` (ledgered).
  Type-check green; registry parity tests green; browser-verified on the dev server.
- **The review loop closes both ways (2026-08-17, Arman's feedback):** per-rule
  **Reject with feedback** (transient `rejected` + `feedback`; rule keeps `draft:true` so a
  Build can never include it) and **Request changes** on any rule (approved stays approved).
  The `rulebook` tool returns `open_feedback` on read; the Scout's instructions require
  clearing every item each turn — rewrite-and-requeue (fresh draft), or withdraw; applying
  feedback consumes it; the Expert approving clears it. Approve-all never touches rejected.
  **Focus wizard** ("Review one by one" — card at a time, approve/reject/edit/skip,
  auto-advance) + **gamified KPI strip** (approved/waiting/with-the-interviewer tiles,
  review-progress bar, next-step encouragement). Every textarea in the module is
  **ProTextarea** (mic + live transcription). Browser-verified end-to-end: a live rejected
  rule (`never-open-with-brand-name`, Strunk) is sitting in the Scout's queue as a demo.
- Fixed along the way: word-boundary name truncation (was defect 3), duplicate Audition judge
  soft-deleted (mandate pins `c55b52c9-…`), test residue removed (was defect 4), two
  unmirrored shareable-registry rows (`interview_session`, `workflow_runtime_surface`) added
  to the FE TS mirror.

## 🔴 DECISIONS ARMAN OWES

**① Does a RELEASED Masterwork pin its agents, or track its Mandates?** Build freezes resolved
agent UUIDs into the workflow definition (`masterworks/build.py`; `ai.agent.start` takes only
`agent_id`). *Recommended:* keep it pinned (reproducibility IS the accountability claim) and
extend the existing drift surface to also detect template/Mandate drift with a one-click
rebuild. Ruling the other way needs a `mandate_key` input on `ai.agent.start` (matrx-ai/graph
change affecting every workflow).

**② Auditor contract vocabulary (deliberate rename holdout).** The generic auditor's runtime
variables `pack_source`/`principles` and output field `principle_id` are DB-owned contracts
frozen into the two live built Masterworks — renaming them requires updating the auditor
agent + mandate contract + `build.py` + REBUILDING the live Masterworks in one pass. Cheap
once ① is settled (a rebuild pass does both). Everything else is renamed.

## Open work, in order

1. **The honest test (the gate).** Arman fills `arman-seo-method` (`5d353449-…`) through the
   Scout — the reject/feedback loop is now ready for exactly this session.
2. **Encore surface** — the Operator door to a released Masterwork. Designed nowhere. Lexicon
   names it; nothing built.
3. **Build-service consolidation** (vocabulary-campaign duplication finding ②):
   `services/masterworks/build.py` (~960 lines) hand-rolls what
   `matrx_ai/plans/compiler.py::compile_plan` does, except data-driven cast width + non-agent
   utility nodes. Bring a plan before touching; never delete first.
4. **Four Scouts, no shared primitive** (duplication finding ③): masterwork_scout, SEO Site
   Strategy Interviewer, GSC Site Intake Interviewer, Vision Interview openers.
5. **Distillation → Engram interface** (`common-docs/systems/engram/VISION.md` §5): emit
   candidate specialists/contracts/acceptance criteria, not just rules.

## Working notes that save hours

- Live ids: Rulebooks `hopkins-scientific-advertising` `f6267bca-…`, `strunk-elements-of-style`
  `e492a07f-…` (has 1 rejected rule waiting as a live demo), `arman-seo-method` `5d353449-…`
  (draft). Masterworks: Strunk `bf711bce-…`, Hopkins `b0865c3b-…`. Scout `4a0b2f8e-…`.
- A real run costs ~$0.19, ~4 min, detaches server-side; safe to walk away.
- Verify: `pnpm preview:start` (port 3001, shared), `/masterwork/e492a07f-…`. `pnpm type-check`
  is the only type gate; the live DB is truth.
- **Never:** hand-render a stream; re-roll the CAS write path (`rulebook_writes.py`);
  auto-activate an AI-written rule; put a prompt/model constant in a distillation module
  (Mandates only); let an agent touch a clean approved rule (feedback is the only key).

## Definition of done (Arman's bar)

An Expert who cannot code opens the Studio, answers four questions, talks for twenty minutes,
approves the rules they agree with, rejects one with a spoken reason and watches it come back
rewritten, presses one button, runs the result, disagrees with it once, and watches that
disagreement become a rule — then runs it again and **agrees with the output where they never
agree with vanilla AI.** Until Arman's own SEO method clears that bar, this is not done.
