# How to assign a project — copy-paste prompt

Start a **fresh session** per project and paste the prompt below, filling the two `{...}` slots.
Don't add more context than this — the briefs are written to be self-sufficient, and extra
instructions in the prompt tend to drift from the doc. If you have a preference the brief leaves
open (e.g. a route name), append it as a final line.

---

```
You are taking ownership of ONE project from the Education Hub master plan.

Your project: {P2 — AI Tutor}
Your brief:   docs/proposals/education-projects/{P2-ai-tutor.md}

Do this, in order:
1. Read docs/proposals/education-projects/README.md (the master plan) — you are one of ~11
   parallel agents; it defines the shared contracts, the TRUST mandate, and who owns what.
2. Read your brief top to bottom. It is your contract: objective, verified current state,
   scope in/out, deliverables, and verification are all binding. Scope OUT means another
   agent owns it — integrate via the named contract, never build it.
3. Re-verify the brief's "current state" claims against live code + the live DB before
   building (they were verified 2026-07-07; other agents are landing work on main daily).
   If reality has moved, adapt and note it — don't build against a stale picture.
4. If your brief says you publish a day-1 contract, publish it (typed interface + doc) before
   anything else.
5. Build to done per the brief, following CLAUDE.md and the skills it names. Work on main;
   commit completed work as you go; other agents are doing the same — pull before you start
   and re-pull before each commit.
6. Verify for real (live app, live DB, no mocks), then report: what shipped, what's open, and
   the exact routes + steps for me to test.

Coordination: where your brief names another project as a dependency, check whether its
contract/stub already exists in the repo before waiting on anything. If you're genuinely
blocked or a product decision is mine to make, ask me directly (the AskUserQuestion tool is
fine) — don't guess on product semantics, and don't silently shrink scope.
```

---

**Fill-in reference:**

| Project | Brief file |
|---|---|
| P0 — Trust Layer | `P0-trust-layer.md` |
| P1 — Assessment Engine | `P1-assessment-engine.md` |
| P2 — AI Tutor | `P2-ai-tutor.md` |
| P3 — Study Media | `P3-study-media.md` |
| P4 — Smart Notes | `P4-smart-notes.md` |
| P5 — Study Intelligence | `P5-study-intelligence.md` |
| P6 — Growth Content Engine | `P6-content-publishing.md` |
| P7 — Sharing & Public Access | `P7-sharing-public-access.md` |
| P8 — Billing Integrity & Entitlements | `P8-entitlements-billing.md` |
| P9 — Universal Ingest | `P9-universal-ingest.md` |
| P10 — Engagement Engine | `P10-engagement-engine.md` |
| F1 — flashcards addendum | give `F1-flashcards-feature-adds.md` to the ACTIVE flashcards agent in its existing session, not a fresh one |

Assignment order if staffing gradually: P0, P7, P8 → P9, P2 → P1, P5 → P10, P3 → P6, P4.
