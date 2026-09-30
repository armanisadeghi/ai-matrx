import { createTabMetadata } from "@/utils/route-metadata";

// One tab of a record's tab shell. Its title is "New Mandate | <the shell's title>",
// read from the already-resolved parent so nothing is fetched twice
// (scripts/check-tab-shell-titles.ts).
export const generateMetadata = createTabMetadata("/organizations", {
  titlePrefix: "New Mandate",
  letter: "NM",
});

export default function OrganizationsOrgIdMandatesNewTabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
