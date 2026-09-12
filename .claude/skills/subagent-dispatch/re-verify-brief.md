---
type: Reference
title: "Scoped re-verify brief template"
description: "Copyable brief for re-verifying one fix round finding by finding. Companion to the subagent-dispatch skill."
tags: [agents, verification, template]
timestamp: 2026-09-10T00:00:00Z
---

# Scoped re-verify brief template (one fix round)

Dispatch: `quick` (sonnet) for small mechanical fix diffs with a clear oracle; `standard` otherwise.
A FRESH seat every time — never the implementer, never the reviewer that raised these findings.

🚨 **This brief narrows the SCOPE, not the verdict count.** You still return Verdict A (vision/spec on
the live surface) and Verdict B (doctrine/quality from the fix diff) as two separate headed sections,
after the finding-by-finding list. A reopened finding answered with one merged list has lost Verdict B.

Findings under verification (verbatim, one per bullet): [FINDINGS]
Brief: [PATH] · Report (fix appended): [PATH] · Fix package (fix commits only): [PKG] · Build: [SHA]

For each finding in order: ADDRESSED | NOT ADDRESSED with file:line / URL evidence.
"Attempted" is not addressed — the specific defect must no longer exist on the current build.
Live findings: re-run the full acceptance targets the fix touches, not only the reported step.
New breakage in the fix diff: severity + file:line, or "none".
Out-of-scope observations (outside the fix diff): list them; they never extend this round.
Then, as separate headed sections:
### Verdict A — vision/spec on the live surface: PASS | PARTIAL | FAIL, with evidence.
### Verdict B — doctrine/quality from the fix diff: PASS | FAIL, with Critical / Important / Minor.
Overall: ALL ADDRESSED | OPEN: [list]. No preamble. Never dispatch reviewers.
