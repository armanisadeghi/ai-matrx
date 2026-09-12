---
type: Reference
title: "Independent verifier brief template"
description: "Copyable brief for a zero-authorship reviewer returning separate vision/spec and doctrine/quality verdicts. Companion to the subagent-dispatch skill."
tags: [agents, verification, template]
timestamp: 2026-09-10T00:00:00Z
---

# Independent verifier brief template

Dispatch: `standard` (opus) by default; `quick` (sonnet) only with a mechanical oracle.
A FRESH seat every time — never the builder, never a resumed worker, never a reviewer that already
looked at this. Zero authorship: you did not build this and did not write its brief.

🚨 **Return TWO verdicts, separately — A and B are never merged into one findings list.** Verdict A can
pass while Verdict B fails, and the reverse; one merged list headed "findings by severity" lets either
mask the other and is a failed review even if every check appears in it.

## What was requested
Brief: [PATH]. Vision/spec: [PATHS §]. Acceptance targets: [list or register row].
Binding constraints (verbatim): [..]

## What the builder claims
Report: [PATH] — unverified claims. Rationales ("kept simple", "per YAGNI") are self-grading and never
lower a severity. Worker screenshots and test runs are leads, not proof.
Review package: [PKG PATH] (the builder's own commits: [SHAs]).

## Verdict A — vision/spec on the LIVE surface
Exercise every target as a real user (non-admin where access matters) with real data, on the build you
state (SHA / version). Try to break it; pair every refusal proof with a positive control that could
fail; re-run every red before believing it. Warnings and console noise are findings.
Per target: PASS | PARTIAL | FAIL with URL + evidence. Then: Missing · Extra (unrequested scope) ·
Misunderstood · ⚠ Cannot verify (what the owner must check).

## Verdict B — doctrine/quality from the diff
Reuse-first (a second implementation of something we own?) · no-legacy (shim, fallback, dead twin,
deprecated path left alive?) · platform primitive vs feature-local · nothing fails silently · opinions
hardcoded instead of knobs · guard proven RED→GREEN · tests clear `forcing-function-tests` (no
manufactured fixtures, no `return expected` passes). Inspect code outside the diff only for a named
risk; name the risk and the check.

## Calibration
Critical = broken, unsafe, or data loss. Important = cannot be trusted until fixed (missed target,
swallowed error, duplicated logic, shim). Minor = polish. Something the brief MANDATED that this rubric
calls a defect is still Important, labeled brief-mandated — the owner rules.
Evidence you cannot read is a gap to report, not a failure to invent — re-read the path first.

## Output (no preamble; every line a verdict, a finding with file:line / URL, or a check you ran)
### Verdict A — vision/spec on the live surface  ### Verdict B — doctrine/quality from the diff
(two separate headed sections, each carrying its own PASS/FAIL and its own Critical / Important /
Minor findings — never one list)  ### ⚠ Cannot verify
### Build verified: [SHA/version]  ### Overall: FLIP | REOPEN — one sentence
Never dispatch other reviewers. Read-only on the checkout.
