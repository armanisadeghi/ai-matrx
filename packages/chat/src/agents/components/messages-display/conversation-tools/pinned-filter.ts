// pinned-filter — the "Pinned" view of a conversation: only the groups that
// hold a message this person pinned. Pure, so the display filter is tested.

import type { DisplayGroup } from "../display-groups";

/** Every cx_message id a display group shows. */
export function groupMessageIds(group: DisplayGroup): string[] {
  switch (group.kind) {
    case "user":
    case "collab-note":
      return [group.messageId];
    case "assistant-failed":
      return group.messageId ? [group.messageId] : [];
    case "assistant":
    case "examples":
      return group.members
        .map((m) => m.messageId)
        .filter((id): id is string => typeof id === "string");
  }
}

export function filterGroupsToPinned(
  groups: DisplayGroup[],
  pinned: ReadonlySet<string>,
): DisplayGroup[] {
  return groups.filter((g) => groupMessageIds(g).some((id) => pinned.has(id)));
}

/**
 * What the transcript renders. Find searches the rendered text, so while the
 * find bar is open EVERY group renders (the window would hide older messages
 * from the search — verify-RC-B9 F3). The pinned view also reads every group,
 * so a pinned message never hides behind "load earlier".
 */
export function groupsToRender(args: {
  all: DisplayGroup[];
  windowed: DisplayGroup[];
  findOpen: boolean;
  pinnedOnly: boolean;
  pinned: ReadonlySet<string>;
}): DisplayGroup[] {
  if (args.pinnedOnly) return filterGroupsToPinned(args.all, args.pinned);
  if (args.findOpen) return args.all;
  return args.windowed;
}
