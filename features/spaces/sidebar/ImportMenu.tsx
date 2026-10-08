"use client";

// features/spaces/sidebar/ImportMenu.tsx — Notion's sidebar "Import" (K2): Markdown, HTML or CSV files
// become new top-level pages (one per file); the last one opens.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Archive, Code2, FileDown, FileInput, FileText, Link2, Table } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { toast } from "@/lib/toast";

import { useMoveIn } from "../ai/MoveIn";
import { IMPORT_ACCEPT, readImport, type ImportKind } from "../io/import";
import { useNotionImportDoor } from "../io/NotionImport";
import { useSpaces } from "../state/SpacesProvider";

const KINDS: Array<{ kind: ImportKind; label: string; icon: ReactNode }> = [
  { kind: "markdown", label: "Text & Markdown", icon: <FileText size={16} /> },
  { kind: "html", label: "HTML", icon: <Code2 size={16} /> },
  { kind: "csv", label: "CSV", icon: <Table size={16} /> },
];

export function ImportButton() {
  const { store, open: openSpace } = useSpaces();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const kindRef = useRef<ImportKind>("markdown");
  const moveIn = useMoveIn();
  const notion = useNotionImportDoor();
  const zip = useRef<HTMLInputElement>(null);

  const pick = (kind: ImportKind) => {
    kindRef.current = kind;
    setOpen(false);
    const el = input.current;
    if (!el) return;
    el.accept = IMPORT_ACCEPT[kind];
    el.value = "";
    el.click();
  };

  const run = async (files: File[]) => {
    let last: string | null = null;
    let made = 0;
    for (const [i, file] of files.entries()) {
      setBusy(`${i + 1}/${files.length}`);
      try {
        const page = await readImport(file, kindRef.current);
        const doc = await store.create({ parentId: null, title: page.title, blocks: page.blocks });
        last = doc.id;
        made += 1;
        if (page.warnings.length) toast.warning(`${file.name}: ${page.warnings.length} part${page.warnings.length === 1 ? "" : "s"} imported as text`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `${file.name} could not be imported.`);
      }
    }
    setBusy(null);
    if (made) toast.success(made === 1 ? "Imported 1 page" : `Imported ${made} pages`);
    if (last) openSpace(last);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="spaces-nav-row" disabled={busy !== null}>
            <FileDown size={17} />
            Import
            {busy ? <span className="ml-auto type-secondary text-muted-foreground">{busy}</span> : null}
          </button>
        </PopoverTrigger>
        <PopoverContent surface="solid" side="right" align="end" width="sm" padding="xs">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" className="spaces-menu-row" onClick={() => pick(k.kind)}>
              <span className="spaces-menu-row-icon">{k.icon}</span>
              <span className="flex-1 truncate text-left">{k.label}</span>
            </button>
          ))}
          <button type="button" className="spaces-menu-row" onClick={() => (setOpen(false), zip.current && ((zip.current.value = ""), zip.current.click()))}>
            <span className="spaces-menu-row-icon">
              <Archive size={16} />
            </span>
            <span className="flex-1 truncate text-left">Notion export (.zip)</span>
          </button>
          <button type="button" className="spaces-menu-row" onClick={() => (setOpen(false), void notion.connect())}>
            <span className="spaces-menu-row-icon">
              <Link2 size={16} />
            </span>
            <span className="flex-1 truncate text-left">Connect Notion</span>
          </button>
          {moveIn.wired ? (
            <button type="button" className="spaces-menu-row" onClick={() => (setOpen(false), moveIn.ask())}>
              <span className="spaces-menu-row-icon">
                <FileInput size={16} />
              </span>
              <span className="flex-1 truncate text-left">From Notion</span>
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
      <input
        ref={zip}
        type="file"
        accept=".zip,application/zip"
        hidden
        aria-hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void notion.fromZip(file);
        }}
      />
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          if (files.length) void run(files);
        }}
      />
    </>
  );
}
