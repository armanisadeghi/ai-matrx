/**
 * Surface manifest — Memory Inspector (`matrx-user/observational-memory`).
 *
 * The admin-only floating Observational Memory inspector (overlay
 * `observationalMemoryWindow`, `ObservationalMemoryWindow`): a sidebar of
 * every conversation this session has seen memory activity for (persisted
 * metadata, `memory_*` stream events, or a fetched cost summary), and a
 * detail pane (`ObservationalMemoryCore`) for the selected conversation's
 * memory state, counters, and cost.
 *
 * Emitter: `ObservationalMemoryWindowInner` mounts `<SurfaceRuntimeProvider>`
 * around the detail pane, reading the same `observationalMemory` Redux
 * selectors the sidebar rows and detail pane already use.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const OBSERVATIONAL_MEMORY_SURFACE_NAME =
  "matrx-user/observational-memory";

const groups: SurfaceValueGroup[] = [
  {
    key: "memory_state",
    label: "Memory state",
    sortOrder: 100,
    description:
      "The selected conversation's observational-memory status and data.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "selected_conversation_id",
    label: "Selected conversation ID",
    description:
      "UUID of the conversation whose memory is inspected in the detail pane. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "memory_state",
  },
  {
    name: "conversation_ids",
    label: "Conversations with memory activity",
    description:
      "Array of conversation UUIDs listed in the sidebar — every conversation this session has seen observational-memory activity for. Empty array when none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 310,
    group: "memory_state",
  },
  {
    name: "memory_enabled",
    label: "Memory enabled",
    description:
      "True when observational memory is enabled for the selected conversation. Absent when no conversation is selected.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "memory_state",
  },
  {
    name: "memory_degraded",
    label: "Memory degraded",
    description:
      "True when the selected conversation's memory pipeline is in a degraded state. Absent when no conversation is selected.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "memory_state",
  },
  {
    name: "memory_counters",
    label: "Memory counters",
    description:
      "Event/cost counters for the selected conversation's memory activity (event totals, cost). Absent when no conversation is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 340,
    group: "memory_state",
  },
  {
    name: "memory_metadata",
    label: "Memory metadata",
    description:
      "The persisted `observational_memory` metadata block for the selected conversation (the memory content itself). Absent when none is persisted. Can be large — bind explicitly when needed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 350,
    group: "memory_state",
  },
];

export const observationalMemoryManifest: SurfaceManifest = {
  surfaceName: OBSERVATIONAL_MEMORY_SURFACE_NAME,
  readiness: "partial",
  readinessNote: "emitter wired, browser verification pending",
  overlayId: "observationalMemoryWindow",
  label: "Memory Inspector",
  intro: `<surface_intro>
You are on the Memory Inspector — an admin floating window for auditing the Observational Memory feature. The sidebar lists every conversation with memory activity this session; the detail pane shows the selected conversation's memory state: whether it is enabled, degraded, its counters/cost, and the persisted memory metadata itself. This is a diagnostic surface — help the admin interpret memory behavior; never fabricate memory content.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createObservationalMemoryScope(values: {
  selected_conversation_id?: string;
  conversation_ids?: string[];
  memory_enabled?: boolean;
  memory_degraded?: boolean;
  memory_counters?: Record<string, unknown>;
  memory_metadata?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
