"use client";

// features/tasks/components/TaskCommentPopover.tsx
//
// The task door to the one comment surface (`EntityCommentPopover`). Kept as
// a named wrapper so task call sites read as tasks.

import { EntityCommentPopover } from "@/components/comments/EntityCommentPopover";

export function TaskCommentPopover({ taskId, className }: { taskId: string; className?: string }) {
  return <EntityCommentPopover token="task" id={taskId} className={className} />;
}
