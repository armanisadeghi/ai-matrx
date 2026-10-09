"use client";

/**
 * TAG MANY KEYWORDS — add or remove tags on the checked rows (or one row).
 *
 * Adding keeps every tag a keyword already has; removing takes off only the
 * tags chosen here. Both go through `writeKeywordTags` → `seo.keyword_facet_set`
 * (`p_remove` to untag). Typing a name that is not a tag yet offers it as a new
 * tag, created on save (P23 — every picker takes new input).
 */

import { useState, type KeyboardEvent } from "react";
import { Eraser, Loader2, Plus, Tags, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import type { FacetValue } from "@/features/marketing/seo/value-system/dimensions/data";
import {
  tagValueKey,
  writeKeywordTags,
  type TagChoice,
  type TagWriteResult,
} from "../tags";
import { AssignTargetHeadline, type AssignTarget } from "./AssignPanel";
import { formatCount } from "@ai-matrx/kit/format";

export function TagAssignPanel({
  siteId,
  tags,
  target,
  onDone,
  onCancel,
  write = writeKeywordTags,
}: {
  siteId: string;
  /** The site's existing tags (the Tags dimension's values). */
  tags: FacetValue[];
  target: AssignTarget;
  onDone: (
    result: TagWriteResult,
    change: { remove: boolean; labels: string[] },
  ) => void;
  onCancel?: () => void;
  /** The write; replaceable in tests only. */
  write?: typeof writeKeywordTags;
}) {
  const [chosen, setChosen] = useState<TagChoice[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<"add" | "remove" | null>(null);
  // A new target is a new decision — never carry tags chosen for other rows.
  const [targetSeen, setTargetSeen] = useState(target);
  if (targetSeen !== target) {
    setTargetSeen(target);
    setChosen([]);
    setDraft("");
  }

  const isChosen = (value: string) => chosen.some((c) => c.value === value);
  const toggle = (choice: TagChoice) =>
    setChosen((current) =>
      current.some((c) => c.value === choice.value)
        ? current.filter((c) => c.value !== choice.value)
        : [...current, choice],
    );

  const draftKey = tagValueKey(draft);
  const draftExisting = draftKey
    ? tags.find((t) => t.key === draftKey)
    : undefined;
  const addDraft = () => {
    if (!draftKey) return;
    const choice: TagChoice = draftExisting
      ? { value: draftExisting.key, label: draftExisting.label, isNew: false }
      : { value: draftKey, label: draft.trim(), isNew: true };
    if (!isChosen(choice.value)) setChosen((current) => [...current, choice]);
    setDraft("");
  };
  const onDraftKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraft();
    }
  };

  const run = async (remove: boolean) => {
    if (chosen.length === 0) return;
    setPending(remove ? "remove" : "add");
    try {
      const result = await write({
        siteId,
        keywordIds: target.keywordIds,
        tags: chosen,
        remove,
      });
      onDone(result, { remove, labels: chosen.map((c) => c.label) });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save those tags.",
      );
    } finally {
      setPending(null);
    }
  };

  const newChosen = chosen.filter((c) => c.isNew);
  const visibleTags = tags.filter((t) => !t.abstain);

  return (
    <div className="space-y-3">
      <AssignTargetHeadline
        target={target}
        icon={Tags}
        title={`Tags for ${target.label}`}
      />

      {visibleTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags">
          {visibleTags.map((tag) => {
            const on = isChosen(tag.key);
            return (
              <button
                key={tag.value_id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  toggle({ value: tag.key, label: tag.label, isNew: false })
                }
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs max-lg:min-h-11",
                  on
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {newChosen.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="New tags">
          {newChosen.map((tag) => (
            <span
              key={tag.value}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2 py-0.5 text-xs text-foreground"
            >
              {tag.label}
              <span className="text-muted-foreground">new</span>
              <button
                type="button"
                aria-label={`Remove ${tag.label}`}
                onClick={() => toggle(tag)}
                className="rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Input
          aria-label="Tag name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onDraftKey}
          placeholder="e.g. priority"
          className="min-w-0 flex-1"
        />
        <Button
          icon={<Plus />}
          variant="outline"
          disabled={!draftKey}
          onClick={addDraft}
        >
          {draftExisting || !draftKey ? "Add" : `New “${draft.trim()}”`}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel ? (
          <Button variant="quiet" onClick={onCancel} disabled={pending !== null}>
            Cancel
          </Button>
        ) : null}
        <Button
          icon={pending === "remove" ? <Loader2 className="animate-spin" /> : <Eraser />}
          variant="outline"
          disabled={
            pending !== null || chosen.filter((c) => !c.isNew).length === 0
          }
          onClick={() => void run(true)}
        >
          Remove
        </Button>
        <Button
          icon={pending === "add" ? <Loader2 className="animate-spin" /> : null}
          variant="primary"
          disabled={pending !== null || chosen.length === 0}
          onClick={() => void run(false)}
        >
          Add to {formatCount(target.keywordIds.length)}
        </Button>
      </div>
    </div>
  );
}
