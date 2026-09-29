"use client";

/**
 * THE ROW CONTROLS for one record on an Organization or Public table — "Shown to" and "Published to
 * the web" (+ "Indexed by search engines" where the table carries it), in the Words table's words
 * (common-docs/policies/access-ladder.md). One compact menu, used by every surface that lets an owner
 * set these two things on a record; the Share dialog carries the same words.
 *
 * Absent, never disabled: a screen renders this only for a record whose table carries the columns
 * (Private, Confidential and child records have none). Sharing without publishing is an Anyone link,
 * made in Share — never here.
 *
 * The component owns no write path: `save` is the feature's own service call, so each table keeps its
 * one writer and this owns only the words, the choices and the honest pending/error state.
 */
import { useState } from "react";
import { Copy, Globe2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import {
  INDEXED_LABEL,
  PUBLISHED_TO_WEB_LABEL,
  SHOWN_TO_LABEL,
  shownToChoices,
  shownToLabel,
  type ShownTo,
} from "@/lib/row-access";

export interface RowAccessValue {
  shownTo: ShownTo | null;
  publishedToWeb: boolean;
  /** Present only when the table carries `search_engine_indexed`. */
  indexed?: boolean;
}

export interface RowAccessPatch {
  shownTo?: ShownTo | null;
  publishedToWeb?: boolean;
  indexed?: boolean;
}

export function RowAccessControl({
  value,
  save,
  publicUrl,
  size = "sm",
  staged = false,
}: {
  value: RowAccessValue;
  /** The feature's own writer. Throw (or reject) to report a failure; the menu says so. */
  save: (patch: RowAccessPatch) => Promise<void>;
  /** The record's own address, offered as "Copy link" once it is published to the web. */
  publicUrl?: string;
  size?: "sm" | "default";
  /**
   * The host only STAGES the choice (a dialog or form with its own Save): the menu then says
   * nothing on pick, because nothing is saved until the host's Save — which reports the outcome.
   */
  staged?: boolean;
}) {
  const [saving, setSaving] = useState(false);

  const apply = async (patch: RowAccessPatch, done: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await save(patch);
      if (!staged) toast.success(done);
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link", { description: publicUrl });
    }
  };

  const TriggerIcon = value.publishedToWeb ? Globe2 : Users;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={saving} className="gap-1.5">
          <TriggerIcon className="h-3.5 w-3.5" />
          {value.publishedToWeb ? PUBLISHED_TO_WEB_LABEL : shownToLabel(value.shownTo)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {SHOWN_TO_LABEL} — which lists show it
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value.shownTo ?? ""}
          onValueChange={(next) =>
            void apply(
              { shownTo: (next || null) as ShownTo | null },
              `Shown to: ${shownToLabel(next || null)}`,
            )
          }
        >
          <DropdownMenuRadioItem value="">{shownToLabel(null)}</DropdownMenuRadioItem>
          {shownToChoices(value.publishedToWeb).map((v) => (
            <DropdownMenuRadioItem key={v} value={v}>
              {shownToLabel(v)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={value.publishedToWeb}
          onCheckedChange={(on) =>
            void apply(
              on
                ? { publishedToWeb: true }
                : // "Everyone on AI Matrx" exists only while published; the database refuses it after.
                  value.shownTo === "everyone_on_ai_matrx"
                  ? { publishedToWeb: false, shownTo: "everyone", indexed: false }
                  : { publishedToWeb: false, ...(value.indexed ? { indexed: false } : {}) },
              on ? "Published to the web" : "No longer published to the web",
            )
          }
        >
          <div className="min-w-0">
            <div className="text-sm">{PUBLISHED_TO_WEB_LABEL}</div>
            <p className="text-xs text-muted-foreground">
              Anyone, signed in or not, can open it at its address
            </p>
          </div>
        </DropdownMenuCheckboxItem>
        {value.publishedToWeb && value.indexed !== undefined ? (
          <DropdownMenuCheckboxItem
            checked={value.indexed}
            onCheckedChange={(on) =>
              void apply({ indexed: on }, on ? "Search engines may list it" : "Hidden from search engines")
            }
          >
            {INDEXED_LABEL}
          </DropdownMenuCheckboxItem>
        ) : null}
        {value.publishedToWeb && publicUrl ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void copyLink()} className="gap-2">
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
