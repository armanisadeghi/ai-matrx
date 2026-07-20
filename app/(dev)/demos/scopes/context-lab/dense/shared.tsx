"use client";

// Dense-lab shared layer: production data/atoms + demo-only fake writes.
export {
  useDenseData,
  useContextTreeData,
  CheckGlyph,
  InlineAddRow,
  InlineSpinner,
} from "@/features/scopes/components/active-context/context-tree/shared";
export type {
  DenseData,
  ContextTreeData,
  LazyStatus,
} from "@/features/scopes/components/active-context/context-tree/shared";

import { toast } from "@/lib/toast";

/** Demo convention: console + toast, real path named — never a DB write. */
export function fakeCreate(
  level: "scope type" | "scope" | "context item" | "project" | "task",
  name: string,
  detail: Record<string, string | null>,
): void {
  const realPath: Record<typeof level, string> = {
    "scope type": "createScopeType thunk → rpc create_scope_type",
    scope: "createScope thunk → rpc create_scope",
    "context item": "createContextItem thunk → rpc create_context_item",
    project: "features/projects/service createProject",
    task: "taskService quickCreateTask",
  };
  console.log(
    `[dense-lab] CREATE ${level} (demo — real path: ${realPath[level]}) →`,
    { name, ...detail },
  );
  toast.success(`Would create ${level} "${name}" (logged — no DB write)`);
}

export function fakeApply(useCase: string, payload: unknown): void {
  console.log(`[dense-lab] APPLY ${useCase} (demo — no DB write) →`, payload);
  toast.success(`${useCase} — selection logged (no DB write)`);
}
