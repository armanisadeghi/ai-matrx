"use client";

/**
 * BUNDLE BAR — load, save and reuse a curation.
 *
 * A bundle is the point of the whole system: the human decides once what an
 * agent should see, names it, and reuses it — on this topic and (as a template)
 * on any other. So this bar makes three states legible at all times: which
 * bundle is loaded, whether the current selection still matches it, and whether
 * it is a template or topic-specific.
 *
 * System bundles are read-only here on purpose. They are the shipped inputs for
 * the built-in outputs; a user who wants a variant saves their own copy rather
 * than editing the platform's out from under every other topic.
 */

import { useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Save,
  Trash2,
  Globe2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import type { ContextBundle } from "../../resources/types";

interface BundleBarProps {
  bundles: ContextBundle[];
  loaded: ContextBundle | null;
  dirty: boolean;
  saving: boolean;
  onLoad: (bundle: ContextBundle) => void;
  /** Save over the loaded bundle. Only offered when it is the user's own. */
  onSave: () => void;
  onSaveAs: (name: string, asTemplate: boolean) => void;
  onDelete: (bundle: ContextBundle) => void;
  selectionCount: number;
}

export function BundleBar({
  bundles,
  loaded,
  dirty,
  saving,
  onLoad,
  onSave,
  onSaveAs,
  onDelete,
  selectionCount,
}: BundleBarProps) {
  const [namingTemplate, setNamingTemplate] = useState<boolean | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContextBundle | null>(null);

  const canOverwrite = loaded !== null && !loaded.isSystem;
  const templates = bundles.filter((b) => b.entityId === null);
  const forTopic = bundles.filter((b) => b.entityId !== null);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <Bookmark className="h-3.5 w-3.5" />
            {loaded ? loaded.name : "Saved selections"}
            {loaded && dirty && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                edited
              </span>
            )}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {templates.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                Templates — usable on any topic
              </DropdownMenuLabel>
              {templates.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  onClick={() => onLoad(b)}
                  className="flex items-start gap-2"
                >
                  <Globe2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-xs">{b.name}</span>
                    {b.description && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {b.description}
                      </span>
                    )}
                  </span>
                  {b.isSystem && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                      built-in
                    </Badge>
                  )}
                  {loaded?.id === b.id && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {forTopic.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                Saved for this topic
              </DropdownMenuLabel>
              {forTopic.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  onClick={() => onLoad(b)}
                  className="flex items-center gap-2"
                >
                  <span className="flex-1 min-w-0 truncate text-xs">{b.name}</span>
                  {loaded?.id === b.id && <Check className="h-3.5 w-3.5" />}
                  <button
                    type="button"
                    aria-label={`Delete ${b.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(b);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </>
          )}
          {bundles.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No saved selections yet. Pick resources, then Save as.
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canOverwrite && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={selectionCount === 0 || saving}
          >
            <Copy className="h-3.5 w-3.5" />
            Save as
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setNamingTemplate(false)}>
            <span className="text-xs">Save for this topic</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNamingTemplate(true)}>
            <span className="text-xs">Save as reusable template</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {loaded?.isSystem && (
        <span className={cn("text-[10px] text-muted-foreground")}>
          Built-in selection — Save as to make your own version.
        </span>
      )}

      <TextInputDialog
        open={namingTemplate !== null}
        onOpenChange={(open) => !open && setNamingTemplate(null)}
        title={
          namingTemplate ? "Name this template" : "Name this selection"
        }
        description={
          namingTemplate
            ? "Templates are not tied to a topic — you can apply this to any research topic."
            : "Saved with this topic."
        }
        placeholder="Brand profile inputs"
        confirmLabel="Save"
        onConfirm={(name) => {
          const asTemplate = namingTemplate === true;
          setNamingTemplate(null);
          onSaveAs(name, asTemplate);
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete this saved selection?"
        description={
          confirmDelete
            ? `"${confirmDelete.name}" will be removed. Any output that used it falls back to its default inputs.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) {
            onDelete(confirmDelete);
            toast.success("Selection deleted");
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
