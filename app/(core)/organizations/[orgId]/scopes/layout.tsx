import { createTabMetadata } from "@/utils/route-metadata";

// One tab of a record's tab shell. Its title is "Scopes | <the record's name>":
// the record's name comes from the shell's own generateMetadata, already resolved,
// so nothing is fetched twice (scripts/check-tab-shell-titles.ts).
export const generateMetadata = createTabMetadata("/organizations", {
  titlePrefix: "Scopes",
  letter: "SP",
});

export default function OrganizationsOrgIdScopesTabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
