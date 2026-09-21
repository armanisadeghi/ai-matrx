/**
 * features/files/devices/components/SyncStorageMeters.tsx
 *
 * The storage meters on Devices & sync — one per organization that OWNS a
 * synced folder, because that is whose plan the synced bytes are counted
 * against (D11 meters storage to the organization).
 *
 * Deliberately NOT the sidebar's active-org selection: the page used to show a
 * plan word resolved from one ladder and a ceiling from another, for an
 * organization nobody on this page had chosen. The mappings say who owns the
 * folders; that is the only organization this page is entitled to meter.
 */

"use client";

import { OrgStorageMeter } from "@/features/files/storage-meter/OrgStorageMeter";
import { useUserOrganizations } from "@/features/organizations/hooks";

/** The distinct organizations owning the mappings on screen, in first-seen order. */
export function owningOrganizationIds(
  mappings: ReadonlyArray<{ organization_id: string }>,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const mapping of mappings) {
    if (seen.has(mapping.organization_id)) continue;
    seen.add(mapping.organization_id);
    ids.push(mapping.organization_id);
  }
  return ids;
}

export function SyncStorageMeters({
  organizationIds,
  className,
}: {
  organizationIds: string[];
  className?: string;
}) {
  if (organizationIds.length === 0)
    return <OrgStorageMeter organizationId={null} className={className} />;
  if (organizationIds.length === 1)
    return (
      <OrgStorageMeter
        organizationId={organizationIds[0] ?? null}
        className={className}
      />
    );
  // More than one organization owns folders on this account, so each meter has
  // to say WHOSE plan it describes — two unlabelled meters would be a riddle.
  return <NamedStorageMeters organizationIds={organizationIds} />;
}

function NamedStorageMeters({
  organizationIds,
}: {
  organizationIds: string[];
}) {
  const { organizations, error } = useUserOrganizations();
  const nameById = new Map(organizations.map((org) => [org.id, org.name]));
  return (
    <div className="flex flex-wrap gap-2">
      {organizationIds.map((id) => (
        <OrgStorageMeter
          key={id}
          organizationId={id}
          organizationLabel={
            nameById.get(id) ??
            (error ? "Organization name unavailable" : "Loading name…")
          }
          className="min-w-64"
        />
      ))}
    </div>
  );
}
