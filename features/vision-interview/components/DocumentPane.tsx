"use client";

// features/vision-interview/components/DocumentPane.tsx
//
// The center pane: the living document (interview.session.document — written
// ONLY by the Scribe's scribe_apply step; read-only here), presented like
// Scribe's working document rather than a raw markdown dump: the Scribe's
// section-keyed markdown splits on its H2 headings into collapsible sections
// (Accordion, all open by default), each body rendered through the canonical
// markdown front door (<RichDocument>). Header carries copy + the revision
// count. A document with no H2 structure renders whole — never a parser
// failure, just fewer folds.

import { useState } from "react";
import { Check, Copy, FileText, History } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectRevisions,
  selectRoomHydrated,
  selectRoomSession,
} from "../redux/vision-interview.slice";
import { ROLES } from "../types";
import { RoleAvatar } from "./RoleAvatar";

interface DocSection {
  key: string;
  title: string;
  body: string;
}

// The backend's section keying: an invisible HTML-comment marker per section
// (aidream `document_sections.py`). Older documents may still carry the
// retired `<key>…</key>` XML wrappers — those are parsed too and their tags
// NEVER reach the user (they rendered as literal junk; live defect,
// 2026-08-18). Pure string work on PERSISTED content — not stream parsing.
const MARKER_RE = /^[ \t]*<!--\s*matrx:section:([A-Za-z_][A-Za-z0-9_.\-]*)\s*-->[ \t]*$/gm;
const LEGACY_SECTION_RE =
  /<([A-Za-z_][A-Za-z0-9_.\-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/g;
const H2_RE = /^##\s+(.+?)\s*$/;

function prettifyKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pull the section's title out of its body: the first H2 wins (and is
 *  removed from the rendered body — the accordion trigger carries it);
 *  fallback is the prettified section key. */
function titleFromBody(body: string, key: string): { title: string; body: string } {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const h2 = H2_RE.exec(lines[i]);
    if (h2) {
      return {
        title: h2[1],
        body: [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n").trim(),
      };
    }
    break;
  }
  return { title: prettifyKey(key), body: body.trim() };
}

function splitSections(markdown: string): {
  preamble: string;
  sections: DocSection[];
} {
  // 1) Canonical marker format.
  MARKER_RE.lastIndex = 0;
  const markers = [...markdown.matchAll(MARKER_RE)];
  if (markers.length > 0) {
    const sections: DocSection[] = markers.map((m, i) => {
      const start = (m.index ?? 0) + m[0].length;
      const end = i + 1 < markers.length ? (markers[i + 1].index ?? markdown.length) : markdown.length;
      const raw = markdown.slice(start, end).trim();
      const { title, body } = titleFromBody(raw, m[1]);
      return { key: `${i}:${m[1]}`, title, body };
    });
    return {
      preamble: markdown.slice(0, markers[0].index ?? 0).trim(),
      sections,
    };
  }

  // 2) Legacy XML-wrapped format — parse, and never show a tag.
  LEGACY_SECTION_RE.lastIndex = 0;
  const legacy = [...markdown.matchAll(LEGACY_SECTION_RE)];
  if (legacy.length > 0) {
    const sections: DocSection[] = legacy.map((m, i) => {
      const { title, body } = titleFromBody(m[2].trim(), m[1]);
      return { key: `${i}:${m[1]}`, title, body };
    });
    return {
      preamble: markdown.slice(0, legacy[0].index ?? 0).trim(),
      sections,
    };
  }

  // 3) Plain markdown — fold on H2 headings.
  const lines = markdown.split("\n");
  const sections: DocSection[] = [];
  const preamble: string[] = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const heading = H2_RE.exec(line);
    if (heading) {
      if (current) {
        sections.push({
          key: `${sections.length}:${current.title}`,
          title: current.title,
          body: current.body.join("\n").trim(),
        });
      }
      current = { title: heading[1], body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) {
    sections.push({
      key: `${sections.length}:${current.title}`,
      title: current.title,
      body: current.body.join("\n").trim(),
    });
  }
  return { preamble: preamble.join("\n").trim(), sections };
}

export function DocumentPane() {
  const session = useAppSelector(selectRoomSession);
  const hydrated = useAppSelector(selectRoomHydrated);
  const revisions = useAppSelector(selectRevisions);
  const [copied, setCopied] = useState(false);
  // null = "all sections open" (the default as new sections land); a user
  // toggle takes over from there.
  const [openKeys, setOpenKeys] = useState<string[] | null>(null);

  const document = session?.document?.trim() ?? "";
  const { preamble, sections } = splitSections(document);
  const allKeys = sections.map((s) => s.key);

  const copyDocument = async () => {
    if (!document) return;
    try {
      // The user's copy is clean markdown — no machine section markers.
      MARKER_RE.lastIndex = 0;
      await navigator.clipboard.writeText(
        document.replace(MARKER_RE, "").replace(/\n{3,}/g, "\n\n").trim(),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 py-1.5">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Living document
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <History className="h-3 w-3" aria-hidden />
          {revisions.length} revision{revisions.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => void copyDocument()}
          disabled={!document}
          aria-label={copied ? "Copied" : "Copy document"}
          title="Copy document"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground",
            document
              ? "hover:bg-accent hover:text-foreground"
              : "opacity-40",
            copied && "text-green-500 hover:text-green-500",
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!hydrated ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : document ? (
          <>
            {preamble && (
              <RichDocument
                content={preamble}
                source={{ type: "raw" }}
                hideCopyButton
                contentClassName="text-sm"
              />
            )}
            {sections.length > 0 ? (
              <Accordion
                type="multiple"
                value={openKeys ?? allKeys}
                onValueChange={setOpenKeys}
                className="w-full"
              >
                {sections.map((section) => (
                  <AccordionItem
                    key={section.key}
                    value={section.key}
                    className="border-border/60"
                  >
                    <AccordionTrigger className="py-2 text-sm font-semibold text-foreground hover:no-underline">
                      {section.title}
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <RichDocument
                        content={section.body}
                        source={{ type: "raw" }}
                        hideCopyButton
                        contentClassName="text-sm"
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xs text-center">
              <RoleAvatar role="scribe" size="lg" className="mx-auto" />
              <p className="mt-2 text-sm font-medium text-foreground">
                The {ROLES.scribe.name} writes here
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                After each round, the living document captures what the room
                has learned — nothing captured yet.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
