---
type: Reference
title: "safety-net playbook template — STEPS for the runner, SEALED CHECKS for the grader"
description: "The two-half shape of one real test: copy it to common-docs/operations/real-tests/<area>/<playbook-id>.md. The runner receives only the STEPS half, as a separate file."
tags: [testing, template, safety-net]
timestamp: 2026-10-01T00:00:00Z
---

# <PB-01> — <the job a person is doing, in their words>

Area: `<area>` · Weaknesses covered: W-02, W-05, W-07 · Written: <date> by <lane/agent> · Change: <one line>

Triggers (one run each): `chat` · `context-menu` · `surface-binding` · `mandate` — strike the ones
that cannot perform this job and say why.

---

## STEPS — this half is handed to the runner as its own file. Nothing below the line is.

**Who you are:** `admin@admin.com` on your own preview hostname (`pnpm dev-login /<route>` prints
the URL). The preview must be in clone mode. Use only the in-app browser and the read queries
named here, against clone project `<ref from operations/clone/CURRENT.md>`.

**Start state:** <the real-use-case dataset by name, and how the runner reaches the state — e.g.
"open the Harbor Dental note 'New-patient intake checklist'; attach the file `intake-2026-10.md`
from the Sources picker; attach the internal resource 'Front desk scripts'">. Never create the end
state by any means other than the product's own screens.

**Steps:**
1. <open …>
2. <type exactly: "…">  ← the typed text carries its marker without saying so
3. <attach …>
4. <wait for …; when a confirmation control appears, read it in full, then approve it>
5. <…>

**Capture (raw, no judgment):**
- C1 — the full text of <the note> after step 5, copied exactly.
- C2 — the result of this query on the clone: `select … from … where …;`
- C3 — the list of tool calls shown in the conversation, in order, with each tool's name.
- C4 — a screenshot of <panel>.
- Anything that stopped you: "could not complete step N because …".

Return C1–C4 and nothing else. Do not say whether it worked.

---

## SEALED CHECKS — never given to the runner

| Marker | Planted in (channel) | Must appear in | Must NOT appear in | Covers |
|---|---|---|---|---|
| `Tuesday 7:40 pickup` | attached `.md` file | C1 (note body) | C3 as typed input | W-02 |
| `Ask for insurance group number` | internal resource | C1 | — | W-05 |
| `(notes page tool) update_note` | page context | C3, exactly once, after the confirmation | before the confirmation | W-07 |
| row `updated_by` = admin, `version` +1 | the write | C2 | — | W-07 |

Grade: PASS only when every row holds. FAIL names the first row that does not, which names the
channel. INCONCLUSIVE when the runner did not finish — never a pass.

## Fault proof for this playbook

| Date | Fault (channel, where, how restored) | Runner | Grade | Marker that failed | Verdict on the playbook |
|---|---|---|---|---|---|
| | | | | | trusted / rewritten |
