"use client";

// components/official/drill-explorer/DrillSavedViews.tsx — A QUESTION KEPT AS A SAVED VIEW
// (lane DRILL-EXPLORER; generalized from the usage page's UsageSavedViews, lane DRILL-USAGE-PAGE).
//
// Two kinds, one menu (program DRILL-FINISH decision 6):
//   BUILT-IN views are declared in the definition file and returned by `platform.drill_describe`
//   (`views`) — listed FIRST, read-only; "Save a copy" makes a person's own.
//   PERSONAL views live in the one table every list uses, `platform.saved_view`, under surface
//   `drill/<definition key>`, written through the doors (`public.saved_view_save` /
//   `saved_view_archive`) and read directly under row security. Remove archives (never deletes).
// A view's definition is the question exactly as the address carries it, so opening a view and
// opening its link are the same thing.

import { useEffect, useState } from "react";
import { Bookmark, Copy } from "lucide-react";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";

import { saveDrillView } from "./savedViews";
import { explorerQuestionOf, type DrillBuiltInView } from "./types";

interface PersonalView {
  id: string;
  name: string;
  question: MatrxDrillQuestion;
}

function questionOf(definition: unknown): MatrxDrillQuestion | null {
  if (typeof definition !== "object" || definition === null) return null;
  const q = (definition as { question?: unknown }).question;
  if (typeof q !== "object" || q === null) return null;
  const by = (q as { by?: unknown }).by;
  const show = (q as { show?: unknown }).show;
  const where = (q as { where?: unknown }).where;
  if (!Array.isArray(by) || !Array.isArray(show) || !Array.isArray(where)) return null;
  return q as MatrxDrillQuestion;
}

export function DrillSavedViews({
  surfaceKey,
  builtIn,
  question,
  onOpen,
  homeOrganizationId,
}: {
  /**
   * Where the person's views live when the explorer names a home (the platform lane: the platform
   * organization — the admin seat never reads or writes through whichever tenant is active).
   * Absent: the organization the person is working in.
   */
  homeOrganizationId?: string | null | undefined;
  surfaceKey: string;
  /** The definition's own views, listed first and read-only. */
  builtIn: readonly DrillBuiltInView[];
  question: MatrxDrillQuestion;
  onOpen: (question: MatrxDrillQuestion) => void;
}) {
  // A Saved view is the person's own, kept in the organization they are working in (a saved view
  // row needs one); the answer itself is counted in the explorer's lane whatever it is.
  const active = useOrganizationRequired();
  const organizationId = homeOrganizationId ?? active.organizationId;
  const organizationState = homeOrganizationId ? "ready" : active.organizationState;
  const [views, setViews] = useState<PersonalView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The question being named: the current one, or a built-in view's ("Save a copy"). */
  const [naming, setNaming] = useState<{ question: MatrxDrillQuestion; suggested: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let read = supabase.schema("platform").from("saved_view").select("id, name, definition").eq("surface_key", surfaceKey);
    // A named home reads only the views kept there.
    if (homeOrganizationId) read = read.eq("organization_id", homeOrganizationId);
    void read
      .is("deleted_at", null)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) {
          setError(`Saved views could not be read: ${e.message}`);
          setViews([]);
          return;
        }
        setError(null);
        setViews(
          (data ?? []).flatMap((row) => {
            const q = questionOf(row.definition);
            return q ? [{ id: row.id, name: row.name, question: q }] : [];
          }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [surfaceKey, homeOrganizationId, version]);

  const save = async (name: string) => {
    if (!organizationId || !naming) return;
    const done = await saveDrillView({ surfaceKey, organizationId, name, question: naming.question, visibility: homeOrganizationId ? "internal" : "personal" });
    if (!done.ok) {
      toast.error(done.message);
      return;
    }
    toast.success(`Saved "${name.trim()}"`);
    setNaming(null);
    setVersion((v) => v + 1);
  };

  const archive = async (view: PersonalView) => {
    const { error: e } = await supabase.rpc("saved_view_archive", { p_surface_key: surfaceKey, p_id: view.id });
    if (e) {
      toast.error(`"${view.name}" could not be removed: ${e.message}`);
      return;
    }
    toast.success(`"${view.name}" archived`);
    setVersion((v) => v + 1);
  };

  const open = (view: PersonalView) => {
    onOpen(view.question);
    void supabase.rpc("saved_view_save", { p_surface_key: surfaceKey, p_id: view.id, p_touch: true }).then(({ error: e }) => {
      if (e) console.error("[drill-explorer] saved view touch failed:", e.message);
    });
  };

  const count = builtIn.length + (views?.length ?? 0);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="xs" className="gap-1" data-drill-explorer-saved-views>
            <Bookmark className="h-3 w-3" /> Saved views{count > 0 ? ` (${count})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[16rem]">
          {builtIn.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Built in</DropdownMenuLabel>
              {builtIn.map((view) => (
                <DropdownMenuItem
                  key={view.key}
                  data-drill-explorer-view={`builtin:${view.key}`}
                  onSelect={() => onOpen(explorerQuestionOf(view.question))}
                  className="flex items-center gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">{view.label}</span>
                  {organizationState === "ready" ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label={`Save a copy of ${view.label}`}
                      data-drill-explorer-save-copy={view.key}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setNaming({ question: explorerQuestionOf(view.question), suggested: `${view.label} (my copy)` });
                      }}
                    >
                      <Copy className="h-3 w-3" /> Save a copy
                    </button>
                  ) : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : null}
          {organizationState === "ready" ? (
            <DropdownMenuItem data-drill-explorer-save-view onSelect={() => setNaming({ question, suggested: "" })}>
              Save this question as a view…
            </DropdownMenuItem>
          ) : (
            <div className="px-2 py-1.5">
              <OrganizationContextNotice state={organizationState} what="Saved views" compact />
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {error ?? (views === null ? "Reading your saved views…" : views.length === 0 ? "No saved views yet" : homeOrganizationId ? "Platform saved views" : "Your saved views")}
          </DropdownMenuLabel>
          {(views ?? []).map((view) => (
            <DropdownMenuItem key={view.id} data-drill-explorer-view={view.id} onSelect={() => open(view)} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                aria-label={`Archive the saved view ${view.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void archive(view);
                }}
              >
                Archive
              </button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <TextInputDialog
        open={naming !== null}
        onOpenChange={(open) => {
          if (!open) setNaming(null);
        }}
        title="Save this question as a view"
        description="The grouping, the Measures, the trail and the window are kept; the numbers are always counted fresh."
        placeholder="e.g. Anthropic spend by model, last 90 days"
        defaultValue={naming?.suggested ?? ""}
        confirmLabel="Save view"
        validate={(value) => (value.trim() ? null : "Name the view so you can find it again")}
        onConfirm={save}
      />
    </>
  );
}
