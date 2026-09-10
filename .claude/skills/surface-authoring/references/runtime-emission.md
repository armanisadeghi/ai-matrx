# Surface authoring — runtime emission

Read this when writing the launch code that emits a surface's values, tagging Locate anchors, or rendering hierarchy chrome.

## Runtime side — making the surface actually emit values

In the surface's launching code (button, context menu, AgentGenerator, etc.):

```ts
import { create<LocalSlug>Scope } from "@/features/surfaces/manifests/<local-slug>.manifest";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";

dispatch(
  launchAgentExecution({
    agentId,
    runtime: {
      surfaceName: "<client>/<local>",        // ← MUST match ui_surface.name
      applicationScope: create<LocalSlug>Scope({
        current_thing_id: currentId,
        selection: selected ?? undefined,
        content: bodyText ?? undefined,
        // ... never pass keys not declared in the manifest
      }),
    },
  }),
);
```

The thunk at `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` reads `runtime.surfaceName`, fetches the agent's binding layers via `fetchSurfaceBindingLayers` (bindings are `platform.associations` edges read through the `agent.menu_surface` view — written ONLY via `features/surfaces/services/bind-agent-to-surface.service.ts`), merges layers weakest→strongest, applies `value_mappings` via the resolver, and falls back to legacy auto-name-matching for unmapped keys. If you skip `surfaceName`, you get the legacy auto-name-match path only — explicit mappings won't apply.

### Highlight-on-page (Locate)

Pages tag the DOM element that renders a value with **`data-surface-value="<value_name>"`**. The Surface Context window's **Locate** button scrolls to and flashes it (`features/surfaces/utils/locate-on-page.ts`). `SectionCard` / `MetricCell` in `features/marketing/components/shared/MarketingUi.tsx` take an `anchor` prop for this. Tag anchors as you build the page — a value with no anchor can't be located.

### Hierarchy chrome

Chrome reads ancestry/children from the REGISTRY — `getSurfaceAncestry` / `getSurfaceChildren` via `getRelatedSurfaces` (`features/surfaces/runtime/fetchRelatedSurfaces.ts`, synchronous). The Agents popover renders the full breadcrumb from it. `ui_surface.parent_surface_name` is a mirror only — never read it for hierarchy in chrome.
