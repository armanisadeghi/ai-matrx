"use client";
// providers/ChatSurfaceRegistrations.tsx
//
// Browser half of the app's `@ai-matrx/chat` surface registrations (P19),
// mounted once in `app/Providers.tsx` beside `ChatHostAdapter`. Module scope
// runs when this client module loads — before any package component renders:
//   - the surface manifests (`providers/chat-surface-manifests.ts`);
//   - the data tools' renderers (`features/records-tool-display`);
//   - feature intelligence (the icon, declared places, intelligence-page links),
//     which the package reads through `@ai-matrx/chat/surfaces/runtime/intelligence`.
// Renders nothing.
import { useEffect } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import { registerBlockStateRemarkDurability } from "@/features/block-state/remarkDurability";
import "@/providers/chat-surface-manifests";
// The app-feature tool renderers (SEO, topical map, notes, tasks, lists, documents, datasets,
// knowledge search). Imported BEFORE the data-tool wrappers below, which wrap `dataset`.
import "@/features/chat-tool-renderers/registerFeatureToolRenderers";
// The note and task context-item drawer bodies.
import "@/features/chat-context-bodies/registerContextBodies";
// The data tools' renderers (records, dataset): rows as a table, writes as a line with a door.
import "@/features/records-tool-display/registerDataToolRenderers";
import { registerSurfaceIntelligence } from "@ai-matrx/chat/surfaces/runtime/intelligence";
import {
  IntelligenceIndicator,
  declaredKeysForRoute,
} from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { usePageIntelligenceDoors } from "@/features/mandates/feature-intelligence/page-intelligence-doors";
import { declaredPlacesFor } from "@/features/mandates/feature-intelligence/registry";
import { featureIntelligenceHref } from "@/features/mandates/feature-intelligence/hrefs";
import { targetForKey } from "@/features/mandates/feature-intelligence/placement";

registerSurfaceIntelligence({
  Indicator: IntelligenceIndicator,
  declaredKeysForRoute,
  usePageIntelligenceDoors,
  declaredPlacesFor,
  featureIntelligenceHref,
  targetForKey,
});

export function ChatSurfaceRegistrations(): null {
  // Unsent remark chips are kept server-side (platform.block_states), never in the browser.
  const store = useAppStore();
  useEffect(() => registerBlockStateRemarkDurability(store), [store]);
  return null;
}
