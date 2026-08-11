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

The surface manifest is `matrx-user/marketing-reputation`; route mapping folds
`/marketing/brands/:brandId/sites/:siteId/reputation` into it. Keep all future agent
actions on this surface scoped to the current brand/site evidence context.
