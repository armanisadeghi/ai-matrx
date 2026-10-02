export type Scope =
  | "global"
  | "user"
  | "organization"
  | "project"
  | "task";

export interface ScopeRef {
  scope: Scope;
  scopeId?: string | null;
}

export interface ScopeFields {
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
}

export function resolveRowScope(fields: ScopeFields): Scope {
  if (fields.userId) return "user";
  if (fields.organizationId) return "organization";
  if (fields.projectId) return "project";
  if (fields.taskId) return "task";
  return "global";
}

export function buildScopeQueryString(ref: ScopeRef): string {
  const params = new URLSearchParams();
  params.set("scope", ref.scope);
  if (ref.scopeId) params.set("scopeId", ref.scopeId);
  return params.toString();
}

export function applyScopeToFields(ref: ScopeRef): ScopeFields {
  const base: ScopeFields = {
    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
  };
  const id = ref.scopeId ?? null;
  switch (ref.scope) {
    case "user":
      return { ...base, userId: id };
    case "organization":
      return { ...base, organizationId: id };
    case "project":
      return { ...base, projectId: id };
    case "task":
      return { ...base, taskId: id };
    case "global":
    default:
      return base;
  }
}

export function scopeIndexKey(ref: ScopeRef): string {
  return ref.scopeId ? `${ref.scope}:${ref.scopeId}` : ref.scope;
}

export function matchesScope(fields: ScopeFields, ref: ScopeRef): boolean {
  switch (ref.scope) {
    case "global":
      return (
        fields.userId === null &&
        fields.organizationId === null &&
        fields.projectId === null &&
        fields.taskId === null
      );
    case "user":
      return ref.scopeId
        ? fields.userId === ref.scopeId
        : fields.userId !== null;
    case "organization":
      return ref.scopeId
        ? fields.organizationId === ref.scopeId
        : fields.organizationId !== null;
    case "project":
      return ref.scopeId
        ? fields.projectId === ref.scopeId
        : fields.projectId !== null;
    case "task":
      return ref.scopeId
        ? fields.taskId === ref.scopeId
        : fields.taskId !== null;
    default:
      return false;
  }
}
