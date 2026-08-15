# FEATURE.md — `crm/inbox` + `crm/chasebox`

**Status:** `inbox LIVE · chasebox LIVE · inbound ingestion PENDING (aidream)` · **Tier:** `1` · **Last updated:** `2026-08-15`

Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md`.
Program: `/Users/armanisadeghi/code/common-docs/projects/outreach-system/` (this is WP1's client half).
Read [`features/crm/FEATURE.md`](../FEATURE.md) and
[`features/crm/compliance/FEATURE.md`](../compliance/FEATURE.md) first — the contact-medium
split and THE ONE SEND AUTHORITY both govern everything here.

---

## 🚨 THE RULING THIS FEATURE IS (D9)

**The unified inbox and the Chasebox are VIEWS over `crm.interaction` +
`crm.outreach_list_member`. They are NOT new tables and NOT a new inbox data model.**

A separate inbox store violates the one-engine rule, and a separate outreach console is
named as a failure mode in the work order's traps list. Both surfaces therefore live at
`/crm/*`, beside the CRM, reading the same two tables the dialer and the outreach-list
workspace already write.

**There is exactly one new persisted thing in the whole feature**, and it is not a table:
`crm.interaction.attributes.inbox = { handled_at, handled_by }`, written only by
`public.crm_inbox_set_handled`.

---

## Purpose

- **`/crm/inbox`** answers *who replied* — every inbound reply in full context, so the
  reader never has to leave to know who this is and why we wrote to them.
- **`/crm/chasebox`** answers *what needs me now* — five queues over the same schema, each
  with a live count that is itself a door, and every detected problem beside its one-click fix.

---

## The SQL layer — `migrations/crm_08_inbox_chasebox.sql`

Applied live and ledger-recorded (`public._schema_migrations`, `source='matrx-frontend'`).
Written from the template in [`lib/list-scope/FEATURE.md`](../../../lib/list-scope/FEATURE.md);
the worked references are `agx_list_scoped_v3_all_columns.sql` and `trx_list_scoped.sql`.

| Function | Role |
|---|---|
| `crm_inbound_label(jsonb)` / `crm_inbound_evidence(jsonb)` | The PROVISIONAL classifier accessor — SQL half (see below) |
| `crm_inbox_search_score(…)` | Relevance tiers, ported from `agx_search_score` |
| `crm_step_matches(int, text)` | Attempt-number buckets, so Step filters like every other column |
| `crm_inbox_list_scoped(…)` | The list: scope, search, deep search, filters, sort, paging, `total_count` |
| `crm_inbox_list_scope_counts(…)` | Scope tab totals + My Orgs narrowing labels, one query |
| `crm_inbox_list_facets(…)` | Filter-panel options WITH counts |
| `crm_inbox_set_handled(uuid, boolean)` | The ONE writer of `attributes.inbox` |
| `crm_chasebox_items(queue, …)` | Five queues, ONE row type with a `queue` column |
| `crm_chasebox_counts(…)` | The five live counts in one round trip |

**THE RLS CEILING IS RESTATED INSIDE EVERY DEFINER FUNCTION.** `crm.interaction`'s
`std_select` keys on `iam.accessible_entity_ids('party','viewer')`, and
`crm.outreach_list_member`'s on `crm_outreach_list` — both are reproduced verbatim, because
`SECURITY DEFINER` bypasses RLS and these surfaces must never show a row the user cannot open.

**Scopes are `mine` + `orgs`, and that is deliberate.** An interaction is private business
data with no `visibility` axis, and CRM still has no grant-reader RPC
(`features/crm/FEATURE.md` § Not built yet). A `shared` / `industry` / `public` tab here
could only ever read zero. A surface declares a SUBSET of the fixed five; it never invents
a sixth, and it never renders a tab that can only lie.

- **Mine** = `created_by = me` OR `assigned_to = me`. The sequence runner acts as the
  campaign owner (D-W1-3), so a reply ingested on my campaign is genuinely mine.
- **My Orgs** = `organization_id` ∈ my org memberships.

---

## 🚨 THE PROVISIONAL ATTRIBUTES CONTRACT — read before touching either half

The inbound-reply ingester and the sequence runner (aidream, landing alongside this) write
their state into `crm.interaction.attributes`. **The exact paths are not frozen.** Every
reader on the platform therefore goes through exactly two places:

- SQL: `public.crm_inbound_label` / `public.crm_inbound_evidence`
- TypeScript: [`attributes.ts`](./attributes.ts)

**Assumed paths (report a change, do not silently adapt a call site):**

```
attributes.inbound_classification = { label, evidence }   ← PRIMARY assumption
attributes.classification         = { label, evidence }   ← accepted alias
attributes.outreach_single_send   = { member_id, medium_id, identity_id, template_id,
                                      reputation_case_id, backlink_id, render_fingerprint,
                                      drafted_at, approved_at, sent_at,
                                      provider_message_id, send_failure }
attributes.inbox                  = { handled_at, handled_by }   ← OURS, RPC-written only
```

`label` is narrowed onto the closed set `bounce | unsubscribe | ooo | interested |
not_interested | other`. **An unrecognised string becomes `other`; a MISSING label stays
`null` and renders as "Unclassified"** — those are different facts, and collapsing them
would tell the user a model made a judgement it never made.

A rename on the server is a one-line change in each of the two accessors. It is never a
grep across the inbox, the Chasebox, the timeline and the record page — that is the entire
reason both accessors exist.

---

## Invariants

- **No second send path, ever.** Replying from the inbox resolves the campaign + member and
  hands them to the CANONICAL `SingleSendDialog`
  (`features/crm/components/outreach-lists/SingleSendDialog.tsx`), over the same
  `createOutreachDraft → approveOutreachDraft → sendOutreachDraft` client and the same
  `readOutreachProblem` fix rendering. The Chasebox's draft flow calls the same two
  approve/send functions on the draft the runner already created.
- **The `outreach.send` gate lives INSIDE `SingleSendDialog`**, compact, beside the Send
  button, keyed on the CAMPAIGN'S organization — never the active-org selection. One gate,
  every consumer, and a blocked user meets the explanation where they were about to press.
  *(The outreach-list workspace had no gate at all before this; putting it in the shared
  dialog fixed that surface too rather than adding a second opinion beside it.)*
- **Reading is never gated.** Only the send is a plan capability. Gating the teaching is how
  a non-technical expert's outreach career ends on day one.
- **HANDLED has two independent, honest signals**, and neither is a new table:
  1. a human pressed *Mark handled* → `attributes.inbox.handled_at`
  2. **we already answered** → a later outbound interaction on the same `thread_key`

  (2) means replying through the one send primitive clears the row on its own, so the queue
  cannot rot behind a forgotten checkbox.
- **Reply→send correlation is by `thread_key` (the Gmail threadId), never RFC822
  `Message-ID`** (D-W1-5). Matching `in_reply_to` against
  `sending_event.provider_message_id` would silently never match.
- **Every column sorts AND filters server-side**, including `why` (the motivating record)
  and `step` (bucketed). A filter the server cannot serve does not render.
- **Search is relevance-ranked from day one.** Deep search adds the full message body.
- **A queue with zero items renders a clean empty state** — never a spinner, never
  "Loading…", and a FAILED read renders its error with a Retry rather than an empty list.

---

## THE DOOR LAW, surface by surface

Nothing here prints a name or an id the user cannot reach.

| Named thing | Door |
|---|---|
| Who replied | `EntityRef token="party"` → `/crm/[partyId]` (+ new tab, + peek) |
| Outlet / employer | `EntityRef token="party"` |
| Campaign | `EntityRef token="crm_outreach_list"` → `/crm/outreach-lists/[listId]` |
| Sending mailbox | `EntityRef token="crm_sending_identity"` → `/crm/sending-identities/[id]` |
| The motivating record | `/marketing/brands/[brand]/sites/[site]/reputation` or `/backlinks` |
| Every Chasebox problem | its own fix button, resolved by `chaseboxFixHref` |
| Every queue count | clicking it opens that queue |

**The motivating record's whole path is resolved IN THE RPC** (`reputation_case_site_id` /
`_brand_id`, `backlink_site_id` / `_brand_id`), because both routes live under a brand and a
site. When the path cannot be resolved the label renders as plain text and **no fake link is
offered** — never render an id you cannot open.

**Doors IN**, so neither surface is reachable only by typing a URL: `/crm` header
(Inbox + Chasebox), the outreach-list workspace header (Replies + Chasebox), each surface to
the other, and `InteractionTimeline` on every record page — where an inbound reply now
carries a standing accent, the classifier's badge and evidence, and a link to the campaign
it answers.

---

## Files

| File | Holds |
|---|---|
| [`attributes.ts`](./attributes.ts) | 🚨 THE ONE client reader of `crm.interaction.attributes` |
| [`types.ts`](./types.ts) | `InboxRow` (from the generated RPC return), scopes, href resolvers |
| [`service.ts`](./service.ts) | The entity-list service triple, `setInboxHandled`, `fetchInteractionById` |
| [`columns.tsx`](./columns.tsx) | The column registry — every column sorts and filters |
| [`listConfig.tsx`](./listConfig.tsx) | The `EntityListConfig` — third consumer of `lib/entity-list` |
| [`useInboxRowActions.tsx`](./useInboxRowActions.tsx) | The ONE row action list |
| [`components/InboxPage.tsx`](./components/InboxPage.tsx) | The route body |
| [`components/InboxReplyDialog.tsx`](./components/InboxReplyDialog.tsx) | Resolves campaign+member, hands off to the canonical dialog |
| [`constants.ts`](./constants.ts) | The two assist surface names |
| `../chasebox/types.ts` | Queue vocabulary + metadata + fix resolution |
| `../chasebox/service.ts` | `crm_chasebox_counts` / `crm_chasebox_items` |
| `../chasebox/components/ChaseboxPage.tsx` | The five queue cards + the item list |
| `../chasebox/components/ChaseboxDraftDialog.tsx` | Read the exact message, then approve + send |
| `../components/outreach-lists/badges.tsx` | `InboundLabelBadge` lives with the OTHER status maps |

---

## Assists

`<AssistStrip>` is mounted on both surfaces (`matrx-user/crm-inbox`,
`matrx-user/crm-chasebox`) and renders nothing today, because **no producer writes to them
yet**. That is declared, not forgotten: the first genuine assist belongs with the
inbound-classification server half — *a reply arrived with no classifier verdict* is a real,
one-click-fixable gap and exactly the shape `platform.assists` exists for. The Chasebox's
five queues are deliberately NOT assists: they are the action surface itself, and emitting
chips that duplicate them would be a second suggestion system beside the first.

---

## Verified live (2026-08-15)

Against the real database, with a temporary fixture that was **committed, browser-verified,
then deleted** (`crm.interaction` is back to its original 4 rows, 0 inbound):

- The inbox renders a real reply with its classification, evidence, snippet, campaign,
  step 2, resolved outbound parent, and both doors; scope counts, facets and the handled
  filter all agree with the row.
- `crm_inbox_set_handled` flips the row to Handled and back, live, from the row menu.
- Answering the thread with a later outbound interaction drops it out of `fresh_replies`
  automatically (the derived half of HANDLED).
- The Chasebox reports true live counts and `blocked_members` = 3 real members with no
  contact point, each stating `recipient_not_in_list` and its fix.
- The reply action opens the canonical `SingleSendDialog`, correctly resolved to Lane B and
  the right recipient.
- `outreach.send` is genuinely enforced: on a Free org the Send control renders the
  capability explanation instead.

## Known limits

- **Inbound ingestion is not live yet** (aidream half). Until it lands, the inbox is
  legitimately empty on production data and the `fresh_replies` queue reads 0.
- **`stalled_sequences` and `escalation_candidates` read 0 today** because no campaign has a
  `definition.sequence` yet — the runner writes it. The queues are correct and will populate
  themselves; they are not stubs.
- **`blocked_members` calls `crm.check_send_eligibility` per member** (the ONE authority,
  never a second copy) for members that pass the cheap structural checks. It is `STABLE` and
  the live volumes are tiny; revisit if a campaign ever reaches thousands of blocked members.
- **The Chasebox is not an entity-list config.** It is a queue console — five saved filters
  with per-row verbs — not a searchable, column-configurable list of one entity. If it ever
  grows search + per-column filtering it should become an `EntityListConfig` with `queue` as
  its `kind` column, exactly like `/transcripts`.
- **No per-campaign deep link into the inbox yet.** The campaign workspace links to the whole
  inbox rather than to its own replies; the filter bag can express it (`outreach_list_name`),
  but the entity-list shell has no URL-query hydration for filters.

---

## Change log

- 2026-08-15 — **Created (WP1).** `migrations/crm_08_inbox_chasebox.sql` applied live +
  ledgered; `/crm/inbox` and `/crm/chasebox` shipped on the canonical entity-list shell and a
  queue console over the SAME two tables; the reply path reuses `SingleSendDialog`; the
  `outreach.send` gate moved INTO that dialog (which also closed the outreach-list
  workspace's missing gate); `InteractionTimeline` now distinguishes an inbound reply and
  reaches its campaign; both routes registered in `/crm/admin`.
