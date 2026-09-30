import { createTabMetadata } from "@/utils/route-metadata";

// One tab of a record's tab shell. Its title is "Tasks | <the record's name>":
// the record's name comes from the shell's own generateMetadata, already resolved,
// so nothing is fetched twice (scripts/check-tab-shell-titles.ts).
export const generateMetadata = createTabMetadata("/organizations", {
  titlePrefix: "Tasks",
  letter: "TS",
});

export default function OrganizationsOrgIdTasksTabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
