# Masterwork Distillation System — THE HANDOFF (forward work order)

> **THE DOC MAP — three documents, three jobs, no overlap (settled 2026-08-19):**
> **STATE** (what exists, evidence-verified): `/Users/armanisadeghi/code/common-docs/projects/masterwork/MASTERWORK.md`
> **CONTRACT** (invariants, LEARNED PATTERNS, Approach registry): `/Users/armanisadeghi/code/common-docs/systems/masterwork/FEATURE.md`
> **THIS FILE** (what remains, who owns it, the integration audit): the ONE forward work order.
> A cold reader starts at MASTERWORK.md, builds from this file, and obeys the contract.

**The spine:** an **Expert** → **Distillation** (many **Approaches**) → a **Rulebook** →
**Build** → a **Masterwork** (draft → released), proved by an **Audition**, run by an
**Operator** as an **Encore**, improved forever (Checkup · Coherence · Hindsight · the
improvement brain).

## Part 0 — Arman's vision (unchanged; do not lose)

1. **UI-first is the reality test** — nothing is real without a UI a normal user can use.
2. **The system is for HUMANS first** — the product is the PROCESS that distills, never
   hand-authored rules. The dream: *"just talk for an hour, upload the audio, we do the rest."*
3. **chunk → extract → table → reference-back** is the ingestion play; every rule links to
   its source (pages, timestamps, conversations).
4. **The honest-evaluation caveat:** Hopkins/Strunk flatter us (models know them). The REAL
   test is Arman's own SEO method, judged by whether HE agrees with the output.
   **Still the gate. Still not run end-to-end.** (28 rules approved 2026-08-18; production
   Build works again; nothing blocks it.)
5. **Agents are legitimate UI.**
6. **The global view is the owner's job (Arman, 2026-08-19):** whoever owns this feature owns
   ALL of it — every part, every integration between parts, and the layer on top. Parts that
   don't talk to each other are the failure mode that has been "disastrous on a couple of
   features." This handoff's Integration Audit section is that view; keep it current.

## THE INTEGRATION AUDIT (2026-08-19) — the global view

A full-feature audit (every part, at HEAD, live DB) answered the one question that matters:
**do the parts talk to each other?** Verdict: the parts are individually strong; seven did
not talk; there is no top layer. Fixed same-day vs. chipped vs. owed is tracked below.
**THE CLASS (name it before fixing instances):** six findings were ONE failure repeated —
*a law lands in the AUTHORING half and never reaches the EXECUTING/CONSUMING half.*
Role-filtering, `relates_to`, corpus assembly, coherence poking, dictation origin, capture
durability: all authored correctly, all dropped downstream. This is LEARNED PATTERN 1b's
generalization, now codified in the CONTRACT doc.

### Fixed 2026-08-19 (this session, pushed, verified)
- 🔴→✅ **Corpus contamination:** the Checkup's server corpus now role-filters `interview`
  edges AND subtracts every non-interview-role conversation (the Conductor's `conducting`
  sessions — 2 were live on the SEO Rulebook and WOULD have been quoted back as Arman's own
  words). Forcing tests: `masterwork_checkup/tests/test_corpus_role_filter.py`. Fail-closed:
  exclusion failure narrows the corpus, never widens it.
- 🔴→✅ **Coherence Partner now fires on the Expert's own writes:** the FE rules funnel's
  announcement endpoint (`/masterworks/understudy/refresh`) pokes coherence exactly like the
  server write funnel — the two paths can no longer diverge on this.
- 🔴→✅ **Three enabled Approaches dead-ended after selection** (`source`/`exemplar`/`file`
  had empty `intake_query`; no param opened IngestSourceDialog at all). Now `?ingest=<lane>`
  opens the dialog pre-set to the chosen lane; rows updated live; browser-verified
  (`?ingest=exemplar` lands on "It IS the finished work").
- ✅ Duplicate `masterwork.rule_cleanup` mandate row (`fc01ee64`, was ENABLED and pinned to a
  deleted agent) soft-deleted; the FEATURE.md paragraph that would have sent someone to
  re-bind it corrected.
- ✅ `rulebook_advisor` / `rule_editor` surface roles bound to existing Mandates
  (`masterwork.checkup_auditor` / `masterwork.rule_improver`) — were empty header-menu rows.
- ✅ Orphaned deploy-gap shim function dropped from the live DB (deploy caught up; outage over
  — production Builds completing again, verified in `platform.masterwork_run`).

### Chipped (five focused sessions, briefs self-contained with file:line evidence)
1. **`task_f27d97ba` — ONE expert corpus, all 9 lanes, both readers.** Two assemblies exist
   (FE `getExpertCorpus` vs server `corpus.py`); NEITHER covers body_of_work
   (`platform.masterwork_corpus_item`), dump (`distillation_source` edges), imported chat
   text, or pasted source — the Checkup's premise is structurally false for 4 Approaches
   (146+24+16 rules invisible).
2. **`task_717a98c5` — `relates_to` reaches EXECUTION.** `understudy.py:87` and
   `build.py:299` serialize rules without relationships/severity ordering; 0 of 429 live
   rules carry `relates_to` (stack shipped after authoring) — run the relationship auditor
   per Rulebook to build the queue; findings stay proposals.
3. **`task_8c4853a1` — THE TOP LAYER, the cheap honest way.** One deterministic journey
   computation; the improvement brain learns checkup/coherence/conductor/audition/release
   moves (today it knows only sections+approaches+weak-auditions; 5 checkup runs exist and
   no finding was ever surfaced as a next move); KPI `nextStepLine` extends past "Ready to
   Build"; AssistStrip on the module home; cross-dedupe coherence↔checkup.
4. ~~**`task_e895e08d` — lane routes get the surface scope + AccessGate; capture durability
   goes from 1 lane to all 9.**~~ **DONE 2026-08-19.** `RulebookLaneRoute` is now the ONE
   scaffold every `/masterwork/[id]/*` route uses and carries the `SurfaceRuntimeProvider`,
   the `buildRulebookSurfaceScope` emitter (workspace args optional; publishes
   `context.lane`), the `masterwork_refresh_rulebook` client tool, and
   `<AccessGate token="rulebook" id/>` — the four denial patterns and both copies of the
   banned hand-written string are gone, and `MasterworksPage` takes the Rulebook the lane
   already gated instead of re-reading it. On the server, every Approach's
   `build_draft_rules` write goes through `write_recovery.append_rules_with_recovery`, so an
   infrastructure-failed append from any lane raises the same one-click restore chip on the
   same source key and endpoint (a CAS conflict deliberately does not; restore re-dedupes
   against the live Rulebook, so it is idempotent). Forcing tests:
   `aidream/services/distillation/tests/test_lane_write_recovery.py`.
5. **`task_c6b6b38d` — Encore shows the Audition + housekeeping.** Operators never see
   `quality_score`/the beat-vanilla verdict (the product's whole pitch); admin-map missing
   rows + 4 dead OPEN buttons; `/import/ai-chats` in no nav; orphan exports
   (`InterviewButton`, `interviewTitleFor`, `listRulebookVersions` has no UI); dictation
   origin on 2 of 18 mic surfaces; `POST /clean-corpus` has zero callers ever (the Checkup's
   `use_cleaned` branch is unreachable through the product).

### Still open, NOT chipped (needs judgment or Arman)
- **Severity floor semantics** — what `critical` mechanically MEANS at run time (blocks vs
  weights) is a product call; chip 2 surfaces ordering but not policy.
- **`monologue` + `matrx_conversations` registry rows disabled by design** — revisit once the
  file card's share of monologue traffic is known.
- **Build-service consolidation** onto `matrx_ai/plans/compiler.py::compile_plan` (~960
  hand-rolled lines) — bring a plan first; never delete first.
- **Four Scouts, no shared primitive** (masterwork/SEO-strategy/GSC-intake/Vision-interview) —
  value is stopping the fifth.
- **Distillation → Engram §5 interface** (candidate specialists/contracts/acceptance
  criteria) — acceptance criteria first; it is also the honest test's instrument.
- **Oracle tap (a) email-in and (b) SMS** halves (transports exist; register `oracle_tap`
  as an Approach row when they land).
- **Encore "shared with me" shelf** — waits on `lib/list-scope` Brief 3A.
- **Voice-on-Scout live E2E** — needs a real microphone (harness cannot capture);
  `docs/handoffs/voice-communication-layer.md` row 1.

### ARMAN'S OWN LIST (nobody else can do these)
1. **THE HONEST TEST** — run your SEO method end to end: Build (works in prod again) →
   Conduct → Audition (three-way, vanilla arm on) → your verdict. The whole program's gate.
2. **16 provider screenshots** for `/import/ai-chats` from your signed-in accounts —
   work orders: `features/source-onboarding/galleries/ai-chats/SCREENSHOT_WORK_ORDERS.md`.
3. **Voice relay with a real mic** (5 minutes on `/masterwork/<id>/interview`).
4. **Five chips to approve** (above) + the standing surface-audit chip if still pending.

## THE APPROACH BUILD CATALOG (#1-#15) — preserved verbatim; the specs for what is not yet built

## The Approach build list — Arman's ruling 2026-08-17: "No idea is turned away until we test it and it sucks"

Every Approach below gets BUILT. The goal: so many ways of distilling that it is impossible
to get it wrong. Status moves here as lanes land.

**BUILT (2026-08-17/18) — the first five, all live:**
1. ✅ Understudy (free running Masterwork from minute one, rebuilt on every save) ·
2. ✅ Body of Work (product-proven: durable per-piece frontier, synthesis, run-linked) ·
3. ✅ Resource dump (`/masterwork/[id]/sources`) · 4. ✅ Approach selector + improvement-brain
assists + bad-draft critique · 5. ✅ Chat import (`/masterwork/[id]/import` + `/import/ai-chats`
gallery; 16 provider screenshots need Arman's accounts — work orders groomed). Plus #12
✅ Exception Hunter (checkup producer; 3 real findings on the SEO Rulebook first run).

**The creative ten (all approved to build; sequence after the five above):**
6. Meeting Scavenger — distill judgment moments from meetings the expert already records
   (MUST tap the platform's own meeting/transcript machinery)
7. Shadow-the-inbox — Understudy drafts real replies; the expert's edit diff is distilled
8. Red-Pen lane — markup + 5-second mic "why?" per strike-through
9. Bad Example probe — "what's wrong with this?" over generated decoys (feeds `detection`)
10. Oracle tap — capture the questions colleagues ask the expert + the answers. Arman's
    channel spec: (a) email-in address, (b) SMS (we have text messaging), (c) ✅ in-app: the
    message "..." actions menu gets "Add to Rulebook" beside create-task/create-note
    (SHIPPED 2026-08-17), and (d) ✅ the thumbs up/down on ANY agent response gets a tiny
    non-disruptive follow-up popover: "does this belong in one of your Rulebooks?" — a
    thumbs-up is Rulebook material whether or not a Masterwork produced it (SHIPPED
    2026-08-17; see STATUS). (a)+(b) remain open.
11. ✅ Hardest-Case Debrief — Critical Decision Method over one war story (interview
    variant) — SHIPPED 2026-08-17 (chip + Scout CDM instructions; see STATUS)
12. ✅ Exception Hunter — "when does this rule NOT apply?" — SHIPPED 2026-08-17 as
    checkup producer #2 (`aidream/services/masterwork_checkup/exception_hunter.py`):
    new Mandate `masterwork.exception_hunter` (DB-defined agent, Opus-class, zero
    findings praised), one `register_producer` call, the SAME evidence gate
    (`auditor.validate_finding`), `add`/`modify`-only findings; approve/dismiss free
    via the Final Checkup UI. Run live on Rulebook `8d1d4f08-…`
13. Triad game — which two of three cases are alike, and why (repertory grid)
14. Prediction Ledger — cheap predictions on real cases, scored against outcomes
15. ✅ Vacation Trigger — succession-framed interview variant — SHIPPED 2026-08-17 (chip +
    Scout instructions; the registry row is deliberately not minted yet — the chip is the
    entry point, same as the monologue precedent)
Plus the cross-cutting **Masterwork M&M** — a standing 15-minute weekly worst-run review
ritual (delivery vehicle for 9/12 and the failure lever, not a lane).

### The overlap map (2026-08-17) — what each idea taps, verified against code

- ONE landing point for every lane: `rulebook_writes.py` — never a second write path.
- **Near-free** (existing machinery, content/config variants): #11 Hardest-Case Debrief +
  #15 Vacation Trigger (new ELICITATION_CHIPS sets + seedText on the existing panel);
  Oracle-tap in-app half — "Add to Rulebook" is one MenuItem in
  `messageActionRegistry.ts` beside create-task/create-note, and the thumbs follow-up
  popover rides `lib/output-feedback` (which ALREADY stores originalContent/
  correctedContent/prose on every thumbs click — no new table).
- **Harness reuse:** #9 Bad Example probe = Audition run in reverse-emphasis (same judge →
  gaps → draft rules); #12 Exception Hunter = one new producer in the `masterwork_checkup`
  harness (parallel-run, stream findings, approve/dismiss all reusable) — ✅ built exactly
  that way 2026-08-17; #6 Meeting
  Scavenger reads the transcripts/War Room `studio_sessions` the platform already produces —
  the missing piece is only the judgment-moment detector.
- **#7 Shadow-the-inbox's diff primitive already exists**: `useOutputFeedback.captureCorrection`
  (AI draft vs corrected content, live on every thumbs button). Missing: the Understudy
  inbound path (outreach_inbound is CRM-shaped; needs a lightweight generic mode).
- **Transports confirmed live** for Oracle tap: inbound Gmail pipeline (needs a non-CRM
  correlation mode), SMS assistant programs (`sms_assistant.py` + `features/sms`), and the
  message-actions registry. Twilio voice relay exists if a voice Oracle is ever wanted.
- **Genuinely new, small:** the Triad item type (a proper content-ir kind through the quiz
  machinery, never a bespoke game engine); the Prediction Ledger's pending→resolved state
  table (scoring still via the ONE Judge mandate — never a second grader).


## Working notes that save hours
- Live ids: Rulebooks `seo-keyword-optimization` **`8d1d4f08-…`** (Arman's, 28 approved rules
  — THE test bed), `strunk-elements-of-style` `e492a07f-…` (admin-owned — agents verify
  here), `hopkins-scientific-advertising` `f6267bca-…`, `arman-seo-method` `5d353449-…`
  (empty early draft). Scout `4a0b2f8e-…`. Approach registry: `platform.approach`, family
  `distillation`, 9 rows.
- Deployed-vs-live schema guard: `aidream db/schema_analysis/check_deployed_schema.py`
  (built from the 2026-08-18 outage; run it before ANY live schema change).
- Verify locally: `pnpm preview:start` (3001, shared), admin@admin.com; Arman-owned rows are
  RLS-invisible to admin — verify his data via SQL/RPC, UI on Strunk.
- **Never:** hand-render a stream · re-roll the CAS write path (`rulebook_writes.py`) ·
  auto-activate an AI-written rule · put a prompt/agent-id in code (Mandates only) · let an
  agent touch a clean approved rule · rename a live DB identifier without the §8a-2 shim ·
  launch a structured-output mandate from a page with write targets without
  `auto_tools_disabled` (mandates RUNTIME.md).

## Attached remaining work (tasks — not separate staffing rows)

| Task | Document | Still pending |
|---|---|---|
| Vision Interview v2 tail | `aidream/docs/handoffs/vision-interview-v2.md` | Live E2E proof, threshold/cadence tuning, mission-block A/B, Cartographer grounding. Vision Interview is an Approach inside Masterwork, not its own feature. |

## Definition of done (Arman's bar, unchanged)
An Expert who cannot code opens the Studio, talks for twenty minutes, approves the rules
they agree with, rejects one with a spoken reason and watches it come back rewritten,
presses one button, runs the result, disagrees with it once, and watches the system get
better — agreeing with the output where they never agree with vanilla AI.
