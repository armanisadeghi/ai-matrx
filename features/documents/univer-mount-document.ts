// features/documents/univer-mount-document.ts
//
// Pure (no Univer import at runtime): the facade is passed in, so this is
// testable without booting Univer.

import type { FUniver } from "@univerjs/presets";
import type { IDocumentData } from "@univerjs/core";

/**
 * THE ONE WAY this editor mounts a document unit. Univer 1.0 renamed the
 * facade's constructor (`createUniverDoc` → `createDocument`); the old call was
 * `createUniverDoc?.(…)`, so after the upgrade it silently did nothing, the
 * editor still said "Editing", and Univer showed its loading skeleton forever
 * (every new document, every reload — 2026-09-28). Never optional again: the
 * unit is created through the typed facade and read back, and a missing unit
 * THROWS so the page says "Load failed" instead of pretending.
 */
export function mountUniverDocument(
  api: FUniver,
  data: Partial<IDocumentData>,
): string {
  const created = (
    api as unknown as { createDocument: (d: Partial<IDocumentData>) => { getId?: () => string } | null }
  ).createDocument(data);
  const active = api.getActiveDocument?.();
  const id = active?.getId?.() ?? created?.getId?.() ?? null;
  if (!id) {
    throw new Error("The editor could not open this document (no document unit was created).");
  }
  return id;
}
