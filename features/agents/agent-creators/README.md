# Agent creators — frontend implementation

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/agent-creation-studio/FEATURE.md — read it before touching this feature in ANY repo.

Verified against code and production **2026-08-12**.

## Surface

`/agents/new` offers Manual, Generate with AI, Build Interactively, Import, and
Template paths. All successful creation paths converge on `/agents/[id]/build`,
the full agent builder and live test track.

Routes live under `app/(core)/agents/new/`. Core creator components live in
`features/agents/agent-creators/interactive-builder/` and remain wrapper-free so
routes, windows, sheets, or dialogs can host them without copying logic.

## Current AI generator

`AgentGenerator.tsx` runs the registry shortcut `agent-generator-01`. Its user
surface contains one required purpose field and optional additional context,
both voice-enabled. The response streams through the shared execution system,
uses centralized JSON extraction, and is normalized by
`utils/agent-config-extractor.ts`.

`services/agentBuilderService.ts` then performs a **legacy minimal direct
insert** into `agent.definition`: name, description, messages, variables,
settings, and one default model. It does not persist the rich contract required
by the Agent Creation Studio.

**New Studio-generated agents author through aidream Agent Service/Factory.** Do
not expand the direct-insert service into a second authoring backend.

## Interactive builders

- `InstantAssistantBuilder.tsx` — persona/tone/format/sliders.
- `ComprehensiveBuilder.tsx` — fourteen prompt-configuration tabs.
- `ExperienceCustomizerBuilder.tsx` — personality and output preferences.

These remain manual/legacy creation options. The Agent Creation Studio starts
from outcome, authority, evidence, and evaluations; it must not inherit these
persona-first screens as its intake model.

## Invariants

- **Creation converges on the full builder.** The Studio complements; it does
  not replace `/agents/[id]/build`.
- **Generated rich writes go through Agent Service.** Direct Supabase reads and
  ordinary user edits follow frontend data doctrine; AI-authored compilation
  needs the server's validation and paid AI work.
- **One component per flow.** Routes and window wrappers reuse the same core.
- **Streaming stays Redux-first.** Do not add component-local parallel request
  state or a second JSON parser.
- **The cross-repo Studio SOR owns product truth.** Keep this file limited to
  frontend implementation.

## Change log

- 2026-08-12 — Replaced the stale route/status roadmap with current frontend
  truth and the Agent Creation Studio system pointer.
