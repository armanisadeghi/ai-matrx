// The admin Markdown Tester IS the Markdown Studio (2026-09-26, approved by
// Arman): the same component, in admin mode because this route sits in the
// admin lane — shared sample library writes and the Inspect view (raw server
// events, event replay, processors / AST) turn on here and nowhere else.

import { MarkdownStudio } from "@/components/markdown-studio/MarkdownStudio";

export default function Page() {
  return (
    <div className="h-full w-full overflow-hidden">
      <MarkdownStudio />
    </div>
  );
}
