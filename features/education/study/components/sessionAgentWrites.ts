import type { StudySessionRow } from "../types";
import {
  collectProblems,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";

export interface SessionDeletePlan {
  id: string;
  version: number;
}

/** Only terminal, visible revisions may enter the approval queue. */
export function parseSessionDeletes(
  value: unknown,
  shown: readonly Pick<StudySessionRow, "id" | "version" | "status">[],
): SessionDeletePlan[] {
  const visibleById = new Map(shown.map((session) => [session.id, session]));
  const rows = readCollectionList("delete_sessions", "sessions", value);
  return collectProblems(
    "delete_sessions",
    rows,
    (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("must be { id, version } from session_list.");
      }
      const item = raw as Record<string, unknown>;
      if (
        typeof item.id !== "string" ||
        !item.id.trim() ||
        !Number.isSafeInteger(item.version)
      ) {
        throw new Error("must be { id, version } from session_list.");
      }
      const session = visibleById.get(item.id);
      if (!session) {
        throw new Error("session is not currently visible. Refresh the history.");
      }
      if (session.status !== "completed" && session.status !== "abandoned") {
        throw new Error("an in-progress session cannot be deleted by the agent.");
      }
      if (session.version !== item.version) {
        throw new Error("session changed. Reload the history.");
      }
      return { id: session.id, version: session.version };
    },
    {
      listChecks: (items) => [
        repeatsProblem(
          "delete_sessions",
          items.map((item) => item.value?.id),
          "session ID",
        ),
      ],
    },
  );
}
