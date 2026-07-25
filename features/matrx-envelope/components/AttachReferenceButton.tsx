"use client";

/**
 * AttachReferenceButton — THE generic "+" for attaching a reference to
 * something a user is composing (a direct message today; any composer next).
 *
 * It exists so a human never has to copy a ```matrx fence out of one surface
 * and paste envelope JSON into another. Pick the type, search the thing, and
 * the caller receives `{ type, item }` — serialization is
 * `buildFencesFromAttachments` (features/matrx-envelope/referenceText.ts),
 * never a hand-built string.
 *
 * Sub-pickers are the shared `ReferenceTypeAdder` — the same file/url/scope/
 * entity-search pickers the scope reference-cell editor uses. `file` opens THE
 * canonical stored-files picker window.
 */

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Paperclip } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { curatedTokens } from "@/features/scopes/registry/entityRegistry";
import { referenceTypeLabel } from "@/features/scopes/utils/referenceCell";
import { ReferenceTypeAdder } from "@/features/matrx-envelope/components/ReferenceTypeAdder";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import type { AttachedReference } from "@/features/matrx-envelope/referenceText";

// THE one canonical file picker. Lazy — WindowPanel must never be parsed in
// a route/boot bundle (features/window-panels FEATURE.md → Bundle invariant).
const FilePickerWindow = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/FilePickerWindow").then(
      (m) => ({ default: m.FilePickerWindow }),
    ),
  { ssr: false, loading: () => null },
);

export interface AttachReferenceButtonProps {
  onAttach: (refs: AttachedReference[]) => void;
  /**
   * Reference types offered, in order. Defaults to `file` + `url` + the
   * curated entity tokens (note, task, project, agent, app, …) — the same
   * default set every other attach picker uses.
   */
  types?: string[];
  /** Anchor scope, required only if `scope` is offered. */
  scopeId?: string | null;
  disabled?: boolean;
  className?: string;
  /** Distinguishes this picker's file-picker window from others on the page. */
  pickerScope?: string;
}

export function AttachReferenceButton({
  onAttach,
  types,
  scopeId = null,
  disabled = false,
  className,
  pickerScope = "attach-reference",
}: AttachReferenceButtonProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);

  const offeredTypes = useMemo(() => {
    if (types && types.length > 0) return [...new Set(types)];
    // Set-dedupe: the lead types are also curated tokens in the registry.
    // Lead with what people actually attach; the rest keep registry order.
    return [
      ...new Set([
        "note",
        "file",
        "url",
        "task",
        "project",
        "agent",
        ...curatedTokens(),
      ]),
    ];
  }, [types]);

  const [activeType, setActiveType] = useState<string>(offeredTypes[0] ?? "");
  const type = offeredTypes.includes(activeType)
    ? activeType
    : (offeredTypes[0] ?? "");

  const attach = (picked: ReferenceItem[]) => {
    if (picked.length === 0) return;
    onAttach(picked.map((item) => ({ type, item })));
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Attach a reference"
            title="Attach a note, file, task, agent, link…"
            className={cn(
              "rounded-full p-1 text-zinc-400 transition-colors hover:text-primary",
              "disabled:cursor-not-allowed disabled:opacity-40",
              className,
            )}
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          ref={contentRef}
          className="w-80 p-2"
          align="start"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              contentRef.current
                ?.querySelector<HTMLElement>("[data-reference-autofocus]")
                ?.focus();
            });
          }}
        >
          {offeredTypes.length > 1 && (
            <div className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {offeredTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveType(t)}
                  aria-pressed={type === t}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                    type === t
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {referenceTypeLabel(t)}
                </button>
              ))}
            </div>
          )}
          <ReferenceTypeAdder
            type={type}
            scopeId={scopeId}
            onBrowseFiles={() => {
              // The picker lives in a portal — close the popover first so its
              // dismiss logic can't unmount the window.
              setOpen(false);
              setFilePickerOpen(true);
            }}
            onPickMany={attach}
          />
        </PopoverContent>
      </Popover>

      {/* Mounted at the root so it survives the popover closing. */}
      {!disabled && (
        <FilePickerWindow
          open={filePickerOpen}
          onClose={() => setFilePickerOpen(false)}
          scopeId={pickerScope}
          title="Attach file(s)"
          onPick={(selection) => {
            const label = selection.details.filename || undefined;
            onAttach([
              {
                type: "file",
                item: {
                  file_id: selection.fileId,
                  ...(label ? { label } : {}),
                } as unknown as ReferenceItem,
              },
            ]);
          }}
        />
      )}
    </>
  );
}

export default AttachReferenceButton;
