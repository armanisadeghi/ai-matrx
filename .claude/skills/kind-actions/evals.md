---
type: Reference
title: "kind-actions — proof"
description: "RED/GREEN proof for the kind-actions skill: the Instagram image-button request answered without and with the skill. Companion to the kind-actions skill."
tags: [kind-actions, skills, evals]
timestamp: 2026-10-06T00:00:00Z
---

# kind-actions — proof

## Scenario (from reality, 2026-10-06)

Arman asked the agent building his `instagram_concept_remix` board (component
`concept_remix_board`) for a button on each idea that has another agent write an image
description, generates the image, and shows it in the card. That agent answered **"Not
available yet"**: it read the component-authoring contract (`kind_shared.py` `PROPS_CONTRACT`,
which then listed only `data`, `kind`, `config`) and the allowed imports, and concluded a shape
could not trigger an agent — although `runAction` already existed. That transcript is the
incident; the reps below replay the same request.

Prompt (all reps): the owner's request verbatim, "answer in under 400 words: can it be done
today, the exact mechanism with a code sketch incl. kit import path, where the result is stored
and how the image is displayed, which skill/doc told you." Lane: workflow `agent()`, model
sonnet. Grader: the session that wrote the skill read the outputs (author-graded — rerun with an
independent grader on the next edit).

## RED — without the skill (draft hidden), 3 reps — run `wf_ebbd2c72-f23`

| Rep (agent id) | Can it be done | Source | Defects |
|---|---|---|---|
| a7e91d5772d6a8866 | yes | raw source under `features/content-ir/react/actions/` | no author doc found |
| a907cdd272fd81e41 | yes | raw source + shape-system | imported the button from `@ai-matrx/content-ir-react/kind-kit` (refused for stored code); unsure `src` exists on saved images |
| a2fe573011aa0a2e7 | yes | raw source | "found no props contract, so I used Button"; unsure of the image shape |

All three reached the mechanism only by reading uncommitted host source (the code had just been
written in the shared checkout); every rep said no skill or doc teaches it. The original
incident agent, with only the authoring contract, answered "not available".

## GREEN — with the skill, 3 reps — run `wf_46b82b27-0d9`

All three: "yes", `run_shortcut` chain with `saveAs` per step, `expect: "image"`, render
`itemState[key].src`, import `@/components/kind-kit/KindActionButton`, cited
`common-docs/skills/kind-actions/SKILL.md` + `chains.md`. Gaps they reported and that were then
closed: the `run` prop the skill named was not yet published; `evals.md` missing; no real
shortcut ids. Transcripts: `~/.claude/projects/-Users-armanisadeghi-code/5e9e43ad-8aee-4b0b-85be-acfa318108c1/subagents/workflows/wf_46b82b27-0d9/`.

## Rationalizations harvested

| Excuse (verbatim) | Reality |
|---|---|
| "Not available yet … What the component receives: only data, kind and config." | The host has always passed `runAction`; the contract text omitted it. Fixed in `PROPS_CONTRACT` and this skill. |
| "found no props contract, so I used Button" | `KindActionButton` exists for exactly this; §4. |
