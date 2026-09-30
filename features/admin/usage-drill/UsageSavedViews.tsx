"use client";

// features/admin/usage-drill/UsageSavedViews.tsx — A USAGE QUESTION KEPT AS A SAVED VIEW
// (lane DRILL-USAGE-PAGE). Arman's word for a saved exploration is Saved view; it lives in the one
// table every list uses, `platform.saved_view`, under surface `drill/ai_usage`, written through the
// doors (`public.saved_view_save` / `saved_view_archive`) and read directly under row security.
// The definition is the question exactly as the address carries it, so opening a Saved view and
// opening its link are the same thing. Remove archives (never deletes).

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
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
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import type { Json } from "@/types/database.types";

export const USAGE_SAVED_VIEW_SURFACE = "drill/ai_usage";

interface UsageView {
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

/** The question as plain JSON (absent keys left out, never `undefined`). */
function questionJson(q: MatrxDrillQuestion): Json {
  const out: { [key: string]: Json } = {
    by: q.by,
    show: q.show,
    where: q.where.map((w) => ({ dim: w.dim, value: w.value })),
  };
  if (q.across) out.across = q.across;
  if (q.window) out.window = q.window;
  if (q.compare) out.compare = q.compare;
  if (q.share) out.share = true;
  if (q.sort) out.sort = { key: q.sort.key, direction: q.sort.direction };
  if (q.path && q.path.length > 0) out.path = q.path;
  return out;
}

export function UsageSavedViews({
  question,
  onOpen,
}: {
  question: MatrxDrillQuestion;
  onOpen: (question: MatrxDrillQuestion) => void;
}) {
  // The parent explorer is a platform-org question, so its saved views must use
  // that same home. Never read or write through whichever tenant is active.
  const organizationId = SYSTEM_ORGANIZATION_ID;
  const [views, setViews] = useState<UsageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .schema("platform")
      .from("saved_view")
      .select("id, name, definition")
      .eq("surface_key", USAGE_SAVED_VIEW_SURFACE)
      .eq("organization_id", organizationId)
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
  }, [organizationId, version]);

  const save = async (name: string) => {
    const { error: e } = await supabase.rpc("saved_view_save", {
      p_surface_key: USAGE_SAVED_VIEW_SURFACE,
      p_organization_id: organizationId,
      p_name: name.trim(),
      p_definition: { question: questionJson(question) },
      p_visibility: "personal",
      p_touch: true,
    });
    if (e) {
      toast.error(e.code === "23505" ? `You already have a view called "${name.trim()}"` : `The view could not be saved: ${e.message}`);
      return;
    }
    toast.success(`Saved "${name.trim()}"`);
    setNaming(false);
    setVersion((v) => v + 1);
  };

  const archive = async (view: UsageView) => {
    const { error: e } = await supabase.rpc("saved_view_archive", { p_surface_key: USAGE_SAVED_VIEW_SURFACE, p_id: view.id });
    if (e) {
      toast.error(`"${view.name}" could not be removed: ${e.message}`);
      return;
    }
    toast.success(`"${view.name}" archived`);
    setVersion((v) => v + 1);
  };

  const open = (view: UsageView) => {
    onOpen(view.question);
    void supabase.rpc("saved_view_save", { p_surface_key: USAGE_SAVED_VIEW_SURFACE, p_id: view.id, p_touch: true }).then(({ error: e }) => {
      if (e) console.error("[usage-drill] saved view touch failed:", e.message);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="xs" className="gap-1" data-usage-saved-views>
            <Bookmark className="h-3 w-3" /> Saved views{views && views.length > 0 ? ` (${views.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[16rem]">
          <DropdownMenuItem data-usage-save-view onSelect={() => setNaming(true)}>
            Save this question as a view…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {error ?? (views === null ? "Reading your saved views…" : views.length === 0 ? "No saved views yet" : "Your saved views")}
          </DropdownMenuLabel>
          {(views ?? []).map((view) => (
            <DropdownMenuItem key={view.id} data-usage-saved-view={view.id} onSelect={() => open(view)} className="flex items-center gap-2">
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
        open={naming}
        onOpenChange={setNaming}
        title="Save this question as a view"
        description="The grouping, the Measures, the trail and the window are kept; the numbers are always counted fresh."
        placeholder="e.g. Anthropic spend by model, last 90 days"
        confirmLabel="Save view"
        validate={(value) => (value.trim() ? null : "Name the view so you can find it again")}
        onConfirm={save}
      />
    </>
  );
}
