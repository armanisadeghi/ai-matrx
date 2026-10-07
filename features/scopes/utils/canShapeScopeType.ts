// Who may change a scope type's STRUCTURE (rename it, add/edit/archive its fields, archive or
// restore the type): an organization owner/admin, or the person who made the type. Every member
// works the DATA (adds, renames, archives and restores scopes). Arman 2026-10-07: "do it like the
// best in the world; structure is the org admins' and the creator's". The database decides the
// same in custom.context_type_write / _archive / _restore and custom.context_item_*.

export function canShapeScopeType(
  role: string | null | undefined,
  userId: string | null | undefined,
  type: { created_by?: string | null } | null | undefined,
): boolean {
  if (role === "owner" || role === "admin") return true;
  return !!userId && !!type?.created_by && type.created_by === userId;
}
