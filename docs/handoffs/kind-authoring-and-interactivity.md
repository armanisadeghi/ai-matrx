---
status: active
updated: 2026-07-23
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/content-ir-system/FEATURE.md, features/content-ir/docs/SHAPE_SYSTEM.md]
---

# Kind authoring, the admin builder, and component interactivity — work order

Scope: **how a kind gets built (esp. by an ADMIN agent) and how its component comes alive and DOES things.** The broader platform rollout (enforcement flips, tool_ui subsumption, workflows, bulk-bind) is a separate handoff — `docs/handoffs/content-ir-integration-map.md`. Read that one's Vision section too; it is the ground truth for the whole system. System-of-record (evidence/counts): `common-docs/content-ir-system/FEATURE.md`.

## Vision — Arman's words (verbatim; never paraphrase into agent-speak)

- **The north star:** "Create the kind based on the user's data → create the custom component → create the agent skills and render blocks → the user tests it and the real magic is when the user sees a COMPLETELY customized, beautiful component that they designed with an agent."
- **The admin builder (his #1 repeated ask):** "we need an ADMIN UI and an ADMIN agent where you give it the stuff and it builds everything end to end." One-shot, no interview, admin-grade — distinct from the cautious user-facing agent. And: "what I need will ALWAYS be the full thing, including the components and all."
- **Components must be ALIVE:** "these components cannot look dead… black and white gray components that look dead, we don't want that. They need to be alive… react, tailwind, animations at their best… the wow factor is this is impressive because it comes to life." Look at the flashcards (3D flip, fullscreen, mobile) and cooking recipes as the bar.
- **Components must DO things:** "they need to actually do stuff. It can't be just here's some information… copy to clipboard buttons where you can copy things for AI — that's critical… collapsible sections… they need to do stuff."
- **The action registry — "trigger ANYTHING (safely)":** "the key is to eliminate the word 'narrow'… the goal is ANYTHING BUT NARROW. AS LONG AS IT'S SAFE, we can trigger ANYTHING. Our goal is eventually a registry of thousands or more of things it can trigger. The hard part is being smart so they're easy to use and safe and don't cause errors if something isn't perfect."
- **The image example (the trigger's motivating case):** an agent writes an image description (a kind); the kind's component has a button that triggers an image-gen agent, maps the description into its variable, and shows the image in place.
- **Kind Request — get a value back:** a droppable control "triggers an agent… you get your result. Now what? That's where our system stops. What I wanna do is encapsulate that whole thing and actually return a value."
- **The `__kind` sample:** "there is no actual sample of the data that includes the kind entry… the agent does it incorrectly and doesn't include the kind key… after creating the system, its final step should output an example that uses the kind key so the user immediately sees the component in action."
- **No "legacy" anywhere:** if something is named legacy it is either dead (kill it) or the name is a lie (rename it). There is no third state.

## Resources (pointers, not explanations)

- **Kernel + registries:** `features/content-ir/` (`core/`, `registry/`, `react/`, `kinds/`, `studio/`, `admin/`). Feature doc: `features/content-ir/FEATURE.md`. Skill: `.claude/skills/shape-system/`.
- **Admin builder:** route `app/(admin)/administration/utilities/kind-registry/build/`, client `features/content-ir/admin/KindBuilderClient.tsx`. Agent `kind_architect` (`9d484ce1-1e2b-4db7-8469-d3ba8550cdd8`, builtin, 19 kind tools incl. `kind_activate`). Read-only diagnostic console: `/administration/utilities/kind-registry` (catalog + doctor board + per-kind tabs).
- **User builder:** `/shapes`, `/shapes/[kind]` (+ `/test`, `/instances`), `/shapes/new` → `features/content-ir/studio/components/NewShapeClient.tsx`. Agent `kind_creator` (`4f4ffd49-…`, v9). Both builders EJECT to `/chat/a/[agentId]` via `stashChatDraftTransfer` (not embedded).
- **Action registry:** `features/content-ir/react/actions/` — `kind-action-registry.ts` (`registerKindAction`), `useKindActionRunner.ts` (`runAction`, injected into every db component by `DbKindComponent.tsx`), `handlers/trigger-agent.ts` (the only handler so far, key `"trigger_agent"`), `KindAgentActionButton.tsx` (the bundled trigger button; kind data declares `action:{agent_id, variable_name, label}`).
- **Kind Request:** `react/actions/useKindRequest.ts` + `KindRequestDialog.tsx` (streams the result live; renders it through the kind's own component with `onResolve` + `uiOptions`). First consumer: `features/podcasts/generator/components/TopicIdeaHelper.tsx` on `/podcast/studio/create`. Return channel: `onResolve`/`uiOptions` on `dbKindComponentCache.ts` render props.
- **Emit/render shape:** `core/emit-payload.ts` (`withRootKind`/`emitPayloadFence`) — the `{__kind, …}` composer; copy affordance on `studio/components/KindExamplePreview.tsx`.
- **aidream tools:** `packages/matrx-ai/matrx_ai/tools/implementations/kind_authoring.py` (+ `kind_component.py`). Agent prompts: `internal_agents/kind_creator.md`, `internal_agents/kind_architect.md`.
- **DB (project `txzxabzwovsujtloxrus`):** activation authority `content_ir.set_kind_activation(p_kind_definition_id, p_active, p_note, p_actor)` (gated; browser `auth.uid()` wins, server passes `p_actor`) + `evaluate_kind_activation`. Menu reads `skill.render_definition` via `agent.context_menu_view` (NOT `public.content_blocks`). System org = `39c38960-d30c-4840-b0c1-c9960de95582`.
- **Login for testing:** `/login` with `admin@admin.com` / `Password1234#` (per CLAUDE.md). Note: kinds are org-scoped — verify against the org that owns the kind.

## Remaining work (ordered; each independently actionable)

1. **VERIFY THE AIDREAM DEPLOY — everything below waits on it.** These are pushed to `aidream` main but need a prod redeploy to take effect: `kind_activate` calling `set_kind_activation`; `kind_create_content_block` → `skill.render_definition`; `kind_creator` v9 prompt; and the `kind-action` source_feature registration (`aidream/services/conversation_context/source_attribution.py`) that Kind Request / KindAgentActionButton launch under. Confirm prod has them (run a real kind build via `/administration/utilities/kind-registry/build`; run the podcast idea-picker on prod). Until then those flows fail at request validation or activation.
2. **Embed the agent in the admin builder — stop ejecting to `/chat`.** `KindBuilderClient` currently hands off to the full chat route. Arman wants to *watch it work* in the admin surface. Reuse `features/tool-call-visualization/admin/hooks/useToolComponentAgent.ts` (headless direct-mode launch + read stream) + `ToolCallVisualization` to show the 19 tools firing, and land the result (a link to the new `/shapes/[kind]`) in-page. Same treatment can upgrade `/shapes/new`.
3. **Raise the component quality bar in the builder prompts (they still produce competent-but-plain TSX).** The sandbox gives db components React hooks + shadcn (accordion/collapsible/dialog/sheet/tabs) + lucide + recharts + `runAction` + `onResolve`/`uiOptions` — but NO framer-motion (animation is CSS/Tailwind only) and NOT the repo's `CopyButtons`/`IconButton`/`useArtifactState`. Two moves: (a) EXPAND the sandbox allowlist (`features/agent-apps/utils/allowed-imports.ts`) to expose the interactivity primitives — copy-for-AI FIRST (Arman: "critical"); (b) rewrite `kind_architect`/`kind_creator` component guidance to teach the CSS-native techniques from the gold-standard files: 3D flip = `perspective`+`preserve-3d`+`rotateY`+`backface-hidden`; fullscreen = `fixed inset-0`+`useState`; container queries; celebration states; and "must DO something" (copy-for-AI, collapsible). Exemplars: `components/mardown-display/blocks/flashcards/FlashcardItem.tsx`, `.../cooking-recipes/cookingRecipeDisplay.tsx`, `.../quiz/MultipleChoiceQuiz.tsx`.
4. **Grow the action registry past one handler (the "thousands" vision).** Add handlers under `react/actions/handlers/` via `registerKindAction`. Each: validate input, run as the viewing user, never throw into component code (safe `{ok,error}` envelope), degrade gracefully. This is the extensible seam — adding capability #2..N must never touch the sandbox contract.
5. **The image example end-to-end (proves the trigger + return together).** Build the `image_description` kind (clone `features/content-ir/kinds/video-prompt-options.ts` + its block, the shipped worked example of a data-declared agent action) and a small `generated_image` result kind so the image lands *in place* via `<InlineMediaRef>` (durable `file_id`, never a signed URL). Needs an image-gen agent that emits a structured `file_id` result.
6. **`kind_surface` creation is still absent from the toolset.** Neither builder agent can register a detection surface (XML tag / non-JSON fence). JSON `__kind` detection works without it, so this is only needed for non-JSON arrival forms — build a `kind_create_surface` tool + regenerate the surface bootstraps (`pnpm check:shapes:surfaces:refresh`, writes both repos) if/when a kind needs it.
7. **System-agent ownership at creation.** Agent-built kinds land in the *user's* org (I had to hand-reassign `topic_ideas`/`topic_idea`/`keyword_relationship_research` to the system org). For platform kinds the admin builder should create them system-owned from the start (org `39c38960`, `created_by` null, visibility public) — a flag on `kind_architect`'s create path. Their SKILLS also still land in the user org (the render blocks were moved; skills were not).
8. **The FE incident reporter (shared with the other handoff).** `DbKindComponentErrorBoundary` screams to the error store but never writes `content_ir.kind_component_incident`, so `kindcomp_resolve_incident` is blind to real crashes. Wire the boundary (and the html-flavor frame) to insert incidents (RLS-gated, org-scoped, dedup), include the crashing `data_snapshot`.

## Done (git + FEATURE.md hold detail)

- Activation path built — DB gate `content_ir.set_kind_activation` (+ server-actor overload); `kind_activate` tool calls it; both builder agents can finish a kind.
- Kind Request primitive + streaming result + podcast idea-picker — `react/actions/useKindRequest.ts` / `KindRequestDialog.tsx` / podcast `TopicIdeaHelper`.
- Action registry seam + `trigger_agent` handler wired into every db component — `react/actions/`.
- `__kind` render-template made copyable + agent v9 teaches the two shapes and emits a live `__kind` block as its final step — `core/emit-payload.ts`, `KindExamplePreview.tsx`.
- Content blocks now reach the menu — tool writes `skill.render_definition`; 3 live blocks ported to system org.
- db-component error boundary un-latches on version change ("broke then healed itself" class) — `DbKindComponentErrorBoundary.tsx`.
- `kind_architect` admin agent + `/administration/utilities/kind-registry/build` page exist (a parallel session).

## Decisions needed (Arman only)

1. **Sandbox widening — APPROVED.** Arman said yes to exposing agent-triggering (and the growing action registry) into db components, emphatically "anything but narrow… as long as it's safe." Proceed with the safe-seam approach (one injected `runAction`, host enforces click-only/RLS/spend). No further sign-off needed to add handlers.
2. **Open:** should agent-built PLATFORM kinds be system-owned by default (remaining #7), and should spend/rate-limiting gate action-triggered agent launches before public launch? Both are pre-launch product calls, not blockers for building.
