"use client";

// components/rich-editor/panels/KindPicker.tsx
//
// Insert a structured block from the shape registry: the person searches the
// registered kinds (content_ir.kind_definition, active only), picks one, and
// gets its canonical example (or its sample data) as `__kind` JSON — inserted
// as a protected island they then edit in its own editor.

import { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ai-matrx/design-system";
import { Shapes } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { kindMarkdown } from "../core/commands";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { asClause } from "@/lib/text/asClause";

interface KindRow {
  id: string;
  kind: string;
  label: string;
  sample_data: unknown;
}

const PICKER_LIMIT = 60;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function searchKinds(query: string): Promise<KindRow[]> {
  let request = supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id, kind, label, sample_data")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("label")
    .limit(PICKER_LIMIT);
  const q = query.trim();
  if (q) request = request.or(`label.ilike.%${q.replace(/[%,()]/g, " ")}%,kind.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

async function exampleFor(row: KindRow): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_example")
    .select("data")
    .eq("kind_definition_id", row.id)
    .eq("is_canonical", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return asRecord(data?.data ?? row.sample_data);
}

export function KindPicker({
  open,
  onResolve,
}: {
  open: boolean;
  onResolve: (markdown: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<KindRow[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  // The highlighted row, so Enter picks the first match like every command menu.
  const [highlighted, setHighlighted] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState("loading");
    const handle = window.setTimeout(() => {
      searchKinds(query)
        .then((found) => {
          if (cancelled) return;
          setRows(found);
          setHighlighted(found[0]?.id ?? "");
          setState("idle");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setState("error");
          setMessage(error instanceof Error ? error.message : String(error));
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query]);

  const choose = async (row: KindRow) => {
    try {
      onResolve(kindMarkdown(row.kind, await exampleFor(row)));
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onResolve(null)}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-2">
            <Shapes className="h-4 w-4" /> Insert a structured block
          </DialogTitle>
          <DialogDescription>
            Pick a kind from the shape registry. It is inserted with its example data as a protected block you edit in its own editor.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} value={highlighted} onValueChange={setHighlighted} className="border-t border-border">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search kinds — flashcards, checklist, timeline…" />
          <CommandList className="max-h-[50dvh]">
            {state === "error" && (
              <div className="px-4 py-3 text-sm text-destructive">
                The kind list could not load: {asClause(message)}. Close this and try again.
                <ErrorAlchemyMenu />
              </div>
            )}
            <CommandEmpty>{state === "loading" ? "Searching the shape registry…" : "No kind matches that search."}</CommandEmpty>
            <CommandGroup>
              {rows.map((row) => (
                <CommandItem key={row.id} value={row.id} onSelect={() => void choose(row)}>
                  <span className="flex-1 truncate">{row.label}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{row.kind}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
