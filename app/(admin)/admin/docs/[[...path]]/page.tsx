// app/(admin)/admin/docs/[[...path]]/page.tsx
//
// Admin-only markdown viewer. Renders any `.md` file from the repo (relative
// to the project root) so feature-admin maps and other internal surfaces can
// link to live FEATURE.md / README.md docs without leaving the app — and so
// new tabs hitting the URL get rendered HTML instead of a 404.
//
// Gate: admin (any level). Sub-feature of the per-feature admin pages.

import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { getCurrentUserAdminStatus } from "@/utils/auth/adminUtils";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";

interface AdminDocsPageProps {
  params: Promise<{ path?: string[] }>;
}

export default async function AdminDocsPage({ params }: AdminDocsPageProps) {
  const status = await getCurrentUserAdminStatus();
  if (!status || !status.isAdmin) {
    redirect("/");
  }

  const { path: segments } = await params;
  if (!segments || segments.length === 0) {
    return (
      <div className="px-6 py-6 text-sm text-muted-foreground">
        Append a repo-relative path. Example:{" "}
        <code className="font-mono">
          /admin/docs/features/transcripts/FEATURE.md
        </code>
      </div>
    );
  }

  // Security: only allow paths that resolve under the project root and end in
  // `.md`. Reject anything that escapes the root or targets non-markdown.
  const relPath = segments.map(decodeURIComponent).join("/");
  if (!relPath.endsWith(".md") && !relPath.endsWith(".MD")) {
    notFound();
  }
  const projectRoot = process.cwd();
  const fullPath = path.resolve(projectRoot, relPath);
  if (!fullPath.startsWith(projectRoot + path.sep)) {
    notFound();
  }

  let content: string;
  try {
    content = await readFile(fullPath, "utf-8");
  } catch {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-2 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Home
        </Link>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-mono">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          {relPath}
        </span>
      </header>
      <main className="px-6 py-6">
        <BasicMarkdownContent content={content} />
      </main>
    </div>
  );
}
