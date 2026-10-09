"use client";

// The ONE component for the `applet_build_result` kind — what the Applet builder answers
// (`applets.build` / `applets.fix`). It is what the floating "Building your app" window shows:
// the app's name and pages as they arrive, then the finished app in words. The code is never
// in front of her; it sits behind "Show the code".
//
// "Open" is deliberately absent: the slug/id exist only after the builder page saves the answer
// (collision suffix, draft status), so the Open link lives on the builder's own card.

import { useState } from "react";
import CodeBlock from "@ai-matrx/rich-content/code-block/CodeBlock";
import { Badge, DisclosureHeader } from "@ai-matrx/design-system/controls";
import { AppWindow, Check, Code2, Database, FileText, Loader2, Table2, Workflow } from "lucide-react";

import { plainFileLabel, type AppletBuildResultData } from "@/features/content-ir/kinds/applet-build-result";
import { useSourceTableNames } from "@/features/applets/hooks/useSourceTableNames";

function languageOf(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx" || ext === "jsx") return "tsx";
  if (ext === "ts") return "typescript";
  if (ext === "js") return "javascript";
  if (ext === "css") return "css";
  if (ext === "json") return "json";
  return ext || "text";
}

export default function AppletBuildResultBlock({ serverData }: { serverData?: unknown }) {
  const [showCode, setShowCode] = useState(false);
  const read = typeof serverData === "object" && serverData !== null ? (serverData as AppletBuildResultData) : null;
  // Her tables by their real name and organization — the alias is the code's name, never hers.
  const tableNames = useSourceTableNames(read?.sources.flatMap((s) => (s.tableId ? [s.tableId] : [])) ?? []);
  if (!read) return null;
  const data = read;
  const building = !data.isComplete;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground" data-kind="applet_build_result">
      <div className="flex items-start gap-2">
        <AppWindow className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{data.name || "Your Applet"}</h3>
            {building ? <Badge tone="info">Building</Badge> : null}
          </div>
          {data.description ? <p className="text-sm text-muted-foreground">{data.description}</p> : null}
        </div>
      </div>

      {data.pages.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Pages</span>
          <ul className="flex flex-col gap-1">
            {data.pages.map((page) => (
              <li key={page.path} className="flex items-center gap-2 text-sm">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{page.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.sources.length > 0 || data.jobs.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Built on</span>
          <div className="flex flex-wrap gap-1.5">
            {data.sources.map((source) =>
              source.newTable ? (
                <Badge key={`s:${source.alias}`} tone="info" title={source.newTable.fields.join(", ")}>
                  <Table2 className="h-3 w-3" /> New: {source.newTable.name}
                </Badge>
              ) : (
                <Badge key={`s:${source.alias}`} tone="neutral">
                  <Database className="h-3 w-3" />{" "}
                  {source.tableId && tableNames[source.tableId]
                    ? [tableNames[source.tableId].name, tableNames[source.tableId].organizationName].filter(Boolean).join(" · ")
                    : source.type === "entity"
                      ? source.alias
                      : "One of your tables"}
                </Badge>
              ),
            )}
            {data.jobs.map((job) => (
              <Badge key={`j:${job}`} tone="primary">
                <Workflow className="h-3 w-3" /> {job}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {data.note ? <p className="text-sm">{data.note}</p> : null}

      {building && data.files.length > 0 ? (
        // What is being written, in her words — the window moves the whole build, never a spinner, and
        // never a code file name (audit9 B4).
        <div className="flex flex-col gap-1" data-applet-build-writing="">
          <ul className="flex flex-col gap-1">
            {data.files.map((file, i) => {
              const writing = i === data.files.length - 1;
              return (
                <li key={file.name} className="flex min-w-0 items-center gap-2 text-sm" title={file.name}>
                  {writing ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">
                    {writing ? "Writing" : "Wrote"} {plainFileLabel(file.name, data.pages)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!building && data.files.length > 0 ? (
        <div className="flex flex-col gap-2">
          <DisclosureHeader
            open={showCode}
            onClick={() => setShowCode((v) => !v)}
            icon={<Code2 className="h-4 w-4" />}
            title="Show the code"
            meta={`${data.files.length} ${data.files.length === 1 ? "file" : "files"}`}
          />
          {showCode
            ? data.files.map((file) => (
                <div key={file.name} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{file.name}</span>
                  <CodeBlock code={file.source} language={languageOf(file.name)} />
                </div>
              ))
            : null}
        </div>
      ) : null}
    </section>
  );
}
