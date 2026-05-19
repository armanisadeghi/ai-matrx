// app/(authenticated)/markdown-studio/page.tsx
// Server Component shell. The Markdown Studio itself is a Client
// Component (interactive editor + parser comparison). This page just
// renders the shell and lets the (authenticated) layout handle auth.

import { MarkdownStudio } from "@/components/markdown-studio/MarkdownStudio";

export default function MarkdownStudioPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <MarkdownStudio />
    </div>
  );
}
