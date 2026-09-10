---
type: Reference
title: "Scoped re-verify brief template"
description: "Copyable brief for re-verifying one fix round finding by finding. Companion to the subagent-dispatch skill."
tags: [agents, verification, template]
timestamp: 2026-09-10T00:00:00Z
---

# Scoped re-verify brief template (one fix round)

Dispatch: `quick` (sonnet) for small mechanical fix diffs with a clear oracle; `standard` otherwise.

Findings under verification (verbatim, one per bullet): [FINDINGS]
Brief: [PATH] · Report (fix appended): [PATH] · Fix package (fix commits only): [PKG] · Build: [SHA]

For each finding in order: ADDRESSED | NOT ADDRESSED with file:line / URL evidence.
"Attempted" is not addressed — the specific defect must no longer exist on the current build.
Live findings: re-run the full acceptance targets the fix touches, not only the reported step.
New breakage in the fix diff: severity + file:line, or "none".
Out-of-scope observations (outside the fix diff): list them; they never extend this round.
Verdict: ALL ADDRESSED | OPEN: [list]. No preamble. Never dispatch reviewers.
