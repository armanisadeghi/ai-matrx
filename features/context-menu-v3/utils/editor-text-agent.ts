// features/context-menu-v3/utils/editor-text-agent.ts
//
// ONE AI SET FOR A RECORD IN EVERY VIEW (page-pass /notes, 2026-09-28). Clean
// up / Help with this… / Custom agent are visible only when the action context
// carries `callbacks.onRequestTextAgentAction` (a host that can review and
// apply). RichDocument (a note's Read view) supplied it; the editor menus
// (Write, Plain, Split) did not, so the same note lost its AI rows on switching
// view. Any menu now offers the shell's review dialog — only where the
// source can be saved back (a record source with an `edit` adapter, not read
// only), and never over a host that already supplied its own.

import type { ContentSource, ContentSourceAdapter, RichDocumentActionContext } from "@/features/rich-document/types";

type Callbacks = RichDocumentActionContext["callbacks"];
type Request = NonNullable<NonNullable<Callbacks>["onRequestTextAgentAction"]>;

export function editorTextAgentCallbacks(
  callbacks: Callbacks,
  source: ContentSource,
  adapter: Pick<ContentSourceAdapter, "edit">,
  request: Request | undefined,
): Callbacks {
  if (callbacks?.onRequestTextAgentAction || !request) return callbacks;
  if (source.type === "raw" || source.readOnly || typeof adapter.edit !== "function") return callbacks;
  return { ...(callbacks ?? {}), onRequestTextAgentAction: request };
}
