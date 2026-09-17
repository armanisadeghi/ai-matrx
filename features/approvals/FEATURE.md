# THE platform approval queue

**Status:** built; the store is live (`platform.assists.auto_apply_at` + its index and the four `hitl.google` knobs verified in the database 2026-09-17), the surface itself is unverified in a browser · **Policy:** `common-docs/policies/human-in-the-loop-autonomy-modes.md` (rule 5 "approval surfaces are one place, not many", rule 6 "whoever may act may approve") · **Plan:** `common-docs/projects/google-native/PLAN.md` §5.5 (build unit U-P4), §4.4 (Gmail), §4.2 (Sheets), §7 (the knobs) · **Store SoR:** `common-docs/systems/platform/assists/FEATURE.md`

One surface where a person with review rights sees every pending AI proposal in their scope — accept all, reject all, or one by one (the system has no opinion which). Every item shows what will change, who or what proposed it, the mode it is running in, and, in mode 3, when it applies itself. Every record a row names opens.

## The ruling: LIFT, not rebuild (2026-09-17)

The SEO value-system queue (register KI-045) was already the generic mechanism: one component, a kind registry, a documented "registering a kind" path, a decision-lifecycle guard, and a store — `platform.assists`. So it was **lifted whole** into this feature: the engine, the registry and its three keyword kinds, which are now three registrations among five. Nothing was rebuilt and nothing forked.

- **Why not build fresh:** a new queue that did not import that registry would have been the platform's *fourth* approval surface (SEO, CMS, HR workflow inbox, and it), which is the exact failure rule 5 names. Rebuilding would also have thrown away a component that had already been walked at 375px and had a remount guard written for a real bug.
- **Cost if this ruling is wrong:** the engine carries the keyword kinds' shape assumptions (a site dimension, reached through `ApprovalScope.siteId` + `scopeRequirement`). If that proves to be the wrong generalisation, the fix is one field on the scope and one field on the kind — not a rewrite.
- **Why no new table:** `platform.assists` already carries the addressee, the subject, a typed proposal payload, the org, the decision + who + when + note + receipt, dedupe and priority. Exactly ONE column was missing (`auto_apply_at`, the mode-3 clock) and it is added additively. An earlier draft of this lane created `platform.approval_proposal`; that was wrong and was deleted before commit. Cost if wrong: `data.ts` is the only module that names the store.

## Parts

| Part | File | Role |
|---|---|---|
| Contract | `types.ts` | `ApprovalKind`, `ApprovalItem`, `ApprovalSource`, `ApprovalDecisions`, `ApprovalScope`, `AutonomyMode`, `ApprovalScopeRequirement` |
| Registry | `registry.ts` | `APPROVAL_KINDS` — THE one ordered list |
| Queue | `ApprovalQueue.tsx` | One list: per-item + select-all, consequences re-listed in the confirm, reason where the write keeps one, the mode line, blocked rows, kinds that live elsewhere named with their door |
| Failure strip | `ApprovalLoadError.tsx` | A kind that cannot be read is named and retryable; the missing-store case names the migration |
| Store seam | `data.ts` | The ONLY module that names `platform.assists`: read, decide, propose |
| Mode ladder | `mode.ts` | `hitl.*` knob reads that REFUSE rather than guess (policy rule 8) |
| Surface | `ApprovalsWorkspace.tsx` | The one screen both hosts mount |
| Route | `app/(core)/approvals/page.tsx` | `/approvals`; reads `?item=<assist id>` server-side and hands it down, so the queue expands, scrolls to that row and rings it — and says plainly when that row is no longer waiting |
| Window | `windows/ApprovalsWindow.tsx` + `features/overlays/openers/approvalsWindow.tsx` | The same surface in a `WindowPanel`, wrapping the canonical component |
| Badge | `usePendingApprovalCount.ts` + `features/shell/components/header/header-right-menu/ApprovalsMenuItem.tsx` | "Waiting on you" with a count in the user menu; no badge at 0 and none when the count could not be read |
| Kinds | `kinds/*.tsx`, `kinds/seo/*.tsx` | One module per proposal kind |

Also mounted on: the marketing approvals console (all keyword kinds, per site), the value workbench, the business guidelines panel (`keyword_meaning:guideline_edit`), the offering tree (`placement_drift`), discovery.

## Kind census (2026-09-17)

| Kind id | Proposed by | Mode | Body | Approve → | Reject → |
|---|---|---|---|---|---|
| `gmail_send` | an agent drafting one message | always mode 4 — Gmail send is human-confirmed per message and is **not a knob** (PLAN §4.4); a row claiming otherwise is shown as the defect it is | the existing `GmailReviewCard` (`features/google-workspace/agent/`), mounted as `individualReview` | the card's own Send posts exactly the reviewed bytes through `sendReviewedGmail`; the decision is recorded afterwards with the message id as its receipt | recorded as rejected with the reason; nothing is sent |
| `sheet_write` | a workflow/schedule (`hitl.google.unattended_file_write`, default mode 4) or an attended ask (`attended_file_write`, default mode 1 — which never reaches the queue) | the row's own | the tool's `write_sheet` dry run: the cells now beside the cells after, in `body` so the row stays batchable | `writeGoogleSheet` — the same call the grid makes — then the decision + what Google returned | recorded as rejected with the reason; the Sheet is untouched |
| `keyword_meaning` (matcher / worth / stamp / guideline_edit / offering) | the meaning agent, the matcher engine, discovery | mode 3 when the row carries a clock (a waiting autonomy mode wrote it), else mode 4 | `AssistCard` for an editable document | `acceptAssist` → the human RPCs in `suggestions/apply.ts` | `dismissAssist` (reason required) |
| `placement_drift` | the Offering assigner moved one of this site's keywords | mode 4 always (a derived read; nothing applies it but a person) | — | `seo.gsc_confirm_keyword_offering` | `setKeywordOffering` back to the earlier offering |
| `topic_placement` | the assigner below its confidence floor, or a waiting mode | mode 4 always | — | `seo.gsc_confirm_keyword_offering` | the site's own offerings list, via `setKeywordOffering` |

The three keyword kinds declare `scopeRequirement: { field: "siteId" }`, so `/approvals` names them and links the per-site console instead of pretending they do not exist.

## Who is addressed, and who may decide

**The addressee is the OPERATOR** — the person whose authority the agent ran under (attended: the person in the chat; unattended: the schedule's owner). That is the row's `user_id`, which is also what RLS scopes the read by, so a proposal reaches exactly one queue.

For `gmail_send` the operator must additionally be able to send from that account (the owner of a personal connection, or an editor on an organization-owned one). When they cannot, the item is created **blocked**: it still appears, says why, and says who can act — never silently dropped, never a disabled button with no reason. Cost if this ruling is wrong: an approval lands with the wrong person, visibly, and is reassignable.

## Registering a proposal kind

1. Build (or confirm) the ordinary HUMAN write path first. A kind never owns a private writer.
2. Add `kinds/<your-kind>.tsx` exporting an `ApprovalKind`:
   - `id`, `label`, `accept`/`reject` copy (`keepsReason: true` ONLY if the write stores the reason);
   - `useSource(scope)` → `{ items, total, loading, error, refetch, moreHref?, moreLabel? }`. Each item: `key = "<kindId>:<row id>"`, `headline`, `acceptEffect`, `rejectEffect` (the exact writes, in the reader's words), `mode`, `autoApplyAt` for mode 3, `doors`, `body` (the would-be change — keeps the row batchable), `individualReview` (must be read alone — excluded from select-all), `blocked`;
   - `useDecisions(scope)` → `acceptItems` / `rejectItems` returning `{ applied, failures }`; never throw for one item's failure;
   - `scopeRequirement` when the kind needs a dimension a person-scoped mount lacks.
3. Add it to `APPROVAL_KINDS`. Every mounted queue and both hosts now render it.
4. Emit rows with `proposeApproval` from `data.ts` (client) or the same `approval_proposal` action shape from aidream (server), addressed to the operator, with `__kind` on the payload.
5. Add a census row here and a Change Log line.

## Invariants

- ONE queue component and ONE registry. A host narrows with `kinds`; it never hands in a shorter list and never forks a list.
- A kind renders no review UI of its own when the product already has one (Gmail).
- Nothing applies without a person, except mode 3's server-side timeout — which has no runner yet (see the gaps).
- A batch confirm re-lists every item's exact effect; each item runs through its kind's single writer.
- The decision is recorded only after the replayed human write returned, and it carries that receipt.
- `gmail_send` never reaches Gmail before `crm.check_send_eligibility` (unsubscribes, blocklist, jurisdiction, identity standing) has answered.

## Known gaps

1. **The store is fully provisioned; `auto_apply_at` is missing from the generated types only.** Corrected 2026-09-17: the `approval.` producer-policy row DID land — it was created 2026-09-17 06:53:33Z (`max_pending_per_user` 500, `presentation_enabled` false) and `migrations/platform_approval_queue.sql` is ledgered in `public._schema_migrations` under source `matrx-frontend` (read live by the zero-authorship verification, common-docs `/projects/google-native/VERIFY-U-P4-U-M1.md` § A6). **Do not re-apply that file.** `platform.assists.auto_apply_at` and `assists_auto_apply_due_idx` exist and the four `hitl.google` knobs resolve with their intended defaults. What is still open: `types/database.types.ts` carries no `auto_apply_at`, because `pnpm db-types` cannot run in the container this lane worked in (no route to `db.matrxserver.com`) — so `readAutoApplyAt` reads a live column the type system does not list yet. The remedy is to run `pnpm db-types` from a box that can reach the database; **never hand-edit the generated file.**
2. **No mode-3 applier.** Nothing sweeps timed-out proposals. The column, the index and the visible instant exist; the runner does not, because an automated schedule needs Arman's approval by name and interval. Until it exists a mode-3 item behaves as mode 4 — it waits — which is the safe direction, and the row's own sentence still promises a clock. **This is the one place the queue currently over-promises.**
3. **Chip admission can refuse an approval.** `platform.assist_admission_decision` refuses on `user_quiet` (quiet hours) and `pending_budget_reached`. Quiet hours must never swallow a proposal a person must decide. The producer policy sets a high ceiling and presentation off, and the client writer returns the refusal loudly to its caller (whose contract is then "do NOT perform the change"), but the admission function itself should exempt approvals.
4. **No `sending_event` on an approved Gmail send.** The pre-send half of the CRM outbound spine is wired (`checkSendEligibility`). The post-send half — recording the send as a `sending_event` so the inbox can match replies — has no client-callable entry point for a 1:1 reviewed send; `sendReviewedGmail` posts to `/api/google-workspace/gmail/send-reviewed` in aidream, which is where that record belongs. Contract named, gap owned there.
5. **A recipient we do not hold as a contact point** cannot be checked against unsubscribes or the blocklist. The row says so in words and the person sends on their own judgement; it is not silently skipped.
6. **The CMS approvals panel and the HR workflow inbox are still separate surfaces.** CMS (`features/cms/components/admin/ApprovalsQueuePanel.tsx`) is a content-exception queue over a table that does not exist yet; HR's inbox (`hr_wf_inbox` / `hr_wf_decide`) is human workflow steps with their own delegation and authority model, not AI proposals. Neither is folded in by this lane; both are candidate kinds.
7. **Nothing here is verified on a live surface, because the queue has never held a row.** The zero-authorship verification (2026-09-17) found `proposeApproval` with zero callers, no `approval_proposal` emitter in aidream, and **0** rows on `matrx-user/approval-queue` against 434 pending assists elsewhere: the screen exists, the pipe into it does not, at either end. Every guard in `__tests__/` is therefore the only proof this engine has, and the empty state says only what is true (`./empty-state.ts`).

## Change Log

- 2026-09-17 — Claude (Cursor Bugbot on `0061daaa`, findings 1–3, plus the U-P4 verification's A-2 and a doc correction): **a row whose STATE changed now reaches the screen, and a deep link never claims "decided" without evidence.** (1) `KindSlot` compared only the item KEYS, so a Gmail draft first published as blocked ("checking this recipient against the unsubscribes") kept that shape forever under `gmail_send:<id>` once the outbound spine allowed the send — the review card never mounted. The signature is now DERIVED from everything the queue renders (`renderedSignature`, a serialisation of the whole source with nodes and functions reduced to presence tokens), so a field a future kind adds is compared the moment it exists; a per-kind distinct key would have fixed one kind and left the next to rediscover it. (2) `onFocusResolved` reported a boolean "found on the page", and each kind reads ONE page of `APPROVAL_PAGE_SIZE`, so row 51 was announced as "already approved or rejected". It now reports an `ApprovalFocusResolution` backed by a direct read of that id (`readProposalStatus` → `getAssistById`, new in the assists service): shown / decided / still pending but outside this page / unconfirmed — and the workspace prints exactly that much. (3) A deep link into a collapsed list expanded and scrolled in ONE turn, before the rows existed; expanding and scrolling are now separate effects and the scroll runs after `expanded` commits. (4) The empty state promised proposals nothing can produce today; the copy moved to `./empty-state.ts` and says what is true. (5) Known gap 1 corrected — the producer-policy row landed and the migration is ledgered; only `pnpm db-types` is outstanding. Guards: `__tests__/ApprovalQueue.focus-and-state.test.tsx` (four cases, each red before its fix).

- 2026-09-17 — Claude (Cursor Bugbot review of the lift, six findings, all fixed): **a blocked Gmail draft no longer gets a live Send button.** (1) `gmail_send` never copied the producer's `blocked` onto its item, so a draft whose operator cannot send from that account still mounted the review card — the field is carried now and the card does not mount at all for a blocked row. (2) While `crm.check_send_eligibility` was in flight the row fell through to the allowed branch; pending is now its own blocked state ("checking this recipient…"), because the card has no eligibility check of its own. (3) Both platform kinds now declare `scopeRequirement: { field: "userId" }` — they are addressed to a PERSON, and the marketing console mounts a queue per site, so unfiltered they repeated on every site and multiplied the waiting count; the console narrows with `SEO_APPROVAL_KIND_IDS` (now used, not dead) and says once where the person-scoped ones are. (4) The load-error strip named `platform.approval_proposal`, a table that was never created; it names `platform.assists` and no longer matches on the store's name, which had been labelling ordinary failures as a missing store. (5) `/approvals?item=<id>` now works: the route reads it server-side, the queue expands, scrolls to the row and rings it, and the workspace says plainly when that row is no longer waiting. (6) A blocked row's checkbox is disabled — it could be ticked and then ignored by Approve/Reject.

- 2026-09-17 — Claude (U-P4): **the SEO queue became THE platform queue.** Lifted `ApprovalQueue.tsx`, the registry, the three keyword kinds, `doors.tsx` and the decision-lifecycle guard out of `features/marketing/seo/value-system/approvals/` into `features/approvals/` (its `types.ts`, `registry.ts` and `ApprovalQueue.tsx` deleted, its five consumers repointed, its console kept where it is and now mounting this engine). Widened the scope beyond a site (person / organization / any entity) and added `scopeRequirement` so a kind that needs a site is NAMED with its door instead of silently omitted. Every item now states its autonomy mode and, in mode 3, when it applies itself; a mode-3 row with no instant says so instead of reading as a calm "waiting". Added `body` (a would-be change that keeps the row batchable) and `blocked` (not yours to approve — shown, never dropped). Added the two Google kinds: `gmail_send`, which mounts the existing `GmailReviewCard` as its body and gates on `crm.check_send_eligibility` first, and `sheet_write`, which shows the tool's dry run and approves through `writeGoogleSheet`. Extended `features/assists/types.ts` with the `approval_proposal` action and the `autoApplyAt` field (read through `readAutoApplyAt`, which never invents a clock) plus a handler that only OPENS the queue — an approval can never be granted from a collapsed chip. New: `/approvals`, the `approvalsWindow` overlay, and "Waiting on you" with a count in the user menu. Two migration files written and not applied.
