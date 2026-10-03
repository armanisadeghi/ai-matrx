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
import "@/providers/chat-surface-manifests";
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
  return null;
}
