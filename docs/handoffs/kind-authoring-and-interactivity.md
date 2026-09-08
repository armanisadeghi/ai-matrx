---
status: active
updated: 2026-09-08
repos: [matrx-frontend, aidream]
scope: program
feature: Content IR
vision: [/Users/armanisadeghi/code/common-docs/systems/content-ir-system/VISION.md]
---

# Kind authoring and component interactivity — work order

**What this is:** how a Shape (kind) gets BUILT — by a user at `/shapes/new`, by an
admin at the kind registry, or by an agent — and how the component it renders with
comes alive and DOES things instead of just displaying.
**Scope:** Program
**Feature:** Content IR
**Vision:** [`common-docs/systems/content-ir-system/VISION.md`](/Users/armanisadeghi/code/common-docs/systems/content-ir-system/VISION.md)

Read the vision before touching anything here; it outranks this work order. The
broader platform rollout (enforcement flips, tool_ui subsumption, workflows,
bulk-bind) is [`content-ir-integration-map.md`](content-ir-integration-map.md).
Evidence/counts system-of-record: `common-docs/systems/content-ir-system/FEATURE.md`.

> **Everything below was re-verified against live code on 2026-09-08.** Claims that
> had rotted were corrected, not appended to.

## Resources

- **Kernel + registries:** `features/content-ir/` (`core/`, `registry/`, `react/`, `kinds/`, `studio/`, `admin/`). Feature doc: `features/content-ir/FEATURE.md`. Skill: `.claude/skills/shape-system/`.
- **User studio:** `/shapes/all` → `/shapes/[kind]` with **nine tabs, one set for users and admins alike** (Preview · Test · Stream · Examples · Instances · Schema · Template · Inputs · Gate — `studio/components/ShapeDetailHeader.tsx`).
- **Create a Shape — two deliberately different experiences.** `/shapes/new` is a **dedicated purpose-built form** (`studio/components/NewShapeClient.tsx` + the question definitions in `studio/new-shape-options.ts`) beside a live result pane that the run streams into via `AgentRunner`, conversation left open. From **anywhere else**, the `shape_builder` surface role opens the generic agent window so you never leave the page (`studio/useKindAgentLaunch.ts`). Neither navigates to `/chat` any more.
- **Admin builder:** `app/(admin)/administration/utilities/kind-registry/build/`, client `features/content-ir/admin/KindBuilderClient.tsx`. Agent `kind_architect` (builtin, 19 kind tools incl. `kind_activate`).
- **Agents are surface roles, not hardcoded ids:** `SHAPE_BUILDER_ROLE` / `SHAPES_SURFACE_NAME` in `studio/constants.ts`; briefs composed in `studio/kind-agent-intents.ts` (structured content rides named variables — THE USER-INPUT LAW).
- **Action registry:** `features/content-ir/react/actions/` — `kind-action-registry.ts`, `useKindActionRunner.ts` (injected into every db component), handlers `trigger-agent.ts` + `apply-surface-write.ts`.
- **Kind Request:** `react/actions/useKindRequest.ts` + `KindRequestDialog.tsx`. First consumer: `features/podcasts/generator/components/TopicIdeaHelper.tsx`.
- **Sandbox allowlist:** `features/agent-apps/utils/allowed-imports.ts` — React hooks, shadcn, lucide, recharts, `runAction`, and (added since this doc was written) `CopyButtons` + `CopyForAiButton`. Still NO framer-motion; animation is CSS/Tailwind only.
- **aidream tools:** `packages/matrx-ai/matrx_ai/tools/implementations/kind_authoring.py` (+ `kind_component.py`). Prompts: `internal_agents/kind_creator.md`, `internal_agents/kind_architect.md`.
- **DB (project `brsgrqvjdzwihsvnfqkf` — Matrx Main; the old `txz…` ref that used to be in this doc is a RETIRED project that will confirm anything you ask it):** activation authority `content_ir.set_kind_activation(...)` + `evaluate_kind_activation`. Menu reads `skill.render_definition` via `agent.context_menu_view`. System org `39c38960-d30c-4840-b0c1-c9960de95582`.
- **Login for testing:** `/login`, `admin@admin.com`, `AI_ADMIN_PASSWORD` from `.env`. Kinds are org-scoped — verify against the org that owns the kind.

## Remaining work (ordered; each independently actionable)

1. **Verify the aidream prod deploy — several items below assume it.** Pushed to `aidream` main but needing prod: `kind_activate` → `set_kind_activation`; `kind_create_content_block` → `skill.render_definition`; the `kind_creator` prompt; and the `kind-action` source_feature registration (`aidream/services/conversation_context/source_attribution.py`). Confirm by running a real kind build at `/administration/utilities/kind-registry/build` and the podcast idea-picker on prod. **Not verifiable from this repo** — it needs prod access.
2. **Teach the builder prompts to produce components that DO something.** The sandbox now exposes copy-for-AI (Arman: "critical") — that half is done. What is NOT done is the prompt guidance: `kind_architect` / `kind_creator` still emit competent-but-plain TSX. Rewrite their component guidance around the CSS-native techniques in the gold-standard files (3D flip = `perspective`+`preserve-3d`+`rotateY`+`backface-hidden`; fullscreen = `fixed inset-0`+`useState`; container queries; celebration states). Exemplars: `components/mardown-display/blocks/flashcards/FlashcardItem.tsx`, `.../cooking-recipes/cookingRecipeDisplay.tsx`, `.../quiz/MultipleChoiceQuiz.tsx`.
3. **Grow the action registry past two handlers** (the "thousands" vision). Add under `react/actions/handlers/` via `registerKindAction`. Each: validate input, run as the viewing user, never throw into component code (safe `{ok,error}` envelope), degrade gracefully. Adding capability #3..N must never touch the sandbox contract.
4. **The image example end-to-end** (proves trigger + return together). `generated-image-set.ts` exists; `image_description` does not. Build it (clone `kinds/video-prompt-options.ts` + its block) so the result lands in place via `<InlineMediaRef>` (durable `file_id`, never a signed URL). Needs an image-gen agent emitting a structured `file_id`.
5. **`kind_surface` creation is still absent from the toolset.** Neither builder agent can register a detection surface (XML tag / non-JSON fence) — confirmed absent from `kind_authoring.py` on 2026-09-08. JSON `__kind` detection works without it, so this is only needed for non-JSON arrival forms.
6. **System-agent ownership at creation.** Agent-built kinds land in the *user's* org; platform kinds should be created system-owned (org `39c38960`, `created_by` null, visibility public) — a flag on `kind_architect`'s create path. Their SKILLS still land in the user org too.
7. **D279 — the Shape Studio render-status strip can lie.** It reports an inactive DB override as the live renderer when the compiled bridge is what actually renders, and the same false premise reaches `ShapeActivationControl`'s deactivate confirmation. Full write-up in `FOUND_DEFECTS.md` § D279.

## Done (git + `features/content-ir/FEATURE.md` hold detail)

- Create-with-agent never navigates to `/chat` — window launch from anywhere, dedicated form at `/shapes/new`.
- `/shapes/new` rebuilt as a purpose-built questionnaire + inline streaming result pane — `studio/new-shape-options.ts`, `studio/components/NewShapeClient.tsx`.
- Shape agents are surface roles with composed, variable-bound briefs — `studio/useKindAgentLaunch.ts`, `studio/kind-agent-intents.ts`.
- One set of tabs for users and admins — `studio/components/ShapeDetailHeader.tsx`.
- Activation path + `kind_activate` → `content_ir.set_kind_activation`.
- Kind Request primitive + streaming result + podcast idea-picker — `react/actions/`.
- Action registry seam wired into every db component; two handlers live.
- Sandbox allowlist exposes copy-for-AI.
- db-component error boundary files durable incidents through its `onCaught` seam — `react/db-component/DbKindComponentErrorBoundary.tsx`.
- In-session component cache-bust so an edited component re-renders live.

## Decisions needed (Arman only)

1. **Should agent-built PLATFORM kinds be system-owned by default?** (remaining #6). Today an agent building a platform Shape leaves it owned by whoever happened to run the agent, and someone hand-reassigns it later. Decide: default to system-owned when an admin builds from the registry, or keep user-owned and make reassignment a visible one-click step.
2. **Should spend/rate-limiting gate action-triggered agent launches before public launch?** A kind component can now trigger an agent from a click. Neither a per-user rate limit nor a spend ceiling gates that today.
