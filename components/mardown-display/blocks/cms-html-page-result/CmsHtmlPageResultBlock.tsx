"use client";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type { CmsHtmlPageResultData } from "@/features/content-ir/kinds/cms-html-page-result";

function label(page: Record<string, unknown>): string {
  return String(page.title ?? page.slug ?? page.id ?? "HTML page");
}

export default function CmsHtmlPageResultBlock({
  serverData,
}: {
  serverData?: unknown;
}) {
  if (typeof serverData !== "object" || serverData === null) return null;
  const data = serverData as CmsHtmlPageResultData;
  const pages = data.page
    ? [data.page]
    : Array.isArray(data.pages)
      ? data.pages
      : [];
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">HTML page result</h3>
          <p className="text-xs text-muted-foreground">
            {pages.length} {pages.length === 1 ? "page" : "pages"}
          </p>
        </div>
        <CopyButtons
          size="xs"
          label="HTML page result"
          human={() => pages.map(label).join("\n")}
          agent={() => ({
            kind: "cms_html_page_result",
            location: "AI Matrx — CMS",
            description: "HTML page tool result",
            data,
          })}
          json={() => data}
        />
      </div>
      {pages.length ? (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {pages.map((page, index) => {
            // A page is open JSON: its fields are read as unknown and narrowed here.
            const fields: Record<string, unknown> = page;
            const slug = fields.slug;
            return (
              <li key={String(fields.id ?? index)} className="px-3 py-2">
                <div className="text-sm font-medium">{label(fields)}</div>
                {typeof slug === "string" ? (
                  <div className="text-xs text-muted-foreground">/{slug}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No pages returned.</p>
      )}
    </section>
  );
}
