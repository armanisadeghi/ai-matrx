---
status: active
updated: 2026-08-14
repos: [matrx-frontend, aidream]
owner: unassigned — Arman will assign a dedicated agent
---

# CRM record classification — keep the platform's discoveries out of the user's face

**The one-sentence problem (Arman, 2026-08-14):**

> *"Someone who has one hundred customers or leads is doing a search, and while they're
> looking for their leads — the people they make money from — they see hundreds of random
> useless things we've added that they couldn't care less about, except when they're doing
> SEO."*

**This is not an SEO problem. It is a CRM architecture problem, and SEO is only the first
place it surfaced.** Every feature that learns about the outside world wants to write a
`crm.party`: SEO link prospects, media outlets, research experts, YouTube/social channels,
NER promotions, scraped authors, competitor companies. Each one is correct on its own and
each one makes the CRM worse for the person who opens it to find a customer.

Live count on 2026-08-14, before any of this: **1,181 platform-discovered parties against 6
real contacts** in the same table, in the same list, behind the same search box.

---

## What is ALREADY DONE (2026-08-14) — the foundation, deployed

Do not rebuild these; build on them.

| Piece | Where |
|---|---|
| `crm.party.record_class` — `'contact'` (default) \| `'discovered'`, CHECK-constrained, indexed `party_org_record_class_idx` | live DB |
| Every automated producer stamps `'discovered'` (SEO fold, social fold, expert promotion), CREATE-only so a human's promotion is never reversed | aidream `services/crm/*` |
| Backfill of the 1,181 existing platform rows | live DB |
| Default list predicate = contacts only, with a **Record** facet (My contacts / Found by the platform / Everything) | `features/crm/service.ts`, `components/columns.tsx`, `components/CrmListPage.tsx` |
| Scope-tab counts take the same filter (`crm_list_scope_counts(p_record_class)`) so a tab can't read 1,181 above a list of 6 | live DB RPC |
| Agent-facing `data` tool tells agents to filter `record_class='contact'` | aidream `services/agent_data/registry.py` |
| Contract + invariants | aidream `services/crm/FEATURE.md` § record_class |

---

## What is NOT done — the actual work order

### 1. The axis is right; the vocabulary is a stub
Two values were the minimum that fixed the bleeding. The real question is what the
categories should BE, and it is a product question, not a schema question. Candidates seen
in the data already: link prospect, media outlet, expert, creator/channel, competitor,
vendor, partner, past customer. **Interview Arman before choosing** (see "How to run this"
below). Whatever is chosen must stay a *system-owned structural axis* — the user's own
taxonomy is `platform.categories` (lifecycle stage, rating, segments) and must not be
merged into it.

### 2. Display + search settings, per user, remembered
Arman's words: *"hidden by default and only visible when you're in the right UI, or if you
specifically go into search settings or display settings and check them so that they're
included."* Today the facet resets to the default on every page load. Needed: a persisted
per-user display/search preference (the platform already has saved views —
`features/crm/saved-views/` — and a surface-defaults mechanism; use them, do not invent a
third).

### 3. Everywhere else a party is listed
The list page is fixed. These are not, and each is a place the pollution reappears:
global search, the outreach-list "add members from filters" flow (it shares
`applyPartyListPredicates`, so verify), duplicates/merge candidates, the party picker in
dialogs, `crm_list_scope_counts` callers, agent surfaces, exports.

### 4. Promotion — the moment a prospect becomes a contact
There is no UI for `discovered` → `contact` yet. It should exist wherever a discovered
record is visible (single and bulk), and it is the same act outreach needs later when a
prospect replies. Consider stamping who promoted it and when.

### 5. The same problem on other tables
`crm.interaction`, `crm.outreach_list_member`, and future activity rows inherit the
question the moment automated outreach starts writing them.

### 6. Should discovered records be org-visible at all?
The YouTube fold writes into the Matrx system org deliberately (see aidream
`services/crm/FEATURE.md`). A tenant's own SEO folds write into the tenant's org. Whether a
tenant should see a *platform-curated* directory at all, and where, is unresolved.

---

## How to run this (Arman's instruction, 2026-08-14)

> *"Do all the research you can on the topic, then come to me with your best suggestions and
> a list of questions so I can answer them — interview me to get the vision out of me after
> you've given me the basics."*

So: research first (this doc, the live data, how HubSpot/Salesforce/Attio/Clay separate
"records you own" from "records the system found" — Clay and Apollo are the closest
analogues), then present the basics plus **open questions**, and interview him. Do not
ship a vocabulary you invented alone.

**Non-negotiables while you work:**
- Never delete or merge rows a user placed. Classification is metadata, not cleanup.
- Hidden must never mean unreachable (THE DOOR LAW) — every hidden record keeps a door.
- One axis, one authority. A second "is this junk" flag anywhere is the failure mode.

## Related

- `aidream/aidream/services/crm/FEATURE.md` — the live contract for `record_class`.
- `docs/handoffs/outreach-system.md` — G1 (the SEO→CRM bridge) is what surfaced this.
- `docs/handoffs/crm-system.md` — the CRM's own work order.
- `/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md` — cross-repo system of record.
