// The "Reports to" half of a position change (lane HR-360, 2026-10-08).
//
// hr_position_change already honours `manager_employment_id` in its payload (hr._l1_apply_position:
// present = set it, absent = keep the prior row's manager), but no HR screen ever sent it, so a
// manager could not be set from the UI at all. The key is sent only when the choice changed, so an
// untouched picker never clears a manager, and nobody is ever made their own manager.

export function managerPatch(
  current: string | null,
  chosen: string | null,
  employmentId: string,
): { manager_employment_id?: string | null } {
  if (chosen === employmentId) return {};
  if ((chosen ?? null) === (current ?? null)) return {};
  return { manager_employment_id: chosen ?? null };
}
