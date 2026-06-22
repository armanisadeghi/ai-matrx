// features/scopes/utils/formatOrgDisplayName.ts

export const PERSONAL_ORG_LABEL = "Personal";

export function formatOrgDisplayName(org: {
  name: string;
  is_personal?: boolean;
}): string {
  return org.is_personal ? PERSONAL_ORG_LABEL : org.name;
}

export function orgDisplayNameById(
  organizations: { id: string; name: string; is_personal: boolean }[],
  id: string,
): string {
  const org = organizations.find((o) => o.id === id);
  if (!org) return id;
  return formatOrgDisplayName(org);
}
