"use client";

// features/data-tables/pick-lists/components/PickListChoicesEditor.tsx — THE CHOICES OF A PICK LIST, one row
// each (lane PICK-LISTS, 2026-10-10). Add, rename and archive write straight to the list's own Records
// through the pick-list service; an archived choice is soft and records that hold it keep it. A choice's
// colour is kept on the column that uses it, and its place by the column's editor.

import { useCallback, useEffect, useState } from "react";
import { Plus, Archive, ListChecks } from "lucide-react";
import { Button, EmptyState, Field } from "@ai-matrx/design-system/controls";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { addChoices, archiveChoice, getListWithItems, updateChoice } from "../service";

interface Choice {
  id: string;
  label: string;
}

export function PickListChoicesEditor({ listId }: { listId: string }) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getListWithItems(listId);
      const flat = Object.values(list?.items_grouped ?? {}).flat();
      setChoices(flat.map((i) => ({ id: i.id, label: i.label })));
      setDrafts({});
    } catch (e) {
      setChoices([]);
      toast.error(e instanceof Error ? e.message : "The choices could not be read.");
    }
  }, [listId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  };

  const rename = (choice: Choice) => {
    const next = (drafts[choice.id] ?? choice.label).trim();
    if (next === "" || next === choice.label) {
      setDrafts(({ [choice.id]: _dropped, ...rest }) => rest);
      return;
    }
    void run(() => updateChoice(listId, choice.id, { label: next }));
  };

  const add = () => {
    const label = adding.trim();
    if (!label) return;
    if (choices?.some((c) => c.label.trim().toLowerCase() === label.toLowerCase())) {
      toast.error(`“${label}” is already a choice.`);
      return;
    }
    setAdding("");
    void run(() => addChoices(listId, [{ label }]));
  };

  const archive = async (choice: Choice) => {
    const yes = await confirm({
      title: `Archive “${choice.label}”?`,
      description: "Records that hold it keep it and read it as retired. You can restore it.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (yes) void run(() => archiveChoice(listId, choice.id));
  };

  if (choices === null) return <div className="p-4 text-xs text-muted-foreground" data-testid="choices-loading" />;

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-2 overflow-y-auto p-4" data-testid="pick-list-choices-editor">
      {choices.length === 0 ? <EmptyState icon={<ListChecks className="h-5 w-5" />} title="No choices yet" /> : null}
      {choices.map((choice) => (
        <div key={choice.id} className="flex items-center gap-2" data-testid="choice-row">
          <Field
            aria-label="Choice"
            value={drafts[choice.id] ?? choice.label}
            disabled={busy}
            onChange={(e) => setDrafts((d) => ({ ...d, [choice.id]: e.target.value }))}
            onBlur={() => rename(choice)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <Button variant="quiet" aria-label={`Archive ${choice.label}`} disabled={busy} onClick={() => void archive(choice)}>
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Field
          aria-label="New choice"
          placeholder="Add a choice"
          value={adding}
          disabled={busy}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button variant="outline" aria-label="Add choice" disabled={busy || adding.trim() === ""} onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
