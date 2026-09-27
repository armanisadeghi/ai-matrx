import { supabase } from "@/utils/supabase/client";

/**
 * THE RUN'S OWN ORGANIZATION (lane RUN-PAGE-TAILS, 2026-09-27).
 *
 * A verb on a run that already exists acts in the organization THE RUN belongs
 * to — the server's resume route reads the run row's, and an object page takes
 * its organization from the object (access is personal). Before this, every
 * verb here fell back to the ACTIVE organization, so a person who opened a run
 * link with no workspace chosen and pressed "Carry on", Stop, Try again… was
 * asked "Which workspace is this for?" about a run that already knew.
 *
 * Read once per run (the column never changes) and remembered. When the row is
 * unreadable the call goes out exactly as before and the server decides.
 */
const runOrganizations = new Map<string, Promise<string | null>>();

export function runOrganizationId(runId: string): Promise<string | null> {
  const known = runOrganizations.get(runId);
  if (known) return known;
  const read = (async () => {
    try {
      const { data, error } = await supabase
        .schema("workflow")
        .from("run")
        .select("organization_id")
        .eq("id", runId)
        .maybeSingle();
      if (error || !data?.organization_id) return null;
      return data.organization_id;
    } catch {
      return null;
    }
  })();
  runOrganizations.set(runId, read);
  // An unreadable run is asked again next time rather than remembered as null.
  void read.then((organizationId) => {
    if (!organizationId) runOrganizations.delete(runId);
  });
  return read;
}

/** The scope a verb on this run is sent in — the run's organization, when known. */
export async function runScope(
  runId: string,
): Promise<{ scopeOverrides?: { organization_id: string } }> {
  const organizationId = await runOrganizationId(runId);
  return organizationId ? { scopeOverrides: { organization_id: organizationId } } : {};
}
