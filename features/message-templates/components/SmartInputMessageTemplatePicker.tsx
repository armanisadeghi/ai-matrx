"use client";

/**
 * Fast message-template picker for transient composer surfaces.
 *
 * Row click applies immediately. Preview/open controls are separate siblings,
 * so inspecting a template never accidentally inserts it.
 */

import { useEffect, useState } from "react";
import { FileText, Loader2, RefreshCcw, Search } from "lucide-react";
import { ProInput } from "@/components/official/ProInput";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { fetchMessageTemplates } from "@/features/message-templates/services/message-templates-service";
import type { MessageTemplateDB } from "@/features/message-templates/types/message-templates-db";
import { filterAndSortBySearch } from "@/utils/search-scoring";

interface SmartInputMessageTemplatePickerProps {
  onSelect: (templateContent: string) => void;
}

export function SmartInputMessageTemplatePicker({
  onSelect,
}: SmartInputMessageTemplatePickerProps) {
  const [templates, setTemplates] = useState<MessageTemplateDB[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const requestTemplates = () =>
    fetchMessageTemplates({
      role: "user",
      order_by: "updated_at",
      order_direction: "desc",
    })
      .then((rows) => {
        setTemplates(rows.filter((template) => template.content?.trim()));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));

  useEffect(() => {
    void requestTemplates();
  }, []);

  const retry = () => {
    setStatus("loading");
    void requestTemplates();
  };

  const visible = search.trim()
    ? filterAndSortBySearch(templates, search, [
        { get: (template) => template.label, weight: "title" },
        { get: (template) => template.content, weight: "body" },
        { get: (template) => template.tags, weight: "tag" },
      ])
    : templates;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-2 py-1.5">
        <ProInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search message templates…"
          startIcon={<Search className="h-3.5 w-3.5" />}
          clearable
          onClear={() => setSearch("")}
          enableVoice={false}
          className="h-7"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {status === "loading" ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : status === "error" ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-destructive">
              Message templates couldn&apos;t be loaded.
            </p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {templates.length === 0
              ? "You don't have any user message templates yet."
              : "No message templates match your search."}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visible.map((template) => (
              <div
                key={template.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(template.content ?? "")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(template.content ?? "");
                  }
                }}
                className="group flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {template.label || "Untitled template"}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {template.content}
                  </p>
                  {template.tags && template.tags.length > 0 ? (
                    <p className="mt-1 truncate text-[10px] text-muted-foreground/70">
                      {template.tags.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <EntityDoorControls
                  token="message_template"
                  id={template.id}
                  name={template.label}
                  alwaysShowActions
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
