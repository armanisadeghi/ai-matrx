// features/context-menu-v3/utils/already-here.ts
//
// ACTIONS THAT TARGET THE THING YOU ARE ALREADY IN ARE ABSENT (page-pass
// 2026-09-27, /notes/<id>): the menu inside a note offered "Save to Notes", and
// the menu inside the editor offered "Edit content" and "Open in full-screen
// editor". Each rich-document action id listed here is excluded for the menu
// instance that is already that place.

export interface WhereTheMenuIs {
  /** The rich-document source type (`note`, `task`, `chat-message`, `raw`, …). */
  sourceType: string;
  /** The registry surface the menu belongs to. */
  surfaceName?: string | null;
  /** The menu wraps an editor (EditableContextMenu). */
  isEditable: boolean;
}

/** "Save to X" where the menu already IS an X. */
const SAVE_INTO_WHERE_YOU_ARE: ReadonlyArray<{ sourceType: string; surface: string; actionId: string }> = [
  { sourceType: "note", surface: "matrx-user/notes", actionId: "save-to-notes" },
  { sourceType: "task", surface: "matrx-user/tasks", actionId: "save-to-task" },
];

/** Opening a window from inside that same window (surface-only rules). */
const OPEN_WHERE_YOU_ARE: ReadonlyArray<{ surface: string; actionId: string }> = [
  // The Feedback window's menus offered "Submit feedback" — reopening itself.
  { surface: "matrx-user/feedback", actionId: "submit-feedback" },
];

/** Opening an editor from inside the editor. */
const EDITOR_DOORS = ["edit", "open-fullscreen-editor"] as const;

export function actionsAlreadyHere(where: WhereTheMenuIs): string[] {
  const out: string[] = [];
  for (const rule of SAVE_INTO_WHERE_YOU_ARE) {
    if (where.sourceType === rule.sourceType || where.surfaceName === rule.surface) out.push(rule.actionId);
  }
  for (const rule of OPEN_WHERE_YOU_ARE) {
    if (where.surfaceName === rule.surface) out.push(rule.actionId);
  }
  // On a record's OWN page (a note's source on the notes surface) the page is
  // its editor — its Write / Read toggle is the door — so the preview offers no
  // second one (live 2026-09-27, /notes/<id> in Read mode). Editor and preview
  // menus now carry the same set.
  // Matched by the SOURCE as well as the surface: live, the Read-mode menu on
  // /notes/<id> carried the note source under a surface name other than the
  // notes one, so a surface-only match missed it.
  const ownPage = SAVE_INTO_WHERE_YOU_ARE.some(
    (rule) => where.sourceType === rule.sourceType || where.surfaceName === rule.surface,
  );
  if (where.isEditable || ownPage) out.push(...EDITOR_DOORS);
  return [...new Set(out)];
}
