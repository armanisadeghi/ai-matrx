---
type: Reference
title: "agent-review-queue — Markdown message-format eval"
description: "Independent proof that the review-message rule replaces single-paragraph review instructions with readable Markdown."
tags: [agent-review-queue, formatting, evals]
timestamp: 2026-09-21T00:00:00Z
---

# Agent Review Queue — Markdown message-format eval

## Scenario

The 2026-09-21 review row `b4ecd2cc-77d6-4147-bff9-4f248a42784a` stored five messages with no newline characters. Its filing instruction packed five table-test steps and feedback into one paragraph. The changed rule requires headings, lists, blank lines, and labeled outcomes.

## Results

| Rep | Lane | Legacy instruction | Current instruction | Evidence |
| --- | --- | --- | --- | --- |
| `/root/format_eval_1` | standard | One paragraph | `## What to review`, five numbered steps, `## Feedback wanted` | agent transcript |
| `/root/format_eval_2` | standard | One paragraph | `## What to re-check`, numbered repair checks | agent transcript |
| `/root/format_eval_3` | standard | One paragraph | `## What to review`, numbered checks, labeled decision | agent transcript |

All three current-instruction reps cited `skills/agent-review-queue/SKILL.md`; all three legacy reps produced the failure shape. The observed failure is therefore addressed by a required Markdown structure, rather than an advisory reminder.
