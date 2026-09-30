import type { Metadata } from "next";

// One of the old Knowledge pages kept side by side for comparison — it names
// itself so two comparison tabs never read the same (scripts/check-tab-shell-titles.ts).
// The parent's noindex robots rule is inherited unchanged.
export const metadata: Metadata = {
  title: "Knowledge Home | Old pages (comparison)",
};

export default function CompareOldKnowledgeHomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
