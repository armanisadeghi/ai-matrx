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
