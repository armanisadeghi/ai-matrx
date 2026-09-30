import { createTabMetadata } from "@/utils/route-metadata";

// One tab of a record's tab shell. Its title is "Template | <the record's name>":
// the record's name comes from the shell's own generateMetadata, already resolved,
// so nothing is fetched twice (scripts/check-tab-shell-titles.ts).
export const generateMetadata = createTabMetadata("/shapes", {
  titlePrefix: "Template",
  letter: "TE",
});

export default function ShapesKindTemplateTabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
