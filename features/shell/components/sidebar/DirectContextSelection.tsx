// features/shell/components/sidebar/DirectContextSelection.tsx
//
// THIN SHIM — Phase 2 of the scopes rebuild. The legacy implementation
// (290 lines, 8 slice imports, scopeFilteredIds local state, fetchEntitiesByScopes
// thunk) was deleted on 2026-05-16. This file now re-exports the new
// <ActiveScopePicker /> from features/scopes/components/active-context/
// so the four call sites (shell Sidebar, NoteSidebar, MobileNotesView,
// ChatSidebar) keep their imports unchanged for one more cycle.
//
// Once Phase 3 ships, the call sites will migrate to importing
// <ActiveScopePicker /> directly and this shim is removed.
//
// DO NOT add features or props here. Add them to ActiveScopePicker.

"use client";

import { ActiveScopePicker } from "@/features/scopes/components/active-context/ActiveScopePicker";

export interface DirectContextSelectionProps {
  defaultExpanded?: boolean;
}

export function DirectContextSelection({
  defaultExpanded = false,
}: DirectContextSelectionProps) {
  return <ActiveScopePicker defaultExpanded={defaultExpanded} />;
}

export default DirectContextSelection;
