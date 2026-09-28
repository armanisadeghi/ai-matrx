// features/context-menu-v3/regroup/engine-rows.ts
//
// The rows the context-menu ENGINE itself can contribute (model/menu-model.ts),
// as the ids and categories `alchemy-provider.ts` gives them (`cm:<node id>`).
// Together with the rich-document registry (`getAllActions()`) this is the full
// inventory of universal menu rows; a surface's own rows (its extraSections)
// are "the page's own actions" and are not listed here.
//
// Kept in step with menu-model.ts by hand; the regroup demo flags any `cm:` row
// a live menu resolves that is missing here ("not in the inventory").

import type { ActionCategory } from "@ai-matrx/alchemy/actions";

export interface InventoryRow {
  id: string;
  label: string;
  category: ActionCategory;
}

export const CONTEXT_MENU_ENGINE_ROWS: readonly InventoryRow[] = [
  { id: "cm:copy", label: "Copy", category: "clipboard" },
  { id: "cm:cut", label: "Cut", category: "clipboard" },
  { id: "cm:paste", label: "Paste", category: "clipboard" },
  { id: "cm:undo", label: "Undo", category: "clipboard" },
  { id: "cm:redo", label: "Redo", category: "clipboard" },
  { id: "cm:find", label: "Find & Replace", category: "clipboard" },
  { id: "cm:speak", label: "Speak", category: "clipboard" },
  { id: "cm:listen", label: "Listen", category: "clipboard" },
  { id: "cm:copy-as", label: "Copy as", category: "clipboard" },
  { id: "cm:json", label: "JSON", category: "clipboard" },
  { id: "cm:select-all", label: "Select All", category: "edit" },
  { id: "cm:insert-reference", label: "Insert / Copy reference…", category: "edit" },
  { id: "cm:chat", label: "Chat", category: "app" },
  { id: "cm:view-history", label: "View History", category: "history" },
  { id: "cm:compare", label: "Compare", category: "app" },
  { id: "cm:export", label: "Export", category: "save" },
  { id: "cm:convert", label: "Convert", category: "save" },
  { id: "cm:attach", label: "Attach To", category: "share" },
  { id: "cm:share", label: "Share", category: "share" },
  { id: "cm:placement:ai-action", label: "AI Actions", category: "ai" },
  { id: "cm:placement:content-block", label: "Content blocks", category: "ai" },
  { id: "cm:placement:organization-tool", label: "Org Items", category: "ai" },
  { id: "cm:placement:user-tool", label: "My Items", category: "ai" },
  { id: "cm:placement:quick-action", label: "Quick actions (placement)", category: "ai" },
  { id: "cm:placement:bound-agent", label: "Agents", category: "ai" },
  { id: "cm:quick-actions", label: "Quick Actions", category: "feedback" },
  { id: "cm:save", label: "Save", category: "edit" },
  { id: "cm:delete", label: "Delete", category: "edit" },
  { id: "cm:admin", label: "Admin Tools", category: "admin" },
  { id: "cm:surface", label: "This page (location, context, agents)", category: "surface-info" },
];

/** Engine rows whose ids are generated per library (one per agent category or placement). */
export const CONTEXT_MENU_ENGINE_ID_PREFIXES: readonly string[] = ["cm:placement:", "cm:cat:", "cm:agents", "cm:entry:"];
