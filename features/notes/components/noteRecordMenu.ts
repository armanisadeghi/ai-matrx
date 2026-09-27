/**
 * The key a note tab registers its rows under, and its content root is marked with, so the tab's ⋯,
 * a right-click on the active tab and a right-click on the note's content open ONE menu
 * (features/context-menu-v3/record-menu-registry.ts; R26, ALC-15 round 5).
 */
export function noteTabRecordMenuKey(instanceId: string, noteId: string): string {
  return `note-tab:${instanceId}:${noteId}`;
}
