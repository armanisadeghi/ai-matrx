---
name: domain-vision-interview
type: Skill
title: "domain-vision-interview — extract the minimal vision and the final vision"
description: "The quick big-picture interview that extracts from Arman, per Domain (or major Feature), the MINIMAL vision (what must exist before we can go live) and the FINAL vision (the ultimate goal), captured verbatim into the node's VISION.md so gap analysis has both bars. Use with /domain-vision-interview <domain>, when a registry domain is ratified without a vision, or when a node shows VISION MISSING. Ruled by Arman 2026-08-20."
tags: [meta, vision, interview, registry, docs-system]
timestamp: 2026-09-10T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/domain-vision-interview/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# domain-vision-interview — the minimal vision and the final vision

**Arman, 2026-08-20 (verbatim in [/systems/platform/docs-system/VISION.md](/systems/platform/docs-system/VISION.md)):**
*"An agent comes to me and does a quick interview, and it's a big picture interview where
the agent essentially extracts from me the minimal vision for the particular module and
then the final vision. So the minimal vision would be what we have to have before we can go
live — because we're not in production yet, and we're being held up by all this stuff. And
then what's like the ultimate goal of this thing — and capturing those and documenting them
allows for agents to be able to do a much better job of doing gap analysis."*

**Disambiguation:** this is NOT the platform's Vision Interview System
(`systems/masterwork/vision-interview/` — a Masterwork Approach, a product feature for users). This is
an internal docs-system skill: a short conversation with Arman about one Domain.

## Before the interview

1. Confirm the target: one Domain (or one major Feature) from `meta/registry.yaml`. One
   interview covers ONE node — never a menu of domains in one sitting.
2. Do the homework HE shouldn't have to do: read the node's existing docs and skim its code
   anchors so your questions are informed. Collect any existing verbatim Arman quotes about
   it — the interview extends his record, never re-asks what is already settled (check the
   node's DECISIONS.md and the "settled — never re-ask" tables).
3. Prepare and ask per the `grilling` skill, kept shallow on purpose. The MINIMAL bar and the
   FINAL vision both go in round 1 (both open-ended). No spec-depth branches.

## The interview — two bars, big picture only

- **The MINIMAL vision:** "What must this domain have, at minimum, before we can go live?"
  Chase it until it is a concrete, finite list in his words — the go-live bar. Push back
  gently on anything that sounds like final-vision scope creep ("is that needed to go
  live, or is that the destination?").
- **The FINAL vision:** "When this system is fully grown, what is it?" Open-ended; let him
  talk; capture his words. (His own exemplar: the CMS is not a content tool — *"it's a
  website platform… a replacement for Shopify, WordPress… web building and hosting and
  domain management."*)
- Stay big-picture: this is a quick interview, not a spec session. Details he volunteers
  are captured; details he doesn't are not chased.

## After the interview

1. Write the node's `VISION.md` (or extend it): two sections — **Minimal vision (go-live
   bar)** and **Final vision** — all verbatim, attributed, dated; inferences marked
   `(inferred)`; nothing paraphrased. Update the registry node (vision recorded).
2. Clear `VISION MISSING` wherever the node carried it (register Notes, handoffs).
3. **The gap analysis is now mechanical:** the node's STATE.md pending list gets two flags —
   items required by the MINIMAL vision (go-live blockers) vs items serving only the FINAL
   vision. Surface the go-live set prominently; that is the whole point.
4. Commit + push; log.md line; end with the mandatory question: any (more) modifications to
   the skill or the core system?

# Changelog

- 2026-09-10 — Step 3 now points to the `grilling` skill for question preparation and delivery
  (kept shallow: both bars in round 1, no spec-depth branches).
- 2026-08-20 — Created per Arman's ruling in the docs-system overhaul session (third
  sitting).
