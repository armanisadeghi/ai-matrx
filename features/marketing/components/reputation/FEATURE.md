# Digital PR & Reputation workspace

Status: **active (2026-08-11)**

## Contract

This surface turns already-observed platform evidence into defensible publication
opportunities and protect/correct/respond/request-update/leave-alone decisions. It does
not ask a model to browse from memory and it does not render a recommendation merely
because the model returned one.

- `reputation-queries.ts` reads RLS-protected cases, the latest active Content IR
  brief, and exact evidence-lane counts directly from Supabase.
- `useReputationAnalysis.ts` calls aidream only for crawl/RAG/AI work, adopts the
  detached stream through `adoptForeignStream`, stores the durable run id for rejoin,
  and renders chunks with `MarkdownStream`.
- `ReputationWorkspace.tsx` is one dynamically loaded edge. Tabs expose the decision
  brief, cases, publications, narratives, and evidence coverage without duplicating
  data rules in components.
- Human case decisions call `seo.update_reputation_case`. The client never updates
  machine evidence, scores, or recommendations directly.

## Quality and no-dead-ends rules

Facts, inferences, contradictions, missing evidence, and exact excerpts stay visibly
separate. Confidence and evidence quality are both shown. Rejected counts and analysis
limitations are first-class output, including a valid “not enough evidence” result.
Publication cards require demonstrated interest plus confirmed supporting material;
correction cases require both the disputed source and contrary authoritative evidence.

Every resolvable identity is a door: source URLs open externally, managed target pages
open their page workspace, stable backlink identities open the backlink workspace, and
brand evidence links to the brand facts/assets cockpit. Case rows always expose the next
human lifecycle action; there are no inert risk warnings.

## The verdict is the action (2026-08-15)

`CaseVerdictAction` in `ReputationWorkspace.tsx` — the end of this surface's
worst dead end. Every verdict used to terminate in "Start action", which only
set `status='in_progress'`; a `pitch` case carrying an AI-written `pitch_angle`
had no way to reach a human being (outreach handoff §3 G9 / §7).

| Verdict | The one action offered |
|---|---|
| `pitch` · `request_update` · `correct` · `respond` | **Start outreach** — `StartOutreachDialog` (`features/crm/components/outreach-start/`) resolves the outlet through the live G1 fold and enrols it in an existing outreach list carrying `reputation_case_id`. Nothing is sent here. |
| `strengthen` | **Improve this page** — the target page workspace. This verdict is about OUR asset, not an outlet. |
| `protect` | The narratives view. Good coverage is kept working, not written about. |
| `investigate` | **Recheck the evidence** — the same run the header launches. |
| `monitor` · `leave_alone` | Deliberately no extra control. The lifecycle row already carries Monitor and Dismiss. |

Two rules paid for once:

- **A case with no `source_domain` says so and stops** — there is nobody to
  write to, and the fix (recheck the evidence) is named.
- 🚨 **`strengthen` is NOT an outreach verdict here, even though aidream's
  `OUTREACH_VERDICTS` folds it.** Offering a "Start outreach" button on a
  verdict about our own content would be a button that pretends. The divergence
  is deliberate; the server-side inclusion is harmless (it only means such an
  outlet may exist as a discovered party).
- The `auto|manual|off` CRM fold control (`CrmFoldControl`) renders above the
  case list AND on the site-settings surface — **one record, two renders.**

The surface manifest is `matrx-user/marketing-reputation`; route mapping folds
`/marketing/brands/:brandId/sites/:siteId/reputation` into it. Keep all future agent
actions on this surface scoped to the current brand/site evidence context.
