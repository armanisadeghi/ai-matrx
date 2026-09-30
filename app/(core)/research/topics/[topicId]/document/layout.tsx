import { createTabMetadata } from "@/utils/route-metadata";

// One tab of a record's tab shell. Its title is "Document | <the record's name>":
// the record's name comes from the shell's own generateMetadata, already resolved,
// so nothing is fetched twice (scripts/check-tab-shell-titles.ts).
export const generateMetadata = createTabMetadata("/research", {
  titlePrefix: "Document",
  letter: "DO",
});

export default function ResearchTopicsTopicIdDocumentTabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
