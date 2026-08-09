# Growth Loop — the map of the platform's end-to-end pipeline

**Status:** active · **Tier:** 2 · **Route:** `/administration/knowledge/growth-loop` (admin)

## What this is

The twelve-stage loop the platform runs on — **research → plan → brief → realize → fill →
publish → serve → crawl → measure → analyze → suggest → write-back** — rendered as an
interactive map, with every connection scored on **THE THREE PIPES** (code / human / AI) and
every open gap registered.

It exists because the pipeline spans three repos and two Supabase projects, so no single
`FEATURE.md` could show whether it actually connects end to end.

- **Vision (Arman's words, 2026-08-09):** `common-docs/systems/growth-loop/VISION.md`
- **System of record:** `common-docs/systems/growth-loop/FEATURE.md`
- **Gap campaign + lanes:** `common-docs/projects/growth-loop-gaps/PLAN.md`

## 🚨 `map/loop-map.ts` is the single source of truth

`features/growth-loop/map/loop-map.ts` holds the stages, connections, per-pipe status and the
`G-*` gap register. **It is the ONLY place any of those statuses live** — the cross-repo docs
point here and never restate them.

Rules (also stated at the top of the file):

1. A `state` other than `"missing"` carries a `ref` an auditor can open and verify. Status
   reflects **live code**, never intent.
2. **Filling a gap = flipping its pipe state in `loop-map.ts` in the same change as the code.**
3. Never delete a gap id — close it with `status: "closed"` and an `evidence` path.
4. A scheduled Codex auditor re-derives this from live code and will re-open a gap whose
   evidence doesn't hold (`common-docs/systems/growth-loop/CODEX_OPERATOR.md`).

## Structure

| File | Role |
|---|---|
| `map/loop-map.ts` | Pure data + helpers. No React, no imports from the app. |
| `components/GrowthLoopCanvas.tsx` | The ONE `next/dynamic({ ssr: false })` front door. |
| `components/GrowthLoopCanvasImpl.tsx` | React Flow canvas + custom stage node + detail rail. |
| `app/(admin)/administration/knowledge/growth-loop/page.tsx` | Admin route. |

## Doctrine

- **Code-splitting:** React Flow is heavy and browser-only. It is imported **statically inside
  the Impl**, which sits behind exactly one dynamic front door — per the `code-splitting` skill,
  rule 3. The surface is registered in `eslint.config.mjs`'s `reactFlowStaticImportBan` comment
  block; the two import lines carry justified disables. Never add a second boundary here.
- **Reuse-first:** the map reuses the repo's React Flow conventions (`SetBuilderCanvasImpl` as the
  exemplar), semantic color tokens, and the admin route/nav registration pattern. It introduces no
  new graph library, no new state store, and no new suggestion or status system.
- **No dead ends:** every pipe entry renders its `ref` path so a reader can go straight to the
  code. When a gap gains an owner, its lane is shown on the gap card.

## Change log

- 2026-08-09 — claude: feature created. Loop mapped from live code by six parallel explorers
  (research, content-plan, CMS, crawler/SEO, suggestions/write-back, workflow substrate);
  `loop-map.ts` seeded with 12 stages, 14 connections, 20 gaps, 6 lanes; React Flow map shipped
  and browser-verified at `/administration/knowledge/growth-loop`.
