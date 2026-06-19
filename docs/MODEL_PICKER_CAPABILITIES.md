# Capability-driven model picker — FE handoff

Goal: replace the flat model dropdown in the agent builder with a **capability-driven picker** — tabs by output type (Text / Image / Video / Audio / Realtime / Extraction) plus a capability filter — now that every model's capabilities are real and DB-backed.

Backend context (aidream): the `ai_model.capabilities` jsonb is now the source of truth, shape `{input, output, features, interaction}` — exactly the `ModelCapabilities` type this repo already has. Backend design: `aidream/docs/model_capabilities/CAPABILITY_SYSTEM.md`.

## Good news — most of this already exists here

- **Types:** `features/ai-models/capabilities/types.ts` — `ModelCapabilities` (`{input, output, features, interaction}`), `parseCapabilities`, type guards, `DEFAULT_CAPABILITIES`. Use these; don't reinvent.
- **Picker component:** `features/ai-models/components/smart/SmartModelSelect.tsx` (Redux-backed shadcn `Select`).
- **Builder integration:** `features/agents/components/builder/AgentModelConfiguration.tsx` → sets agent field `modelId`.
- **Fetch:** `features/ai-models/redux/modelRegistrySlice.ts` — `fetchModelOptions()` pulls models from Supabase.

## The one data gap

`fetchModelOptions()` selects `id, name, common_name, provider, model_class, is_deprecated` — **not `capabilities`**. Two ways to get capabilities for all models:

1. **Simplest — add the column.** Add `capabilities` to the `fetchModelOptions` select, then `parseCapabilities(row.capabilities)` per option. One extra jsonb column; the picker now has everything it needs for tabs + feature/modality filters.
2. **Richer — use the new endpoint.** `GET /agent-service/models` now returns `ModelInfo` with a full `ModelCapabilitySummary` per model, including things the raw jsonb can't give you: the resolved booleans (`supports_function_calling/web_search/vision/audio_input`), the derived `output_type`, and **provider-level** input acceptance (`accepts_documents/video/youtube`). Filters: `?output_types=image,video` and `?capability=function_calling`. Run `pnpm sync-types` to pick up the extended `ModelInfo` in `types/python-generated/api-types.ts`. Use this if you want provider-level filters (e.g. "models that accept PDFs"); otherwise option 1 is enough.

## Tab derivation (the primary output type)

Add to `features/ai-models/capabilities/` (mirrors the backend's `_primary_output_type`):

```ts
import type { ModelCapabilities } from "./types";

export type OutputType = "text" | "image" | "video" | "audio" | "realtime" | "extraction";

export function primaryOutputType(caps: ModelCapabilities): OutputType {
  if (caps.interaction === "realtime") return "realtime";
  const out = new Set(caps.output);
  if (out.has("image")) return "image";
  if (out.has("video")) return "video";
  if (out.has("audio")) return "audio";
  // "entities" output = extraction models (backend vocab; not in this enum yet — treat unknown as text)
  return "text";
}
```

## Picker UX

- Use the existing shadcn `Tabs` (`components/ui/tabs.tsx`) for the output-type tabs; each tab lists the models whose `primaryOutputType` matches. Group within a tab by `provider` (the existing `ModelSelection.tsx` chat picker already does provider grouping — reuse its pattern).
- A small filter row (shadcn checkboxes) over `capabilities.features` (`function_calling`, `thinking`, `web_search`, `vision`, `structured_output`, …) and `capabilities.input` (e.g. "accepts images") — filter the in-tab list client-side. The existing admin filter pattern is `features/ai-models/utils/filterUtils.ts`.
- Keep `SmartModelSelect` as the compact inline control; the tabbed picker is the "browse models" modal/panel opened from the builder (`AgentModelConfiguration`). On select, dispatch the existing `setAgentField('modelId', id)`.

## Suggested sequencing

1. Add `capabilities` to `fetchModelOptions` + `parseCapabilities` per option (option 1 above).
2. Add `primaryOutputType` + a `useModelsByOutputType()` selector/hook over the Redux options.
3. Build the tabbed picker (shadcn Tabs + provider grouping + feature-checkbox filter).
4. Wire it into `AgentModelConfiguration` (modal or inline panel); keep `SmartModelSelect` as the compact fallback.
5. (Optional) switch the fetch to `GET /agent-service/models` if you want provider-level filters (`accepts_documents/video/youtube`) — run `pnpm sync-types` first.

## Notes

- Models can output more than one modality (e.g. Gemini image models output `["image","text"]`); `primaryOutputType` picks the headline. If you want a model to appear under multiple tabs, key membership off `caps.output` directly instead.
- `interaction: "realtime"` is the realtime/voice tab — these are a distinct selection mode at launch.
- Live distribution today (141 active models): text 50 · image 44 · video 28 · audio 12 · realtime 2 · extraction 5.
