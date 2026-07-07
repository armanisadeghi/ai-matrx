# ASSIGN — Photo-to-PDF / Document Pipeline projects

One fresh session per project. Paste the prompt, swapping the `{...}` line.

| # | Project | Brief | Assigned? |
|---|---|---|---|
| P1 | Production Certification & Device Hardening | `P1-production-certification.md` | — |
| P2 | Scan Document Experience (C1 owner) | `P2-scan-document-experience.md` | — |
| P3 | Large-Document Scale (C3 owner) | `P3-large-document-scale.md` | — |
| P4 | Document Intelligence Expansion | `P4-document-intelligence.md` | — (Wave 2) |
| W2 | Redaction Escrow | `W2-redaction-escrow.md` | GATED on KMS — do not assign |

```
You are taking ownership of ONE project from the Photo-to-PDF / Document Pipeline master plan.

Brief directory:        docs/proposals/pdf-scanner-projects/
Your project and brief: {P2 — Scan Document Experience | `P2-scan-document-experience.md`}

Do this, in order:
1. Read the master plan (README.md) — you are one of ~4 parallel agents; it defines the shared
   contracts (C1 thumbnails, C2 extractor registry, C3 job envelope), the cross-cutting
   mandates, and who owns what.
2. Read your brief top to bottom. It is your contract: objective, verified current state, scope
   in/out, deliverables, and verification are all binding. Scope OUT means another agent owns
   it — integrate via the named contract, never build it.
3. Re-verify the brief's "current state" claims against live code + the live DB before building.
   If reality has moved, adapt and note it — don't build against a stale picture.
4. If your brief says you publish a day-1 contract, publish it (typed interface + doc) before
   anything else.
5. Build to done per the brief, following CLAUDE.md and the skills it names. Work on main;
   commit as you go; pull before starting and re-pull before each commit.
6. Verify for real (live app, live DB, real devices where the brief says so — no mocks), then
   report: what shipped, what's open, and the exact routes + steps for me to test.

Coordination: where your brief names another project as a dependency, check whether its
contract/stub already exists before waiting on anything. If you're genuinely blocked or a
product decision is mine to make, ask me directly (the AskUserQuestion tool is fine) — don't
guess on product semantics, and don't silently shrink scope.

Commits: Make small commits. Don't stash other people's work. If your work gets accidentally
added to another commit, that's ok — just don't let your work get lost.

Loop: Work in a loop with your sights set on making every part of my vision a reality. Make
improvements and enhancements when you see the opportunity. Apply all best practices. Use
adversarial agents to check your work. When you truly have nothing more you can do and are
totally blocked, come back with clear questions that set the stage for me to answer quickly.
```
